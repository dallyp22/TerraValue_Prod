/**
 * Queue-based scrape pipeline.
 *
 * WHY THIS EXISTS: the scrape used to run as one sequential 51-source crawl
 * inside a single cron invocation. Measured full runs take 57-206 minutes and
 * issue ~1,400 detail fetches; a Cron Trigger gets 15 minutes of wall clock and
 * one subrequest budget. In production it exhausted that budget inside the first
 * one or two sources, every later source logged "0 URLs found", and because the
 * errors were caught-and-logged the whole thing looked healthy while capturing
 * roughly 0.8% of the auctions it should have.
 *
 * The fix is not a bigger limit — no limit is big enough. It is fan-out: each
 * unit of work becomes its own queue message, and therefore its own invocation
 * with its own subrequest and CPU budget, plus retries and a dead-letter queue.
 *
 *   cron ──produce──> tv-scrape-sources   one message per source
 *                            │ discovery only
 *                            ↓
 *                     tv-scrape-details   one message per listing URL
 *                            │ scrape + save one listing
 *                            ↓
 *                     tv-enrich           OpenAI enrichment + CSR2 valuation
 *
 * Enrichment gets its own queue because in the old Worker path
 * `enrichmentQueue.startProcessing()` was fire-and-forget: the invocation ended
 * and the work was dropped. A queue message cannot be dropped that way.
 */
import type { Env } from './env';
import { auctionScraperService } from '../../server/services/auctionScraper';
import { setScrapeContext } from '../../server/services/scrapeContext';
import { auctionEnrichmentService } from '../../server/services/auctionEnrichment';
import { db } from '../../server/db';
import { scrapeSourceRuns, auctions } from '@shared/schema';
import { sql as dsql, inArray } from 'drizzle-orm';

/**
 * Record what a source actually produced. Upserted on (run_id, runtime,
 * source_name) so a retried message corrects its row instead of double-counting.
 */
async function recordSourceRun(row: {
  runId: string;
  sourceName: string;
  discovered?: number;
  queued?: number;
  dropped?: number;
  saved?: number;
  failed?: number;
  skippedFresh?: number;
  error?: string;
}): Promise<void> {
  try {
    await db
      .insert(scrapeSourceRuns)
      .values({
        runId: row.runId,
        runtime: 'cloudflare-queue',
        sourceName: row.sourceName,
        discovered: row.discovered ?? 0,
        queued: row.queued ?? 0,
        dropped: row.dropped ?? 0,
        saved: row.saved ?? 0,
        failed: row.failed ?? 0,
        skippedFresh: row.skippedFresh ?? 0,
        finishedAt: new Date(),
        error: row.error,
      })
      .onConflictDoUpdate({
        target: [scrapeSourceRuns.runId, scrapeSourceRuns.runtime, scrapeSourceRuns.sourceName],
        set: {
          // Discovery counts are written once by the source consumer; the detail
          // consumer then upserts the same row carrying zeros for them. Taking
          // the max keeps those zeros from erasing the real figures — plain
          // assignment here reported "discovered 0, saved 9", which reads as a
          // broken source.
          discovered: dsql`GREATEST(${scrapeSourceRuns.discovered}, excluded.discovered)`,
          queued: dsql`GREATEST(${scrapeSourceRuns.queued}, excluded.queued)`,
          dropped: dsql`GREATEST(${scrapeSourceRuns.dropped}, excluded.dropped)`,
          skippedFresh: dsql`GREATEST(${scrapeSourceRuns.skippedFresh}, excluded.skipped_fresh)`,
          // Saves and failures genuinely accumulate across detail batches.
          saved: dsql`${scrapeSourceRuns.saved} + excluded.saved`,
          failed: dsql`${scrapeSourceRuns.failed} + excluded.failed`,
          finishedAt: new Date(),
          error: dsql`COALESCE(excluded.error, ${scrapeSourceRuns.error})`,
        },
      });
  } catch (err) {
    // Telemetry must never break a scrape.
    console.error('⚠️  telemetry write failed:', err instanceof Error ? err.message : err);
  }
}

export type SourceMessage = { kind: 'source'; name: string; url: string; searchPath?: string; runId: string };
export type DetailMessage = { kind: 'detail'; url: string; sourceName: string; runId: string };
export type EnrichMessage = { kind: 'enrich'; auctionId: number; runId: string };

/** Cloudflare caps a single sendBatch at 100 messages. */
const SEND_BATCH_MAX = 100;

async function sendAll<T>(queue: Queue<T>, messages: T[]): Promise<void> {
  for (let i = 0; i < messages.length; i += SEND_BATCH_MAX) {
    await queue.sendBatch(
      messages.slice(i, i + SEND_BATCH_MAX).map((body) => ({ body })),
    );
  }
}

/**
 * Drop URLs we already hold and have no reason to re-fetch.
 *
 * ~45% of every run's detail scrapes were re-fetching listings already in the
 * table — 500 of the last 1,099. At ~1,900 Firecrawl calls per run across two
 * runtimes that is the single largest source of waste, and it is what makes the
 * jump to 120 sources unaffordable.
 *
 * Deliberately lifecycle-aware rather than a flat TTL, because a listing is not
 * equally likely to change over its life:
 *   - never seen            -> always fetch
 *   - sale within 7 days    -> always fetch; date corrections, added tracts and
 *                              sold status all land in the final week, and this
 *                              is exactly the window a client notices
 *   - sale already past     -> skip; the archiver owns these
 *   - otherwise             -> skip if we refreshed it within STALE_AFTER_DAYS
 *
 * A skipped URL is NOT lost coverage — we already have the row. It is recorded
 * separately from `dropped` (cap overflow) so the scorecard cannot confuse a
 * saved call with a missed auction.
 */
const STALE_AFTER_DAYS = 3;
const IMMINENT_DAYS = 7;

async function filterFreshlyScraped(urls: string[]): Promise<{ toFetch: string[]; skipped: number }> {
  if (urls.length === 0) return { toFetch: [], skipped: 0 };
  try {
    const known = await db
      .select({ url: auctions.url, updatedAt: auctions.updatedAt, auctionDate: auctions.auctionDate })
      .from(auctions)
      .where(inArray(auctions.url, urls));

    const now = Date.now();
    const staleMs = STALE_AFTER_DAYS * 86_400_000;
    const imminentMs = IMMINENT_DAYS * 86_400_000;
    const skip = new Set<string>();

    for (const row of known) {
      const date = row.auctionDate ? new Date(row.auctionDate).getTime() : null;
      // Imminent sales keep getting re-checked, whatever their refresh age.
      if (date !== null && date >= now && date - now <= imminentMs) continue;
      // Past sales are the archiver's problem, not ours.
      const refreshed = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
      if (date !== null && date < now) { skip.add(row.url); continue; }
      if (now - refreshed < staleMs) skip.add(row.url);
    }

    return { toFetch: urls.filter((u) => !skip.has(u)), skipped: skip.size };
  } catch (err) {
    // Never let this optimisation cost us coverage — on error, fetch everything.
    console.error('⚠️  freshness check failed, fetching all:', err instanceof Error ? err.message : err);
    return { toFetch: urls, skipped: 0 };
  }
}

/**
 * Producer. Fans every configured source out as its own message.
 *
 * Deliberately does no scraping itself — this must stay well inside the cron
 * invocation budget no matter how many sources are configured.
 */
export async function enqueueScrapeRun(
  env: Env,
  runId: string,
  /** Smoke-test escape hatch: enqueue only the first N sources. */
  limit?: number,
): Promise<number> {
  const all = auctionScraperService.getSourceList();
  const sources = limit && limit > 0 ? all.slice(0, limit) : all;
  await sendAll<SourceMessage>(
    env.SCRAPE_SOURCES,
    sources.map((s) => ({ kind: 'source', name: s.name, url: s.url, searchPath: s.searchPath, runId })),
  );
  console.log(`📤 run ${runId}: enqueued ${sources.length} sources`);
  return sources.length;
}

/**
 * Consumer: discovery for one source, then fan its URLs out as detail messages.
 *
 * Each message is ack'd or retried individually — one source failing discovery
 * must not take the rest of the batch down with it.
 */
export async function handleSourceBatch(
  batch: MessageBatch<SourceMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const { name, url, searchPath, runId } = msg.body;
    setScrapeContext({ runtime: 'cloudflare-queue', runId });
    try {
      const { urls, discovered, dropped } = await auctionScraperService.discoverUrlsForSource(
        { name, url, searchPath },
      );
      if (dropped > 0) {
        // Never let a cap truncate silently — that reads as "covered everything".
        console.warn(`⚠️  ${name}: ${dropped} URLs over the cap were not queued`);
      }
      if (urls.length === 0) {
        console.log(`   ${name}: no URLs discovered`);
        await recordSourceRun({ runId, sourceName: name, discovered, dropped });
        msg.ack();
        continue;
      }
      const { toFetch, skipped } = await filterFreshlyScraped(urls);
      await sendAll<DetailMessage>(
        env.SCRAPE_DETAILS,
        toFetch.map((u) => ({ kind: 'detail', url: u, sourceName: name, runId })),
      );
      console.log(
        `   ${name}: discovered ${discovered}, queued ${toFetch.length}` +
          (skipped ? `, skipped ${skipped} already-fresh` : ''),
      );
      await recordSourceRun({
        runId, sourceName: name, discovered, queued: toFetch.length, dropped, skippedFresh: skipped,
      });
      msg.ack();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ discovery failed for ${name}:`, message);
      await recordSourceRun({ runId, sourceName: name, error: message });
      msg.retry();
    }
  }
}

/**
 * Consumer: scrape and save one listing.
 *
 * A failure here is usually a transient Firecrawl error, so retry; after the
 * configured attempts the message lands in the DLQ where it stays visible
 * instead of vanishing into a swallowed catch.
 */
export async function handleDetailBatch(
  batch: MessageBatch<DetailMessage>,
  env: Env,
): Promise<void> {
  // Tally per source so one telemetry write covers the whole batch.
  const tally = new Map<string, { runId: string; saved: number; failed: number }>();

  // Ids of rows we actually saved, to hand to the enrichment queue below.
  const savedIds: Array<{ id: number; runId: string }> = [];

  for (const msg of batch.messages) {
    const { url, sourceName, runId } = msg.body;
    setScrapeContext({ runtime: 'cloudflare-queue', runId });
    const t = tally.get(sourceName) ?? { runId, saved: 0, failed: 0 };
    try {
      const result = await auctionScraperService.scrapeSpecificUrl(url, sourceName);
      if (result) {
        t.saved++;
        const id = (result as { id?: number }).id;
        if (typeof id === 'number') savedIds.push({ id, runId });
      }
      msg.ack();
    } catch (err) {
      t.failed++;
      console.error(`❌ detail failed ${url}:`, err instanceof Error ? err.message : err);
      msg.retry();
    }
    tally.set(sourceName, t);
  }

  for (const sourceName of Array.from(tally.keys())) {
    const t = tally.get(sourceName)!;
    await recordSourceRun({ runId: t.runId, sourceName, saved: t.saved, failed: t.failed });
  }

  // Hand every saved listing to the enrichment queue. This is the step that was
  // missing: the queue existed, its consumer existed, and nothing ever produced
  // to it — so on the Cloudflare path auctions were captured but never
  // enriched or CSR2-valued, leaving the Node process as the only thing doing
  // that work and blocking its retirement.
  if (savedIds.length > 0) {
    await sendAll<EnrichMessage>(
      env.ENRICH,
      savedIds.map(({ id, runId }) => ({ kind: 'enrich', auctionId: id, runId })),
    );
    console.log(`   → queued ${savedIds.length} for enrichment`);
  }
}

/**
 * Consumer: enrichment + valuation for one saved auction.
 *
 * Kept separate from the detail consumer so a slow OpenAI call cannot eat the
 * budget that the scrape-and-save needs.
 */
export async function handleEnrichBatch(
  batch: MessageBatch<EnrichMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const { auctionId, runId } = msg.body;
    setScrapeContext({ runtime: 'cloudflare-queue', runId });
    try {
      // Both halves, in order. Enrichment standardises the title, identifies the
      // auction house and extracts the legal description; the valuation then
      // uses the coordinates that enrichment may have improved. Previously this
      // consumer ran only the valuation, so even once wired it would have left
      // every listing un-enriched.
      await auctionEnrichmentService.enrichAuction(auctionId);
      await auctionScraperService.calculateValuation(auctionId);
      msg.ack();
    } catch (err) {
      console.error(`❌ enrich failed for auction ${auctionId}:`, err instanceof Error ? err.message : err);
      msg.retry();
    }
  }
}
