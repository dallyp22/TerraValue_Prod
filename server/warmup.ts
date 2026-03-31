import { pool } from "./db";
import { soilPool, isSoilDbAvailable } from "./soil-db";
import { countyCsr2RateService } from "./services/countyCsr2Rates";
import { openaiService } from "./services/openai";

/**
 * Pre-warm database connections, caches, and AI services at startup
 * so the first valuation doesn't pay cold-start penalties.
 */
export async function warmupServices(): Promise<void> {
  const start = Date.now();
  console.log("🔥 Warming up services...");

  const results = await Promise.allSettled([
    // 1. Warm the Neon DB WebSocket connection
    (async () => {
      const t = Date.now();
      const res = await pool.query("SELECT 1");
      console.log(`  ✅ Main DB connection warm (${Date.now() - t}ms)`);
    })(),

    // 2. Warm the soil DB connection pool
    (async () => {
      if (!isSoilDbAvailable() || !soilPool) return;
      const t = Date.now();
      await soilPool.query("SELECT 1");
      console.log(`  ✅ Soil DB connection warm (${Date.now() - t}ms)`);
    })(),

    // 3. Pre-cache all county CSR2 rates
    (async () => {
      const t = Date.now();
      const rates = await countyCsr2RateService.getAllRates();
      console.log(`  ✅ County CSR2 rates cached: ${rates.length} counties (${Date.now() - t}ms)`);
    })(),

    // 4. Validate the OpenAI assistant exists (lightweight retrieve, no thread creation)
    (async () => {
      const t = Date.now();
      await openaiService.warmup();
      console.log(`  ✅ OpenAI assistant validated (${Date.now() - t}ms)`);
    })(),
  ]);

  const failures = results.filter(r => r.status === "rejected");
  if (failures.length > 0) {
    for (const f of failures) {
      console.warn("  ⚠️ Warmup task failed:", (f as PromiseRejectedResult).reason?.message || f);
    }
  }

  console.log(`🔥 Warmup complete in ${Date.now() - start}ms (${failures.length} failures)`);
}
