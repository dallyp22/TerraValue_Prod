import OpenAI from 'openai';
import { Pool } from '@neondatabase/serverless';
import { getCountyCentroid } from './iowaCountyCentroids.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY || ''
});

export interface LegalDescriptionComponents {
  township: string;
  range: string;
  section: string | number;
  quarter?: string; // NE, SW, NE1/4, etc.
  county: string;
  state: string;
  raw: string;
  confidence: number; // 0-100
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  confidence: number; // 0-100
  method: 'address' | 'legal_description' | 'county_centroid' | 'osm' | 'mapbox';
  source: string;
}

/**
 * Parse legal description from text using OpenAI
 */
export async function parseLegalDescription(
  text: string,
  county?: string,
  state: string = 'Iowa'
): Promise<LegalDescriptionComponents | null> {
  try {
    const prompt = `Parse this legal land description into its components. Legal descriptions follow the Public Land Survey System (PLSS) format used in the United States.

Text to parse: "${text}"
County: ${county || 'Unknown'}
State: ${state}

Extract the following components:
- Township (e.g., "T85N", "85N", or just "85")
- Range (e.g., "R27W", "27W", or just "27")
- Section (e.g., "Section 10", "S10", or just "10")
- Quarter/Subdivision if specified (e.g., "NE1/4", "E1/2 of SW1/4")

Return JSON with this structure:
{
  "township": "string (e.g., 'T85N' or '85N')",
  "range": "string (e.g., 'R27W' or '27W')",
  "section": "string or number",
  "quarter": "string or null (e.g., 'NE1/4')",
  "county": "county name",
  "state": "state name",
  "raw": "original legal description",
  "confidence": number (0-100, how confident in the parse)
}

If you cannot parse a legal description from the text, return null.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert in parsing Public Land Survey System (PLSS) legal land descriptions. You understand Township, Range, and Section notation used in land surveys.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    
    // Validate we got the essential components
    if (!parsed || !parsed.township || !parsed.range || !parsed.section) {
      return null;
    }

    return {
      township: parsed.township,
      range: parsed.range,
      section: parsed.section,
      quarter: parsed.quarter || undefined,
      county: parsed.county || county || '',
      state: parsed.state || state,
      raw: parsed.raw || text,
      confidence: parsed.confidence || 70
    };
  } catch (error) {
    console.error('Legal description parsing error:', error);
    return null;
  }
}

/**
 * Convert Township/Range/Section to coordinates using Iowa parcel database
 */
export async function geocodeFromTRS(
  township: string,
  range: string,
  section: string | number,
  county: string,
  pool: Pool
): Promise<GeocodingResult | null> {
  try {
    // Extract numeric parts from township and range
    const townshipMatch = township.match(/(\d+)/);
    const rangeMatch = range.match(/(\d+)/);
    
    if (!townshipMatch || !rangeMatch) {
      console.warn('Could not extract numbers from TRS:', { township, range });
      return null;
    }

    const t = townshipMatch[1];
    const r = rangeMatch[1];
    const s = String(section);

    console.log(`   🔍 Searching parcels for T${t} R${r} S${s} in ${county} County`);

    // Query parcels that match this TRS pattern
    const query = `
      SELECT 
        ST_Y(ST_Centroid(ST_Union(geom))) as latitude,
        ST_X(ST_Centroid(ST_Union(geom))) as longitude,
        COUNT(*) as parcel_count
      FROM parcels
      WHERE county_name ILIKE $1
        AND geom IS NOT NULL
        AND (
          state_parcel_id ILIKE $2
          OR state_parcel_id ILIKE $3
          OR state_parcel_id ILIKE $4
        )
      GROUP BY county_name
    `;

    // Try multiple pattern variations
    const patterns = [
      `%S${s}%T${t}%R${r}%`,
      `%T${t}%R${r}%S${s}%`,
      `%-${s}-%${t}-%${r}-%`
    ];

    const result = await pool.query(query, [county, ...patterns]);

    if (result.rows.length > 0 && result.rows[0].latitude) {
      const row = result.rows[0];
      console.log(`   ✅ Matched ${row.parcel_count} parcels`);
      
      return {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        confidence: 80, // High confidence for legal description match
        method: 'legal_description',
        source: 'Iowa Parcel Database'
      };
    }

    // Try broader search - just township and range
    const broadQuery = `
      SELECT 
        ST_Y(ST_Centroid(ST_Union(geom))) as latitude,
        ST_X(ST_Centroid(ST_Union(geom))) as longitude,
        COUNT(*) as parcel_count
      FROM parcels
      WHERE county_name ILIKE $1
        AND geom IS NOT NULL
        AND state_parcel_id ILIKE $2
      GROUP BY county_name
      LIMIT 1
    `;

    const broadResult = await pool.query(broadQuery, [county, `%T${t}%R${r}%`]);

    if (broadResult.rows.length > 0 && broadResult.rows[0].latitude) {
      console.log(`   ⚠️  Broad match on T${t} R${r} (no section match)`);
      return {
        latitude: parseFloat(broadResult.rows[0].latitude),
        longitude: parseFloat(broadResult.rows[0].longitude),
        confidence: 60, // Medium confidence - only township/range
        method: 'legal_description',
        source: 'Iowa Parcel Database (broad match)'
      };
    }

    console.log(`   ❌ No parcel match found`);
    return null;

  } catch (error) {
    console.error('TRS geocoding error:', error);
    return null;
  }
}

/**
 * Geocode using legal description - full pipeline
 */
export async function geocodeLegalDescription(
  components: LegalDescriptionComponents,
  pool: Pool
): Promise<GeocodingResult | null> {
  try {
    console.log(`   📋 Geocoding legal description: ${components.raw}`);
    
    // Try to geocode from TRS
    const result = await geocodeFromTRS(
      components.township,
      components.range,
      components.section,
      components.county,
      pool
    );

    if (result) {
      return result;
    }

    // Fallback to county centroid
    console.log(`   ⚠️  Legal description geocoding failed, using county centroid`);
    const centroid = await getCountyCentroid(components.county);
    
    if (centroid) {
      return {
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        confidence: 50, // Low confidence for county centroid
        method: 'county_centroid',
        source: 'Iowa County Centroids'
      };
    }

    return null;
  } catch (error) {
    console.error('Legal description geocoding error:', error);
    return null;
  }
}

/**
 * Geocode a street address using OpenStreetMap (free)
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    console.log(`   📍 Geocoding address: ${address}`);
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
        countrycodes: 'us'
      })}`,
      {
        headers: {
          'User-Agent': 'FarmScope-AI-Agricultural-Valuation/1.0'
        }
      }
    );

    const data = await response.json();

    if (data && data.length > 0) {
      console.log(`   ✅ Address geocoded successfully`);
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        confidence: 90, // High confidence for address match
        method: 'address',
        source: 'OpenStreetMap'
      };
    }

    console.log(`   ❌ Address not found`);
    return null;
  } catch (error) {
    console.error('Address geocoding error:', error);
    return null;
  }
}

/**
 * Geocode with Mapbox (if API key available)
 */
export async function geocodeWithMapbox(address: string): Promise<GeocodingResult | null> {
  const apiKey = process.env.MAPBOX_API_KEY || process.env.VITE_MAPBOX_PUBLIC_KEY;
  
  if (!apiKey) {
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
      console.log(`   ✅ Geocoded with Mapbox`);
      return {
        latitude: lat,
        longitude: lng,
        confidence: 95, // Very high confidence for Mapbox
        method: 'mapbox',
        source: 'Mapbox'
      };
    }

    return null;
  } catch (error) {
    console.error('Mapbox geocoding error:', error);
    return null;
  }
}

/**
 * Main geocoding function with cascade strategy
 * Tries multiple methods in order of reliability
 */
export async function geocodeWithCascade(
  address: string | null,
  legalDescription: string | null,
  county: string | null,
  state: string = 'Iowa',
  pool: Pool
): Promise<GeocodingResult | null> {
  console.log(`\n🌍 Starting cascade geocoding...`);

  // Strategy 1: Try Mapbox for addresses (best accuracy)
  if (address) {
    const mapboxResult = await geocodeWithMapbox(address);
    if (mapboxResult) return mapboxResult;
  }

  // Strategy 2: Try OpenStreetMap for addresses
  if (address) {
    const osmResult = await geocodeAddress(address);
    if (osmResult) return osmResult;
  }

  // Strategy 3: Try legal description if available
  if (legalDescription && county) {
    const components = await parseLegalDescription(legalDescription, county, state);
    if (components) {
      const legalResult = await geocodeLegalDescription(components, pool);
      if (legalResult) return legalResult;
    }
  }

  // Strategy 4: Fallback to county centroid
  if (county) {
    console.log(`   ⚠️  All methods failed, using county centroid fallback`);
    const centroid = await getCountyCentroid(county);
    if (centroid) {
      return {
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        confidence: 50,
        method: 'county_centroid',
        source: 'Iowa County Centroids'
      };
    }
  }

  console.log(`   ❌ All geocoding methods failed`);
  return null;
}

export class LegalDescriptionGeocoderService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Parse legal description using AI
   */
  async parseLegalDescription(text: string, county?: string, state: string = 'Iowa'): Promise<LegalDescriptionComponents | null> {
    return parseLegalDescription(text, county, state);
  }

  /**
   * Convert legal description components to coordinates
   */
  async geocodeLegalDescription(components: LegalDescriptionComponents): Promise<GeocodingResult | null> {
    return geocodeLegalDescription(components, this.pool);
  }

  /**
   * Geocode from Township/Range/Section
   */
  async geocodeFromTRS(
    township: string,
    range: string,
    section: string | number,
    county: string
  ): Promise<GeocodingResult | null> {
    return geocodeFromTRS(township, range, section, county, this.pool);
  }

  /**
   * Geocode an address
   */
  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    return geocodeAddress(address);
  }

  /**
   * Full cascade geocoding
   */
  async geocodeWithCascade(
    address: string | null,
    legalDescription: string | null,
    county: string | null,
    state: string = 'Iowa'
  ): Promise<GeocodingResult | null> {
    return geocodeWithCascade(address, legalDescription, county, state, this.pool);
  }
}

