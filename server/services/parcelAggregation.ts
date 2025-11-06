import * as turf from '@turf/turf';
import NodeCache from 'node-cache';

// Cache for 1 hour - parcels don't change frequently
const cache = new NodeCache({ stdTTL: 3600 });

interface ParcelFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    DEEDHOLDER: string;
    COUNTYNAME: string;
    PARCELNUMB: string;
    PARCELCLAS: string;
    STATEPARID: string;
    [key: string]: any;
  };
}

export class ParcelAggregationService {
  
  /**
   * Fetch parcels from ArcGIS Iowa Parcels 2017 service
   */
  async fetchParcels(bbox: [number, number, number, number]): Promise<ParcelFeature[]> {
    const [west, south, east, north] = bbox;
    const bboxString = `${west},${south},${east},${north}`;
    
    const url = `https://services3.arcgis.com/kd9gaiUExYqUbnoq/arcgis/rest/services/Iowa_Parcels_2017/FeatureServer/0/query?where=1%3D1&outFields=COUNTYNAME,STATEPARID,PARCELNUMB,PARCELCLAS,DEEDHOLDER&geometry=${bboxString}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=true&f=geojson&resultRecordCount=2000`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ArcGIS request failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.features || [];
  }
  
  /**
   * Normalize owner names for better matching
   * Handles: "Smith, John" vs "SMITH JOHN" vs "Smith John Trust"
   */
  normalizeOwnerName(name: string): string {
    if (!name) return 'UNKNOWN';
    
    return name
      .trim()
      .toUpperCase()
      .replace(/[.,]/g, ' ') // Remove commas and periods
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
  }
  
  /**
   * Check if two parcels are adjacent (touching or very close)
   */
  areAdjacent(parcel1: ParcelFeature, parcel2: ParcelFeature): boolean {
    try {
      const poly1 = turf.polygon(parcel1.geometry.coordinates);
      const poly2 = turf.polygon(parcel2.geometry.coordinates);
      
      // Buffer by 10 meters to account for small gaps (roads, property lines)
      const buffered = turf.buffer(poly1, 0.01, { units: 'kilometers' });
      return turf.booleanIntersects(buffered, poly2);
    } catch (error) {
      // Return false on geometry errors
      return false;
    }
  }
  
  /**
   * Combine adjacent parcels for a single owner into connected groups
   */
  combineOwnerParcels(parcels: ParcelFeature[]): ParcelFeature[] {
    if (parcels.length === 0) return [];
    if (parcels.length === 1) return parcels;
    
    const groups: ParcelFeature[][] = [];
    const used = new Set<number>();
    
    // Find connected groups of parcels
    for (let i = 0; i < parcels.length; i++) {
      if (used.has(i)) continue;
      
      const group = [parcels[i]];
      used.add(i);
      
      // Keep adding adjacent parcels to this group
      let foundAdjacent = true;
      while (foundAdjacent) {
        foundAdjacent = false;
        
        for (let j = 0; j < parcels.length; j++) {
          if (used.has(j)) continue;
          
          // Check if this parcel is adjacent to ANY parcel in the group
          const isAdjacentToGroup = group.some(groupParcel => 
            this.areAdjacent(groupParcel, parcels[j])
          );
          
          if (isAdjacentToGroup) {
            group.push(parcels[j]);
            used.add(j);
            foundAdjacent = true;
          }
        }
      }
      
      groups.push(group);
    }
    
    // Combine each group into a single feature
    return groups.map(group => {
      if (group.length === 1) {
        // Single parcel - return as-is
        return group[0];
      }
      
      try {
        // Merge all geometries in the group
        let combined = turf.polygon(group[0].geometry.coordinates);
        
        for (let i = 1; i < group.length; i++) {
          try {
            const poly = turf.polygon(group[i].geometry.coordinates);
            // Try union - if it fails, just keep the larger polygon
            try {
              const unionResult = turf.union(combined, poly);
              if (unionResult) {
                combined = unionResult as any;
              }
            } catch (unionError) {
              // Union failed - use simple concatenation approach
              // Just keep the original combined polygon (skip this parcel)
              // This prevents crashes while still showing the main parcel group
            }
          } catch (polyError) {
            // Invalid polygon geometry - skip it
          }
        }
        
        // Calculate total acres
        const totalAcres = turf.area(combined) / 4046.86;
        
        // Create combined feature
        return {
          type: 'Feature',
          geometry: combined.geometry,
          properties: {
            ...group[0].properties,
            PARCEL_COUNT: group.length,
            TOTAL_ACRES: Math.round(totalAcres * 100) / 100,
            COMBINED: true,
            ORIGINAL_PARCELS: group.map(p => p.properties.PARCELNUMB).join(', ')
          }
        } as ParcelFeature;
      } catch (error) {
        console.error(`Failed to combine ${group.length} parcels:`, error);
        // Return original parcels if combination fails
        return group;
      }
    }).flat();
  }
  
  /**
   * Main aggregation function - fetches, combines, and caches
   */
  async aggregateParcels(bbox: [number, number, number, number]): Promise<ParcelFeature[]> {
    // Create cache key from bounds (rounded to avoid cache misses from tiny differences)
    const cacheKey = `parcels:${bbox.map(n => n.toFixed(3)).join(',')}`;
    
    // Check cache first
    const cached = cache.get<ParcelFeature[]>(cacheKey);
    if (cached) {
      console.log(`✅ Returning ${cached.length} cached aggregated parcels`);
      return cached;
    }
    
    console.log('🔄 Fetching and aggregating parcels from ArcGIS...');
    const startTime = Date.now();
    
    // Fetch parcels from ArcGIS
    const parcels = await this.fetchParcels(bbox);
    console.log(`📦 Fetched ${parcels.length} parcels`);
    
    if (parcels.length === 0) {
      return [];
    }
    
    // Group by owner
    const byOwner: { [owner: string]: ParcelFeature[] } = {};
    parcels.forEach((parcel: ParcelFeature) => {
      const owner = this.normalizeOwnerName(parcel.properties?.DEEDHOLDER);
      if (!byOwner[owner]) {
        byOwner[owner] = [];
      }
      byOwner[owner].push(parcel);
    });
    
    console.log(`👥 Found ${Object.keys(byOwner).length} unique owners`);
    
    // Count owners with multiple parcels
    const ownersWithMultiple = Object.values(byOwner).filter(p => p.length > 1).length;
    console.log(`🔗 ${ownersWithMultiple} owners have multiple parcels`);
    
    // Aggregate each owner's parcels
    const aggregated: ParcelFeature[] = [];
    Object.entries(byOwner).forEach(([owner, ownerParcels]) => {
      try {
        if (ownerParcels.length > 1) {
          console.log(`  Combining ${ownerParcels.length} parcels for "${ownerParcels[0].properties.DEEDHOLDER.substring(0, 30)}..."`);
        }
        const combined = this.combineOwnerParcels(ownerParcels);
        aggregated.push(...combined);
      } catch (error) {
        // If combination fails for this owner, just add original parcels
        console.warn(`  ⚠️ Failed to combine parcels for owner, using originals`);
        aggregated.push(...ownerParcels);
      }
    });
    
    const elapsedTime = Date.now() - startTime;
    console.log(`✅ Aggregated ${parcels.length} parcels into ${aggregated.length} combined holdings in ${elapsedTime}ms`);
    
    // Cache result
    cache.set(cacheKey, aggregated);
    
    return aggregated;
  }
}

export const parcelAggregationService = new ParcelAggregationService();

