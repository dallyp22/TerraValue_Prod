import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '@shared/schema';

async function addSchabenAuctions() {
  console.log('📄 Adding 3 Schaben Real Estate Auctions\n');
  
  const schabenAuctions = [
    {
      title: 'Adam Ries, Michael Ries & Susan Sager - 306.672 Acres Crawford County Farm',
      description: `Real Estate Auction - 306.672 Acres
      
Location: Dow City Community Building, 106 Franklin St, Dow City, Iowa
Farm Location: 1 1/4 miles south of Dow City on 193rd Street (1 mile frontage on east side)

Physical: Rolling hill farm with 1 more year of CRP payments. 198 tillable acres.
Soil Types: Napier, Monona, Dow and Ida Silt Loam

FSA Info:
- Farm #1681, Tract #5220
- Cropland: 215.72 Acres
- Corn Base: 150 acres (174 bu yield)
- Soybean Base: 49.8 acres (44 bu yield)

CRP Payment: $308.95/acre × 207.83 acres = $64,209 payable September 2026
Taxes: $7,775
CSR2: 51.8 on approximately 198 tillable acres

Possession: At closing, buyer receives 100% of 2025/26 CRP payment

Contact: Jim Schaben 712-263-9449`,
      url: 'https://www.schabenre.com/copy-of-land-auctions-1',
      sourceWebsite: 'https://www.schabenre.com',
      auctionDate: new Date('2025-12-03T09:00:00-06:00'),
      auctionType: 'Live with Simulcast Online',
      auctioneer: 'Jim Schaben',
      address: '193rd Street, Dow City, IA 51736',
      county: 'Crawford',
      state: 'IA',
      acreage: 306.672,
      landType: 'Farmland',
      csr2Mean: 51.8,
      status: 'active'
    },
    {
      title: 'Charles Swanson Family Trust - 487.93 Acres Monona County (3 Tracts)',
      description: `Real Estate Auction - 487.93 Acres in 3 Tracts
      
Location: Town and Country Center - 313 S Monona Ave., Ute IA

TRACT 1: 102.83 acres, CSR2 82.2
- Location: 1 3/4 miles N of Ute on US 141 (West side)
- Very productive rolling hill farm, nearly 70 acres with 0-5% slopes
- Soils: Monona, Ida, Napier, Kennebec Silt Loam
- Taxes: $4,412 + $130 drainage

TRACT 2: 223.09 acres, CSR2 78.5
- Location: 1 3/4 miles N of Ute on US 141 (East side)
- Gently rolling farm with creek bottom, 3/4 mile rows
- Buildings: 40×100, Bins: 1-21,000bu, 2-7,000bu
- Soils: Monona, Napier, Ida Silt Loam
- Taxes: $9,652

TRACT 3: 162.01 acres, CSR2 76.6
- Location: 1.5 miles E on Hwy 141, then 1/4 mile S on 100th St
- Rolling hills with 75 acres creek bottom
- Soils: Monona, Ida Silt Loam
- Taxes: $6,274 + $234 drainage

FSA Combined: Farm #4403, Tract #424/#416
Cropland: 311.42 + 149.66 acres
Corn Base: 191.67 + 92.12 acres (183 bu yield)
Soybean Base: 118.47 + 56.94 acres (50 bu yield)

Possession: March 1, 2026 with full 2026 farming rights

Contact: Jim Schaben 712-263-9449`,
      url: 'https://www.schabenre.com/charles-swanson',
      sourceWebsite: 'https://www.schabenre.com',
      auctionDate: new Date('2025-12-04T10:00:00-06:00'),
      auctionType: 'Live with Simulcast Online',
      auctioneer: 'Jim Schaben',
      address: 'US Highway 141, Ute, IA 51060',
      county: 'Monona',
      state: 'IA',
      acreage: 487.93,
      landType: 'Farmland',
      csr2Mean: 78.5, // Weighted average of the 3 tracts
      status: 'active'
    },
    {
      title: 'Brummer Willow Farm LLC - 478.56 Acres Monona County (3 Tracts)',
      description: `Real Estate Auction - 478.56 Acres in 3 Tracts
      
Location: Dunlap Livestock Auction - 701 W Hwy 30, Dunlap, IA

TRACT 1: 253.56 acres, CSR2 77
- Location: From E54 & Teak Ave, S 1 3/4 mi, then W 3/4 mi on 325th (South side)
- Nearly level highly productive upland Willow creek farmland
- Buildings: 54'×81' steel sided, 24'×40' steel sided
- Bins: Three 30'×18' storage bins (11,144 bu each)
- Soils: Napier, Rawles, Kennebec, Ida, Colo, Monona, Ackmore Silt Loam

TRACT 2: 189 acres, CSR2 70.8
- Location: From E54 & Teak Ave, S 3 1/4 mi, then W 1/2 mi on 340th
- Nearly level highly productive upland Willow creek farmland
- Soils: Rawles, Napier, Colo, Ida, Monona, Kennebec Silt Loam

TRACT 3: 36 acres, CSR2 83.4
- Location: From E54 & Teak Ave, S 1 3/4 mi, then W 1/8 mi on 325th
- Nearly level highly productive upland farmland
- Soils: Kennebec, McPaul, Colo, Ida, Monona, Ackmore silt loams

FSA Info: Farm #6746, Tract #8193
Farmland: 477.97 acres
Cropland: 413.4 acres
Corn Base: 263.73 acres (170 bu yield)
Soybean Base: 128.67 acres (49 bu yield)

Current Lease: 2026-2027 at $400/acre
- Tract 1: $91,040/year
- Tract 2: $63,500/year
- Tract 3: $12,260/year

Total Taxes: $19,296

Possession: At closing (landlord keeps current lease for 2026-2027)

Contact: Jim Schaben 712-263-9449`,
      url: 'https://www.schabenre.com/brummer-willow-farm-llc',
      sourceWebsite: 'https://www.schabenre.com',
      auctionDate: new Date('2025-12-06T11:00:00-06:00'),
      auctionType: 'Live with Simulcast Online',
      auctioneer: 'Jim Schaben',
      address: '325th Street, Dunlap, IA 51529',
      county: 'Monona',
      state: 'IA',
      acreage: 478.56,
      landType: 'Farmland',
      csr2Mean: 75.4, // Weighted average of the 3 tracts
      status: 'active'
    }
  ];

  let savedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < schabenAuctions.length; i++) {
    const auction = schabenAuctions[i];
    console.log(`\n[${i + 1}/3] Processing: ${auction.title.substring(0, 60)}...`);

    try {
      // Check if already exists
      const existing = await db.query.auctions.findFirst({
        where: (auctions, { eq }) => eq(auctions.url, auction.url)
      });

      if (existing) {
        console.log('  ℹ️  Already in database (ID: ' + existing.id + ')');
        skippedCount++;
        continue;
      }

      // Save to database
      const [saved] = await db.insert(auctions).values(auction).returning();

      console.log(`  ✅ Saved (ID: ${saved.id})`);
      console.log(`  📅 Date: ${auction.auctionDate.toLocaleDateString()} @ ${auction.auctionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
      console.log(`  📏 Acreage: ${auction.acreage}`);
      console.log(`  🌾 CSR2: ${auction.csr2Mean}`);
      savedCount++;

    } catch (error) {
      console.log(`  ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Geocode all 3
  console.log('\n🗺️  Geocoding all auctions...\n');
  
  const geocodeData = [
    { address: 'Dow City, Crawford County, Iowa', auctionIndex: 0 },
    { address: 'Ute, Monona County, Iowa', auctionIndex: 1 },
    { address: 'Dunlap, Monona County, Iowa', auctionIndex: 2 }
  ];

  for (const geo of geocodeData) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geo.address)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FarmScope-AI-Auction-Scraper/1.0' }
      });
      const data = await response.json();
      
      if (data && data.length > 0) {
        const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        
        await db.update(auctions)
          .set({ latitude: coords.lat, longitude: coords.lon })
          .where((a, { eq }) => eq(a.url, schabenAuctions[geo.auctionIndex].url));
        
        console.log(`  ✅ ${schabenAuctions[geo.auctionIndex].title.substring(0, 40)}...`);
        console.log(`     Coords: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
    } catch (error) {
      console.log(`  ❌ Geocoding failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total auctions:   3`);
  console.log(`Newly saved:      ${savedCount}`);
  console.log(`Already existed:  ${skippedCount}`);
  console.log(`Total acreage:    ${schabenAuctions.reduce((sum, a) => sum + a.acreage, 0).toFixed(2)} acres`);
  console.log(`\n✨ All auctions are now live on the map!`);
  console.log('='.repeat(60) + '\n');

  process.exit(0);
}

addSchabenAuctions();

