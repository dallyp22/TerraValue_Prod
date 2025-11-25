import axios from 'axios';

export interface PLSSData {
  township: number;
  townshipDirection: 'N' | 'S';
  range: number;
  rangeDirection: 'E' | 'W';
  section: number;
  state: string;
}

export interface PLSSResult {
  geometry: any; // GeoJSON geometry
  plssid: string;
  confidence: number;
}

// Cache for PLSS queries to avoid repeated API calls
const plssCache = new Map<string, PLSSResult>();

export class BLMPlssService {
  private readonly BLM_API_URL = 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/2/query';

  /**
   * Query BLM PLSS API to convert Township/Range/Section to geometry
   */
  async queryPLSS(plss: PLSSData): Promise<PLSSResult | null> {
    try {
      const cacheKey = `${plss.state}-T${plss.township}${plss.townshipDirection}-R${plss.range}${plss.rangeDirection}-S${plss.section}`;
      
      // Check cache first
      if (plssCache.has(cacheKey)) {
        console.log(`✅ PLSS cache hit: ${cacheKey}`);
        return plssCache.get(cacheKey)!;
      }

      console.log(`🔍 Querying BLM PLSS API: ${cacheKey}`);

      // Build PLSS ID pattern for query
      // Format: STATE + Township + Range + Section
      const stateCode = this.getStateCode(plss.state);
      const plssPattern = `${stateCode}%${plss.township}%${plss.range}%${this.pad(plss.section, 2)}%`;

      const params = {
        where: `PLSSID LIKE '${plssPattern}'`,
        outFields: 'PLSSID',
        returnGeometry: 'true',
        f: 'geojson'
      };

      const response = await axios.get(this.BLM_API_URL, { 
        params,
        timeout: 10000 
      });

      if (response.data && response.data.features && response.data.features.length > 0) {
        const feature = response.data.features[0];
        const result: PLSSResult = {
          geometry: feature.geometry,
          plssid: feature.properties.PLSSID,
          confidence: 95 // High confidence for BLM data
        };

        // Cache the result
        plssCache.set(cacheKey, result);
        
        console.log(`✅ BLM PLSS found: ${result.plssid}`);
        return result;
      }

      console.log(`⚠️  No PLSS geometry found for ${cacheKey}`);
      return null;

    } catch (error) {
      console.error('Error querying BLM PLSS API:', error);
      return null;
    }
  }

  /**
   * Get state code for PLSS query
   */
  private getStateCode(state: string): string {
    const stateCodes: Record<string, string> = {
      'Iowa': 'IA',
      'Illinois': 'IL',
      'Nebraska': 'NE',
      'Minnesota': 'MN',
      'Missouri': 'MO',
      'Kansas': 'KS',
      'South Dakota': 'SD',
      'North Dakota': 'ND',
      'Wisconsin': 'WI'
    };

    return stateCodes[state] || state.substring(0, 2).toUpperCase();
  }

  /**
   * Pad number with leading zeros
   */
  private pad(num: number, size: number): string {
    let s = num.toString();
    while (s.length < size) s = '0' + s;
    return s;
  }
}

export const blmPlssService = new BLMPlssService();

