import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateSpeech } from '../../functions/_video-chat/speech.mjs';
const env = { OPENAI_API_KEY: 'test-only-secret' };
const audio = (bytes = new Uint8Array([73, 68, 51]), headers = {}) => new Response(bytes, {
  headers: { 'content-type': 'audio/mpeg', ...headers },
});
test('speech uses the server-owned OpenAI MP3 contract and forwards abort signal', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await generateSpeech({ text: ' Hello. ', signal: controller.signal, voice: 'onyx', model: 'expensive', response_format: 'wav', instructions: 'attacker' }, env, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.signal, controller.signal);
    assert.equal(init.headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
    assert.deepEqual(JSON.parse(init.body), {
      input: 'Hello.', model: 'gpt-4o-mini-tts', voice: 'marin', response_format: 'mp3',
    });
    return audio();
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { audio: new Uint8Array([73, 68, 51]), mediaType: 'audio/mpeg' });
});

test('missing key, empty, non-string, oversized input or prior cancellation never calls provider', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return audio(); };
  for (const text of ['', ' ', null, 4, 'x'.repeat(1001)]) {
    await assert.rejects(generateSpeech({ text }, env, fetcher), /Speech is temporarily unavailable/);
  }
  await assert.rejects(generateSpeech({ text: 'Hi' }, {}, fetcher));
  await assert.rejects(generateSpeech({ text: 'Hi' }, { XAI_API_KEY: 'unused' }, fetcher));
  await assert.rejects(generateSpeech({ text: 'Hi', signal: AbortSignal.abort() }, env, fetcher));
  assert.equal(calls, 0);
});
test('redirects, provider errors and non-MP3 responses are rejected without exposing provider text', async () => {
  for (const response of [
    new Response(env.OPENAI_API_KEY, { status: 302, headers: { location: 'https://evil.example' } }),
    new Response(env.OPENAI_API_KEY, { status: 500 }),
    audio(new Uint8Array([1]), { 'content-type': 'application/json' }),
    audio(new Uint8Array([1]), { 'content-type': 'audio/wav' }),
    audio(new Uint8Array()),
  ]) {
    let calls = 0;
    await assert.rejects(generateSpeech({ text: 'Hi' }, env, async () => { calls++; return response; }), { message: 'Speech is temporarily unavailable.' });
    assert.equal(calls, 1);
  }
  await assert.rejects(generateSpeech({ text: 'Hi' }, env, () => { throw Error(env.OPENAI_API_KEY); }), { message: 'Speech is temporarily unavailable.' });
});
test('declared oversized audio is cancelled before reading', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(generateSpeech({ text: 'Hi' }, env, async () => new Response(stream, {
    headers: { 'content-type': 'audio/mpeg', 'content-length': String(1024 * 1024 + 1) },
  })));
  assert.equal(cancelled, true);
});
test('chunked audio enforces one MiB bound even when content-length understates it', async () => {
  let cancelled = false;
  let chunks = 0;
  const stream = new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(512 * 1024)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(generateSpeech({ text: 'Hi' }, env, async () => new Response(stream, {
    headers: { 'content-type': 'audio/mpeg', 'content-length': '1' },
  })));
  assert.equal(cancelled, true);
  assert.ok(chunks <= 4);
});
test('exactly one MiB audio is accepted', async () => {
  const result = await generateSpeech({ text: 'Hi' }, env, async () => audio(new Uint8Array(1024 * 1024)));
  assert.equal(result.audio.byteLength, 1024 * 1024);
});
test('abort during audio body consumption cancels the stream and rejects partial audio', async () => {
  const controller = new AbortController();
  let cancelled = false;
  let reading;
  const started = new Promise(resolve => { reading = resolve; });
  const stream = new ReadableStream({
    pull() { reading(); },
    cancel() { cancelled = true; },
  });
  const result = generateSpeech({ text: 'Hi', signal: controller.signal }, env, async () => new Response(stream, { headers: { 'content-type': 'audio/mpeg' } }));
  await started;
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(result, { message: 'Speech is temporarily unavailable.' });
  assert.equal(cancelled, true);
});

test('podcast roles select distinct configured voices and reject client voice injection', async () => {
  const voices = [];
  const configured = { ...env, BRIEFING_HOST_VOICE: 'coral', BRIEFING_ANALYST_VOICE: 'onyx' };
  for (const speaker of ['host', 'analyst']) await generateSpeech({ text: 'Hello.', speaker, voice: 'attacker' }, configured, async (_url, init) => {
    voices.push(JSON.parse(init.body).voice);
    return audio();
  });
  assert.deepEqual(voices, ['coral', 'onyx']);
  await assert.rejects(() => generateSpeech({ text: 'Hello.', speaker: 'attacker' }, configured, () => { throw new Error('Must not fetch'); }));
});

test('default podcast roles select marin and cedar', async () => {
  const voices = [];
  for (const speaker of ['host', 'analyst']) await generateSpeech({ text: 'Hello.', speaker }, env, async (_url, init) => {
    voices.push(JSON.parse(init.body).voice);
    return audio();
  });
  assert.deepEqual(voices, ['marin', 'cedar']);
});

test('server speech configuration controls model, narrator and language instructions', async () => {
  const configured = { ...env, BRIEFING_CONFIG: { speech: {
    model: 'gpt-4o-mini-tts-2025-12-15', narrator: 'coral', language: 'nl-NL',
  } } };
  await generateSpeech({ text: 'Hallo.', language: 'en', instructions: 'attacker' }, configured, async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), {
      input: 'Hallo.', model: 'gpt-4o-mini-tts-2025-12-15', voice: 'coral', response_format: 'mp3',
      instructions: 'Speak in the language identified by nl-NL.',
    });
    return audio();
  });
});

test('abort before provider headers cancels its body without returning audio', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(generateSpeech({ text: 'Hi', signal: controller.signal }, env, async () => {
    controller.abort();
    return new Response(stream, { headers: { 'content-type': 'audio/mpeg' } });
  }), { message: 'Speech is temporarily unavailable.' });
  assert.equal(cancelled, true);
});

test('audio read failures are private and release the body lock', async () => {
  const stream = new ReadableStream({ pull(controller) { controller.error(new Error(env.OPENAI_API_KEY)); } });
  await assert.rejects(generateSpeech({ text: 'Hi' }, env, async () => new Response(stream, {
    headers: { 'content-type': 'audio/mpeg' },
  })), { message: 'Speech is temporarily unavailable.' });
  assert.equal(stream.locked, false);
});

test('invalid server configuration fails privately without calling the provider', async () => {
  let calls = 0;
  await assert.rejects(generateSpeech({ text: 'Hi' }, {
    ...env, BRIEFING_CONFIG: { speech: { model: env.OPENAI_API_KEY } },
  }, async () => { calls++; return audio(); }), { message: 'Speech is temporarily unavailable.' });
  assert.equal(calls, 0);
});
