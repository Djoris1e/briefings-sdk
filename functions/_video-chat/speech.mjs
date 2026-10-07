import { providerConfig } from './config.mjs';

const ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const MAX_AUDIO_BYTES = 1024 * 1024;
const unavailable = () => new Error('Speech is temporarily unavailable.');

// Fixed server-owned voice and output contract. Never forward client options.
// https://developers.openai.com/api/docs/guides/text-to-speech
export async function generateSpeech({ text, signal, speaker }, env, fetcher = fetch) {
  if (!env?.OPENAI_API_KEY || typeof text !== 'string' || !text.trim() ||
    text.length > 1000 || signal?.aborted) throw unavailable();
  if (speaker !== undefined && !['host', 'analyst'].includes(speaker)) throw unavailable();
  let reader;
  let response;
  const abort = () => { void reader?.cancel().catch(() => {}); };
  try {
    const config = providerConfig(env);
    const voice = config.speech[speaker ?? 'narrator'];
    response = await fetcher(ENDPOINT, {
      method: 'POST', redirect: 'manual', signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text.trim(), model: config.speech.model, voice, response_format: 'mp3',
        ...(config.speech.language.toLowerCase() === 'auto' ? {} : {
          instructions: `Speak in the language identified by ${config.speech.language}.`,
        }),
      }),
    });
    const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (signal?.aborted || !response.ok || mediaType !== 'audio/mpeg' ||
      Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES || !response.body) throw unavailable();
    reader = response.body.getReader();
    signal?.addEventListener('abort', abort, { once: true });
    const chunks = [];
    let length = 0;
    while (true) {
      if (signal?.aborted) throw unavailable();
      const { done, value } = await reader.read();
      if (signal?.aborted) throw unavailable();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_AUDIO_BYTES) throw unavailable();
      chunks.push(value);
    }
    if (!length) throw unavailable();
    const audio = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.byteLength; }
    // This endpoint returns audio only; the player estimates caption timing.
    return { audio, mediaType: 'audio/mpeg' };
  } catch { throw unavailable(); }
  finally {
    signal?.removeEventListener('abort', abort);
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    } else { await response?.body?.cancel().catch(() => {}); }
  }
}
