import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function TestParcels() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [tileUrl, setTileUrl] = useState<string>('');

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const apiUrl = 'http://localhost:5001';
    const tileTemplate = `${apiUrl}/api/parcels/tiles/{z}/{x}/{y}.mvt`;
    setTileUrl(tileTemplate);

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
          'parcels': {
            type: 'vector',
            tiles: [tileTemplate],
            minzoom: 10,
            maxzoom: 18
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm'
          },
          {
            id: 'parcels-fill',
            type: 'fill',
            source: 'parcels',
            'source-layer': 'parcels',
            paint: {
              'fill-color': '#10b981',
              'fill-opacity': 0.3
            },
            minzoom: 14
          },
          {
            id: 'parcels-outline',
            type: 'line',
            source: 'parcels',
            'source-layer': 'parcels',
            paint: {
              'line-color': '#059669',
              'line-width': 2
            },
            minzoom: 14
          },
          {
            id: 'ownership-fill',
            type: 'fill',
            source: 'parcels',
            'source-layer': 'ownership',
            paint: {
              'fill-color': '#3b82f6',
              'fill-opacity': 0.3
            },
            maxzoom: 14
          }
        ]
      },
      center: [-93.6, 41.6], // Des Moines, IA
      zoom: 14
    });

    map.current.on('load', () => {
      setStatus('Map loaded - Vector tiles should appear if working');
    });

    map.current.on('error', (e) => {
      console.error('Map error:', e);
      setStatus(`Error: ${e.error?.message || 'Unknown error'}`);
    });

    map.current.on('sourcedata', (e) => {
      if (e.sourceId === 'parcels' && e.isSourceLoaded) {
        console.log('Parcels source loaded successfully');
        setStatus('✅ Parcel tiles are loading!');
      }
    });

  }, []);

  const testTileUrl = () => {
    const testUrl = 'http://localhost:5001/api/parcels/tiles/14/3932/6106.mvt';
    fetch(testUrl)
      .then(r => {
        setStatus(`Test tile response: ${r.status} (${r.headers.get('content-length')} bytes)`);
      })
      .catch(e => {
        setStatus(`Test tile error: ${e.message}`);
      });
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="p-4 bg-gray-100 border-b">
        <h1 className="text-2xl font-bold mb-2">Parcel Vector Tile Test</h1>
        <div className="space-y-2">
          <div>Status: <span className="font-mono">{status}</span></div>
          <div className="text-sm">Tile URL: <code className="bg-gray-200 p-1 rounded">{tileUrl}</code></div>
          <button 
            onClick={testTileUrl}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Test Tile Fetch
          </button>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          <p>• Green = Individual parcels (zoom 14+)</p>
          <p>• Blue = Ownership groups (zoom &lt; 14)</p>
          <p>• Center: Des Moines, Iowa</p>
        </div>
      </div>
      <div ref={mapContainer} className="flex-1" />
    </div>
  );
}

