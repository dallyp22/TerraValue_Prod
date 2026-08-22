import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { landSalesComps, landTalkPdfs } from "@shared/schema";
import {
  discoverLandTalkPdfs,
  parseLandTalkPdf,
  type DiscoveredPdf,
} from "./landTalkParser";

/**
 * Monthly Land Talk ingest, callable from the Worker's cron.
 *
 * Iowa Appraisal publishes one "Land Talk Monthly" PDF per month; its sales
 * table is the source for `land_sales_comps`, which `valuation`, `comparables`,
 * `marketData` and `landComps` all read. When this stops running, valuations
 * quietly keep working against stale comps — there is no error, just drift.
 * That is exactly what happened between 2026-06-04 and 2026-08-21: the only
 * ingest ever performed was a manual backfill, and June and July 2026 (113
 * sales) were simply missing.
 *
 * WHY THIS SKIPS BY MONTH AND NOT BY URL: `scripts/ingest-land-talk.ts`
 * decides what is "new" by diffing `land_talk_pdfs.url`. Iowa Appraisal
 * re-uploads older newsletters under changed filenames
 * ("May2026LandTalkMonthlyweb.pdf" vs "May-2026-Land-Talk-Monthly.pdf"), so a
 * URL diff reported 36 PDFs as unparsed when only 2 months were actually
 * missing. On a schedule that would mean ~34 needless PDF parses — each one a
 * Firecrawl scrape plus an LLM extraction — every single run. A month is the
 * thing we actually care about having, so a month is what we key on.
 */

export interface LandTalkIngestResult {
  discovered: number;
  monthsMissing: string[];
  parsed: Array<{ month: string; comps: number }>;
  failed: Array<{ month: string; error: string }>;
  totalComps: number;
}

async function upsertComps(
  comps: Awaited<ReturnType<typeof parseLandTalkPdf>>["comps"],
): Promise<number> {
  if (comps.length === 0) return 0;
  // Postgres rejects an ON CONFLICT batch that would touch the same row twice,
  // so collapse duplicate rowHashes within the batch first.
  const unique = Array.from(
    new Map(comps.map((c) => [c.rowHash, c])).values(),
  );
  await db
    .insert(landSalesComps)
    .values(unique)
    .onConflictDoUpdate({
      target: landSalesComps.rowHash,
      set: {
        pricePerAcre: sql`excluded.price_per_acre`,
        saleStatus: sql`excluded.sale_status`,
        totalPrice: sql`excluded.total_price`,
        tillableCsr2: sql`excluded.tillable_csr2`,
        tillableAcres: sql`excluded.tillable_acres`,
        dollarPerTillableCsr2: sql`excluded.dollar_per_tillable_csr2`,
        landCategory: sql`excluded.land_category`,
        updatedAt: new Date(),
      },
    });
  return unique.length;
}

async function recordPdf(
  pdf: DiscoveredPdf,
  patch: Partial<typeof landTalkPdfs.$inferInsert>,
): Promise<void> {
  const existing = await db.query.landTalkPdfs.findFirst({
    where: eq(landTalkPdfs.url, pdf.url),
  });
  if (existing) {
    await db
      .update(landTalkPdfs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(landTalkPdfs.url, pdf.url));
  } else {
    await db.insert(landTalkPdfs).values({
      url: pdf.url,
      title: pdf.title,
      month: pdf.month ?? undefined,
      ...patch,
    });
  }
}

/**
 * Parse and store every month on the archive page we do not already hold.
 *
 * Idempotent: a month that already produced comps is skipped outright, and
 * re-parsing the same PDF is a no-op for unchanged rows (`rowHash` is unique).
 * A steady-state run therefore costs one Firecrawl scrape of the index page
 * and nothing else.
 */
export async function ingestNewLandTalkPdfs(
  opts: { limit?: number } = {},
): Promise<LandTalkIngestResult> {
  const result: LandTalkIngestResult = {
    discovered: 0,
    monthsMissing: [],
    parsed: [],
    failed: [],
    totalComps: 0,
  };

  const discovered = await discoverLandTalkPdfs();
  result.discovered = discovered.length;

  // A month counts as "held" only if it actually produced comps. A row left
  // behind by a failed parse must not mask the gap it created — three months
  // (2022-05, 2022-07, 2022-11) sit at status='failed' with 0 sales, and a
  // status-only check would skip them forever.
  const held = await db
    .select({ month: landTalkPdfs.month })
    .from(landTalkPdfs)
    .where(sql`${landTalkPdfs.status} = 'parsed' AND coalesce(${landTalkPdfs.salesCount}, 0) > 0`);
  const heldMonths = new Set(held.map((h) => h.month).filter(Boolean) as string[]);

  // No month means we cannot tell what we would be filling; skip rather than
  // guess, so an unparseable title can never trigger a re-parse every run.
  let todo = discovered.filter((p) => p.month && !heldMonths.has(p.month));
  todo.sort((a, b) => (b.month ?? "").localeCompare(a.month ?? ""));
  result.monthsMissing = todo.map((p) => p.month!);

  if (opts.limit) todo = todo.slice(0, opts.limit);

  for (const pdf of todo) {
    const month = pdf.month!;
    try {
      const { comps, rowCount } = await parseLandTalkPdf(pdf.url, pdf.month);
      await upsertComps(comps);
      await recordPdf(pdf, {
        status: "parsed",
        salesCount: rowCount,
        error: null,
        scrapedAt: new Date(),
        ingestedAt: new Date(),
      });
      result.parsed.push({ month, comps: rowCount });
      result.totalComps += rowCount;
      console.log(`📄 Land Talk ${month}: ${rowCount} comps`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await recordPdf(pdf, { status: "failed", error, scrapedAt: new Date() });
      result.failed.push({ month, error });
      console.error(`❌ Land Talk ${month} failed: ${error}`);
    }
  }

  return result;
}
