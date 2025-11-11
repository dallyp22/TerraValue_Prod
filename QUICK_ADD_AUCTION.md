# Quick Guide: Adding Missed Auctions

## Problem
You found an auction that wasn't captured by the automated scraper.

## Solution
Add it manually using one of these methods:

---

## Method 1: CLI Script (Recommended for Developers)

```bash
npx tsx scripts/add-auction-by-url.ts "AUCTION_URL_HERE"
```

### Example: Add the Pottawattamie County Auction

```bash
npx tsx scripts/add-auction-by-url.ts "https://www.bigiron.com/Lots/466-46-acres-pottawattamie-county-ia"
```

**Output:**
```
🚀 Manual Auction Addition Tool

URL: https://www.bigiron.com/Lots/466-46-acres-pottawattamie-county-ia

🔍 Manually scraping auction: https://www.bigiron.com/Lots/466-46-acres-pottawattamie-county-ia

  Source: BigIron
  ✅ Data extracted:
     Title: 466.46 Acres Pottawattamie County, IA
     County: Pottawattamie
     State: Iowa
     Acreage: 466.46
     Date: December 4, 2025

      Geocoding: Crescent, IA
      ✓ Coordinates: 41.3553, -95.8336
  ✅ Auction saved to database!

✅ Success! The auction has been added to your database.
   You can now view it on the map and calculate its CSR2 valuation.
```

---

## Method 2: API Call (Recommended for Integrations)

```bash
curl -X POST http://YOUR_SERVER:5000/api/auctions/add-by-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.bigiron.com/Lots/466-46-acres-pottawattamie-county-ia"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Auction added successfully!",
  "auction": {
    "title": "466.46 Acres Pottawattamie County, IA",
    "county": "Pottawattamie",
    "state": "Iowa",
    "acreage": 466.46,
    "auction_date": "December 4, 2025"
  }
}
```

---

## Method 3: Re-run Full Scraper

If you just want to refresh all sources and trust the improved scraper:

```bash
curl -X POST http://YOUR_SERVER:5000/api/auctions/refresh
```

**Note:** This starts a background job that may take 10-15 minutes to complete.

---

## What Happens When You Add an Auction

1. **Scrapes the URL** - Extracts title, description, acreage, county, date, etc.
2. **Geocodes the address** - Converts "Crescent, IA" to GPS coordinates
3. **Saves to database** - Stores all auction data
4. **Makes it available** - Shows up on the map immediately
5. **Enables valuation** - You can calculate CSR2 valuation with one click

---

## Supported Auction Sites

The scraper automatically detects the source from the URL. Works with:

- BigIron
- Sullivan Auctioneers
- Farmers National
- Peoples Company
- LandWatch
- And 20+ other agricultural auction sites

---

## Troubleshooting

### "No data could be extracted"
- The URL might not be a valid auction listing
- Try visiting the URL in a browser to confirm it has auction details

### "DATABASE_URL must be set"
- You need to set your `DATABASE_URL` environment variable
- In production, this is done automatically
- For local testing, create a `.env` file with your database connection

### "Failed to geocode address"
- The auction might only have a county listed
- It will use the county centroid instead (less precise but still works)

---

## Need Help?

See `AUCTION_SCRAPER_IMPROVEMENTS.md` for detailed technical information about the improvements made to the scraper.

