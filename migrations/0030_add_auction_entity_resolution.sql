-- Entity resolution: canonical sale events above the existing listing rows.
--
-- WHY: `auctions` is keyed on `url UNIQUE`, which means it is already an
-- *observation* table — one row per source-sighting — wearing the name of an
-- entity table. That was survivable while all 51 sources were auctioneers with
-- little mutual overlap. It stops being survivable the moment LandHub, HiBid and
-- Land And Farm are onboarded, because those sources exist to repost each
-- other's inventory. Measured on production today (2026-08-03): among 361
-- upcoming auctions there are 57 duplicate-title groups covering 164 rows, and
-- one real sale — Verdella Kenkel, 377.25 ac, 2026-08-29 — is stored four times
-- under three different county spellings ("Crawford", "Crawford, Shelby",
-- "Shelby and Crawford"). Cross-source pairs already exist too (Land Search vs
-- High Point Land, Land.com vs LandWatch).
--
-- WHY NOT A RENAME: the obvious move is to rename `auctions` to
-- `listing_observations` and put a compatibility view in its place. Rejected.
-- `auctions` is read directly by the Worker API, the MVT tile route, the
-- archiver, the enrichment queue, the Heistand overlay and a dozen scripts.
-- Swapping a table for a view underneath all of that, to fix a naming problem,
-- is a large blast radius on a system that is already mis-delivering. So
-- `auctions` keeps its name and its columns and simply gains a pointer to the
-- event it belongs to. Nothing that reads it today changes behaviour.
--
-- WHY AN AUDIT TABLE: a wrong merge makes an auction *disappear from the map*,
-- which is the exact complaint this whole workstream exists to fix. A missed
-- merge only shows a duplicate pin. So the resolver never auto-merges in the
-- grey zone — it records the pair, its feature vector and its score in
-- `auction_match_audit` for a human, and only high-confidence pairs with real
-- identity evidence are allowed to form an event. The audit rows are also the
-- un-merge path: delete the edge, re-cluster the component.
--
-- WHY THE dedupe_* COLUMNS ON `auctions`: blocking has to happen in SQL once the
-- resolver runs inside the queue consumer against 1.4k live + 93k archived rows.
-- They are written by the resolver's fingerprint pass, not by this migration,
-- and they stay NULL until that pass runs — nothing reads them before then.
--
-- Apply with:  psql "$DATABASE_URL" -f migrations/0030_add_auction_entity_resolution.sql
-- NEVER apply schema changes to this database with `npm run db:push` — it drops
-- the soil/PostGIS layer.

BEGIN;

-- ---------------------------------------------------------------------------
-- Canonical sale event. One row per physical auction, however many listings
-- advertise it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auction_events (
  id                 SERIAL PRIMARY KEY,

  -- The observation whose values were promoted into the golden record. Kept as
  -- a plain integer rather than an FK so archiving an observation can never
  -- cascade into deleting a sale event.
  primary_auction_id INTEGER,

  -- Golden-record fields, merged by source precedence. Deliberately a subset of
  -- `auctions` — only what the map and list views need. Anything richer is read
  -- through the member rows.
  title              TEXT,
  county             TEXT,          -- display form, e.g. "Shelby and Crawford"
  county_keys        TEXT[],        -- normalised set, e.g. {crawford,shelby}
  state              TEXT,          -- 2-letter, normalised
  acreage            REAL,
  auction_date       TIMESTAMPTZ,
  auctioneer         TEXT,
  land_type          TEXT,
  latitude           REAL,
  longitude          REAL,

  member_count       INTEGER NOT NULL DEFAULT 1,

  -- How this event was formed. 'singleton' = no duplicate was found, which is
  -- the majority case and must not be confused with a confident merge.
  match_method       TEXT NOT NULL DEFAULT 'singleton',
  -- Lowest pairwise score inside the cluster; the cluster is only as trustworthy
  -- as its weakest accepted edge.
  match_confidence   REAL,
  -- 'auto'      — formed by the resolver above the merge threshold
  -- 'needs_review' — grey zone, surfaced to a human, NOT merged in the UI yet
  -- 'confirmed' / 'rejected' — a human decided
  review_status      TEXT NOT NULL DEFAULT 'auto',
  matcher_version    TEXT NOT NULL DEFAULT 'v1',

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auction_events_review_idx
  ON auction_events (review_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS auction_events_date_idx
  ON auction_events (auction_date);
CREATE INDEX IF NOT EXISTS auction_events_county_keys_idx
  ON auction_events USING GIN (county_keys);

-- ---------------------------------------------------------------------------
-- Observation -> event pointer, plus the blocking-key cache.
-- ---------------------------------------------------------------------------
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS event_id           INTEGER;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS event_match_score  REAL;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS event_match_method TEXT;

-- Normalised blocking keys. NULL until the resolver's fingerprint pass runs.
--   dedupe_county_keys — county split on ","/" and "/"&" then de-suffixed, so
--     "Crawford, Shelby", "Shelby and Crawford" and "Crawford County" all
--     reduce to comparable sets. 375 distinct county strings exist across 1,443
--     active rows today; raw equality is useless.
--   dedupe_acreage — acreage with 0 mapped to NULL. 78 of 361 upcoming rows
--     carry acreage 0, which is "unknown" written as a number; scoring it as
--     agreement manufactures duplicates.
--   dedupe_trs_keys — Township/Range/Section triples parsed out of
--     `legal_description` TEXT. NOTE: `legal_description_parsed` is NULL on
--     every row in the table — auctionEnrichment.ts sets it to null with a
--     "will be filled by the geocoder" comment and the geocoder only ever uses
--     the components in memory. So TRS has to be re-derived from raw text.
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS dedupe_county_keys TEXT[];
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS dedupe_state       TEXT;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS dedupe_acreage     REAL;
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS dedupe_trs_keys    TEXT[];
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS dedupe_name_tokens TEXT[];
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS dedupe_fingerprint_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auctions_event_id_fkey'
  ) THEN
    ALTER TABLE auctions
      ADD CONSTRAINT auctions_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS auctions_event_id_idx
  ON auctions (event_id);
CREATE INDEX IF NOT EXISTS auctions_dedupe_county_idx
  ON auctions USING GIN (dedupe_county_keys);
CREATE INDEX IF NOT EXISTS auctions_dedupe_trs_idx
  ON auctions USING GIN (dedupe_trs_keys);
CREATE INDEX IF NOT EXISTS auctions_dedupe_name_idx
  ON auctions USING GIN (dedupe_name_tokens);
-- Blocking key B1: county set is a GIN lookup, acreage narrows it.
CREATE INDEX IF NOT EXISTS auctions_dedupe_acreage_idx
  ON auctions (dedupe_acreage) WHERE dedupe_acreage IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Every scored pair, whatever the verdict. This is what makes the thresholds
-- tunable from data instead of from vibes, and what makes a bad merge
-- reversible.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auction_match_audit (
  id              BIGSERIAL PRIMARY KEY,
  -- Ordered (lower id first) so a pair has exactly one row.
  auction_a_id    INTEGER NOT NULL,
  auction_b_id    INTEGER NOT NULL,
  score           REAL    NOT NULL,
  -- 'merge' | 'review' | 'distinct'
  disposition     TEXT    NOT NULL,
  -- Which blocking key generated the pair — tells you whether a key is earning
  -- its keep or just producing noise.
  block_key       TEXT,
  -- Per-signal contributions, e.g. {"acreage":5,"county":3,"date":4,"name":4}
  features        JSONB,
  -- Why a pair that scored high was still not merged, e.g.
  -- "no identity evidence", "weak-identity URL", "cluster too large".
  hold_reason     TEXT,
  -- 'rules_v1' | 'human'
  decided_by      TEXT    NOT NULL DEFAULT 'rules_v1',
  matcher_version TEXT    NOT NULL DEFAULT 'v1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auction_a_id, auction_b_id, matcher_version)
);

CREATE INDEX IF NOT EXISTS auction_match_audit_disposition_idx
  ON auction_match_audit (disposition, score DESC);
CREATE INDEX IF NOT EXISTS auction_match_audit_a_idx
  ON auction_match_audit (auction_a_id);
CREATE INDEX IF NOT EXISTS auction_match_audit_b_idx
  ON auction_match_audit (auction_b_id);

COMMIT;
