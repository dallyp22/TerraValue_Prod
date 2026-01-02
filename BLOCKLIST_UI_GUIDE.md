# Auction Blocklist UI - User Guide

## Overview

The Auction Blocklist allows you to permanently remove non-farm auctions from your system with just a few clicks. Blocked auctions will:
- ✅ Be immediately removed from the database
- ✅ Never be scraped again in future runs
- ✅ Be tracked in the blocklist for reference

## How to Use

### Method 1: Block from Auction Diagnostics Page (NEW!)

1. **Navigate to Auction Diagnostics**
   - Open your app
   - Go to `/diagnostics` or click "Auction Diagnostics"

2. **Find the Non-Farm Auction**
   - Scroll through the auction list
   - Look for auctions that aren't land sales (equipment, shops, etc.)

3. **Click the "Block" Button**
   - Each auction now has a "Block" button in the top-right
   - Click it on the non-farm auction

4. **Enter a Reason**
   - A prompt will ask for a reason (e.g., "non-farm", "equipment-only")
   - Type the reason and click OK

5. **Confirm**
   - Review the auction details in the confirmation
   - Click OK to block it

6. **Done!**
   - The auction is immediately removed from the list
   - It won't appear in future scrapes

### Method 2: Command Line (Advanced)

If you prefer the CLI:

```bash
npx tsx scripts/add-to-blocklist.ts "https://example.com/auction-url" "reason"
```

## Blocklist Management

### View Blocked Auctions

1. **Navigate to Auction Diagnostics**
2. **Scroll to "Auction Blocklist" section**
3. **See all blocked URLs** in a table with:
   - URL
   - Reason for blocking
   - Date added
   - Remove button

### Remove from Blocklist

If you blocked an auction by mistake:

1. **Find it in the Blocklist table**
2. **Click the X button** on the right
3. **Confirm removal**

The auction won't automatically reappear, but it won't be blocked in future scrapes.

### Search Blocked URLs

Use the search box to filter blocked URLs:
- Search by URL
- Search by reason
- Instantly filters the table

## Common Use Cases

### Example 1: Daugherty Auction (Non-Farm)

**Problem:** Daugherty Auction has a vintage toys/decor sale
- URL: `https://www.daughertyauction.com/upcoming-auctions`
- Not a land auction

**Solution:**
1. Find it in the auction list
2. Click "Block"
3. Enter reason: "non-farm: vintage holiday decor, toys, jewelry"
4. Confirm

**Result:** Auction removed, never scraped again

### Example 2: Equipment-Only Auction

**Problem:** Farm equipment sale listed as land auction

**Solution:**
1. Click "Block" button
2. Reason: "equipment-only"
3. Confirm

### Example 3: Residential Property

**Problem:** House sale showing up in farm land auctions

**Solution:**
1. Click "Block"
2. Reason: "residential property"
3. Confirm

## Features

✅ **One-Click Blocking** - Block auctions directly from the list
✅ **Permanent** - Blocked URLs never scraped again
✅ **Tracked** - All blocks recorded with reasons
✅ **Reversible** - Remove from blocklist if needed
✅ **Searchable** - Find blocked URLs quickly
✅ **Real-Time** - Changes take effect immediately

## Statistics

The blocklist section shows:
- **Total blocked URLs** - How many URLs you've blocked
- **Recent blocks** - Latest additions to the blocklist
- **Search/filter** - Find specific blocked URLs

## Best Practices

1. **Be Specific with Reasons**
   - ✅ Good: "non-farm: equipment auction, no land"
   - ❌ Bad: "bad"

2. **Block, Don't Archive**
   - Use blocklist for recurring non-farm auctions
   - Use archive for old/past auctions

3. **Review Regularly**
   - Check blocklist monthly
   - Remove any accidentally blocked URLs

4. **Document Patterns**
   - If a source consistently posts non-farm auctions
   - Consider blocking the pattern or entire source

## Technical Details

### How It Works

1. **User clicks "Block"**
2. **URL added to `auction_blocklist` table**
3. **Auction deleted from `auctions` table**
4. **Scraper checks blocklist before saving**
5. **Blocked URLs skipped during future scrapes**

### Database Schema

```sql
CREATE TABLE auction_blocklist (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  added_by TEXT DEFAULT 'ui'
);
```

### API Endpoints

- `GET /api/auctions/blocklist/all` - Get all blocked URLs
- `POST /api/auctions/blocklist/add` - Add URL to blocklist
- `DELETE /api/auctions/blocklist/:id` - Remove from blocklist

## Troubleshooting

### Auction still appearing after blocking

**Cause:** May need to refresh the page or clear cache

**Solution:**
1. Refresh the Auction Diagnostics page
2. Check the Blocklist section to verify it was added
3. Run the scraper again to test

### Can't remove from blocklist

**Cause:** Database permission or connection issue

**Solution:**
1. Try refreshing the page
2. Check browser console for errors
3. Check server logs for database errors

### Accidentally blocked wrong auction

**Solution:**
1. Go to Blocklist section
2. Find the URL in the table
3. Click X to remove it
4. The URL won't be blocked in future scrapes

## Future Enhancements (Planned)

- 📋 Bulk blocking (select multiple auctions)
- 🔍 Pattern matching (block all from a source)
- 📊 Blocking statistics and analytics
- 🔔 Notifications for blocked auction attempts
- 📁 Export blocklist to CSV
- 🔄 Sync blocklist across environments

## Support

If you encounter issues with the blocklist:
1. Check the browser console for errors
2. Check the server logs
3. Verify the database connection
4. Check the blocklist table exists (`auction_blocklist`)

## Summary

The Auction Blocklist UI makes it easy to:
- ✅ **Quickly remove** non-farm auctions
- ✅ **Prevent future scraping** of unwanted URLs
- ✅ **Track blocked auctions** for reference
- ✅ **Manage the blocklist** visually

No more need for server restarts or manual database edits!
