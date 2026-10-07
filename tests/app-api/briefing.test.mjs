import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleVideoChatRequest } from "../../functions/api/video-chat.mjs";
import { guardPaidProvider } from "../../functions/_video-chat/provider-admission.mjs";
import { actorHash, reserveQuota } from "../../functions/_video-chat/quota.mjs";

function environment() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../../migrations/0001_video_chat_quotas.sql", import.meta.url), "utf8"));
  return { ANTHROPIC_API_KEY: "test-only", VIDEO_CHAT_QUOTA_SALT: "test-salt-that-is-at-least-32-characters",
    VIDEO_CHAT_QUOTAS: { sql, prepare(query) { return { bind(...args) { return {
      async first() { return sql.prepare(query).get(...args); },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    }; } }; } } };
}
const prompt = "Feature A is in preview. Admin enablement is required.";
const authored = () => ({ summary: "Feature A needs admin enablement and remains in preview.",
  facts: [{ id: "f1", text: prompt, sourceId: "source1" }],
  priorities: [{ factIds: ["f1"], relevance: "A limited pilot can test the feature.", action: "Ask the admin to check availability." }],
  podcast: { exchanges: [{ host: "What can we try?", analyst: prompt, factIds: ["f1"] }] } });
const screenshot = { id: "screen1", url: "https://cdn.example.com/a.png", alt: "Provided settings screenshot" };
function request(body = { prompt }, { action = "briefing", signal, headers } = {}) {
  return new Request(`https://example.com/api/video-chat?action=${action}`, { method: "POST", signal,
    headers: { origin: "https://example.com", "content-type": "application/json", "cf-connecting-ip": "192.0.2.1", ...headers }, body: JSON.stringify(body) });
}
const providerAnswer = value => Response.json({ content: [{ type: "text", text: JSON.stringify(value) }] });
const active = env => env.VIDEO_CHAT_QUOTAS.sql.prepare("SELECT COUNT(*) AS count FROM video_chat_requests WHERE released = 0").get().count;
const noProvider = () => { assert.fail("Rejected request must not reach any provider"); };

test("briefing creates one admitted canonical record without calling media/speech or fetching supplied URLs", async () => {
  const env = environment(); let count = 0;
  const response = await handleVideoChatRequest({ request: request({ prompt, screenshots: [screenshot] }), env,
    fetcher: async (url, options) => {
      count++;
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(active(env), 1);
      const sent = JSON.parse(options.body);
      assert.equal(sent.stream, false);
      assert.ok(!sent.system.includes(prompt));
      assert.deepEqual(JSON.parse(sent.messages[0].content), { sources: [{ id: "source1", text: prompt }], screenshots: [{ id: screenshot.id, alt: screenshot.alt }] });
      return providerAnswer(authored());
    } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.version, 1);
  assert.equal(result.prompt, prompt);
  assert.deepEqual(result.screenshots, [screenshot]);
  assert.equal(result.podcast.turns[1].speaker, "analyst");
  assert.equal(count, 1);
  assert.equal(active(env), 0);
});

test("briefing input and unsafe response assets are rejected before quota admission", async () => {
  const env = environment();
  for (const body of [{}, { prompt: "" }, { prompt: "x".repeat(12001) }, { prompt, model: "untrusted" },
    { prompt, screenshots: [{ ...screenshot, url: "https://127.0.0.1/x" }] },
    { prompt, screenshots: [{ ...screenshot, sourceUrl: "http://example.com" }] }]) {
    assert.equal((await handleVideoChatRequest({ request: request(body), env, fetcher: noProvider })).status, 400);
  }
  assert.equal((await handleVideoChatRequest({ request: request({ prompt, screenshots: [{ ...screenshot, url: "https://local.internal/x" }] }, { action: "response" }), env, fetcher: noProvider })).status, 400);
  assert.equal(env.VIDEO_CHAT_QUOTAS.sql.prepare("SELECT COUNT(*) AS count FROM video_chat_requests").get().count, 0);
});

test("briefing preserves origin/configuration/identity/quota gates", async () => {
  const env = environment();
  assert.equal((await handleVideoChatRequest({ request: request(undefined, { headers: { origin: "https://other.example" } }), env, fetcher: noProvider })).status, 403);
  assert.equal((await handleVideoChatRequest({ request: request(), env: { ...env, VIDEO_CHAT_PAID_PROVIDERS: "disabled" }, fetcher: noProvider })).status, 503);
  const noIdentity = request(); noIdentity.headers.delete("cf-connecting-ip");
  assert.equal((await handleVideoChatRequest({ request: noIdentity, env, fetcher: noProvider })).status, 503);
  const actor = await actorHash("192.0.2.1", env.VIDEO_CHAT_QUOTA_SALT);
  for (let index = 0; index < 4; index++) await reserveQuota(env.VIDEO_CHAT_QUOTAS, actor, 1);
  assert.equal((await handleVideoChatRequest({ request: request(), env, fetcher: noProvider })).status, 429);
});

test("briefing rejects fabricated evidence and model URLs while releasing reservation", async () => {
  for (const output of [{ ...authored(), facts: [{ id: "f1", text: "Available to all", sourceId: "source20" }] },
    { ...authored(), screenshots: [{ ...screenshot, url: "https://invented.example.com/x" }] }]) {
    const env = environment();
    const response = await handleVideoChatRequest({ request: request(), env, fetcher: async () => providerAnswer(output) });
    assert.equal(response.status, 503); assert.equal(active(env), 0);
  }
});

test("provider failure and cancellation settle the briefing reservation", async () => {
  const env = environment();
  const failed = await handleVideoChatRequest({ request: request(), env, fetcher: async () => { throw new Error("failure"); } });
  assert.equal(failed.status, 503); assert.equal(active(env), 0);
  const controller = new AbortController();
  const response = await handleVideoChatRequest({ request: request(undefined, { signal: controller.signal }), env,
    fetcher: async () => { controller.abort(); return providerAnswer(authored()); } });
  assert.equal(response.status, 503); assert.equal(active(env), 0);
});

test("briefing admission permits only text generation", async () => {
  const admission = { action: "briefing", reservation: "reservation", signal: new AbortController().signal, isReleased: () => false };
  assert.equal(await guardPaidProvider("generateText", admission, () => "ok")({}), "ok");
  for (const kind of ["generateVideo", "searchMedia", "generateSpeech"]) {
    const guarded = guardPaidProvider(kind, admission, noProvider);
    await assert.rejects(kind === "generateSpeech" ? guarded({}) : guarded("query", {}));
  }
});

test("speech role validation rejects arbitrary provider voice controls", async () => {
  for (const body of [{ text: "Hello", speaker: "eve" }, { text: "Hello", speaker: "host", voice_id: "other" }]) {
    assert.equal((await handleVideoChatRequest({ request: request(body, { action: "speech" }), env: environment(), fetcher: noProvider })).status, 400);
  }
});
