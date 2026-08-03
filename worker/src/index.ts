import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { api } from "./routes/api";
import { AuctionArchiverService } from "../../server/services/auctionArchiver";
import {
  enqueueScrapeRun,
  handleSourceBatch,
  handleDetailBatch,
  handleEnrichBatch,
  type SourceMessage,
  type DetailMessage,
  type EnrichMessage,
} from "./queues";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("X-XSS-Protection", "1; mode=block");
  await next();
});

app.route("/api", api);

app.notFound((c) => c.json({ success: false, message: "Not found" }, 404));

app.onError((err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
  return c.json(
    {
      success: false,
      message: err.message || "Internal Server Error",
    },
    500,
  );
});

// Cron handlers — registered in wrangler.jsonc via triggers.crons:
//   "0 9 * * *" → daily 09:00 UTC (~03:00 CST) → auction archiver
//   "0 6 * * *" → daily 06:00 UTC (~01:00 CST) → enqueue a scrape run
//
// The hourly "0 * * * *" scraper check is GONE, and deliberately so. It called
// automaticScraperService.checkAndRun(), which runs the whole 51-source crawl
// inline. That exhausted the invocation's subrequest budget inside the first one
// or two sources; every later source then logged "0 URLs found" and the final
// updateSettings({nextRun}) write was itself over budget and threw — so nextRun
// never advanced and the cron re-fired the whole thing every 2 hours forever,
// burning Firecrawl credits on the same two sources each time. Scraping now goes
// through queues (see queues.ts), where each source and each listing gets its own
// invocation and its own budget.
async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
) {
  if (controller.cron === "0 9 * * *") {
    console.log("⏰ Cron: running daily auction archiver");
    const archiver = new AuctionArchiverService();
    ctx.waitUntil(archiver.archivePastAuctions());
  } else if (controller.cron === "0 6 * * *") {
    // Producer only — this must stay cheap regardless of source count.
    const runId = `run_${controller.scheduledTime}`;
    console.log(`⏰ Cron: enqueueing scrape run ${runId}`);
    ctx.waitUntil(enqueueScrapeRun(env, runId));
  } else {
    console.warn(`⏰ Cron: unrecognized schedule "${controller.cron}"`);
  }
}

/**
 * Queue consumer entry point. Cloudflare delivers every queue to the same
 * handler, so dispatch on the binding name.
 */
async function handleQueue(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  switch (batch.queue) {
    case "tv-scrape-sources":
      return handleSourceBatch(batch as MessageBatch<SourceMessage>, env);
    case "tv-scrape-details":
      return handleDetailBatch(batch as MessageBatch<DetailMessage>, env);
    case "tv-enrich":
      return handleEnrichBatch(batch as MessageBatch<EnrichMessage>, env);
    default:
      // Includes tv-dlq, which we retain for inspection rather than consume.
      console.warn(`📬 Unhandled queue "${batch.queue}" (${batch.messages.length} msgs)`);
      batch.ackAll();
  }
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
  queue: handleQueue,
} satisfies ExportedHandler<Env>;
