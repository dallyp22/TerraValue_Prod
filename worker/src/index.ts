import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { api } from "./routes/api";
import { AuctionArchiverService } from "../../server/services/auctionArchiver";
import { automaticScraperService } from "../../server/services/automaticScraper";

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
//   "0 9 * * *"   → daily 09:00 UTC (~03:00 CST) → auction archiver
//   "*/5 * * * *" → every 5 minutes → scraper schedule check
async function handleScheduled(
  controller: ScheduledController,
  _env: Env,
  ctx: ExecutionContext,
) {
  if (controller.cron === "0 9 * * *") {
    console.log("⏰ Cron: running daily auction archiver");
    const archiver = new AuctionArchiverService();
    ctx.waitUntil(archiver.archivePastAuctions());
  } else if (controller.cron === "*/5 * * * *") {
    console.log("⏰ Cron: scraper schedule check");
    ctx.waitUntil(automaticScraperService.checkAndRun());
  } else {
    console.warn(`⏰ Cron: unrecognized schedule "${controller.cron}"`);
  }
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
