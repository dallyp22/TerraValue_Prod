import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '@shared/schema';

async function addMenkeEastonAuction() {
  console.log('📄 Adding Menke Auction - Easton Farm\n');
  
  const auctionData = {
    title: 'Pottawattamie County Iowa Farm - 78.25 Acres - Sealed Bid Auction',
    description: `Sealed Bid Land Auction
    
Location: Belknap Township, Section 13 - Oakland Iowa
Legal: SE NW & SW NE all in Section 13, T75N R40W in Pottawattamie Co. Iowa

Farm Information:
- FSA Farm #: 197
- FSA Tract #: 1878
- Net Taxable Acres: 78.25
- FSA Crop Acres: 72.57
- CSR2 Rating: 73.67
- 2024 Taxes: $3,032.00

Directions: Property is located on the South side Clark Rd. on the south edge of Oakland IA.
Take Frank Kearney Rd. E. off Hwy 59 to Clark Rd. – Then East .2 mile on Clark Rd. to farm.

Auction Method: One Bid, Sealed Bid Auction. Bids submitted on a per acre basis multiplied by 78.25 acres.
No lease in place for 2026 Crop Year.

Contact: Byron Menke – Auctioneer 402-630-6469`,
    url: 'https://www.menke-auction.com/siteart/auction-images/real-estate-auction/Easton%20land%20salebill.pdf',
    sourceWebsite: 'https://www.menke-auction.com',
    auctionDate: new Date('2025-12-18T16:00:00-06:00'), // 4:00 PM CST
    auctionType: 'Sealed Bid',
    auctioneer: 'Byron Menke',
    address: 'Clark Rd, Oakland, IA 51560',
    county: 'Pottawattamie',
    state: 'IA',
    acreage: 78.25,
    landType: 'Farmland',
    csr2Mean: 73.67,
    status: 'active'
  };

  try {
    // Check if already exists
    const existing = await db.query.auctions.findFirst({
      where: (auctions, { eq }) => eq(auctions.url, auctionData.url)
    });

    if (existing) {
      console.log('⚠️  Auction already exists in database');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Title: ${existing.title}`);
      return;
    }

    // Add to database
    const [saved] = await db.insert(auctions).values(auctionData).returning();

    console.log('✅ Successfully added auction!');
    console.log('\n' + '='.repeat(60));
    console.log('📊 AUCTION DETAILS');
    console.log('='.repeat(60));
    console.log(`ID:           ${saved.id}`);
    console.log(`Title:        ${saved.title}`);
    console.log(`Location:     Oakland, Pottawattamie County, Iowa`);
    console.log(`Acreage:      78.25 acres`);
    console.log(`CSR2:         73.67`);
    console.log(`Auction Date: December 18, 2025 @ 4:00 PM CST`);
    console.log(`Type:         Sealed Bid`);
    console.log(`Source:       Menke Auction`);
    console.log('='.repeat(60) + '\n');
    
    console.log('🗺️  Now geocoding...');
    
    // Geocode using free OpenStreetMap
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent('Oakland, Pottawattamie County, Iowa')}&format=json&limit=1`;
    
    const response = await fetch(geocodeUrl, {
      headers: {
        'User-Agent': 'FarmScope-AI-Auction-Scraper/1.0'
      }
    });
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
      
      await db.update(auctions)
        .set({
          latitude: coords.lat,
          longitude: coords.lon
        })
        .where((a) => a.id === saved.id);
      
      console.log(`✅ Geocoded: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
      console.log('\n🎯 Auction is now live on the map!');
    } else {
      console.log('⚠️  Geocoding failed - manual coordinates needed');
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }

  process.exit(0);
}

addMenkeEastonAuction();

