/**
 * Pages catch-all proxy: every request to /api/* is forwarded to the
 * terravalue-api Worker via Service Binding. Same-origin from the
 * browser's perspective — replaces Vercel's rewrite rule.
 */
interface Env {
  API: Fetcher;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return env.API.fetch(request);
};
