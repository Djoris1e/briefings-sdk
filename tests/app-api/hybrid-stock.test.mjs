import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { decodeVideoSse } from "../../src/protocol/sse.ts";
import { handleVideoChatRequest } from "../../functions/api/video-chat.mjs";
import { actorHash, reserveQuota } from "../../functions/_video-chat/quota.mjs";

function environment() {
  const sql = new DatabaseSync(":memory:");
  for (const migration of ["0001_video_chat_quotas", "0002_fal_preview", "0004_public_fal_answers", "0005_double_public_fal_allowance", "0006_daily_public_clip_budget", "0003_owner_fal_previews"]) {
    sql.exec(readFileSync(new URL(`../../migrations/${migration}.sql`, import.meta.url), "utf8"));
  }
  return { ANTHROPIC_API_KEY: "test-anthropic", PEXELS_API_KEY: "test-pexels", FAL_KEY: "test-fal",
    VIDEO_CHAT_FAL_PREVIEW: "enabled", VIDEO_CHAT_QUOTA_SALT: "test-salt-that-is-at-least-32-characters",
    VIDEO_CHAT_QUOTAS: { sql, prepare(query) { return { bind(...args) { return {
      async first() { return sql.prepare(query).get(...args); },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    }; } }; } },
  };
}
const request = () => new Request("https://example.com/api/video-chat?action=response", {
  method: "POST", headers: { origin: "https://example.com", "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
  body: JSON.stringify({ prompt: "Explain the supplied facts with suitable illustrative footage.", mode: "cinematic" }),
});
const template = title => ({ type: "shot", title, subject: title, action: "", narration: `${title} explains the important facts clearly.`, visual: { templateId: "chapterTitle", variables: { title } } });
const footage = (source, title) => ({ type: "shot", title, subject: title, action: "A clear action illustrates this idea.", narration: `${title} reveals this detail.`, footageSource: source });
function providers(env, body, { stockMiss = false } = {}) {
  const counters = { planning: 0, stock: 0, generated: 0, durations: [] };
  const records = [
    { type: "answer", intent: "explanation", musicMood: "off", opening: "", subject: "supplied facts", development: "Explain every important point.", visualDirection: "Natural light." },
    template("Opening fact"), { ...template("Useful next step"), type: "ending" }, template("Important condition"), ...body,
  ];
  const sse = records.map(record => `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: JSON.stringify(record) + "\n" } })}\n\n`).join("");
  const fetcher = async (url, options) => {
    assert.equal(env.VIDEO_CHAT_QUOTAS.sql.prepare("SELECT COUNT(*) AS count FROM video_chat_requests WHERE released = 0").get().count, 1);
    if (url === "https://api.anthropic.com/v1/messages") {
      counters.planning++;
      return new Response(sse);
    }
    if (String(url).startsWith("https://api.pexels.com/v1/videos/search?")) {
      counters.stock++;
      assert.equal(options.headers.Authorization, "test-pexels");
      assert.equal(new URL(url).searchParams.get("per_page"), "12");
      return Response.json({ videos: stockMiss ? [] : [{ id: counters.stock, duration: 12,
        url: "https://www.pexels.com/video/team-discussion-laptop-work-123/", image: "https://images.pexels.com/poster.jpg", user: { name: "Fixture creator" },
        video_files: [{ file_type: "video/mp4", width: 1280, height: 720, link: `https://videos.pexels.com/stock-${counters.stock}.mp4` }],
      }] });
    }
    if (url === "https://queue.fal.run/minimax/h3-max-turbo/text-to-video") {
      counters.generated++;
      counters.durations.push(JSON.parse(options.body).duration);
      const id = counters.generated;
      return Response.json({ request_id: `clip-${id}`, status_url: `https://queue.fal.run/status/${id}`, response_url: `https://queue.fal.run/result/${id}`, cancel_url: `https://queue.fal.run/cancel/${id}` });
    }
    if (String(url).startsWith("https://queue.fal.run/status/") && String(url).endsWith("/stream")) return new Response('data: {"status":"COMPLETED"}\n\n', { headers: { "content-type": "text/event-stream" } });
    if (String(url).startsWith("https://queue.fal.run/result/")) return Response.json({ video: { url: `https://v3.fal.media/${String(url).split("/").at(-1)}.mp4` } });
    assert.fail(`Unexpected provider ${new URL(url).hostname}`);
  };
  return { fetcher, counters };
}
async function collect(response) {
  const events = [];
  for await (const event of decodeVideoSse(response.body)) events.push(event);
  return events;
}

test("one admitted cinematic answer mixes templates, Pexels and capped AI footage without changing its mode", async t => {
  t.mock.method(console, "info", () => undefined);
  const env = environment();
  const { fetcher, counters } = providers(env, [footage("stock", "Team discussion"), footage("generated", "Hidden mechanism"),
    footage("generated", "Abstract connection"), footage("generated", "Future possibility"), footage("stock", "Laptop work"), footage("generated", "Extra generation")]);
  const response = await handleVideoChatRequest({ request: request(), env, fetcher });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-briefings-resolved-video-mode"), "cinematic");
  const events = await collect(response);
  const scenes = events.filter(event => event.type === "scene.add").map(event => event.data.scene);
  // Scene positions are deterministic; concurrent stock lookups may complete in
  // either order, so the stock clip numbers are compared as a set.
  const media = scenes.map(scene => scene.variables.mediaUrl ?? scene.templateId);
  assert.deepEqual(media.map(url => url.includes("fal.media") ? "generated" : url.includes("pexels.com") ? "stock" : url),
    ["stock", "stock", "stock", "generated", "generated", "generated", "stock", "stock", "stock"]);
  assert.deepEqual(media.filter(url => url.includes("fal.media")), ["https://v3.fal.media/1.mp4", "https://v3.fal.media/2.mp4", "https://v3.fal.media/3.mp4"]);
  assert.deepEqual(media.filter(url => url.includes("pexels.com")).sort(), Array.from({ length: 6 }, (_, index) => `https://videos.pexels.com/stock-${index + 1}.mp4`));
  assert.deepEqual(counters, { planning: 1, stock: 6, generated: 3, durations: [5, 8, 8] });
  assert.equal(env.VIDEO_CHAT_QUOTAS.sql.prepare("SELECT SUM(attempts) AS total FROM video_chat_fal_reservations").get().total, 3);
  assert.equal(env.VIDEO_CHAT_QUOTAS.sql.prepare("SELECT COUNT(*) AS count FROM video_chat_requests WHERE released = 0").get().count, 0);
  assert.equal(events.at(-1).data.finishReason, "stop");
});

test("a selected Pexels miss preserves narration without opening a paid-generation reservation", async t => {
  t.mock.method(console, "info", () => undefined);
  const env = environment();
  const { fetcher, counters } = providers(env, [footage("stock", "Team discussion")], { stockMiss: true });
  const events = await collect(await handleVideoChatRequest({ request: request(), env, fetcher }));
  assert.equal(counters.stock, 4);
  assert.equal(counters.generated, 0);
  const scene = events.filter(event => event.type === "scene.add")[2].data.scene;
  assert.equal(scene.templateId, "chapterTitle");
  assert.equal(scene.narration, "Team discussion reveals this detail.");
  assert.equal(env.VIDEO_CHAT_QUOTAS.sql.prepare("SELECT COUNT(*) AS count FROM video_chat_fal_reservations").get().count, 0);
});

test("mixed stock requests cannot bypass response quota admission", async () => {
  const env = environment();
  const actor = await actorHash("192.0.2.1", env.VIDEO_CHAT_QUOTA_SALT);
  for (let index = 0; index < 4; index++) await reserveQuota(env.VIDEO_CHAT_QUOTAS, actor, 8);
  const response = await handleVideoChatRequest({ request: request(), env, fetcher: () => assert.fail("denied request must not call text, stock or generation providers") });
  assert.equal(response.status, 429);
  assert.equal(env.VIDEO_CHAT_QUOTAS.sql.prepare("SELECT COUNT(*) AS count FROM video_chat_fal_reservations").get().count, 0);
});
