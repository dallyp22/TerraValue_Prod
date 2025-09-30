import { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as turf from '@turf/turf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MapPin, Target, Loader2, Search, Map, Satellite, X, Maximize2, Minimize2, Pentagon, Tag, Edit3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CSR2Data {
  mean: number;
  min: number;
  max: number;
  count: number;
}

interface ParcelData {
  fieldId?: string;
  wkt: string;
  csr2?: CSR2Data;
  coordinates: [number, number];
  acres?: number;
}

interface MapParcelPickerProps {
  defaultAddress?: string;
  onParcelSelected?: (data: ParcelData) => void;
  onLocationChange?: (lat: number, lon: number, address?: string) => void;
  className?: string;
}

export function MapParcelPicker({ 
  defaultAddress = "",
  onParcelSelected,
  onLocationChange,
  className = ""
}: MapParcelPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const expandedMapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [address, setAddress] = useState(defaultAddress);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isFetchingCSR2, setIsFetchingCSR2] = useState(false);
  const [selectedArea, setSelectedArea] = useState<ParcelData | null>(null);
  const [currentMarker, setCurrentMarker] = useState<maplibregl.Marker | null>(null);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('satellite');
  const [csr2Points, setCsr2Points] = useState<Array<{coordinates: [number, number], csr2: number}>>([]);
  const [markers, setMarkers] = useState<maplibregl.Marker[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-93.5, 42.0]);
  const [mapZoom, setMapZoom] = useState(8);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [customPolygonData, setCustomPolygonData] = useState<{acres: number, avgCSR2: number} | null>(null);
  const [showOwnerLabels, setShowOwnerLabels] = useState(false);
  const [isPolygonDrawMode, setIsPolygonDrawMode] = useState(false);
  const draw = useRef<MapboxDraw | null>(null);
  const [liveTooltip, setLiveTooltip] = useState<maplibregl.Popup | null>(null);
  const { toast } = useToast();

  // Custom MapboxDraw styles compatible with MapLibre GL
  const customDrawStyles = [
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
      'id': 'gl-draw-line-inactive',
      'type': 'line',
      'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
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
      'id': 'gl-draw-line-active',
      'type': 'line',
      'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
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
  ];

  // Map style URLs with proper glyph configuration
  const mapStyles = {
    street: {
      version: 8 as const,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'carto-light': {
          type: 'raster' as const,
          tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © CARTO'
        }
      },
      layers: [{
        id: 'carto-light-layer',
        type: 'raster' as const,
        source: 'carto-light'
      }]
    },
    satellite: {
      version: 8 as const,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'satellite': {
          type: 'raster' as const,
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256,
          attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }
      },
      layers: [
        {
          id: 'satellite-layer',
          type: 'raster' as const,
          source: 'satellite',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  };

  // Function to toggle map style
  const toggleMapStyle = () => {
    if (!map.current) return;
    
    const newStyle = mapStyle === 'street' ? 'satellite' : 'street';
    setMapStyle(newStyle);
    map.current.setStyle(mapStyles[newStyle] as any);
  };

  // Function to load parcels based on current bounds
  const loadParcels = async () => {
    if (!map.current || map.current.getZoom() <= 12) {
      // Clear data if zoomed out
      const source = map.current?.getSource('parcels') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const bounds = map.current.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',');
    // Use the working Iowa Parcels 2017 service with all available fields
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
          toast({
            title: "Parcel Data Loaded",
            description: `${data.features.length} property parcels displayed on map`
          });
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
        // Handle too many features or empty (e.g., alert user to zoom in)
        console.warn('Too many or no parcels in view; zoom in for details.');
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

  // Handle drawing clicks to build polygon
  const handleDrawingClick = useCallback((e: maplibregl.MapMouseEvent) => {
    console.log('Drawing click detected:', e.lngLat);
    const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    const newPoints = [...drawingPoints, coords];
    setDrawingPoints(newPoints);
    console.log('New drawing points:', newPoints);

    // Update the drawing polygon visualization with multiple features
    if (newPoints.length >= 1) {
      const features = [];
      
      // Add all points as Point features
      newPoints.forEach((point, index) => {
        features.push({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: point
          },
          properties: { index }
        });
      });

      // Add lines connecting the points
      if (newPoints.length > 1) {
        features.push({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: newPoints
          },
          properties: { type: 'line' }
        });
      }

      // If we have 3+ points, show the polygon
      if (newPoints.length >= 3) {
        const polygonCoords = [...newPoints, newPoints[0]]; // Close the polygon
        features.push({
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [polygonCoords]
          },
          properties: { type: 'polygon' }
        });
      }

      const source = map.current?.getSource('drawing-polygon') as maplibregl.GeoJSONSource;
      if (source) {
        console.log('Updating drawing visualization with features:', features);
        source.setData({
          type: 'FeatureCollection',
          features
        });
      } else {
        console.error('Drawing source not found');
      }
    }

    toast({
      title: "Point Added",
      description: `${newPoints.length} point${newPoints.length > 1 ? 's' : ''} selected. ${newPoints.length >= 3 ? 'Ready to finish drawing.' : `Need ${3 - newPoints.length} more points.`}`
    });
  }, [drawingPoints, toast]);

  // Setup polygon drawing events for MapboxDraw
  const setupPolygonDrawingEvents = useCallback((mapInstance: maplibregl.Map) => {
    if (!draw.current) return;

    // Real-time area calculation during polygon drawing
    mapInstance.on('draw.update', (e: any) => {
      const feature = e.features[0];
      if (feature && feature.geometry.type === 'Polygon' && feature.geometry.coordinates[0].length > 3) {
        // Calculate area using Turf.js
        const areaSqM = turf.area(feature);
        const acres = parseFloat((areaSqM / 4046.86).toFixed(2));
        
        // Show live tooltip at polygon centroid
        const center = turf.centroid(feature);
        if (liveTooltip) {
          liveTooltip.setLngLat([center.geometry.coordinates[0], center.geometry.coordinates[1]])
            .setHTML(`<div class="live-area-tooltip">📐 ${acres} acres</div>`);
        } else {
          const tooltip = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'live-area-tooltip'
          })
          .setLngLat([center.geometry.coordinates[0], center.geometry.coordinates[1]])
          .setHTML(`<div class="live-area-tooltip">📐 ${acres} acres</div>`)
          .addTo(mapInstance);
          setLiveTooltip(tooltip);
        }
      }
    });

    // Handle polygon completion
    mapInstance.on('draw.create', async (e: any) => {
      const feature = e.features[0];
      if (feature && feature.geometry.type === 'Polygon') {
        setIsPolygonDrawMode(false);
        
        // Calculate final area and CSR2 analysis
        const areaSqM = turf.area(feature);
        const acres = parseFloat((areaSqM / 4046.86).toFixed(2));
        
        // Get CSR2 data for the polygon
        try {
          const response = await fetch('/api/average-csr2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ polygon: feature.geometry })
          });
          
          if (response.ok) {
            const csr2Data = await response.json();
            const avgCSR2 = csr2Data.averageCSR2 || 0;
            
            // Create parcel data
            const center = turf.centroid(feature);
            const parcelData: ParcelData = {
              wkt: `POLYGON((${feature.geometry.coordinates[0].map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')}))`,
              coordinates: [center.geometry.coordinates[0], center.geometry.coordinates[1]],
              acres,
              csr2: {
                mean: Math.round(avgCSR2 * 10) / 10,
                min: avgCSR2,
                max: avgCSR2,
                count: 1
              }
            };
            
            setSelectedArea(parcelData);
            onParcelSelected?.(parcelData);
            
            toast({
              title: "Polygon Completed",
              description: `${acres} acres drawn with CSR2: ${avgCSR2.toFixed(1)}`
            });
            
            // Add enhanced styled polygon
            addEnhancedPolygonVisualization(feature, mapInstance);
            
          } else {
            throw new Error('Failed to get CSR2 data');
          }
        } catch (error) {
          console.error('Error processing polygon:', error);
          toast({
            title: "Analysis Error",
            description: "Could not analyze soil data for drawn polygon",
            variant: "destructive"
          });
        }
        
        // Clear live tooltip
        if (liveTooltip) {
          liveTooltip.remove();
          setLiveTooltip(null);
        }
      }
    });

    // Handle drawing mode changes
    mapInstance.on('draw.modechange', (e: any) => {
      setIsPolygonDrawMode(e.mode === 'draw_polygon');
      if (e.mode !== 'draw_polygon' && liveTooltip) {
        liveTooltip.remove();
        setLiveTooltip(null);
      }
    });

  }, [liveTooltip, onParcelSelected, toast]);

  // Add enhanced polygon visualization
  const addEnhancedPolygonVisualization = (feature: any, mapInstance: maplibregl.Map) => {
    // Create enhanced visual layers for completed polygon
    if (!mapInstance.getSource('drawn-polygon-fill')) {
      mapInstance.addSource('drawn-polygon-fill', {
        type: 'geojson',
        data: feature
      });

      mapInstance.addLayer({
        id: 'drawn-polygon-fill',
        type: 'fill',
        source: 'drawn-polygon-fill',
        paint: {
          'fill-color': '#3B82F6',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 0.6],
          'fill-antialias': true
        }
      });

      mapInstance.addLayer({
        id: 'drawn-polygon-stroke',
        type: 'line',
        source: 'drawn-polygon-fill',
        paint: {
          'line-color': '#1E40AF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 4],
          'line-opacity': 0.9
        }
      });
    } else {
      (mapInstance.getSource('drawn-polygon-fill') as maplibregl.GeoJSONSource).setData(feature);
    }
  };

  // Enhanced owner label management
  const manageOwnerLabels = useCallback((mapInstance: maplibregl.Map) => {
    if (!mapInstance.getLayer('parcels-labels') && mapInstance.getSource('parcels')) {
      console.log('Adding enhanced owner labels layer');
      mapInstance.addLayer({
        'id': 'parcels-labels',
        'type': 'symbol',
        'source': 'parcels',
        'layout': {
          'text-field': [
            'case',
            ['>', ['length', ['get', 'DEEDHOLDER']], 18],
            ['concat', ['slice', ['get', 'DEEDHOLDER'], 0, 18], '...'],
            ['get', 'DEEDHOLDER']
          ],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 12,
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': false,
          'text-padding': 2,
          'text-max-width': 15,
          'visibility': showOwnerLabels ? 'visible' : 'none'
        },
        'paint': {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1,
          'text-opacity': 1
        },
        'minzoom': 13
      });
      console.log('Enhanced owner labels layer added successfully');
    } else if (mapInstance.getLayer('parcels-labels')) {
      console.log('Enhanced owner labels layer already exists');
    } else {
      console.log('Parcels source not ready yet for enhanced labels');
    }
  }, [showOwnerLabels]);

  // Handle custom polygon drawing
  const handlePolygonCreate = useCallback(async (polygon: any) => {
    try {
      // Calculate acres
      const areaSqM = turf.area(polygon);
      const acres = Number((areaSqM / 4046.86).toFixed(2)); // 1 acre = 4046.86 sq m

      // Fetch average CSR2 from backend
      const response = await fetch('/api/average-csr2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon: polygon.geometry })
      });
      
      const data = await response.json();
      const avgCSR2 = Number(data.average.toFixed(2));
      const minCSR2 = data.min || avgCSR2;
      const maxCSR2 = data.max || avgCSR2;
      const count = data.count || 1;

      console.log('Polygon analysis completed:', { acres, avgCSR2, minCSR2, maxCSR2, count });

      // Show results in toast with range if different
      const rangeText = minCSR2 !== maxCSR2 ? ` (Range: ${minCSR2}-${maxCSR2})` : '';
      toast({
        title: "Custom Polygon Analysis",
        description: `Area: ${acres} acres • Average CSR2: ${avgCSR2}${rangeText}`
      });

      // Create parcel data with acres
      const parcelData: ParcelData = {
        wkt: `POLYGON((${polygon.geometry.coordinates[0].map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')}))`,
        coordinates: turf.center(polygon).geometry.coordinates as [number, number],
        acres: acres, // Include acres in the parcel data
        csr2: {
          mean: avgCSR2,
          min: minCSR2,
          max: maxCSR2,
          count: count
        }
      };
      
      // Update the selected area state to show in CSR2 results
      console.log('Setting selectedArea with parcelData:', parcelData);
      setSelectedArea(parcelData);
      
      // Integrate into valuation
      if (onParcelSelected) {
        onParcelSelected(parcelData);
      }

    } catch (error) {
      console.error('Error calculating CSR2:', error);
      toast({
        title: "Error",
        description: "Failed to calculate polygon analysis",
        variant: "destructive"
      });
    }
  }, [onParcelSelected, toast]);

  // Finish drawing and calculate polygon stats
  const finishDrawing = useCallback(async () => {
    console.log('Finish drawing called, points:', drawingPoints.length);
    
    if (drawingPoints.length < 3) {
      toast({
        title: "Drawing Error",
        description: "Need at least 3 points to create a polygon",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsFetchingCSR2(true);
      
      // Create closed polygon
      const closedPoints = [...drawingPoints, drawingPoints[0]];
      const polygon = {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [closedPoints]
        },
        properties: {}
      };

      console.log('Created polygon for analysis:', polygon);
      await handlePolygonCreate(polygon);
      
      // Reset drawing state immediately to prevent double-clicking issues
      setIsDrawing(false);
      setDrawingPoints([]);
      
      // Clear drawing visualization
      const source = map.current?.getSource('drawing-polygon') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      
      console.log('Drawing finished successfully');
      
    } catch (error) {
      console.error('Error in finishDrawing:', error);
      toast({
        title: "Drawing Error",
        description: "Failed to complete polygon drawing",
        variant: "destructive"
      });
    } finally {
      setIsFetchingCSR2(false);
    }
  }, [drawingPoints, handlePolygonCreate, toast]);

  // Handle ESC key to close expanded map
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isExpanded]);

  // Initialize map
  useEffect(() => {
    const currentContainer = isExpanded ? expandedMapContainer.current : mapContainer.current;
    
    if (!currentContainer || map.current) return;

    map.current = new maplibregl.Map({
      container: currentContainer,
      style: mapStyles[mapStyle] as any,
      center: mapCenter,
      zoom: mapZoom,
      attributionControl: false
    });

    // Add controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // Add source for parcels (initially empty)
      map.current!.addSource('parcels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add outline layer for parcels
      map.current!.addLayer({
        id: 'parcels-outline',
        type: 'line',
        source: 'parcels',
        paint: {
          'line-color': '#0000FF', // Blue outlines
          'line-width': 1,
          'line-opacity': 0.8
        }
      });

      // Initialize MapboxDraw for polygon drawing
      draw.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        styles: customDrawStyles
      });
      
      map.current!.addControl(draw.current);
      
      // Setup polygon drawing events
      setupPolygonDrawingEvents(map.current!);

      // Initialize enhanced owner label system
      manageOwnerLabels(map.current!);

      // Add drawing polygon source and layer
      map.current!.addSource('drawing-polygon', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add circle layer for drawing points
      map.current!.addLayer({
        id: 'drawing-points',
        type: 'circle',
        source: 'drawing-polygon',
        paint: {
          'circle-color': '#ff0000',
          'circle-radius': 6,
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        },
        filter: ['==', '$type', 'Point']
      });

      // Add line layer for polygon outline and drawing progress
      map.current!.addLayer({
        id: 'drawing-polygon-line',
        type: 'line',
        source: 'drawing-polygon',
        paint: {
          'line-color': '#ff0000',
          'line-width': 3,
          'line-opacity': 0.8
        },
        filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']]
      });

      // Add fill layer for completed polygons
      map.current!.addLayer({
        id: 'drawing-polygon-fill',
        type: 'fill',
        source: 'drawing-polygon',
        paint: {
          'fill-color': '#ff0000',
          'fill-opacity': 0.2
        },
        filter: ['==', '$type', 'Polygon']
      });

      // Load parcels based on current bounds  
      loadParcels();
      
      // Initialize enhanced owner label system after parcels load
      setTimeout(() => {
        if (map.current?.getSource('parcels')) {
          manageOwnerLabels(map.current);
        }
      }, 500);
      
      // Add event handlers for parcel interaction
      map.current!.on('click', 'parcels-outline', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          const html = `
            <strong>County:</strong> ${props.COUNTYNAME || 'Unknown'}<br>
            <strong>Owner:</strong> ${props.DEEDHOLDER || 'Unknown'}<br>
            <strong>Parcel Number:</strong> ${props.PARCELNUMB || 'N/A'}<br>
            <strong>Class:</strong> ${props.PARCELCLAS || 'N/A'}
          `;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map.current!);
        }
      });

      // Make the parcel layer interactive
      map.current!.on('mouseenter', 'parcels-outline', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      
      map.current!.on('mouseleave', 'parcels-outline', () => {
        map.current!.getCanvas().style.cursor = '';
      });
    });

    // Save map position when it moves and reload parcels
    map.current.on('moveend', () => {
      if (map.current) {
        setMapCenter([map.current.getCenter().lng, map.current.getCenter().lat]);
        setMapZoom(map.current.getZoom());
        loadParcels();
      }
    });

    // Handle map clicks for parcel selection and drawing
    map.current.on('click', (e) => {
      if (isDrawing) {
        handleDrawingClick(e);
      } else {
        handleMapClick(e);
      }
    });

    return () => {
      if (map.current) {
        try {
          map.current.remove();
          map.current = null;
        } catch (e) {
          console.log('Map cleanup error:', e);
        }
      }
    };
  }, []);

  // Handle expansion state changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const currentContainer = isExpanded ? expandedMapContainer.current : mapContainer.current;
    
    if (!currentContainer) return;

    // Save current map state
    const currentCenter = map.current.getCenter();
    const currentZoom = map.current.getZoom();
    setMapCenter([currentCenter.lng, currentCenter.lat]);
    setMapZoom(currentZoom);

    // Remove current map
    map.current.remove();
    
    // Recreate map in new container with preserved position
    map.current = new maplibregl.Map({
      container: currentContainer,
      style: mapStyles[mapStyle] as any,
      center: [currentCenter.lng, currentCenter.lat],
      zoom: currentZoom,
      attributionControl: false
    });

    // Add controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // Re-add drawing layers when map is recreated
      if (!map.current?.getSource('drawing-polygon')) {
        map.current!.addSource('drawing-polygon', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        map.current!.addLayer({
          id: 'drawing-points',
          type: 'circle',
          source: 'drawing-polygon',
          paint: {
            'circle-color': '#ff0000',
            'circle-radius': 6,
            'circle-opacity': 0.8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          },
          filter: ['==', '$type', 'Point']
        });

        map.current!.addLayer({
          id: 'drawing-polygon-line',
          type: 'line',
          source: 'drawing-polygon',
          paint: {
            'line-color': '#ff0000',
            'line-width': 3,
            'line-opacity': 0.8
          },
          filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']]
        });

        map.current!.addLayer({
          id: 'drawing-polygon-fill',
          type: 'fill',
          source: 'drawing-polygon',
          paint: {
            'fill-color': '#ff0000',
            'fill-opacity': 0.2
          },
          filter: ['==', '$type', 'Polygon']
        });

        // Restore drawing points if they exist
        if (drawingPoints.length > 0) {
          const features = [];
          
          // Add all points as Point features
          drawingPoints.forEach((point, index) => {
            features.push({
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: point
              },
              properties: { index }
            });
          });

          // Add lines connecting the points
          if (drawingPoints.length > 1) {
            features.push({
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: drawingPoints
              },
              properties: { type: 'line' }
            });
          }

          // If we have 3+ points, show the polygon
          if (drawingPoints.length >= 3) {
            const polygonCoords = [...drawingPoints, drawingPoints[0]]; // Close the polygon
            features.push({
              type: 'Feature' as const,
              geometry: {
                type: 'Polygon' as const,
                coordinates: [polygonCoords]
              },
              properties: { type: 'polygon' }
            });
          }

          const source = map.current?.getSource('drawing-polygon') as maplibregl.GeoJSONSource;
          if (source) {
            source.setData({
              type: 'FeatureCollection',
              features
            });
          }
        }
      }

      // Re-add parcels source when map is recreated
      if (!map.current?.getSource('parcels')) {
        map.current!.addSource('parcels', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        map.current!.addLayer({
          id: 'parcels-outline',
          type: 'line',
          source: 'parcels',
          paint: {
            'line-color': '#0000FF',
            'line-width': 1,
            'line-opacity': 0.8
          }
        });

        // Add parcel interaction handlers
        map.current!.on('click', 'parcels-outline', (e) => {
          if (e.features && e.features.length > 0) {
            const props = e.features[0].properties;
            const html = `
              <strong>Owner:</strong> ${props.DEEDHOLDER || 'Unknown'}<br>
              <strong>Parcel Number:</strong> ${props.PARCELNUMB || 'N/A'}<br>
              <strong>Class:</strong> ${props.PARCELCLAS || 'N/A'}
            `;
            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map.current!);
          }
        });

        map.current!.on('mouseenter', 'parcels-outline', () => {
          map.current!.getCanvas().style.cursor = 'pointer';
        });
        
        map.current!.on('mouseleave', 'parcels-outline', () => {
          map.current!.getCanvas().style.cursor = '';
        });
      }
      
      // Re-add existing markers
      markers.forEach((marker, index) => {
        if (csr2Points[index]) {
          const newMarker = new maplibregl.Marker()
            .setLngLat(csr2Points[index].coordinates)
            .addTo(map.current!);
          markers[index] = newMarker;
        }
      });
    });

    // Save map position when it moves and load parcels
    map.current.on('moveend', () => {
      if (map.current) {
        setMapCenter([map.current.getCenter().lng, map.current.getCenter().lat]);
        setMapZoom(map.current.getZoom());
        loadParcels(); // Load parcels when map moves
      }
    });

    // Handle map clicks for parcel selection and drawing
    map.current.on('click', (e) => {
      console.log('Map clicked, isDrawing:', isDrawing);
      if (isDrawing) {
        handleDrawingClick(e);
      } else {
        handleMapClick(e);
      }
    });
  }, [isExpanded, isDrawing, handleDrawingClick]);

  // Handle CSR2 point changes and trigger callbacks
  useEffect(() => {
    if (csr2Points.length === 0) return;
    
    // Calculate average CSR2 from all points
    const avgCSR2 = csr2Points.reduce((sum, point) => sum + point.csr2, 0) / csr2Points.length;
    const minCSR2 = Math.min(...csr2Points.map(p => p.csr2));
    const maxCSR2 = Math.max(...csr2Points.map(p => p.csr2));
    const lastPoint = csr2Points[csr2Points.length - 1];
    
    const parcelData: ParcelData = {
      wkt: `POINT(${lastPoint.coordinates[0]} ${lastPoint.coordinates[1]})`,
      coordinates: lastPoint.coordinates,
      csr2: {
        mean: Math.round(avgCSR2 * 10) / 10, // Round to 1 decimal
        min: Math.round(minCSR2),
        max: Math.round(maxCSR2),
        count: csr2Points.length
      }
    };

    setSelectedArea(parcelData);
    
    // Use setTimeout to defer callback execution
    setTimeout(() => {
      onParcelSelected?.(parcelData);
      onLocationChange?.(lastPoint.coordinates[1], lastPoint.coordinates[0]);
    }, 0);

    toast({
      title: csr2Points.length === 1 ? "Point Added" : `${csr2Points.length} Points Selected`,
      description: `Average CSR2: ${avgCSR2.toFixed(1)} (${getCSR2Rating(avgCSR2)})`
    });
  }, [csr2Points, onParcelSelected, onLocationChange, toast]);

  // Toggle owner labels visibility - Updated for enhanced system
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    console.log('Toggling owner labels visibility:', showOwnerLabels);
    const visibility = showOwnerLabels ? 'visible' : 'none';
    try {
      // Use the enhanced layer name
      if (map.current.getLayer('parcels-labels')) {
        map.current.setLayoutProperty('parcels-labels', 'visibility', visibility);
        console.log('Successfully set enhanced label visibility to:', visibility);
      } else {
        console.log('Enhanced labels layer not found, initializing...');
        manageOwnerLabels(map.current);
      }
    } catch (error) {
      console.error('Error setting label visibility:', error);
    }
  }, [showOwnerLabels, mapLoaded, manageOwnerLabels]);

  const handleMapClick = async (e: maplibregl.MapMouseEvent) => {
    const { lng, lat } = e.lngLat;
    
    setIsFetchingCSR2(true);
    
    try {
      // Fetch CSR2 data for this point
      const response = await fetch('/api/csr2/point', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          radiusMeters: 500 // 500m radius
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch CSR2 data');
      }

      const data = await response.json();
      
      if (data.success && data.mean > 0) {
        // Add new marker
        const marker = new maplibregl.Marker()
          .setLngLat([lng, lat])
          .addTo(map.current!);
        
        // Add to CSR2 points first
        const newPoint = { coordinates: [lng, lat] as [number, number], csr2: data.mean };
        setCsr2Points(prev => [...prev, newPoint]);
        
        // Add to markers array
        setMarkers(prev => [...prev, marker]);
      }
    } catch (error) {
      console.error('CSR2 fetch error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch soil data for selected area",
        variant: "destructive"
      });
    } finally {
      setIsFetchingCSR2(false);
    }
  };

  // Clear all points function
  const clearAllPoints = () => {
    // Remove all markers
    markers.forEach(marker => marker.remove());
    setMarkers([]);
    setCsr2Points([]);
    setSelectedArea(null);
    
    toast({
      title: "Points Cleared",
      description: "All CSR2 measurement points removed"
    });
  };

  const handleAddressSearch = async () => {
    if (!address.trim()) return;

    setIsGeocoding(true);
    
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() })
      });

      if (!response.ok) {
        throw new Error('Address not found');
      }

      const data = await response.json();
      
      if (data.success && map.current) {
        map.current.flyTo({
          center: [data.longitude, data.latitude],
          zoom: 15,
          duration: 2000
        });

        // Use setTimeout to defer callback execution
        setTimeout(() => {
          onLocationChange?.(data.latitude, data.longitude, address);
        }, 0);

        toast({
          title: "Location Found",
          description: "Map centered on address. Click to select an area."
        });
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast({
        title: "Address Not Found",
        description: "Please check the address and try again",
        variant: "destructive"
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  const toggleMapLayer = () => {
    if (!map.current) return;

    const osmVisibility = map.current.getLayoutProperty('osm', 'visibility');
    
    if (osmVisibility === 'none') {
      // Switch to OSM
      map.current.setLayoutProperty('osm', 'visibility', 'visible');
      map.current.setLayoutProperty('satellite', 'visibility', 'none');
    } else {
      // Switch to satellite
      map.current.setLayoutProperty('osm', 'visibility', 'none');
      map.current.setLayoutProperty('satellite', 'visibility', 'visible');
    }
  };

  const getCSR2Rating = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const getCSR2Color = (score: number): string => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    if (score >= 40) return 'orange';
    return 'red';
  };

  const toggleMapExpansion = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      <div className={`space-y-4 ${className}`}>
        {/* Address Search */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span>Find Location</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex space-x-2">
              <Input
                placeholder="Enter address (e.g., 123 Main St, Ames, IA)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddressSearch()}
              />
              <Button 
                onClick={handleAddressSearch}
                disabled={isGeocoding || !address.trim()}
                size="icon"
              >
                {isGeocoding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <div className="text-slate-600">
                {csr2Points.length === 0 ? (
                  "Click map to add CSR2 measurement points"
                ) : (
                  `${csr2Points.length} CSR2 point${csr2Points.length > 1 ? 's' : ''} selected`
                )}
              </div>
              <div className="flex space-x-2">
                {csr2Points.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllPoints}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear Points
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleMapLayer}
                  disabled={!mapLoaded}
                >
                  <Target className="h-3 w-3 mr-1" />
                  Toggle View
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Map Container - Normal View */}
        {!isExpanded && (
          <div className="relative h-64 sm:h-80 lg:h-96">
            <div 
              ref={mapContainer} 
              className="w-full h-full rounded-lg border border-slate-200 bg-slate-100"
            />
            
            {/* Map Controls - Repositioned to avoid overlap */}
            <div className="absolute top-2 left-2 z-10 flex flex-col space-y-2 max-w-xs">
              {/* First row - Map Style and Polygon Drawing */}
              <div className="flex space-x-2">
                <Button
                  variant="secondary"
                  size="sm" 
                  onClick={toggleMapStyle}
                  className="bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm"
                >
                  {mapStyle === 'street' ? (
                    <>
                      <Satellite className="h-4 w-4 mr-1" />
                      Satellite
                    </>
                  ) : (
                    <>
                      <Map className="h-4 w-4 mr-1" />
                      Street
                    </>
                  )}
                </Button>

                {!isDrawing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsDrawing(true);
                      setDrawingPoints([]);
                      toast({
                        title: "Drawing Mode",
                        description: "Click on the map to draw a polygon. Draw at least 3 points."
                      });
                    }}
                    className="bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm"
                  >
                    <Pentagon className="h-4 w-4 mr-1" />
                    Draw Area
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={finishDrawing}
                      disabled={drawingPoints.length < 3 || isFetchingCSR2}
                      className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                    >
                      {isFetchingCSR2 ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Pentagon className="h-4 w-4 mr-1" />
                          Finish ({drawingPoints.length} pts)
                        </>
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setIsDrawing(false);
                        setDrawingPoints([]);
                        const source = map.current?.getSource('drawing-polygon') as maplibregl.GeoJSONSource;
                        if (source) {
                          source.setData({ type: 'FeatureCollection', features: [] });
                        }
                      }}
                      className="bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {/* Second row - Owner Labels and Expand */}
              <div className="flex space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowOwnerLabels(!showOwnerLabels)}
                  className={`bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm ${
                    showOwnerLabels ? 'bg-blue-50 border-blue-300' : ''
                  }`}
                >
                  <Tag className="h-4 w-4 mr-1" />
                  {showOwnerLabels ? 'Hide' : 'Show'} Owners
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleMapExpansion}
                  className="bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm"
                >
                  <Maximize2 className="h-4 w-4 mr-1" />
                  Expand
                </Button>
              </div>
            </div>
            
            {isFetchingCSR2 && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-lg">
                <div className="bg-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Analyzing soil data...</span>
                </div>
              </div>
            )}
          </div>
        )}




      </div>

      {/* Expanded Map Modal */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full h-full max-w-7xl bg-white rounded-lg shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-slate-600" />
                <h2 className="text-lg font-semibold">Interactive Map View</h2>
                {csr2Points.length > 0 && (
                  <Badge variant="secondary">
                    {csr2Points.length} CSR2 point{csr2Points.length > 1 ? 's' : ''} selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {csr2Points.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllPoints}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear Points
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleMapExpansion}
                >
                  <Minimize2 className="h-4 w-4 mr-1" />
                  Close
                </Button>
              </div>
            </div>

            {/* Address Search in Expanded View */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex space-x-2 max-w-md">
                <Input
                  placeholder="Enter address to navigate..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddressSearch()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleAddressSearch}
                  disabled={isGeocoding || !address.trim()}
                  size="sm"
                >
                  {isGeocoding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-1" />
                      Find
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Click anywhere on the map to add CSR2 measurement points
              </p>
            </div>

            {/* Expanded Map */}
            <div className="flex-1 p-4">
              <div className="relative h-full">
                <div 
                  ref={expandedMapContainer} 
                  className="w-full h-full rounded-lg border border-slate-200 bg-slate-100"
                />
                
                {/* Map Controls for Expanded View */}
                <div className="absolute top-2 left-2 z-10 flex space-x-2">
                  <Button
                    variant="secondary"
                    size="sm" 
                    onClick={toggleMapStyle}
                    className="bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm"
                  >
                    {mapStyle === 'street' ? (
                      <>
                        <Satellite className="h-4 w-4 mr-1" />
                        Satellite
                      </>
                    ) : (
                      <>
                        <Map className="h-4 w-4 mr-1" />
                        Street
                      </>
                    )}
                  </Button>

                  {/* Owner Labels Toggle Button */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowOwnerLabels(!showOwnerLabels)}
                    className={`bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm ${
                      showOwnerLabels ? 'bg-blue-50 border-blue-300' : ''
                    }`}
                  >
                    <Tag className="h-4 w-4 mr-1" />
                    {showOwnerLabels ? 'Hide' : 'Show'} Owners
                  </Button>
                  {!isDrawing ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setIsDrawing(true);
                        setDrawingPoints([]);
                        toast({
                          title: "Drawing Mode",
                          description: "Click on the map to draw a polygon. Use the Finish Drawing button when done."
                        });
                      }}
                      className="bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm"
                    >
                      <Pentagon className="h-4 w-4 mr-1" />
                      Draw Area
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={finishDrawing}
                        disabled={drawingPoints.length < 3 || isFetchingCSR2}
                        className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                      >
                        {isFetchingCSR2 ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Pentagon className="h-4 w-4 mr-1" />
                            Finish Drawing ({drawingPoints.length} pts)
                          </>
                        )}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setIsDrawing(false);
                          setDrawingPoints([]);
                          const source = map.current?.getSource('drawing-polygon') as maplibregl.GeoJSONSource;
                          if (source) {
                            source.setData({ type: 'FeatureCollection', features: [] });
                          }
                        }}
                        className="bg-white/90 backdrop-blur-sm border border-slate-200 hover:bg-white/95 shadow-sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                
                {isFetchingCSR2 && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center rounded-lg">
                    <div className="bg-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Analyzing soil data...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>


          </div>
        </div>
      )}
    </>
  );
}