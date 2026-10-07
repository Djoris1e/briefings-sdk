export async function onRequest({ request, env }) {
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers });
  try {
    // Production reads the build artifact; each local server supplies its own
    // frozen copy without rewriting any file watched by other running workers.
    const response = await env.ASSETS.fetch(new URL("/app-build.json", request.url));
    if (!response.ok) throw new Error("Build identity unavailable");
    const identity = await response.json();
    if (!/^[a-f0-9]{40}$/.test(identity?.commit) || !/^[a-f0-9]{64}$/.test(identity?.sourceSha256)) {
      throw new Error("Invalid build identity");
    }
    return Response.json({ commit: identity.commit, sourceSha256: identity.sourceSha256 }, { headers });
  } catch {
    return new Response("Build identity unavailable", { status: 503, headers });
  }
}
