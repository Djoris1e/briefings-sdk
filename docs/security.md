# Security

The SDK validates protocol shape and content. Identity, admission, spending
policy and infrastructure controls belong to the host that mounts
`createBriefingHandler`. The Cloudflare route in `functions/api/video-chat.mjs`
shows one way to do that for the local preview; it is not a production
deployment.

## Required server controls

- Authenticate the request before reading the prompt body.
- `createBriefingHandler` and `createVideoChatHandler` require an explicit
  `authorize` option. `authorize: "none"` is an explicit opt-out for in-process
  tests or for a host that admits requests in front of the handler, as the
  reference route does. Never use it alone on a billable endpoint.
- Allowlist browser origins with `allowedOrigins`; CORS is not authentication.
- Bound request bytes (`maxBodyBytes`, default 64 KiB), prompt length
  (12,000 characters), screenshots (four), scene count, duration, tokens,
  concurrency and spend. Reserve quota before every paid callback and release it
  on completion, cancellation and failure.
- Keep provider keys, system prompts, model and voice choices server-side.
  Request bodies cannot select a provider, model, voice or key; keep it that
  way in any adapter you write.
- Treat supplied text and screenshot `alt` as untrusted data. The prompts
  already say so; do not add host instructions into the user prompt.
- Screenshot URLs are checked for public HTTPS, length and disallowed hosts
  only. The validator does not fetch them. Restrict media domains, types,
  sizes, redirects and fetch timeouts in your adapters.
- Propagate cancellation and use deadlines for every provider call.
- Return safe typed errors; log private causes only in protected observability.

## Logging

Do not log raw source text, follow-ups, authorization headers, provider deltas,
audio or signed media URLs by default. Record request ID, fixed diagnostic
codes, model ID, timing, event counts, error codes and token usage. The SDK's
`onDiagnostic` events carry only such classifications.

## Local development

`npm run dev` binds the reference API to loopback, uses a local D1 database and
salt under `.wrangler/local`, and enables paid providers only for that process.
Localhost requests take the owner clip allowance because the hostname is a
loopback address and `VIDEO_CHAT_LOCAL=enabled` is set by the dev script; that
gate must not be reproduced on a reachable host.

## Data

The component keeps briefings and conversation in memory for the mounted
session only. Nothing is persisted or exported in this slice. If a host adds
storage, treat saved briefings and videos as viewer data with retention,
encryption and deletion policy; see [persistence](persistence.md).

Report suspected vulnerabilities through [SECURITY.md](../SECURITY.md).
