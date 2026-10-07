import { afterEach, expect, it, vi } from "vitest";
import { requestSpeech } from "../src/video-chat/speech-request";
afterEach(() => vi.useRealTimers());
it("waits for short admission backoff and then retries the exact speech request", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "1" } })).mockResolvedValue(new Response("audio"));
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: "same speech", signal: new AbortController().signal };
  const response = requestSpeech(fetcher, "/speech", init);
  await vi.advanceTimersByTimeAsync(999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await (await response).text()).toBe("audio");
  expect(fetcher.mock.calls[1]).toEqual(["/speech", init]);
});
it.each([[503, "1"], [429, "60"], [429, "0"], [429, "invalid"]])("does not retry provider failures or long/invalid admission waits (%s, %s)", async (status, after) => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status, headers: { "retry-after": after } }));
  expect((await requestSpeech(fetcher, "/speech", {})).status).toBe(status);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("bounds retries and stops promptly on cancellation", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 429, headers: { "retry-after": "1" } }));
  const work = requestSpeech(fetcher, "/speech", {});
  await vi.advanceTimersByTimeAsync(2000);
  expect((await work).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(3);
  const controller = new AbortController();
  const cancelled = requestSpeech(fetcher, "/speech", { signal: controller.signal });
  const rejected = expect(cancelled).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(1);
  controller.abort(); await rejected;
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
