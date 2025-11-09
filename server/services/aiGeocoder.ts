import OpenAI from 'openai';
import { Pool } from '@neondatabase/serverless';

// Lazy initialize OpenAI client
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY or OPENAI_API_KEY2 environment variable is required');
    }
    openai = new OpenAI({
      apiKey: apiKey,
    });
  }
  return openai;
}

interface LegalDescription {
  section: number | number[];
  township: string;
  range: string;
  subdivision?: string;
  raw: string;
  confidence: 'high' | 'medium' | 'low';
}

interface StreetAddress {
  full_address: string;
  city: string;
  county: string;
  state: string;
  confidence: 'high' | 'medium' | 'low';
}

interface AuctionLocationAnalysis {
  is_actual_land_auction: boolean;
  legal_description?: LegalDescription;
  street_address?: StreetAddress;
  reasoning: string;
}

/**
 * Use AI to analyze auction listing and extract ALL location information
 * including legal descriptions (Section/Township/Range)
 */
export async function analyzeAuctionListing(
  auction: any
): Promise<AuctionLocationAnalysis | null> {
  
  try {
    const prompt = `Analyze this land auction listing and extract ALL location information.

Title: ${auction.title || 'N/A'}
Address: ${auction.address || 'N/A'}
County: ${auction.county || 'N/A'}
State: ${auction.state || 'N/A'}
Description: ${auction.description || 'N/A'}
URL: ${auction.url || 'N/A'}

Extract:
1. Is this an actual LAND auction? (not equipment, blog post, or article)
2. Legal Description if present (Section/Township/Range format like "S10 T85N R27W" or "NE1/4 of Section 23")
3. Street address or physical location
4. City, County, State
5. Provide confidence level for each piece of information

Return JSON with this exact structure:
{
  "is_actual_land_auction": boolean,
  "legal_description": {
    "section": number or array of numbers,
    "township": string,
    "range": string,
    "subdivision": string (e.g., "NE1/4" or "E1/2 of SW1/4"),
    "raw": string (original legal description text),
    "confidence": "high" | "medium" | "low"
  } or null,
  "street_address": {
    "full_address": string,
    "city": string,
    "county": string,
    "state": string,
    "confidence": "high" | "medium" | "low"
  } or null,
  "reasoning": string
}`;

    const client = getOpenAI();
    const response = await client.chat.completions.create({
      model: 'gpt-4o', // Using GPT-4o to match existing codebase
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing land auction listings and extracting location data. You understand Iowa PLSS legal descriptions and can parse Section/Township/Range formats.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const analysis = JSON.parse(content) as AuctionLocationAnalysis;
    return analysis;
    
  } catch (error) {
    console.error('AI analysis error:', error);
    return null;
  }
}

/**
 * Match legal description to Iowa parcels using PLSS system
 * Returns coordinates of the matching parcel(s)
 */
export async function matchLegalDescription(
  legalDesc: LegalDescription,
  county: string,
  pool: Pool
): Promise<{ latitude: number; longitude: number; confidence: string } | null> {
  
  try {
    // Parse township and range numbers
    const townshipMatch = legalDesc.township.match(/(\d+)N?/i);
    const rangeMatch = legalDesc.range.match(/(\d+)W?/i);
    
    if (!townshipMatch || !rangeMatch) {
      console.warn('Could not parse township/range:', legalDesc);
      return null;
    }
    
    const township = townshipMatch[1];
    const range = rangeMatch[1];
    const sections = Array.isArray(legalDesc.section) ? legalDesc.section : [legalDesc.section];
    
    // Search for parcels matching this legal description
    // Note: state_parcel_id often contains section/township/range info
    const searchPatterns = sections.map(s => `%S${s}%T${township}%R${range}%`);
    
    const query = `
      SELECT 
        ST_Y(ST_Centroid(ST_Union(geom))) as latitude,
        ST_X(ST_Centroid(ST_Union(geom))) as longitude,
        COUNT(*) as parcel_count,
        array_agg(id) as parcel_ids
      FROM parcels
      WHERE county_name = $1
        AND geom IS NOT NULL
        AND (
          ${searchPatterns.map((_, idx) => `state_parcel_id ILIKE $${idx + 2}`).join(' OR ')}
        )
      GROUP BY county_name
    `;
    
    const params = [county, ...searchPatterns];
    const result = await pool.query(query, params);
    
    if (result.rows.length > 0 && result.rows[0].latitude) {
      const row = result.rows[0];
      console.log(`   ✅ Legal description matched ${row.parcel_count} parcels in ${county} County`);
      
      return {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        confidence: row.parcel_count > 0 ? 'high' : 'medium'
      };
    }
    
    // Fallback: Try broader search without exact section match
    const broadQuery = `
      SELECT 
        ST_Y(ST_Centroid(ST_Union(geom))) as latitude,
        ST_X(ST_Centroid(ST_Union(geom))) as longitude,
        COUNT(*) as parcel_count
      FROM parcels
      WHERE county_name = $1
        AND geom IS NOT NULL
        AND state_parcel_id ILIKE $2
      GROUP BY county_name
    `;
    
    const broadPattern = `%T${township}%R${range}%`;
    const broadResult = await pool.query(broadQuery, [county, broadPattern]);
    
    if (broadResult.rows.length > 0 && broadResult.rows[0].latitude) {
      console.log(`   ⚠️  Broad match on T${township} R${range} in ${county} County`);
      return {
        latitude: parseFloat(broadResult.rows[0].latitude),
        longitude: parseFloat(broadResult.rows[0].longitude),
        confidence: 'medium'
      };
    }
    
    console.log(`   ❌ No parcel match for legal description in ${county} County`);
    return null;
    
  } catch (error) {
    console.error('Legal description matching error:', error);
    return null;
  }
}

/**
 * Geocode using Mapbox (free tier: 100k/month)
 */
export async function geocodeWithMapbox(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  
  const apiKey = process.env.MAPBOX_API_KEY || process.env.VITE_MAPBOX_PUBLIC_KEY;
  
  if (!apiKey) {
    console.warn('MAPBOX_API_KEY not configured, skipping Mapbox geocoding');
    return null;
  }
  
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
    const params = new URLSearchParams({
      access_token: apiKey,
      country: 'US',
      limit: '1'
    });
    
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { latitude: lat, longitude: lng };
    }
    
    return null;
  } catch (error) {
    console.error('Mapbox geocoding error:', error);
    return null;
  }
}

/**
 * Validate coordinates are within Iowa using parcel database
 */
export async function validateIowaLocation(
  latitude: number,
  longitude: number,
  pool: Pool
): Promise<{ is_in_iowa: boolean; actual_county: string | null }> {
  
  try {
    const result = await pool.query(`
      SELECT county_name
      FROM parcels
      WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      LIMIT 1
    `, [longitude, latitude]);
    
    if (result.rows.length > 0) {
      return {
        is_in_iowa: true,
        actual_county: result.rows[0].county_name
      };
    }
    
    // Check if at least close to Iowa (within 50km)
    const nearbyResult = await pool.query(`
      SELECT county_name, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
      FROM parcels
      WHERE geom && ST_Expand(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geometry, 0.5)
      ORDER BY distance
      LIMIT 1
    `, [longitude, latitude]);
    
    if (nearbyResult.rows.length > 0 && nearbyResult.rows[0].distance < 50000) {
      console.warn(`   ⚠️  Coordinates are ${(nearbyResult.rows[0].distance / 1000).toFixed(1)}km from Iowa`);
      return {
        is_in_iowa: false,
        actual_county: nearbyResult.rows[0].county_name
      };
    }
    
    return {
      is_in_iowa: false,
      actual_county: null
    };
    
  } catch (error) {
    console.error('Iowa validation error:', error);
    return { is_in_iowa: false, actual_county: null };
  }
}

/**
 * Geocode address using OpenStreetMap (free, current method)
 */
export async function geocodeWithOSM(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: 'us'
    })}`, {
      headers: {
        'User-Agent': 'TerraValue-Agricultural-Valuation/1.0'
      }
    });
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }
    
    return null;
  } catch (error) {
    console.error('OSM geocoding error:', error);
    return null;
  }
}

/**
 * Get Iowa county centroid coordinates
 */
export async function getCountyCentroid(
  county: string
): Promise<{ latitude: number; longitude: number } | null> {
  
  const { getCountyCentroid } = await import('./iowaCountyCentroids.js');
  return getCountyCentroid(county);
}

/**
 * Comprehensive geocoding with cascade fallback strategy
 */
export async function geocodeWithCascade(
  analysis: AuctionLocationAnalysis,
  pool: Pool
): Promise<{
  latitude: number;
  longitude: number;
  method: string;
  confidence: string;
  county?: string;
} | null> {
  
  // Strategy 1: Legal Description Matching (BEST for farmland)
  if (analysis.legal_description && analysis.street_address?.county) {
    console.log('   🔍 Attempting legal description match...');
    const legalMatch = await matchLegalDescription(
      analysis.legal_description,
      analysis.street_address.county,
      pool
    );
    
    if (legalMatch) {
      return {
        ...legalMatch,
        method: 'legal_description',
        county: analysis.street_address.county
      };
    }
  }
  
  // Strategy 2: Mapbox Geocoding (Good accuracy, free tier)
  if (analysis.street_address?.full_address) {
    console.log('   🔍 Attempting Mapbox geocoding...');
    const mapboxResult = await geocodeWithMapbox(analysis.street_address.full_address);
    
    if (mapboxResult) {
      // Validate it's in Iowa
      const validation = await validateIowaLocation(mapboxResult.latitude, mapboxResult.longitude, pool);
      
      if (validation.is_in_iowa) {
        return {
          ...mapboxResult,
          method: 'mapbox',
          confidence: 'high',
          county: validation.actual_county || undefined
        };
      } else {
        console.log('   ⚠️  Mapbox result not in Iowa');
      }
    }
  }
  
  // Strategy 3: OpenStreetMap Geocoding (Free, current method)
  if (analysis.street_address?.full_address) {
    console.log('   🔍 Attempting OSM geocoding...');
    const osmResult = await geocodeWithOSM(analysis.street_address.full_address);
    
    if (osmResult) {
      const validation = await validateIowaLocation(osmResult.latitude, osmResult.longitude, pool);
      
      if (validation.is_in_iowa) {
        return {
          ...osmResult,
          method: 'osm',
          confidence: 'medium',
          county: validation.actual_county || undefined
        };
      }
    }
  }
  
  // Strategy 4: County Centroid (Last resort)
  if (analysis.street_address?.county && analysis.street_address?.state?.toLowerCase() === 'iowa') {
    console.log('   🔍 Using county centroid fallback...');
    const centroid = await getCountyCentroid(analysis.street_address.county);
    
    if (centroid) {
      return {
        ...centroid,
        method: 'county_centroid',
        confidence: 'low',
        county: analysis.street_address.county
      };
    }
  }
  
  console.log('   ❌ All geocoding methods failed');
  return null;
}

/**
 * Complete geocoding pipeline for a single auction
 */
export async function geocodeAuction(
  auction: any,
  pool: Pool
): Promise<{
  success: boolean;
  coordinates?: { latitude: number; longitude: number };
  method?: string;
  confidence?: string;
  county?: string;
  is_actual_auction?: boolean;
  reasoning?: string;
  error?: string;
}> {
  
  try {
    console.log(`\n🔍 Geocoding: ${auction.title}`);
    
    // Step 1: AI Analysis
    console.log('   🤖 Running AI analysis...');
    const analysis = await analyzeAuctionListing(auction);
    
    if (!analysis) {
      return { success: false, error: 'AI analysis failed' };
    }
    
    // Check if it's actually a land auction
    if (!analysis.is_actual_land_auction) {
      console.log(`   ⚠️  Not a land auction: ${analysis.reasoning}`);
      return {
        success: false,
        is_actual_auction: false,
        reasoning: analysis.reasoning
      };
    }
    
    console.log(`   ✅ Confirmed land auction`);
    if (analysis.legal_description) {
      console.log(`   📋 Legal: ${analysis.legal_description.raw}`);
    }
    if (analysis.street_address) {
      console.log(`   📍 Address: ${analysis.street_address.full_address}`);
    }
    
    // Step 2: Geocode using cascade
    const result = await geocodeWithCascade(analysis, pool);
    
    if (!result) {
      return { success: false, error: 'All geocoding methods failed' };
    }
    
    console.log(`   ✅ Geocoded via ${result.method}: ${result.latitude}, ${result.longitude}`);
    console.log(`   📊 Confidence: ${result.confidence}`);
    
    return {
      success: true,
      coordinates: {
        latitude: result.latitude,
        longitude: result.longitude
      },
      method: result.method,
      confidence: result.confidence,
      county: result.county,
      is_actual_auction: true,
      reasoning: analysis.reasoning
    };
    
  } catch (error) {
    console.error('   ❌ Geocoding error:', error);
    return { success: false, error: String(error) };
  }
}


