import assert from 'node:assert/strict';
import { test } from 'node:test';
import { providerText } from '../../functions/_video-chat/provider.mjs';
const schema = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false };
const context = { task: 'briefing', systemPrompt: 'Server instructions', userPrompt: 'Supplied source', maxOutputTokens: 4096, outputSchema: schema, signal: new AbortController().signal };

test('briefing generation enforces its server schema in the provider request', async () => {
  const result = await providerText(context, { ANTHROPIC_API_KEY: 'test-only' }, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.output_config, { format: { type: 'json_schema', schema } });
    assert.equal(body.stream, false);
    return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"summary":"Ready"}' }] });
  });
  assert.equal(result, '{"summary":"Ready"}');
});
test('ordinary narration does not receive a briefing schema', async () => {
  await providerText({ ...context, task: 'narration' }, { ANTHROPIC_API_KEY: 'test-only' }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).output_config, undefined);
    return Response.json({ content: [{ type: 'text', text: 'Ready' }] });
  });
});
test('truncated or refused structured responses fail without presenting partial content', async () => {
  for (const stop_reason of ['max_tokens', 'refusal']) {
    await assert.rejects(() => providerText(context, { ANTHROPIC_API_KEY: 'test-only' }, async () => Response.json({ stop_reason, content: [{ type: 'text', text: '{"summary":' }] })));
  }
});

test('article preparation keeps the complete schema and the server token ceiling in one call', async () => {
  const { prepareBriefing } = await import('../../src/briefing/prepare.ts');
  const prompt = 'Feature A is in preview and requires admin consent.';
  const article = { title: 'Assess the preview', dek: 'Start with the known prerequisites.', sections: [
    { heading: 'Known facts', paragraphs: [prompt] },
    { heading: 'Suggested next step', paragraphs: ['Ask an admin to assess a bounded pilot.'] },
    { heading: 'Source limits', paragraphs: ['The source does not establish measured benefits.'] },
  ] };
  let calls = 0;
  const result = await prepareBriefing({ prompt }, { generateText: request => providerText(request, { ANTHROPIC_API_KEY: 'test-only' }, async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 6144);
    assert.equal(body.stream, false);
    const grammar = body.output_config.format.schema;
    assert.ok(grammar.required.includes('article'));
    assert.equal(grammar.properties.article.additionalProperties, false);
    assert.equal(grammar.properties.article.properties.sections.items.additionalProperties, false);
    return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
      summary: prompt, article, facts: [{ id: 'f1', text: prompt, sourceId: 'source1' }], priorities: [],
      podcast: { exchanges: { opening: { host: 'What is known?', analyst: prompt, factIds: ['f1'] }, detail: null, closing: null } },
    }) }] });
  }) });
  assert.equal(calls, 1);
  assert.deepEqual(result.article, article);
  assert.equal(result.summary, prompt);
});
