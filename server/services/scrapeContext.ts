/**
 * Which runtime is executing, and which scrape run we are inside.
 *
 * The Node process and the Cloudflare queue pipeline share every service module
 * and upsert the same `auctions` rows. Without a tag, a parallel run can only be
 * eyeballed ("both seem to be working") rather than measured — you cannot tell
 * which runtime actually found a listing, or which sources one covers that the
 * other misses.
 *
 * Module-level state is safe here: a Worker isolate handles one queue batch at a
 * time for our purposes, and the Node process is single-runtime by definition.
 * The runtime is auto-detected so nothing silently reports as the wrong one if an
 * entry point forgets to set it.
 */

export type Runtime = 'cloudflare-queue' | 'node';

/**
 * Cloudflare Workers set `navigator.userAgent` to exactly this. It is the
 * documented way to detect the runtime without a build-time flag.
 */
function detectRuntime(): Runtime {
  try {
    const nav = (globalThis as { navigator?: { userAgent?: string } }).navigator;
    return nav?.userAgent === 'Cloudflare-Workers' ? 'cloudflare-queue' : 'node';
  } catch {
    return 'node';
  }
}

let runtime: Runtime = detectRuntime();
let runId: string | null = null;

export function setScrapeContext(next: { runtime?: Runtime; runId?: string | null }): void {
  if (next.runtime) runtime = next.runtime;
  if (next.runId !== undefined) runId = next.runId;
}

export function getRuntime(): Runtime {
  return runtime;
}

export function getRunId(): string | null {
  return runId;
}
