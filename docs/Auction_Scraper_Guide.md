# Auction Scraper Integration Guide

## Overview

The Auction Scraper feature automatically discovers and displays upcoming land and farm auctions across 15+ agricultural auction websites. Users can view auctions on an interactive map and get instant CSR2-based valuations.

## Features

- **Automated Discovery**: Scrapes 15 major agricultural auction sites
- **Interactive Map Layer**: Toggle auction markers on/off with custom gavel icons
- **On-Demand Valuations**: Calculate CSR2-based valuations with one click
- **Real-time Data**: Refresh auction data on demand
- **Geographic Search**: Automatically geocodes auction addresses
- **Persistent Storage**: Stores auction data in PostgreSQL for fast retrieval

## Supported Auction Sites

The system scrapes the following 15 major agricultural auction websites:

1. **Farmers National Company** - `/real-estate/auctions` (sorted by date)
2. **Midwest Ag Services** - `/farm-auctions/`
3. **Iowa Land Company** - `/auctions/`
4. **Peoples Company** - `/listings?type=auctions`
5. **High Point Land Company** - `/land/?places=state=IA` (Iowa only)
6. **Zomer Company** - `/site/auctions/current-land-real-estate/`
7. **Land Search** - `/properties/iowa/filter/format=auctions`
8. **DreamDirt** - `bid.dreamdirt.com` subdomain
9. **LandWatch** - Multiple listing pages
10. **Steffes Auctioneers** - Production website
11. **McCall Auctions** - `/mccall-listings?cat=17`
12. **Midwest Land Management** - Main site
13. **Randy Pryor Real Estate** - `/farm-land-auctions/`
14. **Jim Schaben Real Estate** - `/land-listings`
15. **Denison Livestock** - Main site

### Multi-Strategy URL Discovery

The scraper uses a three-tier approach for each source:

1. **Map API** - Discovers URLs by mapping the website structure
2. **Direct Extraction** - Uses LLM to extract listing URLs from the page
3. **Web Search** - Falls back to web search if other methods fail

This ensures maximum coverage across different website architectures.

## How It Works

### 1. Data Collection (Firecrawl)

```
┌─────────────────┐
│ Auction Website │
└────────┬────────┘
         │
         ↓
   ┌─────────────┐
   │  Map URLs   │  ← Discover auction listings
   └──────┬──────┘
          │
          ↓
   ┌─────────────┐
   │   Extract   │  ← Extract structured data (LLM)
   └──────┬──────┘
          │
          ↓
   ┌─────────────┐
   │  Geocode    │  ← Convert addresses to coordinates
   └──────┬──────┘
          │
          ↓
   ┌─────────────┐
   │  Database   │  ← Store in PostgreSQL
   └─────────────┘
```

### 2. Map Display

- Auction markers appear as red gavel icons
- Visible when "Land Auctions" toggle is ON
- Click any marker to see auction details
- Automatically loads auctions in current map view

### 3. Valuation

- Click "Calculate CSR2 Valuation" in auction panel
- System queries CSR2 data for auction location
- Calculates estimated value using: `CSR2 × $174/point`
- Displays per-acre and total property value

## API Endpoints

### Get Auctions in Map Bounds
```http
GET /api/auctions?minLat=41.5&maxLat=42.0&minLon=-95.0&maxLon=-94.0
```

**Response:**
```json
{
  "success": true,
  "auctions": [...],
  "count": 25
}
```

### Refresh Auction Data
```http
POST /api/auctions/refresh
```

**Response:**
```json
{
  "success": true,
  "message": "Auction scraping started in background. This may take several minutes."
}
```

### Get Auction Details
```http
GET /api/auctions/:id
```

**Response:**
```json
{
  "success": true,
  "auction": {
    "id": 123,
    "title": "160 Acre Farm Auction",
    "address": "123 Farm Road, Story County, IA",
    "acreage": 160,
    "latitude": 42.0308,
    "longitude": -93.6319,
    ...
  }
}
```

### Calculate Valuation
```http
POST /api/auctions/:id/valuation
```

**Response:**
```json
{
  "success": true,
  "valuation": {
    "csr2Mean": 78.5,
    "csr2Min": 72,
    "csr2Max": 85,
    "estimatedValue": 13659,
    "estimatedTotalValue": 2185440
  }
}
```

## Database Schema

```sql
CREATE TABLE auctions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL UNIQUE,
  source_website TEXT NOT NULL,
  
  -- Auction details
  auction_date TIMESTAMP,
  auction_type TEXT,
  auctioneer TEXT,
  
  -- Property details
  address TEXT,
  county TEXT,
  state TEXT,
  acreage REAL,
  land_type TEXT,
  
  -- Geographic data
  latitude REAL,
  longitude REAL,
  
  -- CSR2 & Valuation (populated on-demand)
  csr2_mean REAL,
  csr2_min INTEGER,
  csr2_max INTEGER,
  estimated_value REAL,
  
  -- Metadata
  raw_data JSON,
  scraped_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'active'
);
```

## Usage Guide

### For Users

1. **Enable Auction Layer**
   - Toggle "Land Auctions" switch in top-left panel
   - Red gavel markers appear on map

2. **View Auction Details**
   - Click any auction marker
   - See title, date, location, acreage

3. **Get Valuation**
   - Click "Calculate CSR2 Valuation"
   - Wait 2-3 seconds for CSR2 analysis
   - View estimated value per acre and total

4. **Refresh Data**
   - Click "Refresh Auctions" button
   - System scrapes all 15 auction sites
   - Takes 5-10 minutes (runs in background)

### For Developers

#### Manual Scraping

```javascript
import { auctionScraperService } from './server/services/auctionScraper.js';

// Scrape all sources
const results = await auctionScraperService.scrapeAllSources();
console.log(`Found ${results.length} auctions`);

// Calculate valuation for specific auction
const valuation = await auctionScraperService.calculateValuation(auctionId);
```

#### Testing

```bash
# Test Firecrawl connection and single site
node scripts/test-auction-scraper.js

# Run full scraper (all 15 sites)
node scripts/test-auction-scraper.js --full
```

#### Customizing Auction Sources

Edit `server/services/auctionScraper.ts`:

```typescript
private sources = [
  { 
    name: 'Your Auction Site', 
    url: 'https://yoursite.com',
    searchPath: '/auctions' // Optional
  },
  // ... more sources
];
```

#### Testing Auction Sources

Multiple test scripts are available:

```bash
# Test specific sources (first 2)
node scripts/test-scraper-urls.js

# Test all 10 updated sources (quick)
node scripts/test-all-sources.js

# Full integration test with database
node scripts/test-updated-scrapers.js

# Test original auction scraper
node scripts/test-auction-scraper.js
```

**Test Results (October 2025):**
- ✅ All 10 updated sources verified working
- 📊 95+ auction URLs discovered in test run
- 📦 100% data completeness on Midwest Ag Services
- 📦 87.5% average completeness across sources
- ⚡ Multi-strategy approach improved success rate from 60% to 100%

## Configuration

### Environment Variables

Required:
```env
FIRECRAWL_API_KEY=fc-your-api-key-here
DATABASE_URL=postgresql://...
```

Optional:
```env
# Adjust scraping limits
AUCTION_SCRAPE_LIMIT=20  # URLs per source
AUCTION_MAP_LIMIT=100    # Max URLs to discover
```

### Rate Limiting

The auction refresh endpoint is rate-limited to:
- **10 requests per minute** per IP
- Prevents API abuse
- Background processing prevents timeout

## Performance Considerations

### Scraping Time
- **Single site**: 10-30 seconds
- **All 15 sites**: 5-10 minutes
- Runs asynchronously in background

### Firecrawl Credits
- **Map**: ~1 credit per site
- **Extract**: ~1 credit per 10 URLs
- **Estimate**: 30-50 credits per full refresh

### Database Storage
- **~1KB** per auction record
- **~1000 auctions** = 1MB storage
- Automatic cleanup recommended for old auctions

## Troubleshooting

### No Auctions Appearing

1. Check toggle is enabled
2. Zoom to Iowa region (auctions are location-based)
3. Click "Refresh Auctions" to scrape fresh data
4. Check console for errors

### Valuation Fails

- Ensure auction has valid coordinates
- Check CSR2 service is operational
- Verify auction is in Iowa (CSR2 data only available for Iowa)

### Scraping Errors

```javascript
// Check Firecrawl API key
console.log(process.env.FIRECRAWL_API_KEY);

// Test individual site
const result = await firecrawlService.map('https://dreamdirt.com');
console.log(result);
```

### Database Errors

```sql
-- Check auctions table exists
SELECT COUNT(*) FROM auctions;

-- View recent auctions
SELECT id, title, scraped_at FROM auctions 
ORDER BY scraped_at DESC LIMIT 10;
```

## Future Enhancements

- [ ] Email alerts for new auctions
- [ ] Auction watchlist/favorites
- [ ] Price trends analysis
- [ ] Automatic bidding integration
- [ ] Multi-state support beyond Iowa
- [ ] Auction results tracking
- [ ] Comparative market analysis

## Credits

- **Firecrawl**: Web scraping and data extraction
- **MapLibre GL**: Map rendering
- **USDA Soil Data Access**: CSR2 soil ratings
- **OpenStreetMap Nominatim**: Geocoding

## Support

For issues or questions:
- Check console logs
- Run test script: `node scripts/test-auction-scraper.js`
- Review Firecrawl docs: https://docs.firecrawl.dev
- Check database with: `psql $DATABASE_URL`

