import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as turf from '@turf/turf';
import { useToast } from '@/hooks/use-toast';

interface EnhancedMapProps {
  drawModeEnabled: boolean;
  onParcelClick: (parcel: any) => void;
  onPolygonDrawn: (polygon: any) => void;
  drawnPolygonData?: any;
  onMapReady?: (map: maplibregl.Map) => void;
  showOwnerLabels?: boolean;
  showOwnershipHeatmap?: boolean;
  clearDrawnPolygons?: boolean;
  onClearComplete?: () => void;
}

export default function EnhancedMap({ 
  drawModeEnabled, 
  onParcelClick, 
  onPolygonDrawn,
  drawnPolygonData,
  onMapReady,
  showOwnerLabels = false,
  showOwnershipHeatmap = false,
  clearDrawnPolygons = false,
  onClearComplete
}: EnhancedMapProps) {

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const drawModeEnabledRef = useRef(drawModeEnabled);

  const { toast } = useToast();

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
        const source = map.current?.getSource('parcels') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(data);
          console.log(`Loaded ${data.features.length} parcels`);
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
      // Initialize map with satellite imagery
      // Initialize map with satellite imagery as fallback
      map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
          }
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
            ['>', ['length', ['get', 'DEEDHOLDER']], 20],
            ['concat', ['slice', ['get', 'DEEDHOLDER'], 0, 20], '...'],
            ['get', 'DEEDHOLDER']
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
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          const geometry = e.features[0].geometry;
          
          // Use gisacre field for acres (authentic data from tileset)
          const acres = parseFloat(props.gisacre) || 0;
          
          // Highlight the selected parcel with red border
          const parcelNumber = props.parcelnumb || props.parcelnu_1 || '';
          if (map.current && parcelNumber) {
            map.current.setFilter('harrison-parcels-selected', ['==', ['get', 'parcelnumb'], parcelNumber]);
          }
          
          // Map Harrison County fields to expected format using actual tileset field names
          const parcel = {
            owner_name: props.owner || props.owner2 || props.owner3 || 'Unknown',
            address: props.address || props.parcelid || 'N/A', 
            acres: Math.round(acres * 100) / 100, // Round to 2 decimal places
            coordinates: [e.lngLat.lng, e.lngLat.lat],
            parcel_number: props.parcelnumb || props.parcelnu_1 || 'N/A',
            parcel_class: props.class_ || 'N/A',
            county: 'Harrison County',
            geometry: geometry // Include actual polygon geometry
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
              <small><em>Updated Harrison County Data</em></small>
            `;
            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map.current!);
          }
        }
      };

      // Add click handlers for Harrison County layers
      map.current!.on('click', 'harrison-parcels-outline', handleHarrisonParcelClick);
      map.current!.on('click', 'harrison-parcels-fill', handleHarrisonParcelClick);

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

      // Initial parcel load
      loadParcels();
    });

      // Load parcels when map moves and update label visibility
      map.current.on('moveend', () => {
        loadParcels();
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

  return <div ref={mapContainer} className="absolute top-0 left-0 w-full h-full" />;
}