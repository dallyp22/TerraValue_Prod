import { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as turf from '@turf/turf';
import { useToast } from '@/hooks/use-toast';
import { AuctionDetailsPanel } from './AuctionDetailsPanel';
import { SubstationInfoPanel } from './SubstationInfoPanel';
import { DataCenterInfoPanel } from './DataCenterInfoPanel';
import { LakeInfoPanel } from './LakeInfoPanel';
import type { Auction } from '@shared/schema';

interface EnhancedMapProps {
  drawModeEnabled: boolean;
  onParcelClick: (parcel: any) => void;
  onPolygonDrawn: (polygon: any) => void;
  onAuctionClick?: (auction: Auction) => void;
  onStartAuctionValuation?: (auction: Auction) => void;
  drawnPolygonData?: any;
  onMapReady?: (map: maplibregl.Map) => void;
  showOwnerLabels?: boolean;
  showOwnershipHeatmap?: boolean;
  clearDrawnPolygons?: boolean;
  onClearComplete?: () => void;
  showAuctionLayer?: boolean;
  auctionFilters?: any;
  showSubstations?: boolean;
  showDatacenters?: boolean;
  showLakes?: boolean;
  lakeTypes?: {
    lakes: boolean;
    reservoirs: boolean;
  };
  showPowerLines?: boolean;
  powerLineVoltages?: {
    kv345: boolean;
    kv161: boolean;
    kv138: boolean;
    kv115: boolean;
    kv69: boolean;
  };
  showCityLabels?: boolean;
  showHighways?: boolean;
}

export default function EnhancedMap({ 
  drawModeEnabled, 
  onParcelClick, 
  onPolygonDrawn,
  onAuctionClick,
  onStartAuctionValuation,
  drawnPolygonData,
  onMapReady,
  showOwnerLabels = false,
  showOwnershipHeatmap = false,
  clearDrawnPolygons = false,
  onClearComplete,
  showAuctionLayer = true,
  auctionFilters,
  showSubstations = true,
  showDatacenters = true,
  showLakes = true,
  lakeTypes = { lakes: true, reservoirs: true },
  showPowerLines = true,
  powerLineVoltages = { kv345: true, kv161: true, kv138: true, kv115: true, kv69: true },
  showCityLabels = true,
  showHighways = true
}: EnhancedMapProps) {

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const drawModeEnabledRef = useRef(drawModeEnabled);
  const featureClickedRef = useRef<boolean>(false); // Track if any feature (auction, substation, datacenter, lake) was just clicked
  
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [selectedSubstation, setSelectedSubstation] = useState<any>(null);
  const [selectedDatacenter, setSelectedDatacenter] = useState<any>(null);
  const [selectedLake, setSelectedLake] = useState<any>(null);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const auctionsRef = useRef<Auction[]>([]);

  const { toast } = useToast();
  
  // Keep auctions ref in sync with state
  useEffect(() => {
    auctionsRef.current = auctions;
  }, [auctions]);

  // Update the ref whenever drawModeEnabled changes
  useEffect(() => {
    drawModeEnabledRef.current = drawModeEnabled;
  }, [drawModeEnabled]);

  // Function to update label visibility based on current location
  const updateLabelVisibility = () => {
    if (!map.current) return;

    const inHarrisonCounty = isInHarrisonCounty();
    
    // Handle regular parcel labels (only show outside Harrison County)
    const regularLayer = map.current.getLayer('parcels-labels');
    if (regularLayer) {
      const shouldShowRegular = showOwnerLabels && !inHarrisonCounty;
      map.current.setLayoutProperty('parcels-labels', 'visibility', shouldShowRegular ? 'visible' : 'none');
    }

    // Handle Harrison County parcel labels (only show inside Harrison County)
    const harrisonLayer = map.current.getLayer('harrison-parcels-labels');
    if (harrisonLayer) {
      const shouldShowHarrison = showOwnerLabels && inHarrisonCounty;
      map.current.setLayoutProperty('harrison-parcels-labels', 'visibility', shouldShowHarrison ? 'visible' : 'none');
    }
  };

  // Aggregate parcels by owner - combine adjacent parcels with same owner
  const aggregateParcelsByOwner = (features: any[]): any[] => {
    if (!features || features.length === 0) return [];
    
    try {
      // Group parcels by owner (DEEDHOLDER)
      const parcelsByOwner: { [owner: string]: any[] } = {};
      
      features.forEach(feature => {
        const owner = feature.properties?.DEEDHOLDER || 'Unknown Owner';
        // Normalize owner name for better matching
        const normalizedOwner = owner.trim().toUpperCase();
        
        if (!parcelsByOwner[normalizedOwner]) {
          parcelsByOwner[normalizedOwner] = [];
        }
        parcelsByOwner[normalizedOwner].push(feature);
      });
      
      const aggregatedFeatures: any[] = [];
      
      // For each owner, try to combine adjacent parcels
      Object.entries(parcelsByOwner).forEach(([owner, parcels]) => {
        if (parcels.length === 1) {
          // Single parcel - just add it
          aggregatedFeatures.push(parcels[0]);
        } else {
          // Multiple parcels - try to combine adjacent ones
          const combined = combineAdjacentParcels(parcels);
          aggregatedFeatures.push(...combined);
        }
      });
      
      return aggregatedFeatures;
    } catch (error) {
      console.error('Error aggregating parcels:', error);
      return features; // Return original if aggregation fails
    }
  };

  // Combine adjacent parcels using Turf.js
  const combineAdjacentParcels = (parcels: any[]): any[] => {
    if (parcels.length === 0) return [];
    if (parcels.length === 1) return parcels;
    
    try {
      // Convert all to turf polygons
      const turfParcels = parcels.map(p => ({
        feature: p,
        polygon: turf.polygon(p.geometry.coordinates)
      }));
      
      const combined: any[] = [];
      const used = new Set<number>();
      
      // For each parcel, find and merge with adjacent parcels
      for (let i = 0; i < turfParcels.length; i++) {
        if (used.has(i)) continue;
        
        let mergedPolygon = turfParcels[i].polygon;
        const mergedIndices = [i];
        used.add(i);
        
        // Find adjacent parcels
        let foundAdjacent = true;
        while (foundAdjacent) {
          foundAdjacent = false;
          
          for (let j = 0; j < turfParcels.length; j++) {
            if (used.has(j)) continue;
            
            // Check if adjacent (touching or very close)
            try {
              const buffered = turf.buffer(mergedPolygon, 0.001, { units: 'kilometers' }); // 1 meter buffer
              const intersects = turf.booleanIntersects(buffered, turfParcels[j].polygon);
              
              if (intersects) {
                // Merge this parcel
                mergedPolygon = turf.union(mergedPolygon, turfParcels[j].polygon);
                mergedIndices.push(j);
                used.add(j);
                foundAdjacent = true;
              }
            } catch (e) {
              // Skip on error (complex geometries)
            }
          }
        }
        
        // Create combined feature with total acreage
        const totalAcres = mergedIndices.reduce((sum, idx) => {
          const geom = turfParcels[idx].polygon;
          const area = turf.area(geom) / 4046.86; // Convert to acres
          return sum + area;
        }, 0);
        
        const combinedFeature = {
          type: 'Feature',
          properties: {
            ...turfParcels[i].feature.properties,
            PARCEL_COUNT: mergedIndices.length,
            TOTAL_ACRES: Math.round(totalAcres * 100) / 100,
            COMBINED: mergedIndices.length > 1
          },
          geometry: mergedPolygon.geometry
        };
        
        combined.push(combinedFeature);
      }
      
      return combined;
    } catch (error) {
      console.error('Error combining parcels:', error);
      return parcels; // Return original if combination fails
    }
  };

  // Function to determine if current view is in Harrison County, Iowa
  const isInHarrisonCounty = () => {
    if (!map.current) return false;
    const center = map.current.getCenter();
    // Harrison County, Iowa bounds (more precise)
    // Woodbine, Iowa coordinates: -95.7159, 41.7407
    const harrisonBounds = {
      west: -96.137,
      east: -95.498,
      south: 41.506,
      north: 41.866
    };
    
    // Removed debugging logs as system is now operational
    
    return center.lng >= harrisonBounds.west && 
           center.lng <= harrisonBounds.east && 
           center.lat >= harrisonBounds.south && 
           center.lat <= harrisonBounds.north;
  };

  // Function to load auctions within current map bounds
  const loadAuctions = async () => {
    if (!map.current || !showAuctionLayer) {
      // Clear auction markers if layer is disabled
      const source = map.current?.getSource('auctions') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }
    
    const bounds = map.current.getBounds();
    const params = new URLSearchParams({
      minLat: bounds.getSouth().toString(),
      maxLat: bounds.getNorth().toString(),
      minLon: bounds.getWest().toString(),
      maxLon: bounds.getEast().toString()
    });
    
    // Add filter params if provided
    if (auctionFilters) {
      if (auctionFilters.minAcreage) params.append('minAcreage', auctionFilters.minAcreage.toString());
      if (auctionFilters.maxAcreage) params.append('maxAcreage', auctionFilters.maxAcreage.toString());
      if (auctionFilters.minCSR2) params.append('minCSR2', auctionFilters.minCSR2.toString());
      if (auctionFilters.maxCSR2) params.append('maxCSR2', auctionFilters.maxCSR2.toString());
      if (auctionFilters.auctionDateRange && auctionFilters.auctionDateRange !== 'all') {
        params.append('auctionDateRange', auctionFilters.auctionDateRange);
      }
      if (auctionFilters.propertyTypes?.length > 0) {
        auctionFilters.propertyTypes.forEach((type: string) => params.append('landTypes[]', type));
      }
      if (auctionFilters.counties?.length > 0) {
        auctionFilters.counties.forEach((county: string) => params.append('counties[]', county));
      }
      if (auctionFilters.minValue) params.append('minValue', auctionFilters.minValue.toString());
      if (auctionFilters.maxValue) params.append('maxValue', auctionFilters.maxValue.toString());
    }
    
    try {
      const response = await fetch(`https://web-production-51e54.up.railway.app/api/auctions?${params}`);
      const data = await response.json();
      
      if (data.success && data.auctions) {
        setAuctions(data.auctions);
        
        // Convert auctions to GeoJSON features with color-coding based on urgency
        const features = data.auctions
          .filter((a: Auction) => a.latitude && a.longitude)
          .map((auction: Auction) => {
            // Determine marker color based on days until auction
            let markerColor = '#10b981'; // green default (> 30 days)
            if (auction.auctionDate) {
              const daysUntil = Math.floor((new Date(auction.auctionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              if (daysUntil <= 7) {
                markerColor = '#ef4444'; // red (< 7 days)
              } else if (daysUntil <= 30) {
                markerColor = '#f59e0b'; // orange (7-30 days)
              }
            }
            
            // Check if this is a county-level location (approximate)
            const isCountyLevel = auction.rawData?.isCountyLevel || false;
            
            return {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [auction.longitude, auction.latitude]
              },
              properties: {
                id: auction.id,
                title: auction.title,
                acreage: auction.acreage,
                county: auction.county,
                state: auction.state,
                markerColor,
                isCountyLevel // Add flag for county-level locations
              }
            };
          });
        
        const source = map.current?.getSource('auctions') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'FeatureCollection',
            features
          });
        }
      }
    } catch (error) {
      console.error('Failed to load auctions:', error);
    }
  };

  // Function to load parcels based on current map bounds
  const loadParcels = async () => {
    if (!map.current || map.current.getZoom() <= 12) {
      // Clear data if zoomed out
      const source = map.current?.getSource('parcels') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      // Also clear Harrison County tileset if it exists
      const harrisonSource = map.current?.getSource('harrison-parcels');
      if (harrisonSource && map.current) {
        map.current.setLayoutProperty('harrison-parcels-fill', 'visibility', 'none');
        map.current.setLayoutProperty('harrison-parcels-outline', 'visibility', 'none');
        map.current.setLayoutProperty('harrison-parcels-labels', 'visibility', 'none');
        map.current.setLayoutProperty('harrison-parcels-selected', 'visibility', 'none');
        // Clear selection when leaving Harrison County
        map.current.setFilter('harrison-parcels-selected', ['==', ['get', 'parcelnumb'], '']);
      }
      return;
    }

    const bounds = map.current.getBounds();
    
    // Check if we're in Harrison County and should use the custom tileset
    if (isInHarrisonCounty()) {
      // Show Harrison County layers if they exist
      const harrisonSource = map.current.getSource('harrison-parcels');
      if (harrisonSource) {
        map.current.setLayoutProperty('harrison-parcels-fill', 'visibility', 'visible');
        map.current.setLayoutProperty('harrison-parcels-outline', 'visibility', 'visible');
        map.current.setLayoutProperty('harrison-parcels-labels', 'visibility', showOwnerLabels ? 'visible' : 'none');
        // Hide regular parcel labels when in Harrison County
        const regularLayer = map.current.getLayer('parcels-labels');
        if (regularLayer) {
          map.current.setLayoutProperty('parcels-labels', 'visibility', 'none');
        }
        map.current.setLayoutProperty('harrison-parcels-selected', 'visibility', 'visible');
        
        // Clear the default parcel source to avoid overlap
        const defaultSource = map.current.getSource('parcels') as maplibregl.GeoJSONSource;
        if (defaultSource) {
          defaultSource.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }
    } else {
      // Hide Harrison County layers when outside the county
      const harrisonSource = map.current?.getSource('harrison-parcels');
      if (harrisonSource && map.current) {
        map.current.setLayoutProperty('harrison-parcels-fill', 'visibility', 'none');
        map.current.setLayoutProperty('harrison-parcels-outline', 'visibility', 'none');
        map.current.setLayoutProperty('harrison-parcels-labels', 'visibility', 'none');
        map.current.setLayoutProperty('harrison-parcels-selected', 'visibility', 'none');
        // Re-enable regular parcel labels when outside Harrison County
        const regularLayer = map.current.getLayer('parcels-labels');
        if (regularLayer) {
          map.current.setLayoutProperty('parcels-labels', 'visibility', showOwnerLabels ? 'visible' : 'none');
        }
      }
    }

    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',');
    
    // Use the working Iowa Parcels 2017 service with all available fields for non-Harrison counties
    const url = `https://services3.arcgis.com/kd9gaiUExYqUbnoq/arcgis/rest/services/Iowa_Parcels_2017/FeatureServer/0/query?where=1%3D1&outFields=COUNTYNAME,STATEPARID,PARCELNUMB,PARCELCLAS,DEEDHOLDER&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=true&f=geojson&resultRecordCount=2000`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Parcel data received:', data.features?.length || 0, 'features');
      
      if (data.features && data.features.length > 0) {
        // AGGREGATE PARCELS BY OWNER (like Harrison County)
        console.log('🔄 Aggregating parcels by owner...');
        const aggregatedFeatures = aggregateParcelsByOwner(data.features);
        console.log(`✅ Aggregated ${data.features.length} parcels into ${aggregatedFeatures.length} combined holdings`);
        
        const source = map.current?.getSource('parcels') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'FeatureCollection',
            features: aggregatedFeatures
          });
          console.log(`Loaded ${aggregatedFeatures.length} aggregated parcels`);
        }
      } else if (data.properties?.exceededTransferLimit) {
        // Too many features - zoom in more
        console.warn('Transfer limit exceeded; zoom in for details.');
        const source = map.current?.getSource('parcels') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData({ type: 'FeatureCollection', features: [] });
        }
        toast({
          title: "Too Many Parcels",
          description: "Zoom in further to view property boundaries",
          variant: "default"
        });
      } else {
        // Handle empty results
        console.warn('No parcels found in current view');
        const source = map.current?.getSource('parcels') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    } catch (error) {
      console.error('Error loading parcels:', error);
      // Clear parcels on error
      const source = map.current?.getSource('parcels') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      // Initialize map with satellite imagery and state borders
      map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: `https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf?access_token=${import.meta.env.VITE_MAPBOX_PUBLIC_KEY || ''}`,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '© Esri'
          },
          'osm': {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          },
          'harrison-parcels': {
            type: 'vector',
            tiles: [
              `https://a.tiles.mapbox.com/v4/dpolivka22.3l1693dn/{z}/{x}/{y}.vector.pbf?access_token=${import.meta.env.VITE_MAPBOX_PUBLIC_KEY || ''}`,
              `https://b.tiles.mapbox.com/v4/dpolivka22.3l1693dn/{z}/{x}/{y}.vector.pbf?access_token=${import.meta.env.VITE_MAPBOX_PUBLIC_KEY || ''}`
            ],
            minzoom: 0,
            maxzoom: 16
          },
          'state-borders': {
            type: 'vector',
            tiles: [
              `https://a.tiles.mapbox.com/v4/dpolivka22.2i1mucgl/{z}/{x}/{y}.vector.pbf?access_token=${import.meta.env.VITE_MAPBOX_PUBLIC_KEY || ''}`,
              `https://b.tiles.mapbox.com/v4/dpolivka22.2i1mucgl/{z}/{x}/{y}.vector.pbf?access_token=${import.meta.env.VITE_MAPBOX_PUBLIC_KEY || ''}`
            ],
            minzoom: 0,
            maxzoom: 16
          },
          'mapbox-streets': {
            type: 'vector',
            url: `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json?secure&access_token=${import.meta.env.VITE_MAPBOX_PUBLIC_KEY || ''}`
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
            layout: {
              visibility: 'none'
            }
          },
          {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19
          },
          {
            id: 'state-borders-fill',
            type: 'fill',
            source: 'state-borders',
            'source-layer': 'us-states-2btm85',
            paint: {
              'fill-color': 'transparent'
            }
          },
          {
            id: 'state-borders-line',
            type: 'line',
            source: 'state-borders',
            'source-layer': 'us-states-2btm85',
            paint: {
              'line-color': '#ffffff',
              'line-width': 2.5,
              'line-opacity': 0.8
            }
          },
          // City and town labels
          {
            id: 'place-labels-city',
            type: 'symbol',
            source: 'mapbox-streets',
            'source-layer': 'place_label',
            filter: ['in', 'type', 'city', 'town'],
            layout: {
              'text-field': ['get', 'name_en'],
              'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
              'text-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                8, 12,
                12, 18,
                16, 24
              ],
              'text-anchor': 'center',
              'text-offset': [0, 0.5],
              'text-max-width': 8
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 2,
              'text-halo-blur': 1
            }
          },
          // Village labels (smaller)
          {
            id: 'place-labels-village',
            type: 'symbol',
            source: 'mapbox-streets',
            'source-layer': 'place_label',
            filter: ['==', 'type', 'village'],
            minzoom: 10,
            layout: {
              'text-field': ['get', 'name_en'],
              'text-font': ['DIN Offc Pro Regular', 'Arial Unicode MS Regular'],
              'text-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 10,
                14, 14,
                16, 16
              ],
              'text-anchor': 'center',
              'text-offset': [0, 0.5]
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1.5,
              'text-halo-blur': 1
            }
          },
          // All highways and major roads (single color, simple)
          {
            id: 'road-all-highways',
            type: 'line',
            source: 'mapbox-streets',
            'source-layer': 'road',
            filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#fbbf24', // Yellow/gold
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                6, 1.5,
                10, 3,
                14, 5,
                18, 8
              ],
              'line-opacity': 0.85
            }
          },
        ]
      },
      center: [-93.5, 42.0], // Iowa center
      zoom: 8,
      attributionControl: false
    });

      // Add navigation controls
      map.current.addControl(new maplibregl.NavigationControl(), 'top-left');
      map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    // Initialize MapboxDraw
    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: drawModeEnabled,
        trash: drawModeEnabled
      },
      styles: [
        {
          'id': 'gl-draw-polygon-fill-inactive',
          'type': 'fill',
          'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          'paint': {
            'fill-color': '#3BB2D0',
            'fill-outline-color': '#3BB2D0',
            'fill-opacity': 0.1
          }
        },
        {
          'id': 'gl-draw-polygon-fill-active',
          'type': 'fill',
          'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          'paint': {
            'fill-color': '#fbb03b',
            'fill-outline-color': '#fbb03b',
            'fill-opacity': 0.1
          }
        },
        {
          'id': 'gl-draw-polygon-stroke-inactive',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          'layout': {
            'line-cap': 'round',
            'line-join': 'round'
          },
          'paint': {
            'line-color': '#3BB2D0',
            'line-width': 2
          }
        },
        {
          'id': 'gl-draw-polygon-stroke-active',
          'type': 'line',
          'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          'layout': {
            'line-cap': 'round',
            'line-join': 'round'
          },
          'paint': {
            'line-color': '#fbb03b',
            'line-width': 2
          }
        },
        {
          'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
          'type': 'circle',
          'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          'paint': {
            'circle-radius': 5,
            'circle-color': '#fff'
          }
        },
        {
          'id': 'gl-draw-polygon-and-line-vertex-inactive',
          'type': 'circle',
          'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          'paint': {
            'circle-radius': 3,
            'circle-color': '#fbb03b'
          }
        }
      ]
    });
    map.current.addControl(draw.current as any);

    // Load parcel data when map is ready
    map.current.on('load', () => {
      // Call onMapReady callback with map instance
      if (onMapReady) {
        onMapReady(map.current!);
      }
      
      // Add parcel data source if it doesn't exist
      if (!map.current!.getSource('parcels')) {
        map.current!.addSource('parcels', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });
      }

      // Add parcel outline layer if it doesn't exist
      if (!map.current!.getLayer('parcels-outline')) {
        map.current!.addLayer({
          id: 'parcels-outline',
          type: 'line',
          source: 'parcels',
          paint: {
            'line-color': '#10b981',
            'line-width': 2,
            'line-opacity': 0.8
          }
        });
      }

      // Add parcel fill layer if it doesn't exist
      if (!map.current!.getLayer('parcels-fill')) {
        map.current!.addLayer({
          id: 'parcels-fill',
          type: 'fill',
          source: 'parcels',
          paint: {
            'fill-color': '#10b981',
            'fill-opacity': 0.15
          }
        });
      }

      // Add owner labels layer (only visible when zoomed in and toggle is on)
      if (!map.current!.getLayer('parcels-labels')) {
        map.current!.addLayer({
          id: 'parcels-labels',
        type: 'symbol',
        source: 'parcels',
        layout: {
          'text-field': [
            'case',
            // If combined parcels, show owner + parcel count + acres
            ['get', 'COMBINED'],
            ['concat',
              ['case',
                ['>', ['length', ['get', 'DEEDHOLDER']], 15],
                ['concat', ['slice', ['get', 'DEEDHOLDER'], 0, 15], '...'],
                ['get', 'DEEDHOLDER']
              ],
              '\n(',
              ['to-string', ['get', 'PARCEL_COUNT']],
              ' parcels, ',
              ['to-string', ['get', 'TOTAL_ACRES']],
              ' ac)'
            ],
            // Single parcel - just show owner
            [
              'case',
              ['>', ['length', ['get', 'DEEDHOLDER']], 20],
              ['concat', ['slice', ['get', 'DEEDHOLDER'], 0, 20], '...'],
              ['get', 'DEEDHOLDER']
            ]
          ],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 10,
            16, 14,
            18, 16
          ],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 2,
          'text-max-width': 12,
          'visibility': showOwnerLabels ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
          'text-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.7,
            15, 0.9,
            18, 1.0
          ]
        },
        minzoom: 13
      });
      }

      // Add Harrison County vector tile layers (initially hidden)
      map.current!.addLayer({
        id: 'harrison-parcels-fill',
        type: 'fill',
        source: 'harrison-parcels',
        'source-layer': 'TMV-79tjod',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.15
        },
        layout: {
          'visibility': 'none'
        }
      });

      map.current!.addLayer({
        id: 'harrison-parcels-outline',
        type: 'line',
        source: 'harrison-parcels',
        'source-layer': 'TMV-79tjod',
        paint: {
          'line-color': '#10b981',
          'line-width': 2,
          'line-opacity': 0.8
        },
        layout: {
          'visibility': 'none'
        }
      });

      map.current!.addLayer({
        id: 'harrison-parcels-labels',
        type: 'symbol',
        source: 'harrison-parcels',
        'source-layer': 'TMV-79tjod',
        layout: {
          'text-field': [
            'case',
            ['>', ['length', ['get', 'owner']], 20],
            ['concat', ['slice', ['get', 'owner'], 0, 20], '...'],
            ['get', 'owner']
          ],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 10,
            16, 14,
            18, 16
          ],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-padding': 2,
          'text-max-width': 12,
          'visibility': 'none'
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
          'text-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.7,
            15, 0.9,
            18, 1.0
          ]
        },
        minzoom: 13
      });

      // Add selected parcel highlight layer
      map.current!.addLayer({
        id: 'harrison-parcels-selected',
        type: 'line',
        source: 'harrison-parcels',
        'source-layer': 'TMV-79tjod',
        paint: {
          'line-color': '#ef4444',
          'line-width': 6,
          'line-opacity': 1
        },
        layout: {
          'visibility': 'visible'
        },
        filter: ['==', ['get', 'parcelnumb'], '']
      });

      // Function to handle Harrison County parcel clicks
      const handleHarrisonParcelClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        // Check if a feature (auction, substation, datacenter, lake) was just clicked - if so, ignore parcel click
        if (featureClickedRef.current) {
          console.log('Ignoring parcel click - auction was clicked');
          return;
        }
        
        // Double-check by querying rendered features at click point
        const auctionFeatures = map.current?.queryRenderedFeatures(e.point, {
          layers: ['auction-markers', 'auction-markers-bg']
        });
        if (auctionFeatures && auctionFeatures.length > 0) {
          return; // Auction marker takes priority
        }
        
        if (e.features && e.features.length > 0) {
          const clickedFeature = e.features[0];
          const props = clickedFeature.properties;
          
          // Use gisacre field for acres (authentic data from tileset)
          const acres = parseFloat(props.gisacre) || 0;
          
          // Highlight the selected parcel with red border
          const parcelNumber = props.parcelnumb || props.parcelnu_1 || '';
          if (map.current && parcelNumber) {
            map.current.setFilter('harrison-parcels-selected', ['==', ['get', 'parcelnumb'], parcelNumber]);
            
            // Query ALL features with the same parcel number to get all sections
            const allFeatures = map.current.querySourceFeatures('harrison-parcels', {
              sourceLayer: 'TMV-79tjod',
              filter: ['==', ['get', 'parcelnumb'], parcelNumber]
            });
            
            // Collect all geometries from all sections
            const allGeometries = allFeatures.map(f => f.geometry).filter(g => g.type === 'Polygon');
            
            // Map Harrison County fields to expected format using actual tileset field names
            const parcel = {
              owner_name: props.owner || props.owner2 || props.owner3 || 'Unknown',
              address: props.address || props.parcelid || 'N/A', 
              acres: Math.round(acres * 100) / 100, // Round to 2 decimal places
              coordinates: [e.lngLat.lng, e.lngLat.lat],
              parcel_number: props.parcelnumb || props.parcelnu_1 || 'N/A',
              parcel_class: props.class_ || 'N/A',
              county: 'Harrison County',
              geometry: clickedFeature.geometry, // Primary geometry (clicked section)
              allGeometries: allGeometries // All polygon sections for this parcel
            };
            
            // Harrison County parcel successfully clicked
            onParcelClick(parcel);
            
            // Only show popup if not in drawing mode
            if (!drawModeEnabledRef.current) {
              const html = `
                <strong>Owner:</strong> ${parcel.owner_name}<br>
                <strong>Parcel Number:</strong> ${parcel.parcel_number}<br>
                <strong>Class:</strong> ${parcel.parcel_class}<br>
                <strong>County:</strong> Harrison County<br>
                ${allGeometries.length > 1 ? `<strong>Sections:</strong> ${allGeometries.length}<br>` : ''}
                <small><em>Updated Harrison County Data</em></small>
              `;
              new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(html)
                .addTo(map.current!);
            }
          } else {
            // Fallback if no parcel number
            const parcel = {
              owner_name: props.owner || props.owner2 || props.owner3 || 'Unknown',
              address: props.address || props.parcelid || 'N/A', 
              acres: Math.round(acres * 100) / 100, // Round to 2 decimal places
              coordinates: [e.lngLat.lng, e.lngLat.lat],
              parcel_number: props.parcelnumb || props.parcelnu_1 || 'N/A',
              parcel_class: props.class_ || 'N/A',
              county: 'Harrison County',
              geometry: clickedFeature.geometry // Include actual polygon geometry
            };
            
            onParcelClick(parcel);
            
            // Only show popup if not in drawing mode
            if (!drawModeEnabledRef.current) {
              const html = `
                <strong>Owner:</strong> ${parcel.owner_name}<br>
                <strong>Parcel Number:</strong> ${parcel.parcel_number}<br>
                <strong>Class:</strong> ${parcel.parcel_class}<br>
                <strong>County:</strong> Harrison County<br>
                <small><em>Updated Harrison County Data</em></small>
              `;
              new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(html)
                .addTo(map.current!);
            }
          }
        }
      };

      // Add click handlers for Harrison County layers
      map.current!.on('click', 'harrison-parcels-outline', handleHarrisonParcelClick);
      map.current!.on('click', 'harrison-parcels-fill', handleHarrisonParcelClick);

      // Add click handlers for regular parcels (all other counties)
      const handleRegularParcelClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          const geometry = e.features[0].geometry;
          
          // Calculate acres from geometry
          let acres = 0;
          if (geometry.type === 'Polygon' && geometry.coordinates) {
            const polygon = turf.polygon(geometry.coordinates);
            const area = turf.area(polygon);
            acres = area / 4046.86; // Convert to acres
          }
          
          // Use aggregated acres if available
          const totalAcres = props.TOTAL_ACRES || acres;
          
          const parcel = {
            owner_name: props.DEEDHOLDER || 'Unknown',
            address: props.STATEPARID || 'N/A',
            acres: Math.round(totalAcres * 100) / 100,
            coordinates: [e.lngLat.lng, e.lngLat.lat],
            parcel_number: props.PARCELNUMB || 'N/A',
            parcel_class: props.PARCELCLAS || 'N/A',
            county: props.COUNTYNAME || 'Unknown County',
            geometry: geometry,
            parcelCount: props.PARCEL_COUNT || 1, // Number of combined parcels
            isCombined: props.COMBINED || false
          };
          
          onParcelClick(parcel);
          
          // Show popup
          if (!drawModeEnabledRef.current) {
            const html = `
              <strong>Owner:</strong> ${props.DEEDHOLDER || 'Unknown'}<br>
              ${props.COMBINED ? `<strong style="color: #10b981;">Combined: ${props.PARCEL_COUNT} parcels</strong><br>` : ''}
              <strong>Total Acres:</strong> ${totalAcres.toFixed(2)}<br>
              <strong>Parcel Number:</strong> ${props.PARCELNUMB || 'N/A'}<br>
              <strong>Class:</strong> ${props.PARCELCLAS || 'N/A'}<br>
              <strong>County:</strong> ${props.COUNTYNAME || 'N/A'}<br>
              <small><em>Iowa Parcels 2017 Data${props.COMBINED ? ' (Aggregated)' : ''}</em></small>
            `;
            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map.current!);
          }
        }
      };

      map.current!.on('click', 'parcels-outline', handleRegularParcelClick);
      map.current!.on('click', 'parcels-fill', handleRegularParcelClick);

      // Add hover effects for regular parcels
      map.current!.on('mouseenter', 'parcels-outline', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      
      map.current!.on('mouseleave', 'parcels-outline', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      map.current!.on('mouseenter', 'parcels-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      
      map.current!.on('mouseleave', 'parcels-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      // Add hover effects for Harrison County layers
      map.current!.on('mouseenter', 'harrison-parcels-outline', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      
      map.current!.on('mouseleave', 'harrison-parcels-outline', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      map.current!.on('mouseenter', 'harrison-parcels-fill', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      
      map.current!.on('mouseleave', 'harrison-parcels-fill', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      // Function to handle parcel click (shared by both outline and fill)
      const handleParcelClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        // Check if a feature (auction, substation, etc.) was just clicked - if so, ignore parcel click
        if (featureClickedRef.current) {
          console.log('Ignoring parcel click - feature was clicked');
          return;
        }
        
        // Double-check by querying rendered features at click point
        const auctionFeatures = map.current?.queryRenderedFeatures(e.point, {
          layers: ['auction-markers', 'auction-markers-bg']
        });
        if (auctionFeatures && auctionFeatures.length > 0) {
          return; // Auction marker takes priority
        }
        
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          const geometry = e.features[0].geometry;
          
          // Calculate acres from geometry using Turf.js
          let acres = 0;
          if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates[0]) {
            const polygon = turf.polygon(geometry.coordinates);
            const area = turf.area(polygon);
            acres = Math.round((area / 4046.86) * 100) / 100; // Convert square meters to acres with 2 decimal precision
          }
          
          const parcel = {
            owner_name: props.DEEDHOLDER || 'Unknown',
            address: props.STATEPARID || 'N/A',
            acres: acres,
            coordinates: [e.lngLat.lng, e.lngLat.lat],
            parcel_number: props.PARCELNUMB || 'N/A',
            parcel_class: props.PARCELCLAS || 'N/A',
            county: props.COUNTYNAME || 'N/A',
            geometry: geometry // Include actual polygon geometry
          };
          
          onParcelClick(parcel);
          
          // Only show popup if not in drawing mode
          if (!drawModeEnabledRef.current) {
            const html = `
              <strong>Owner:</strong> ${props.DEEDHOLDER || 'Unknown'}<br>
              <strong>Parcel Number:</strong> ${props.PARCELNUMB || 'N/A'}<br>
              <strong>Class:</strong> ${props.PARCELCLAS || 'N/A'}<br>
              <strong>County:</strong> ${props.COUNTYNAME || 'N/A'}<br>
              <small><em>Iowa Parcels 2017 Data</em></small>
            `;
            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map.current!);
          }
        }
      };

      // Add parcel click handler for both outline and fill
      map.current!.on('click', 'parcels-outline', handleParcelClick);
      map.current!.on('click', 'parcels-fill', handleParcelClick);

      // Add hover effects for both outline and fill
      map.current!.on('mouseenter', 'parcels-outline', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      
      map.current!.on('mouseleave', 'parcels-outline', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      map.current!.on('mouseenter', 'parcels-fill', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      
      map.current!.on('mouseleave', 'parcels-fill', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      // Add auction data source
      map.current!.addSource('auctions', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Add substations/infrastructure data source
      map.current!.addSource('substations', {
        type: 'geojson',
        data: '/substations.geojson'
      });

      // Add datacenters data source
      map.current!.addSource('datacenters', {
        type: 'geojson',
        data: '/datacentersIowa.geojson'
      });

      // Add lakes data source
      map.current!.addSource('lakes', {
        type: 'geojson',
        data: '/lakes.geojson'
      });

      // Add power lines data source
      map.current!.addSource('powerlines', {
        type: 'geojson',
        data: '/powerlines.geojson'
      });

      // Add auction marker layers with color-coding
      // Background circle layer
      map.current!.addLayer({
        id: 'auction-markers-bg',
        type: 'circle',
        source: 'auctions',
        paint: {
          'circle-radius': 12,
          'circle-color': ['get', 'markerColor'],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        },
        layout: {
          'visibility': showAuctionLayer ? 'visible' : 'none'
        }
      });

      // Load and add auction icon for overlay
      const img = new Image(40, 40);
      img.onload = () => {
        if (map.current && !map.current.hasImage('auction-icon')) {
          map.current.addImage('auction-icon', img);
          
          // Add auction marker icon layer on top of circles
          map.current.addLayer({
            id: 'auction-markers',
            type: 'symbol',
            source: 'auctions',
            layout: {
              'icon-image': 'auction-icon',
              'icon-size': 0.5,
              'icon-allow-overlap': true,
              'visibility': showAuctionLayer ? 'visible' : 'none'
            },
            paint: {
              'icon-color': ['get', 'markerColor'], // Use the dynamic color from feature properties
              'icon-opacity': [
                'case',
                ['get', 'isCountyLevel'], 0.6, // 60% opacity for county-level (approximate) locations
                1.0 // 100% opacity for specific addresses
              ]
            }
          });

          // Add auction click handlers for both layers
          const handleAuctionClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            // Prevent event from bubbling to parcel layer
            e.originalEvent.stopPropagation();
            
            // Set flag to prevent parcel click handlers from firing
            featureClickedRef.current = true;
            
            // Clear the flag after a short delay
            setTimeout(() => {
              featureClickedRef.current = false;
            }, 100);
            
            if (e.features && e.features.length > 0) {
              const auctionId = e.features[0].properties?.id;
              console.log('Auction clicked! ID:', auctionId);
              console.log('Auctions in ref:', auctionsRef.current.length);
              const auction = auctionsRef.current.find(a => a.id === auctionId);
              if (auction) {
                console.log('Found auction:', auction.title);
                // Close ALL other panels when auction is clicked
                setSelectedSubstation(null);
                setSelectedDatacenter(null);
                setSelectedLake(null);
                setSelectedAuction(auction);
                // Also call prop callback if provided
                if (onAuctionClick) {
                  onAuctionClick(auction);
                }
              } else {
                console.log('Auction not found in state! ID:', auctionId);
              }
            }
          };

          map.current.on('click', 'auction-markers', handleAuctionClick);
          map.current.on('click', 'auction-markers-bg', handleAuctionClick);

          // Add substations polygon layer
          map.current.addLayer({
            id: 'substations-fill',
            type: 'fill',
            source: 'substations',
            paint: {
              'fill-color': '#ff9800',
              'fill-opacity': 0.3
            },
            layout: {
              'visibility': showSubstations ? 'visible' : 'none'
            }
          });

          map.current.addLayer({
            id: 'substations-outline',
            type: 'line',
            source: 'substations',
            paint: {
              'line-color': '#ff6f00',
              'line-width': 2
            },
            layout: {
              'visibility': showSubstations ? 'visible' : 'none'
            }
          });

          // Create lightning bolt SVG and add to map
          const lightningBoltSVG = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="#ffa726" stroke="#ff6f00" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
          `;
          const lightningImg = new Image(24, 24);
          lightningImg.onload = () => {
            if (map.current && !map.current.hasImage('lightning-bolt')) {
              map.current.addImage('lightning-bolt', lightningImg);
              
              // Add substations markers with lightning bolt icon
              map.current.addLayer({
                id: 'substations-markers',
                type: 'symbol',
                source: 'substations',
                layout: {
                  'icon-image': 'lightning-bolt',
                  'icon-size': 1,
                  'icon-allow-overlap': true,
                  'visibility': showSubstations ? 'visible' : 'none'
                }
              });

              // Add click handlers for substations
              const handleSubstationClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
                // Prevent event from bubbling to parcel layer
                e.originalEvent.stopPropagation();
                
                // Set flag to prevent parcel click handlers from firing
                featureClickedRef.current = true;
                setTimeout(() => {
                  featureClickedRef.current = false;
                }, 100);
                
                if (e.features && e.features.length > 0) {
                  const properties = e.features[0].properties;
                  // Close ALL other panels when substation is clicked
                  setSelectedAuction(null);
                  setSelectedDatacenter(null);
                  setSelectedLake(null);
                  setSelectedSubstation(properties);
                  console.log('Substation clicked:', properties);
                }
              };

              map.current.on('click', 'substations-markers', handleSubstationClick);
              map.current.on('click', 'substations-fill', handleSubstationClick);

              // Add hover effects
              map.current.on('mouseenter', 'substations-markers', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer';
              });
              map.current.on('mouseleave', 'substations-markers', () => {
                if (map.current) map.current.getCanvas().style.cursor = '';
              });
              map.current.on('mouseenter', 'substations-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer';
              });
              map.current.on('mouseleave', 'substations-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = '';
              });
            }
          };

          // Add datacenter layers
          map.current!.addLayer({
            id: 'datacenters-fill',
            type: 'fill',
            source: 'datacenters',
            paint: {
              'fill-color': '#2563eb',
              'fill-opacity': 0.3
            },
            layout: {
              'visibility': showDatacenters ? 'visible' : 'none'
            }
          });

          map.current!.addLayer({
            id: 'datacenters-outline',
            type: 'line',
            source: 'datacenters',
            paint: {
              'line-color': '#1e40af',
              'line-width': 2,
              'line-opacity': 0.8
            },
            layout: {
              'visibility': showDatacenters ? 'visible' : 'none'
            }
          });

          // Create a fun server icon for datacenters
          const serverIconSVG = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="14" rx="2" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
              <rect x="7" y="7" width="10" height="2" fill="#ffffff"/>
              <rect x="7" y="11" width="10" height="2" fill="#ffffff"/>
              <rect x="7" y="15" width="6" height="2" fill="#ffffff"/>
              <circle cx="18" cy="6" r="2" fill="#10b981"/>
            </svg>
          `;

          const serverImg = new Image(24, 24);
          serverImg.onload = () => {
            if (map.current && !map.current.hasImage('server-icon')) {
              map.current.addImage('server-icon', serverImg);

              map.current.addLayer({
                id: 'datacenters-markers',
                type: 'symbol',
                source: 'datacenters',
                layout: {
                  'icon-image': 'server-icon',
                  'icon-size': 1,
                  'icon-allow-overlap': true,
                  'visibility': showDatacenters ? 'visible' : 'none'
                }
              });

              // Add click handlers for datacenters
              const handleDatacenterClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
                // Prevent event from bubbling to parcel layer
                e.originalEvent.stopPropagation();
                
                // Set flag to prevent parcel click handlers from firing
                featureClickedRef.current = true;
                setTimeout(() => {
                  featureClickedRef.current = false;
                }, 100);
                
                if (e.features && e.features.length > 0) {
                  const properties = e.features[0].properties;
                  // Close ALL other panels when datacenter is clicked
                  setSelectedAuction(null);
                  setSelectedSubstation(null);
                  setSelectedLake(null);
                  setSelectedDatacenter(properties);
                  console.log('Datacenter clicked:', properties);
                }
              };

              map.current.on('click', 'datacenters-markers', handleDatacenterClick);
              map.current.on('click', 'datacenters-fill', handleDatacenterClick);

              // Add hover effects
              map.current.on('mouseenter', 'datacenters-markers', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer';
              });
              map.current.on('mouseleave', 'datacenters-markers', () => {
                if (map.current) map.current.getCanvas().style.cursor = '';
              });
              map.current.on('mouseenter', 'datacenters-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer';
              });
              map.current.on('mouseleave', 'datacenters-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = '';
              });
            }
          };
          serverImg.src = 'data:image/svg+xml;base64,' + btoa(serverIconSVG);

          // Add lakes layer with filtering
          map.current!.addLayer({
            id: 'lakes-fill',
            type: 'fill',
            source: 'lakes',
            paint: {
              'fill-color': '#4299e1',
              'fill-opacity': 0.4
            },
            layout: {
              'visibility': showLakes ? 'visible' : 'none'
            },
            filter: ['in', ['get', 'water'], ['literal', ['lake', 'reservoir']]] // Show both by default
          });

          map.current!.addLayer({
            id: 'lakes-outline',
            type: 'line',
            source: 'lakes',
            paint: {
              'line-color': '#2b6cb0',
              'line-width': 1.5,
              'line-opacity': 0.8
            },
            layout: {
              'visibility': showLakes ? 'visible' : 'none'
            },
            filter: ['in', ['get', 'water'], ['literal', ['lake', 'reservoir']]] // Show both by default
          });

          // Add click handlers for lakes
          const handleLakeClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            // Prevent event from bubbling to parcel layer
            e.originalEvent.stopPropagation();
            
            // Set flag to prevent parcel click handlers from firing
            featureClickedRef.current = true;
            setTimeout(() => {
              featureClickedRef.current = false;
            }, 100);
            
            if (e.features && e.features.length > 0) {
              const properties = e.features[0].properties;
              // Close ALL other panels when lake is clicked
              setSelectedAuction(null);
              setSelectedSubstation(null);
              setSelectedDatacenter(null);
              setSelectedLake(properties);
              console.log('Lake clicked:', properties);
            }
          };

          map.current!.on('click', 'lakes-fill', handleLakeClick);
          map.current!.on('click', 'lakes-outline', handleLakeClick);

          // Add hover effects for lakes
          map.current!.on('mouseenter', 'lakes-fill', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current!.on('mouseleave', 'lakes-fill', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });

          // Add power lines layers with orange gradient (darkest to lightest by voltage)
          
          // 345 kV - Darkest Orange (highest voltage)
          map.current!.addLayer({
            id: 'powerlines-345kv',
            type: 'line',
            source: 'powerlines',
            paint: {
              'line-color': '#c2410c',
              'line-width': 3,
              'line-opacity': 0.8
            },
            layout: {
              'visibility': showPowerLines && powerLineVoltages.kv345 ? 'visible' : 'none'
            },
            filter: ['any',
              ['==', ['get', 'voltage'], '345000'],
              ['in', '345000', ['get', 'voltage']]
            ]
          });

          // 161 kV - Dark Orange
          map.current!.addLayer({
            id: 'powerlines-161kv',
            type: 'line',
            source: 'powerlines',
            paint: {
              'line-color': '#ea580c',
              'line-width': 2.5,
              'line-opacity': 0.7
            },
            layout: {
              'visibility': showPowerLines && powerLineVoltages.kv161 ? 'visible' : 'none'
            },
            filter: ['any',
              ['==', ['get', 'voltage'], '161000'],
              ['in', '161000', ['get', 'voltage']]
            ]
          });

          // 138 kV - Medium Orange
          map.current!.addLayer({
            id: 'powerlines-138kv',
            type: 'line',
            source: 'powerlines',
            paint: {
              'line-color': '#f97316',
              'line-width': 2,
              'line-opacity': 0.6
            },
            layout: {
              'visibility': showPowerLines && powerLineVoltages.kv138 ? 'visible' : 'none'
            },
            filter: ['any',
              ['==', ['get', 'voltage'], '138000'],
              ['in', '138000', ['get', 'voltage']]
            ]
          });

          // 115 kV - Light Orange
          map.current!.addLayer({
            id: 'powerlines-115kv',
            type: 'line',
            source: 'powerlines',
            paint: {
              'line-color': '#fb923c',
              'line-width': 1.5,
              'line-opacity': 0.5
            },
            layout: {
              'visibility': showPowerLines && powerLineVoltages.kv115 ? 'visible' : 'none'
            },
            filter: ['any',
              ['==', ['get', 'voltage'], '115000'],
              ['in', '115000', ['get', 'voltage']]
            ]
          });

          // 69 kV - Lightest Orange (lowest voltage)
          map.current!.addLayer({
            id: 'powerlines-69kv',
            type: 'line',
            source: 'powerlines',
            paint: {
              'line-color': '#fdba74',
              'line-width': 1,
              'line-opacity': 0.4
            },
            layout: {
              'visibility': showPowerLines && powerLineVoltages.kv69 ? 'visible' : 'none'
            },
            filter: ['any',
              ['==', ['get', 'voltage'], '69000'],
              ['in', '69000', ['get', 'voltage']]
            ]
          });

          lightningImg.src = 'data:image/svg+xml;base64,' + btoa(lightningBoltSVG);

          // Add click handlers for powerlines to show operator info
          const powerlineLayers = ['powerlines-345kv', 'powerlines-161kv', 'powerlines-138kv', 'powerlines-115kv', 'powerlines-69kv'];
          
          powerlineLayers.forEach(layerId => {
            map.current!.on('click', layerId, (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
              if (e.features && e.features.length > 0) {
                const props = e.features[0].properties;
                const operator = props?.operator || 'Unknown Operator';
                const voltage = props?.voltage || 'Unknown';
                const voltageKV = voltage ? (parseInt(voltage) / 1000).toFixed(0) : '?';
                
                const html = `
                  <div style="padding: 10px; min-width: 200px;">
                    <strong style="display: block; margin-bottom: 8px; font-size: 14px; color: #1f2937;">⚡ Transmission Line</strong>
                    <div style="font-size: 12px; color: #4b5563; margin-bottom: 6px;">
                      <strong>Operator:</strong> ${operator}
                    </div>
                    <div style="font-size: 12px; color: #4b5563; margin-bottom: 6px;">
                      <strong>Voltage:</strong> ${voltageKV} kV
                    </div>
                    ${props?.circuits ? `<div style="font-size: 11px; color: #6b7280;">Circuits: ${props.circuits}</div>` : ''}
                    <div style="font-size: 10px; color: #9ca3af; margin-top: 8px; padding-top: 6px; border-top: 1px solid #e5e7eb;">
                      High voltage transmission infrastructure
                    </div>
                  </div>
                `;
                
                new maplibregl.Popup()
                  .setLngLat(e.lngLat)
                  .setHTML(html)
                  .addTo(map.current!);
              }
            });

            // Add hover cursor
            map.current!.on('mouseenter', layerId, () => {
              if (map.current) map.current.getCanvas().style.cursor = 'pointer';
            });

            map.current!.on('mouseleave', layerId, () => {
              if (map.current) map.current.getCanvas().style.cursor = '';
            });
          });

          // Add hover effects for auction markers
          const handleAuctionMouseEnter = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (map.current) {
              map.current.getCanvas().style.cursor = 'pointer';
              
              // Show preview popup on hover
              if (e.features && e.features.length > 0 && !drawModeEnabledRef.current) {
                const props = e.features[0].properties;
                const auction = auctions.find(a => a.id === props?.id);
                
                if (auction) {
                  const isCountyLevel = auction.rawData?.isCountyLevel || props?.isCountyLevel || false;
                  const html = `
                    <div style="padding: 8px; min-width: 180px;">
                      <strong style="display: block; margin-bottom: 6px; font-size: 13px;">${auction.acreage ? `${auction.acreage} Acres` : auction.title}</strong>
                      ${auction.auctionDate ? `<div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Auction: ${new Date(auction.auctionDate).toLocaleDateString()}</div>` : ''}
                      ${auction.county ? `<div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${auction.county} County${isCountyLevel ? ' <span style="color: #f59e0b;">(Approx.)</span>' : ''}</div>` : ''}
                      ${auction.csr2Mean ? `<div style="font-size: 11px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb;">CSR2: <strong>${auction.csr2Mean.toFixed(1)}</strong></div>` : ''}
                      <div style="font-size: 10px; color: #9ca3af; margin-top: 6px; text-align: center;">Click for details</div>
                    </div>
                  `;
                  new maplibregl.Popup({
                    closeButton: false,
                    closeOnClick: false,
                    offset: 15
                  })
                    .setLngLat(e.lngLat)
                    .setHTML(html)
                    .addTo(map.current);
                }
              }
            }
          };

          const handleAuctionMouseLeave = () => {
            if (map.current) {
              map.current.getCanvas().style.cursor = '';
              // Remove hover popup
              const popups = document.getElementsByClassName('maplibregl-popup');
              if (popups.length) {
                for (let i = popups.length - 1; i >= 0; i--) {
                  const popup = popups[i];
                  if (!popup.querySelector('.maplibregl-popup-close-button')) {
                    popup.remove();
                  }
                }
              }
            }
          };

          map.current.on('mouseenter', 'auction-markers', handleAuctionMouseEnter);
          map.current.on('mouseleave', 'auction-markers', handleAuctionMouseLeave);
          map.current.on('mouseenter', 'auction-markers-bg', handleAuctionMouseEnter);
          map.current.on('mouseleave', 'auction-markers-bg', handleAuctionMouseLeave);

          // Initial auction load
          loadAuctions();
        }
      };
      img.src = '/auction-icon.svg';

      // Initial parcel load
      loadParcels();
    });

      // Load parcels and auctions when map moves and update label visibility
      map.current.on('moveend', () => {
        loadParcels();
        loadAuctions();
        // Update label visibility based on new location
        updateLabelVisibility();
      });

      // Handle polygon drawn
      map.current.on('draw.create', (e) => {
        const polygon = e.features[0];
        onPolygonDrawn(polygon);
      });

      map.current.on('draw.update', (e) => {
        const polygon = e.features[0];
        onPolygonDrawn(polygon);
      });

      return () => {
        if (map.current) {
          map.current.remove();
          map.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to initialize map with WebGL:', error);
      // Map initialization failed - show error message
      if (mapContainer.current) {
        mapContainer.current.innerHTML = '<div class="flex items-center justify-center h-full bg-gray-100 text-gray-500"><p>Map visualization unavailable (WebGL required)</p></div>';
      }
      toast({
        title: "Map Initialization Failed",
        description: "Map visualization is not available in this environment. The valuation form is still functional.",
        variant: "default"
      });
    }
  }, []);

  // Toggle draw mode
  useEffect(() => {
    if (!draw.current || !map.current) return;

    if (drawModeEnabled) {
      draw.current.changeMode('draw_polygon');
    } else {
      draw.current.changeMode('simple_select');
    }
  }, [drawModeEnabled]);

  // Toggle owner labels visibility - only show one type based on location
  useEffect(() => {
    updateLabelVisibility();
  }, [showOwnerLabels]);

  // Handle clearing drawn polygons
  useEffect(() => {
    if (!draw.current || !clearDrawnPolygons) return;

    // Get all drawn features
    const features = draw.current.getAll();
    if (features.features.length > 0) {
      // Delete all features
      draw.current.deleteAll();
      toast({
        title: "Polygons Cleared",
        description: "All drawn polygons have been removed",
        variant: "default"
      });
    }

    // Call the callback to reset the clear flag
    if (onClearComplete) {
      onClearComplete();
    }
  }, [clearDrawnPolygons, onClearComplete, toast]);

  // Add drawn polygon to map if data is provided
  useEffect(() => {
    if (!map.current || !drawnPolygonData) return;

    // Add or update polygon source
    if (map.current.getSource('drawn-polygon')) {
      (map.current.getSource('drawn-polygon') as maplibregl.GeoJSONSource).setData({
        type: 'Feature',
        geometry: drawnPolygonData.polygon.geometry,
        properties: {}
      });
    }
  }, [drawnPolygonData]);

  // Function to analyze ownership patterns and create heatmap
  const analyzeOwnershipPatterns = async () => {
    if (!map.current || !isInHarrisonCounty()) return;

    // Get all features from Harrison County tileset
    const features = map.current.querySourceFeatures('harrison-parcels', {
      sourceLayer: 'TMV-79tjod'
    });

    if (features.length === 0) return;

    // Create a map to group parcels by owner
    const ownershipMap = new Map<string, any[]>();
    
    features.forEach(feature => {
      if (!feature.properties) return;
      const owner = (feature.properties.owner || 'Unknown').toLowerCase().trim();
      if (!ownershipMap.has(owner)) {
        ownershipMap.set(owner, []);
      }
      ownershipMap.get(owner)!.push(feature);
    });

    // Sort owners by parcel count
    const sortedOwners = Array.from(ownershipMap.entries())
      .sort((a, b) => b[1].length - a[1].length);

    // Find owners with multiple parcels
    const multiParcelOwners = sortedOwners
      .filter(([owner, parcels]) => parcels.length > 1);

    // Log statistics
    console.log(`Harrison County: Analyzed ${features.length} parcels`);
    console.log(`Found ${ownershipMap.size} unique owners`);
    console.log(`${multiParcelOwners.length} owners have multiple parcels`);

    // Create color scale based on parcel count
    const colors = [
      '#fee5d9', // 2 parcels - light peach
      '#fcbba1', // 3 parcels
      '#fc9272', // 4-5 parcels
      '#fb6a4a', // 6-8 parcels
      '#ef3b2c', // 9-12 parcels
      '#cb181d', // 13-20 parcels
      '#99000d'  // 21+ parcels - dark red
    ];

    // Create paint expression for heatmap
    const paintExpression: any = ['case'];
    
    multiParcelOwners.forEach(([owner, parcels]) => {
      const parcelCount = parcels.length;
      let colorIndex = 0;
      if (parcelCount >= 21) colorIndex = 6;
      else if (parcelCount >= 13) colorIndex = 5;
      else if (parcelCount >= 9) colorIndex = 4;
      else if (parcelCount >= 6) colorIndex = 3;
      else if (parcelCount >= 4) colorIndex = 2;
      else if (parcelCount === 3) colorIndex = 1;
      
      paintExpression.push(['==', ['downcase', ['get', 'owner']], owner]);
      paintExpression.push(colors[colorIndex]);
    });
    
    // Default color for single-parcel owners
    paintExpression.push('rgba(52, 211, 153, 0.15)'); // Original green

    // Update the fill layer with ownership heatmap
    if (map.current.getLayer('harrison-parcels-fill')) {
      map.current.setPaintProperty(
        'harrison-parcels-fill',
        'fill-color',
        showOwnershipHeatmap ? paintExpression : 'rgba(52, 211, 153, 0.15)'
      );
      map.current.setPaintProperty(
        'harrison-parcels-fill',
        'fill-opacity',
        showOwnershipHeatmap ? 0.6 : 0.15
      );
    }

    // Show a toast with summary if heatmap is enabled
    if (showOwnershipHeatmap) {
      const largestOwners = multiParcelOwners.slice(0, 3);
      const ownerSummary = largestOwners
        .map(([owner, parcels]) => `${parcels.length} parcels`)
        .join(', ');
        
      toast({
        title: "Ownership Heatmap Active",
        description: `Highlighting ${multiParcelOwners.length} multi-parcel owners. Largest: ${ownerSummary}`,
      });
    }
  };

  // Update ownership heatmap when toggle changes or map moves
  useEffect(() => {
    if (!map.current) return;
    
    if (showOwnershipHeatmap) {
      analyzeOwnershipPatterns();
      // Re-analyze when map moves in Harrison County
      const moveHandler = () => {
        if (isInHarrisonCounty()) {
          analyzeOwnershipPatterns();
        }
      };
      map.current.on('moveend', moveHandler);
      
      return () => {
        map.current?.off('moveend', moveHandler);
      };
    } else if (map.current.getLayer('harrison-parcels-fill')) {
      // Reset to default colors when heatmap is disabled
      map.current.setPaintProperty(
        'harrison-parcels-fill',
        'fill-color',
        'rgba(52, 211, 153, 0.15)'
      );
      map.current.setPaintProperty(
        'harrison-parcels-fill',
        'fill-opacity',
        0.15
      );
    }
  }, [showOwnershipHeatmap]);

  // Toggle auction layer visibility
  useEffect(() => {
    if (!map.current) return;
    
    const auctionLayer = map.current.getLayer('auction-markers');
    const auctionBgLayer = map.current.getLayer('auction-markers-bg');
    
    if (auctionLayer) {
      map.current.setLayoutProperty(
        'auction-markers',
        'visibility',
        showAuctionLayer ? 'visible' : 'none'
      );
    }
    
    if (auctionBgLayer) {
      map.current.setLayoutProperty(
        'auction-markers-bg',
        'visibility',
        showAuctionLayer ? 'visible' : 'none'
      );
    }
    
    // Load or clear auctions based on visibility
    if (showAuctionLayer) {
      loadAuctions();
    }
  }, [showAuctionLayer]);

  // Reload auctions when filters change
  useEffect(() => {
    if (map.current && showAuctionLayer) {
      loadAuctions();
    }
  }, [auctionFilters]);

  // Toggle substations layer visibility
  useEffect(() => {
    if (!map.current) return;
    
    const layers = ['substations-fill', 'substations-outline', 'substations-markers'];
    
    layers.forEach(layerId => {
      const layer = map.current?.getLayer(layerId);
      if (layer) {
        map.current?.setLayoutProperty(
          layerId,
          'visibility',
          showSubstations ? 'visible' : 'none'
        );
      }
    });
  }, [showSubstations]);

  // Toggle datacenter layer visibility
  useEffect(() => {
    if (!map.current) return;

    const layers = ['datacenters-fill', 'datacenters-outline', 'datacenters-markers'];

    layers.forEach(layerId => {
      const layer = map.current?.getLayer(layerId);
      if (layer) {
        map.current?.setLayoutProperty(
          layerId,
          'visibility',
          showDatacenters ? 'visible' : 'none'
        );
      }
    });
  }, [showDatacenters]);

  // Toggle lakes layer visibility
  useEffect(() => {
    if (!map.current) return;

    const layers = ['lakes-fill', 'lakes-outline'];

    layers.forEach(layerId => {
      const layer = map.current?.getLayer(layerId);
      if (layer) {
        map.current?.setLayoutProperty(
          layerId,
          'visibility',
          showLakes ? 'visible' : 'none'
        );
      }
    });
  }, [showLakes]);

  // Toggle city/town labels visibility
  useEffect(() => {
    if (!map.current) return;

    const layers = ['place-labels-city', 'place-labels-village'];

    layers.forEach(layerId => {
      const layer = map.current?.getLayer(layerId);
      if (layer) {
        map.current?.setLayoutProperty(
          layerId,
          'visibility',
          showCityLabels ? 'visible' : 'none'
        );
      }
    });
  }, [showCityLabels]);

  // Toggle highways/interstates visibility
  useEffect(() => {
    if (!map.current) return;

    const layers = ['road-all-highways'];

    layers.forEach(layerId => {
      const layer = map.current?.getLayer(layerId);
      if (layer) {
        map.current?.setLayoutProperty(
          layerId,
          'visibility',
          showHighways ? 'visible' : 'none'
        );
      }
    });
  }, [showHighways]);

  // Filter lakes by type (lake vs reservoir)
  useEffect(() => {
    if (!map.current) return;

    const layers = ['lakes-fill', 'lakes-outline'];
    const allowedTypes = [];
    
    if (lakeTypes.lakes) allowedTypes.push('lake');
    if (lakeTypes.reservoirs) allowedTypes.push('reservoir');

    // If no types selected, hide all lakes
    if (allowedTypes.length === 0) {
      layers.forEach(layerId => {
        const layer = map.current?.getLayer(layerId);
        if (layer) {
          map.current?.setFilter(layerId, ['in', ['get', 'water'], ['literal', []]]);
        }
      });
      return;
    }

    // Filter by selected types
    layers.forEach(layerId => {
      const layer = map.current?.getLayer(layerId);
      if (layer) {
        map.current?.setFilter(layerId, ['in', ['get', 'water'], ['literal', allowedTypes]]);
      }
    });
  }, [lakeTypes]);

  // Toggle power lines layer visibility based on voltage selections
  useEffect(() => {
    if (!map.current) return;

    const voltageLayerMap = [
      { id: 'powerlines-345kv', enabled: powerLineVoltages.kv345 },
      { id: 'powerlines-161kv', enabled: powerLineVoltages.kv161 },
      { id: 'powerlines-138kv', enabled: powerLineVoltages.kv138 },
      { id: 'powerlines-115kv', enabled: powerLineVoltages.kv115 },
      { id: 'powerlines-69kv', enabled: powerLineVoltages.kv69 }
    ];

    voltageLayerMap.forEach(({ id, enabled }) => {
      const layer = map.current?.getLayer(id);
      if (layer) {
        map.current?.setLayoutProperty(
          id,
          'visibility',
          showPowerLines && enabled ? 'visible' : 'none'
        );
      }
    });
  }, [showPowerLines, powerLineVoltages]);

  return (
    <>
      <div ref={mapContainer} className="absolute top-0 left-0 w-full h-full" />
      {selectedAuction && (
        <AuctionDetailsPanel
          auction={selectedAuction}
          onClose={() => setSelectedAuction(null)}
          onStartValuation={onStartAuctionValuation ? () => onStartAuctionValuation(selectedAuction) : undefined}
        />
      )}
      {selectedSubstation && (
        <SubstationInfoPanel
          substation={selectedSubstation}
          onClose={() => setSelectedSubstation(null)}
        />
      )}
      {selectedDatacenter && (
        <DataCenterInfoPanel
          datacenter={selectedDatacenter}
          onClose={() => setSelectedDatacenter(null)}
        />
      )}
      {selectedLake && (
        <LakeInfoPanel
          lake={selectedLake}
          onClose={() => setSelectedLake(null)}
        />
      )}
    </>
  );
}