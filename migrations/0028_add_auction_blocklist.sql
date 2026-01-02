-- Add auction_blocklist table to prevent re-scraping unwanted auctions
CREATE TABLE IF NOT EXISTS "auction_blocklist" (
  "id" SERIAL PRIMARY KEY,
  "url" TEXT NOT NULL UNIQUE,
  "reason" TEXT NOT NULL,
  "added_at" TIMESTAMP DEFAULT NOW(),
  "added_by" TEXT DEFAULT 'manual'
);

-- Create index on URL for fast lookups
CREATE INDEX IF NOT EXISTS "auction_blocklist_url_idx" ON "auction_blocklist" ("url");

