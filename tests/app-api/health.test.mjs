import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequest } from "../../functions/api/health.mjs";

const identity = { commit: "a".repeat(40), sourceSha256: "b".repeat(64) };
const request = () => new Request("https://example.com/api/health");
test("health returns the static build identity with no cache", async () => {
  const response = await onRequest({ request: request(), env: { ASSETS: { fetch: async url => {
    assert.equal(String(url), "https://example.com/app-build.json");
    return Response.json(identity);
  } } } });
  assert.deepEqual(await response.json(), identity);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

for (const body of [null, { commit: "bad", sourceSha256: "bad" }, "<!doctype html>"]) {
  test(`health rejects invalid identity ${JSON.stringify(body)}`, async () => {
    const response = await onRequest({ request: request(), env: { ASSETS: { fetch: async () => Response.json(body) } } });
    assert.equal(response.status, 503);
  });
}
test("health rejects missing assets", async () => {
  const response = await onRequest({ request: request(), env: { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } } });
  assert.equal(response.status, 503);
});
test("health rejects writes without reading assets", async () => {
  const response = await onRequest({ request: new Request("https://example.com/api/health", { method: "POST" }), env: { ASSETS: { fetch: () => assert.fail("Must not fetch") } } });
  assert.equal(response.status, 405);
});
