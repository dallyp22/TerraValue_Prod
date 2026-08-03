-- Scrape coverage telemetry.
--
-- WHY: until now nobody could answer "are we missing auctions?" until a client
-- emailed. scraperDiagnostics.ts writes to a local JSONL file and disables
-- itself entirely when there is no filesystem, so the Cloudflare runtime has
-- never recorded anything — which is exactly why a scrape that captured 0.8% of
-- its target looked healthy on every dashboard.
--
-- This also makes the Node-vs-Queues parallel run measurable. Both runtimes
-- upsert into the same `auctions` rows, so without per-runtime attribution
-- "compare capture counts" is unanswerable.
--
-- Apply with:  psql "$DATABASE_URL" -f migrations/0029_add_scrape_run_telemetry.sql
-- NEVER apply schema changes to this database with `npm run db:push` — it drops
-- the soil/PostGIS layer.

BEGIN;

-- One row per (run, source). Run-level totals are an aggregate of these, so
-- there is no second table to keep consistent.
CREATE TABLE IF NOT EXISTS scrape_source_runs (
  id            SERIAL PRIMARY KEY,
  run_id        TEXT        NOT NULL,
  -- 'cloudflare-queue' | 'node'. Free text rather than an enum so a third
  -- runtime during a future cutover cannot fail an insert.
  runtime       TEXT        NOT NULL,
  source_name   TEXT        NOT NULL,

  discovered    INTEGER     NOT NULL DEFAULT 0,  -- candidate URLs after junk filtering
  queued        INTEGER     NOT NULL DEFAULT 0,  -- URLs actually handed downstream
  dropped       INTEGER     NOT NULL DEFAULT 0,  -- lost to the per-source cap
  saved         INTEGER     NOT NULL DEFAULT 0,  -- listings written to `auctions`
  failed        INTEGER     NOT NULL DEFAULT 0,

  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  error         TEXT,

  UNIQUE (run_id, runtime, source_name)
);

CREATE INDEX IF NOT EXISTS scrape_source_runs_run_idx
  ON scrape_source_runs (run_id, runtime);
CREATE INDEX IF NOT EXISTS scrape_source_runs_source_time_idx
  ON scrape_source_runs (source_name, started_at DESC);

-- Per-listing attribution, so we can ask which runtime actually found a given
-- auction rather than only comparing counts.
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS last_captured_by  TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS last_captured_run TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS first_captured_by TEXT;

CREATE INDEX IF NOT EXISTS auctions_captured_by_idx
  ON auctions (last_captured_by, updated_at DESC);

COMMIT;
