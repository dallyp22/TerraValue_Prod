import "dotenv/config";
import { db } from "../server/db.js";
import { landTalkPdfs, landSalesComps } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  discoverLandTalkPdfs,
  parseLandTalkPdf,
  type DiscoveredPdf,
} from "../server/services/landTalkParser.js";

/**
 * Ingest Iowa Appraisal "Land Talk Monthly" PDFs into `land_sales_comps`.
 *
 * This is the BATCH/OFFLINE path (run by hand or by a monthly cron). It never
 * runs on the valuation request path — the goal is to populate a structured
 * comps table so per-valuation "market research" becomes a SQL query instead
 * of a slow OpenAI vector-store retrieval.
 *
 * Usage:
 *   npm run landtalk:backfill                 # parse every PDF on the archive page
 *   npm run landtalk:ingest                   # parse only PDFs we haven't parsed yet
 *   tsx scripts/ingest-land-talk.ts --month=2026-04
 *   tsx scripts/ingest-land-talk.ts --pdf=<url> [--month=2026-04]
 *   tsx scripts/ingest-land-talk.ts --dry-run --limit=2
 */

interface Args {
  backfill: boolean;
  dryRun: boolean;
  month?: string;
  pdf?: string;
  limit?: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.split("=").slice(1).join("=") : undefined;
  };
  return {
    backfill: argv.includes("--backfill"),
    dryRun: argv.includes("--dry-run"),
    month: get("month"),
    pdf: get("pdf"),
    limit: get("limit") ? parseInt(get("limit")!, 10) : undefined,
  };
}

async function upsertComps(
  comps: Awaited<ReturnType<typeof parseLandTalkPdf>>["comps"],
): Promise<{ inserted: number }> {
  if (comps.length === 0) return { inserted: 0 };
  // Safety net: collapse any duplicate rowHashes within this batch — Postgres
  // rejects an ON CONFLICT batch that would update the same row twice.
  const byHash = new Map(comps.map((c) => [c.rowHash, c]));
  const unique = Array.from(byHash.values());
  // Idempotent: rowHash is unique, so re-ingesting the same PDF is a no-op
  // for unchanged rows and an update for changed ones.
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
  return { inserted: unique.length };
}

async function recordPdf(
  pdf: DiscoveredPdf,
  patch: Partial<typeof landTalkPdfs.$inferInsert>,
) {
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

async function ingestOne(pdf: DiscoveredPdf, dryRun: boolean): Promise<number> {
  console.log(`\n📄 ${pdf.title}  [${pdf.month ?? "month?"}]`);
  console.log(`   ${pdf.url}`);
  try {
    const { comps, rowCount, confidence } = await parseLandTalkPdf(pdf.url, pdf.month);
    console.log(`   → extracted ${rowCount} sales (confidence ${(confidence * 100).toFixed(0)}%)`);

    if (dryRun) {
      console.table(
        comps.slice(0, 5).map((c) => ({
          date: c.saleDate?.toISOString().slice(0, 10),
          county: c.county,
          type: c.landCategory,
          acres: c.soldAcres,
          $acre: c.pricePerAcre ?? c.saleStatus,
          csr2: c.tillableCsr2,
        })),
      );
      console.log(`   (dry-run: not written)`);
      return rowCount;
    }

    await upsertComps(comps);
    await recordPdf(pdf, {
      status: "parsed",
      salesCount: rowCount,
      error: null,
      scrapedAt: new Date(),
      ingestedAt: new Date(),
    });
    console.log(`   ✅ saved ${rowCount} comps`);
    return rowCount;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ failed: ${msg}`);
    if (!dryRun) await recordPdf(pdf, { status: "failed", error: msg, scrapedAt: new Date() });
    return 0;
  }
}

async function main() {
  const args = parseArgs();

  // Single explicit PDF (handy for testing against one newsletter).
  if (args.pdf) {
    await ingestOne(
      { url: args.pdf, title: args.pdf.split("/").pop() || args.pdf, month: args.month ?? null },
      args.dryRun,
    );
    process.exit(0);
  }

  console.log("🔎 Discovering Land Talk PDFs…");
  let pdfs = await discoverLandTalkPdfs();
  console.log(`   found ${pdfs.length} PDF link(s)`);

  if (args.month) pdfs = pdfs.filter((p) => p.month === args.month);

  // Default (non-backfill) mode: skip PDFs we've already parsed.
  if (!args.backfill && !args.month) {
    const done = await db
      .select({ url: landTalkPdfs.url })
      .from(landTalkPdfs)
      .where(eq(landTalkPdfs.status, "parsed"));
    const doneSet = new Set(done.map((d) => d.url));
    pdfs = pdfs.filter((p) => !doneSet.has(p.url));
    console.log(`   ${pdfs.length} new (not yet parsed)`);
  }

  if (args.limit) pdfs = pdfs.slice(0, args.limit);

  let totalComps = 0;
  for (const pdf of pdfs) {
    totalComps += await ingestOne(pdf, args.dryRun);
  }

  console.log(`\n🏁 Done. ${totalComps} comps across ${pdfs.length} PDF(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
