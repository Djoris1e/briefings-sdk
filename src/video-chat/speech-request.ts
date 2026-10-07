/** Retry only rejected admission requests, never a paid provider failure. */
export async function requestSpeech(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    init.signal?.throwIfAborted();
    const response = await fetcher(url, init);
    const seconds = Number(response.headers.get("retry-after"));
    if (response.status !== 429 || attempt >= 2 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 2) return response;
    await response.body?.cancel();
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(init.signal?.reason); };
      const timer = setTimeout(() => { init.signal?.removeEventListener("abort", abort); resolve(); }, seconds * 1000);
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener("abort", abort, { once: true });
    });
  }
}
