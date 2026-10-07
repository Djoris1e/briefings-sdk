import assert from 'node:assert/strict';
import { test } from 'node:test';
import { providerStream, providerText } from '../../functions/_video-chat/provider.mjs';

const context = { task: 'narration', systemPrompt: 'Server instructions', userPrompt: 'Source text', maxOutputTokens: 99999, signal: new AbortController().signal };
const env = { OPENAI_API_KEY: 'test-only' };
const completed = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Ready' }] }], usage: { input_tokens: 9, output_tokens: 24 } };
const delta = text => ({ type: 'response.output_text.delta', delta: text });
const terminal = { type: 'response.completed', response: completed };
const sse = event => `data: ${JSON.stringify(event)}\n\n`;
const collect = async iterable => { let result = ''; for await (const text of iterable) result += text; return result; };
const responseFor = events => new Response(events.map(sse).join(''));

test('OpenAI requests keep credentials, prompts, storage, model and token ceilings server-owned', async () => {
  let request;
  assert.equal(await providerText(context, env, async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return Response.json(completed);
  }), 'Ready');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.redirect, 'manual');
  assert.equal(request.options.signal, context.signal);
  assert.deepEqual(request.options.headers, { 'content-type': 'application/json', authorization: 'Bearer test-only' });
  assert.deepEqual(request.body, {
    model: 'gpt-6-sol', max_output_tokens: 512, stream: false, store: false,
    reasoning: { effort: 'none' }, instructions: context.systemPrompt,
    input: [{ role: 'user', content: context.userPrompt }],
  });
  await collect(providerStream(context, env, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.max_output_tokens, 4096);
    assert.equal(body.stream, true);
    assert.equal(body.text, undefined);
    return responseFor([delta('Ready'), terminal]);
  }));
});

test('a configured nonreasoning model can omit reasoning entirely', async () => {
  await providerText(context, { ...env, BRIEFING_CONFIG: { planner: { model: 'gpt-4.1', reasoningEffort: null } } }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).reasoning, undefined);
    return Response.json(completed);
  });
});

test('text requires completed nonempty output and hides upstream failures', async () => {
  for (const data of [{ ...completed, status: 'failed' }, { ...completed, status: 'in_progress' }, { output: completed.output }, { status: 'completed', output: [] }, null]) {
    await assert.rejects(providerText(context, env, async () => Response.json(data)), /^Error: Provider did not return a complete response$/);
  }
  await assert.rejects(providerText(context, env, async () => new Response('private invalid JSON')), /^Error: Provider did not return a complete response$/);
  await assert.rejects(providerText(context, env, async () => { throw new Error('private transport data'); }), /^Error: Provider unavailable$/);
  await assert.rejects(providerText(context, env, async () => new Response('private failure', { status: 500 })), /^Error: Provider unavailable$/);
  await assert.rejects(providerText({ ...context, userPrompt: 'x'.repeat(60001) }, env, () => assert.fail('must not fetch')), /Provider input limit/);
});

test('stream decodes fragmented UTF-8, CRLF and multiline SSE with terminal usage', async () => {
  const multiline = 'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta",\r\ndata: "delta":"café"}\r\n\r\n';
  const bytes = new TextEncoder().encode(': comment\r\n\r\n' + multiline + sse(terminal).trimEnd());
  let cursor = 0;
  const reports = [];
  const response = new Response(new ReadableStream({ pull(controller) {
    if (cursor === bytes.length) controller.close();
    else controller.enqueue(bytes.slice(cursor, ++cursor));
  } }));
  assert.equal(await collect(providerStream(context, env, async () => response, report => reports.push(report))), 'café');
  assert.equal(reports.length, 1);
  const { durationMs, firstTextMs, ...report } = reports[0];
  assert.ok(firstTextMs >= 0 && firstTextMs <= durationMs);
  assert.deepEqual(report, { outcome: 'complete', stopReason: 'end_turn', inputTokens: 9, outputTokens: 24 });
  assert.equal(response.body.locked, false);
});

test('streams reject incomplete, failed, refused and missing completion without leaking provider data', async () => {
  const cases = [
    [[], 'unknown'],
    [[{ type: 'error', message: 'private failure' }], 'unknown'],
    [[{ type: 'response.failed', response: { status: 'failed', error: { message: 'private failure' } } }], 'unknown'],
    [[{ type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: -9, output_tokens: 1e10 } } }], 'max_tokens'],
    [[{ type: 'response.refusal.delta', delta: 'private refusal' }], 'refusal'],
    [[{ type: 'response.completed', response: { ...completed, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'private' }] }] } }], 'refusal'],
    [[{ type: 'response.completed', response: { status: 'incomplete' } }], 'unknown'],
  ];
  for (const [events, stopReason] of cases) {
    const reports = [];
    await assert.rejects(collect(providerStream(context, env, async () => responseFor([delta('partial'), ...events]), report => reports.push(report))), /^Error: Provider stream failed$/);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].outcome, 'error');
    assert.equal(reports[0].stopReason, stopReason);
    if (stopReason === 'max_tokens') {
      assert.equal(reports[0].inputTokens, 0);
      assert.equal(reports[0].outputTokens, 4096);
    }
  }
  for (const response of [responseFor([terminal]), new Response('data: private invalid JSON\n\n'), new Response('data: [DONE]\n\n'), new Response(null)]) {
    await assert.rejects(collect(providerStream(context, env, async () => response)), /^Error: Provider stream failed$/);
  }
});

test('downstream return cancels provider reader and reports cancellation once', async () => {
  let canceled = false;
  const reports = [];
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(sse(delta('first')))); },
    cancel() { canceled = true; },
  }));
  const iterator = providerStream(context, env, async () => response, report => reports.push(report));
  assert.deepEqual(await iterator.next(), { value: 'first', done: false });
  await iterator.return();
  assert.equal(canceled, true);
  assert.equal(response.body.locked, false);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].outcome, 'canceled');
});

test('aborted streams report cancellation and diagnostics exceptions cannot change output', async () => {
  const controller = new AbortController();
  const reports = [];
  const iterator = providerStream({ ...context, signal: controller.signal }, env, async () => responseFor([delta('first'), terminal]), report => reports.push(report));
  await iterator.next();
  controller.abort();
  await assert.rejects(iterator.next(), { name: 'AbortError' });
  assert.equal(reports[0].outcome, 'canceled');
  assert.equal(await collect(providerStream(context, env, async () => responseFor([delta('Ready'), terminal]), () => { throw new Error('diagnostics'); })), 'Ready');
});
