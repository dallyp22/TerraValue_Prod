import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function TestHarrisonTileset() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState<string>('Loading...');
  const [layers, setLayers] = useState<string[]>([]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const MAPBOX_KEY = import.meta.env.VITE_MAPBOX_PUBLIC_KEY || '';
    
    setStatus('Initializing map...');

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256
          },
          'harrison-test': {
            type: 'vector',
            tiles: [
              `https://api.mapbox.com/v4/dpolivka22.98m684w2/{z}/{x}/{y}.vector.pbf?access_token=${MAPBOX_KEY}`
            ],
            minzoom: 12,
            maxzoom: 16
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm'
          },
          {
            id: 'harrison-fill',
            type: 'fill',
            source: 'harrison-test',
            'source-layer': 'harrison_county_all_parcels_o-7g2t48',
            paint: {
              'fill-color': '#ff0000',
              'fill-opacity': 0.4
            }
          },
          {
            id: 'harrison-outline',
            type: 'line',
            source: 'harrison-test',
            'source-layer': 'harrison_county_all_parcels_o-7g2t48',
            paint: {
              'line-color': '#ff0000',
              'line-width': 2
            }
          }
        ]
      },
      center: [-95.7159, 41.7407], // Woodbine, Iowa
      zoom: 13 // Zoom 13 (within the 12-16 range)
    });

    map.current.on('load', () => {
      setStatus('✅ Map loaded - Harrison tileset should appear in RED');
      
      // List all layers
      const allLayers = map.current!.getStyle().layers.map(l => l.id);
      setLayers(allLayers);
    });

    map.current.on('error', (e) => {
      console.error('Map error:', e);
      setStatus(`❌ Error: ${e.error?.message || 'Unknown error'}`);
    });

    map.current.on('sourcedata', (e) => {
      if (e.sourceId === 'harrison-test') {
        console.log('Harrison tileset event:', e);
        if (e.isSourceLoaded) {
          setStatus('✅ Harrison tileset loaded successfully!');
        }
      }
    });

    map.current.on('data', (e) => {
      if (e.sourceId === 'harrison-test' && e.source && e.tile) {
        console.log('Harrison tile loaded:', e.tile.tileID);
      }
    });

  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="p-4 bg-gray-100 border-b">
        <h1 className="text-2xl font-bold mb-2">Harrison County Tileset Test</h1>
        <div className="space-y-2">
          <div>Status: <span className="font-mono font-bold">{status}</span></div>
          <div className="text-sm space-y-1">
            <p><strong>Tileset ID:</strong> dpolivka22.98m684w2</p>
            <p><strong>Source-layer:</strong> harrison_county_all_parcels_o-7g2t48</p>
            <p><strong>Zoom range:</strong> 12-16 (tileset limitation)</p>
            <p><strong>Location:</strong> Woodbine, Iowa (Harrison County)</p>
            <p><strong>Current zoom:</strong> 13</p>
          </div>
          {layers.length > 0 && (
            <div className="text-xs mt-2">
              <strong>Layers:</strong> {layers.join(', ')}
            </div>
          )}
        </div>
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm font-semibold text-yellow-900">Expected Result:</p>
          <p className="text-xs text-yellow-800">You should see RED parcels if the tileset is loading correctly.</p>
          <p className="text-xs text-yellow-800 mt-1">If you see nothing or errors, the tileset access/configuration is wrong.</p>
        </div>
      </div>
      <div ref={mapContainer} className="flex-1" />
    </div>
  );
}

