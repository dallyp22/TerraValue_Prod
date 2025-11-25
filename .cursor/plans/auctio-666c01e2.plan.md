<!-- 666c01e2-798f-43b2-a78a-72a06f0bed3e b38f54c5-edfe-47aa-baa6-36368dd67ff8 -->
# Enhanced AI-Powered Parcel Matching System

## Problem

Current system only searches by radius (0.5 mile) around auction coordinates. Many auctions don't match because:

- Auction address is often the auction house/city hall, not the property
- Coordinates may be missing or inaccurate
- No use of rich data: legal descriptions, owner names, directions, etc.

## Solution: Multi-Strategy Matching with AI

### Strategy 1: Legal Description Parsing

**What**: Parse legal land descriptions to find exact parcels

**Examples**:

- "NW 1/4 of Section 28, Township 92N, Range 42W"
- "E1/2 SE1/4 Sec 15-T89N-R39W"

**Implementation**:

```typescript
// Parse legal description using regex + AI
const legalDesc = "NW 1/4 of Section 28, Township 92N, Range 42W, Pocahontas County"

// Query parcel database by legal description components
SELECT * FROM parcels 
WHERE county = 'Pocahontas'
  AND legal_description ILIKE '%Section 28%'
  AND legal_description ILIKE '%T92N%'
  AND legal_description ILIKE '%R42W%'
```

### Strategy 2: Owner Name Fuzzy Matching

**What**: Match auction seller/owner name with parcel owner records

**Examples**:

- Auction: "Edna King Estate" → Parcel: "KING, EDNA M."
- Auction: "RDB Farms LLC" → Parcel: "RDB FARMS L.L.C."

**Implementation**:

```typescript
// Use fuzzy matching with Levenshtein distance
import { distance } from 'fastest-levenshtein';

function fuzzyMatchOwner(auctionOwner: string, parcelOwners: string[]): Match[] {
  const normalized = auctionOwner.toUpperCase().replace(/[.,\s]/g, '');
  
  return parcelOwners
    .map(owner => ({
      owner,
      score: distance(normalized, owner.toUpperCase().replace(/[.,\s]/g, ''))
    }))
    .filter(m => m.score < 5) // Allow small differences
    .sort((a, b) => a.score - b.score);
}
```

### Strategy 3: Address Geocoding + Reverse Lookup

**What**: If auction has street address, geocode it and find parcels at that point

**Examples**:

- "27664 270th St, Reinbeck, IA 50669"
- Geocode → exact coordinates → query parcels at point

**Implementation**:

```typescript
// Use Google Geocoding API or Mapbox
const coords = await geocodeAddress("27664 270th St, Reinbeck, IA 50669");
const parcels = await findParcelsAtPoint(coords.lng, coords.lat);
```

### Strategy 4: AI-Enhanced Description Analysis

**What**: Use Gemini + OpenAI to extract location clues from descriptions

**Examples from auction descriptions**:

- "three miles south and ½ west of Plover, Iowa"
- "located on County Road B-40 between Woodbine and Logan"
- "adjacent to the Johnson property on the north"

**Implementation**:

```typescript
// Two-stage AI analysis
// Stage 1: OpenAI extracts structured data
const openaiData = await extractWithOpenAI(auction);

// Stage 2: Gemini validates and enhances with search
const geminiData = await enhanceWithGemini(auction, openaiData);

// Combine results
const merged = mergeAIResults(openaiData, geminiData);
```

### Strategy 5: Google Search API Integration

**What**: Search for the property online to find additional info

**Search queries**:

- "{auction title} {county} Iowa parcel"
- "{owner name} {acreage} acres {county}"
- "property records {address}"

**Extract from results**:

- Property websites with detailed info
- County assessor records
- Real estate listings with parcel numbers

### Strategy 6: Acreage + County Combination

**What**: When other methods fail, use acreage + county with tolerance

**Implementation**:

```typescript
SELECT * FROM parcels
WHERE county = 'Pocahontas'
  AND acres BETWEEN 75 AND 85  -- 80 acres ±6%
ORDER BY ABS(acres - 80)
LIMIT 10
```

### Strategy 7: Multi-Tract Aggregation

**What**: Some auctions sell multiple adjacent parcels as one listing

**Implementation**:

- Find all parcels near auction coordinates
- Check for same owner name
- Sum acreages to see if they match auction total
- Return all parcels as multi-tract match

## Service Architecture

**File: `server/services/enhancedParcelMatcher.ts` (new)**

```typescript
interface MatchingStrategy {
  name: string;
  confidence: number;
  execute(auction: Auction): Promise<ParcelMatch[]>;
}

class EnhancedParcelMatcher {
  private strategies: MatchingStrategy[] = [
    new LegalDescriptionStrategy(),
    new OwnerNameStrategy(),
    new AddressGeocodingStrategy(),
    new AIAnalysisStrategy(),
    new GoogleSearchStrategy(),
    new AcreageCountyStrategy(),
    new MultiTractStrategy()
  ];

  async findBestMatch(auction: Auction): Promise<ParcelMatch> {
    const results = await Promise.allSettled(
      this.strategies.map(s => s.execute(auction))
    );

    // Weight results by strategy confidence
    const weighted = this.weightResults(results);
    
    // Return highest confidence match
    return this.selectBestMatch(weighted);
  }
}
```

## AI Integration Details

### OpenAI GPT-4o (Already integrated)

- Extract structured data from auction text
- Parse complex legal descriptions
- Identify owner names and property details
- Fast, reliable, good at structured extraction

### Google Gemini 2.0 Flash (New)

- Validate OpenAI results
- Search-grounded generation for accuracy
- Better at spatial reasoning ("3 miles south of...")
- Can cross-reference with real-time data

### Gemini Setup

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash-exp",
  tools: [{ googleSearch: {} }] // Enable grounded search
});
```

### Google Custom Search API

```typescript
const searchResults = await fetch(
  `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${query}`
);
// Extract parcel numbers, addresses, owner info from results
```

## Confidence Scoring System

Each strategy returns a confidence score (0-100):

- **90-100**: Exact match (legal description + owner name)
- **75-89**: High confidence (legal desc OR owner + acreage)
- **50-74**: Medium confidence (address geocode + acreage)
- **25-49**: Low confidence (county + acreage only)
- **0-24**: Very low (radius search only)

Show confidence to user with color coding:

- 🟢 Green: 75-100 (High)
- 🟡 Yellow: 50-74 (Medium)
- 🟠 Orange: 25-49 (Low)
- 🔴 Red: 0-24 (Very Low)

## Updated API Response

```typescript
{
  success: true,
  match: {
    parcelNumber: "123-456-789",
    ownerName: "King, Edna M.",
    geometry: "POLYGON(...)",
    confidence: 95,
    matchedBy: ["legal_description", "owner_name"],
    strategies: [
      { name: "Legal Description", score: 95, matched: true },
      { name: "Owner Name", score: 88, matched: true },
      { name: "Address Geocoding", score: 0, matched: false }
    ]
  }
}
```

## Implementation Steps

1. **Install Gemini SDK**: `npm install @google/generative-ai`
2. **Create BLM PLSS service** (`server/services/blmPlss.ts`):

   - Query BLM API with township/range/section
   - Convert PLSS to GeoJSON geometry
   - Cache results for performance

3. **Create Gemini parsing service** (`server/services/geminiParser.ts`):

   - Parse legal descriptions to structured JSON
   - Handle multiple formats (PLSS, lot/block, metes/bounds)
   - Return confidence scores

4. **Create enhanced matcher** (`server/services/enhancedParcelMatcher.ts`):

   - Combine Gemini + BLM + our database
   - Try strategies in order (PLSS → Owner → Address → Acreage)
   - Weight results by confidence

5. **Update prepare-valuation endpoint**:

   - Call enhanced matcher instead of simple radius search
   - Return confidence scores and matched strategies

6. **Update UI** to show:

   - Confidence badges (High/Medium/Low)
   - Which strategy matched (PLSS, Owner, etc.)
   - Legal description if available

7. **Add PostGIS spatial queries**:

   - Use ST_Intersects with BLM geometry
   - Use ST_Distance for proximity ranking
   - Combine with text search on legal_description field

## Environment Variables Needed

```env
GEMINI_API_KEY=your_gemini_key
GOOGLE_SEARCH_API_KEY=your_search_key
GOOGLE_SEARCH_CX=your_search_engine_id
```

## Testing Strategy

Test with various auction types:

1. ✅ Clear legal description → should get 90%+ confidence
2. ✅ Owner name + county → should get 80%+ confidence
3. ✅ Street address → should get 75%+ confidence
4. ✅ Only directions ("3 miles south") → Gemini + search should find it
5. ✅ Multiple tracts → should aggregate and match
6. ✅ Poor data (only county + acreage) → should get 30-50% confidence

## Benefits

- **Higher match rate**: Currently ~40% → Expected 80%+
- **Confidence transparency**: Users know match quality
- **Multi-source validation**: AI + search + database queries
- **Handles edge cases**: Multi-tracts, directions, estate sales
- **Graceful degradation**: Falls back through strategies

### To-dos

- [ ] Create AI parcel extraction service in server/services/auctionParcelExtractor.ts
- [ ] Add POST /api/auctions/:id/prepare-valuation endpoint in server/routes.ts
- [ ] Update handleStartAuctionValuation in MapCentricHome.tsx to call new API
- [ ] Enhance PropertyFormOverlay to handle auction-sourced pre-populated data
- [ ] Test with various auction types and verify data accuracy
- [ ] Create AI parcel extraction service in server/services/auctionParcelExtractor.ts
- [ ] Add POST /api/auctions/:id/prepare-valuation endpoint in server/routes.ts
- [ ] Update handleStartAuctionValuation in MapCentricHome.tsx to call new API
- [ ] Enhance PropertyFormOverlay to handle auction-sourced pre-populated data
- [ ] Test with various auction types and verify data accuracy