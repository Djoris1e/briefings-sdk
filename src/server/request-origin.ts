/**
 * Cross-site write protection. Browsers attach an Origin header to every
 * cross-site POST, including "simple" requests that skip the CORS preflight,
 * so a host that authenticates with cookies would otherwise pay for requests
 * forged by another site. Without an explicit allow list only the handler's
 * own origin may write; hosts behind a proxy that rewrites the URL must set
 * `allowedOrigins`.
 */
export function originForbidden(request: Request, allowedOrigins?: readonly string[]): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (allowedOrigins) return !allowedOrigins.includes(origin);
  return origin !== new URL(request.url).origin;
}

/** JSON write operations must declare JSON; text/plain bodies never reach a provider. */
export function declaresJson(request: Request): boolean {
  return /^application\/json\s*(?:;|$)/i.test(request.headers.get("content-type") ?? "");
}
