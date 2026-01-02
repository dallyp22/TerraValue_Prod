# Auction Blocklist

## Overview

The auction blocklist prevents specific URLs from being scraped and added to the system. This is useful for filtering out non-farm auctions (equipment, shops, etc.) that the scraper might accidentally pick up.

## Features

- **Permanent Blocking**: URLs in the blocklist will never be scraped
- **Automatic Deletion**: Adding a URL to the blocklist also removes it from the active auctions
- **Reason Tracking**: Each blocked URL includes a reason for documentation

## Usage

### Adding a URL to the Blocklist

```bash
npx tsx scripts/add-to-blocklist.ts "<URL>" "[reason]"
```

**Parameters:**
- `URL` (required): The full URL of the auction to block
- `reason` (optional): Why it's being blocked (default: "non-farm")

**Common Reasons:**
- `non-farm` - Equipment, shops, residential property, etc.
- `spam` - Spam or invalid listings
- `duplicate` - Duplicate of another auction
- `equipment-only` - Equipment auction without land

**Example:**

```bash
npx tsx scripts/add-to-blocklist.ts \
  "https://example.com/equipment-auction" \
  "non-farm"
```

### How It Works

1. **During Scraping**: Before saving each auction, the scraper checks if the URL is in the blocklist
2. **If Blocked**: The auction is skipped and logged as blocked
3. **Automatic Cleanup**: The `add-to-blocklist` script also deletes the auction if it already exists

### Database Schema

```sql
CREATE TABLE auction_blocklist (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by TEXT DEFAULT 'manual'
);
```

### Verifying Blocklist

To see all blocked URLs:

```sql
SELECT * FROM auction_blocklist ORDER BY added_at DESC;
```

### Removing from Blocklist

To remove a URL from the blocklist (if it was added by mistake):

```sql
DELETE FROM auction_blocklist WHERE url = 'https://example.com/url';
```

## Integration

The blocklist is automatically checked in:
- `server/services/auctionScraper.ts` - Prevents saving blocked auctions
- The check happens at the beginning of `saveAuction()` method

## Notes

- The blocklist uses exact URL matching
- URLs must match exactly (including query parameters)
- The blocklist is checked on every scrape, so it's very efficient
- Blocked auctions are logged in the scraper output with a `⛔ BLOCKED` message

