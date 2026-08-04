-- Track detail scrapes skipped because the listing was already fresh.
--
-- WHY: `discovered - queued` previously had exactly one meaning — URLs lost to
-- the per-source cap. Once we start skipping unchanged listings, that
-- subtraction silently conflates "we deliberately saved a Firecrawl call" with
-- "we truncated coverage", and those must never look alike on the scorecard.
-- The whole point of scrape_source_runs is that a number means what it says.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0031_add_skipped_fresh_telemetry.sql
-- NEVER `npm run db:push` — it drops the soil/PostGIS layer.

BEGIN;

ALTER TABLE scrape_source_runs
  ADD COLUMN IF NOT EXISTS skipped_fresh INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN scrape_source_runs.skipped_fresh IS
  'Discovered URLs not re-fetched because we already hold the listing and it is not near its sale date. Cost avoided, not coverage lost.';

COMMIT;
