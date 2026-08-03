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
        msg.ack();
        continue;
      }
      await sendAll<DetailMessage>(
        env.SCRAPE_DETAILS,
        urls.map((u) => ({ kind: 'detail', url: u, sourceName: name, runId })),
      );
      console.log(`   ${name}: discovered ${discovered}, queued ${urls.length}`);
      msg.ack();
    } catch (err) {
      console.error(`❌ discovery failed for ${name}:`, err instanceof Error ? err.message : err);
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
  for (const msg of batch.messages) {
    const { url, sourceName } = msg.body;
    try {
      await auctionScraperService.scrapeSpecificUrl(url, sourceName);
      msg.ack();
    } catch (err) {
      console.error(`❌ detail failed ${url}:`, err instanceof Error ? err.message : err);
      msg.retry();
    }
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
    const { auctionId } = msg.body;
    try {
      await auctionScraperService.calculateValuation(auctionId);
      msg.ack();
    } catch (err) {
      console.error(`❌ enrich failed for auction ${auctionId}:`, err instanceof Error ? err.message : err);
      msg.retry();
    }
  }
}
