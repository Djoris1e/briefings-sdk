import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVideoChatHandler } from '../../src/server/create-video-chat-handler.ts';
import { decodeVideoSse } from '../../src/protocol/sse.ts';
import { searchStock } from '../../functions/_video-chat/stock.mjs';

// Recorded input and local provider double only; no external requests.
const longSubject = 'people review the account records and decide what to do next';
const selection = {subject: 'team', activity: 'reviewing documents'};
const narration = 'Review the supplied records before deciding which experiment to try.';
const template = title => ({title, subject: title, narration: `${title} explains a distinct useful fact.`, visual: {templateId: 'chapterTitle', variables: {title}}});
async function run({subject = longSubject, stockSelection = selection, mediaLed = false, visual = false, generated = false} = {}) {
  const searches = [], diagnostics = [], requests = [], generatedQueries = [];
  const body = {title: 'Review the records', subject, narration, action: 'Review records.', footageSource: generated ? 'generated' : 'stock', stockSelection,
    ...(visual || mediaLed ? {visual: {templateId: 'chapterTitle', variables: {title: 'Review the records'}}} : {})};
  const shots = mediaLed ? [body] : [template('Opening'), template('Context'), body];
  const handler = createVideoChatHandler({authorize: 'none', hybrid: true, mediaLed, heartbeatMs: false,
    generateText: () => {throw new Error('Narration must not be rewritten');},
    searchMedia: async (query, context) => {
      searches.push(query);
      return searchStock(query, {env: {PEXELS_API_KEY: 'recorded-test-key'}, cache: null, signal: context.signal,
        selection: context.scene?.variables.stockSelection, onDiagnostic: event => diagnostics.push(event.reason),
        fetcher: async url => {
          requests.push(new URL(url).searchParams.get('query'));
          return Response.json({videos: [{id: 123, url: 'https://www.pexels.com/video/team-reviewing-documents-123/', duration: 20,
            video_files: [{link: 'https://videos.pexels.com/video-files/123/clip.mp4', file_type: 'video/mp4', width: 1920, height: 1080}]}]});
        }});
    },
    generateVideo: generated ? (query) => {generatedQueries.push(query); return {type: 'video', url: 'https://media.example/generated.mp4', durationSec: 8};} : undefined,
    streamText: async function* () {
      yield JSON.stringify({type: 'answer', opening: '', subject: 'Records', development: 'Explain the supplied facts.', visualDirection: 'Natural office light.'}) + '\n';
      for (const shot of shots) yield JSON.stringify({type: 'shot', ...shot}) + '\n';
      yield JSON.stringify({type: 'ending', ...template('Next step'), subject: ''}) + '\n';
    }});
  const response = await handler(new Request('https://app.example/api?action=response', {method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({prompt: 'Explain the supplied facts.'})}));
  const events = []; for await (const event of decodeVideoSse(response.body)) events.push(event);
  const scenes = events.flatMap(event => event.type === 'scene.add' ? [event.data.scene] : []);
  return {searches, diagnostics, requests, generatedQueries, scene: scenes.find(scene => scene.narration === narration), events};
}

test('reproduces the adapter word-limit mismatch without any request', async () => {
  assert.ok(longSubject.length < 80);
  assert.ok(longSubject.split(' ').length > 8);
  const diagnostics = [];
  const result = await searchStock(longSubject, {env: {PEXELS_API_KEY: 'recorded-test-key'}, selection,
    fetcher: () => {throw new Error('Must reject before any provider request');}, onDiagnostic: event => diagnostics.push(event.reason)});
  assert.equal(result, null);
  assert.deepEqual(diagnostics, ['invalid_input']);
});
for (const configuration of [{mediaLed: true}, {visual: true}, {}]) {
  test(`uses short authored stock metadata for long subjects: ${JSON.stringify(configuration)}`, async () => {
    const result = await run(configuration);
    assert.deepEqual(result.searches, ['team reviewing documents']);
    assert.deepEqual(result.requests, ['team reviewing documents']);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.scene.narration, narration);
    assert.equal(result.scene.variables.mediaUrl, 'https://videos.pexels.com/video-files/123/clip.mp4');
  });
}
test('uses the complete short subject when combining metadata exceeds 80 characters', async () => {
  const subject = 'abcdefghijklmnopqrstuv abcdefghijklmnopqrstuv';
  const result = await run({stockSelection: {subject, activity: 'abcdefghijklmnopqrstuv abcdefghijklmnopqrstuv'}});
  assert.deepEqual(result.searches, [subject]);
  assert.deepEqual(result.diagnostics, []);
});
test('keeps valid existing queries unchanged', async () => {
  const result = await run({subject: 'Team reviewing documents'});
  assert.deepEqual(result.searches, ['Team reviewing documents']);
  assert.deepEqual(result.requests, ['team reviewing documents']);
});
for (const stockSelection of [undefined, {subject: 'the and with'}, {subject: 'https://untrusted.example/image'}]) {
  test(`keeps narration without dispatching an invalid stock query: ${JSON.stringify(stockSelection)}`, async () => {
    const result = await run({stockSelection: stockSelection ?? null, mediaLed: true});
    assert.deepEqual(result.searches, []);
    assert.deepEqual(result.requests, []);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.scene.narration, narration);
    assert.equal(result.scene.variables.mediaUrl, undefined);
  });
}
test('does not shorten generated-video subjects or switch their provider', async () => {
  const result = await run({generated: true});
  assert.deepEqual(result.generatedQueries, [longSubject]);
  assert.deepEqual(result.searches, []);
});
