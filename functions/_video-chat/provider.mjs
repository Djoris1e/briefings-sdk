import { providerConfig } from './config.mjs';

const URL = 'https://api.openai.com/v1/responses';
const bounded = (value, max) => Number.isFinite(value) && value >= 0 ? Math.min(max, Math.floor(value)) : 0;
const content = data => (Array.isArray(data?.output) ? data.output : [])
  .filter(item => item?.type === 'message')
  .flatMap(item => Array.isArray(item.content) ? item.content : []);
const refused = data => content(data).some(item => item?.type === 'refusal');

// The model and ceilings are server-owned. Requests cannot choose providers,
// models, token ceilings, generated video, or speech services.
async function call(context, env, fetcher, stream) {
  const config = providerConfig(env);
  if (context.systemPrompt.length + context.userPrompt.length > 60000)
    throw new Error('Provider input limit');
  let response;
  try {
    response = await fetcher(URL, {
      method: 'POST',
      redirect: 'manual',
      signal: context.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.planner.model,
        max_output_tokens: stream ? config.planner.videoTokens : Math.min(context.maxOutputTokens, context.task === 'briefing' ? config.planner.briefingTokens : 512),
        stream,
        store: false,
        ...(config.planner.reasoningEffort ? { reasoning: { effort: config.planner.reasoningEffort } } : {}),
        ...(!stream && context.task === 'briefing' && context.outputSchema ? {
          text: { format: { type: 'json_schema', name: 'briefing', strict: true, schema: context.outputSchema } },
        } : {}),
        instructions: context.systemPrompt,
        input: [{ role: 'user', content: context.userPrompt }],
      }),
    });
  } catch {
    context.signal?.throwIfAborted();
    throw new Error('Provider unavailable');
  }
  if (!response.ok) {
    console.warn('video_chat_provider_failure', { provider: 'openai', status: response.status });
    await response.body?.cancel().catch(() => {});
    throw new Error('Provider unavailable');
  }
  return response;
}

export async function providerText(context, env, fetcher) {
  const response = await call(context, env, fetcher, false);
  let data;
  try { data = await response.json(); } catch {
    context.signal?.throwIfAborted();
    throw new Error('Provider did not return a complete response');
  }
  context.signal?.throwIfAborted();
  const text = content(data).filter(item => item?.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('');
  if (data?.status !== 'completed' || refused(data) || !text.trim())
    throw new Error('Provider did not return a complete response');
  return text;
}

export function providerStream(context, env, fetcher, onComplete) {
  return (async function* () {
    const startedAt = performance.now();
    const elapsed = () => bounded(performance.now() - startedAt, 150000);
    let firstTextMs;
    let reader;
    // Returning from a suspended yield means the downstream consumer canceled.
    let outcome = 'canceled';
    let stopReason = 'unknown';
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const response = await call(context, env, fetcher, true);
      if (!response.body) throw new Error('Provider stream unavailable');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        context.signal?.throwIfAborted();
        const { value, done } = await reader.read();
        context.signal?.throwIfAborted();
        buffer += decoder.decode(value, { stream: !done });
        const records = buffer.split(/\r?\n\r?\n/);
        buffer = records.pop() ?? '';
        // A final event can arrive without its trailing blank line.
        if (done && buffer.trim()) { records.push(buffer); buffer = ''; }
        for (const record of records) {
          context.signal?.throwIfAborted();
          const data = record.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
          if (!data || data === '[DONE]') continue;
          const event = JSON.parse(data);
          if (event.response?.usage) {
            inputTokens = bounded(event.response.usage.input_tokens, 100000);
            outputTokens = bounded(event.response.usage.output_tokens, 4096);
          }
          if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done' || refused(event.response)) {
            stopReason = 'refusal';
            throw new Error('Provider stream failed');
          }
          if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') {
            if (event.response?.incomplete_details?.reason === 'max_output_tokens') stopReason = 'max_tokens';
            throw new Error('Provider stream failed');
          }
          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string' && event.delta.length > 0) {
            firstTextMs ??= elapsed();
            yield event.delta;
          }
          if (event.type === 'response.completed') {
            context.signal?.throwIfAborted();
            if (event.response?.status !== 'completed' || firstTextMs === undefined) throw new Error('Provider stream failed');
            stopReason = 'end_turn';
            outcome = 'complete';
            return;
          }
        }
        if (done) throw new Error('Provider stream failed');
      }
    } catch {
      outcome = context.signal?.aborted ? 'canceled' : 'error';
      context.signal?.throwIfAborted();
      throw new Error('Provider stream failed');
    } finally {
      if (context.signal?.aborted) outcome = 'canceled';
      try { onComplete?.({ outcome, stopReason, inputTokens, outputTokens, durationMs: elapsed(), ...(firstTextMs === undefined ? {} : { firstTextMs }) }); } catch { /* Diagnostics cannot alter provider output. */ }
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  })();
}
