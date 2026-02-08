import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FarmPin, PinCategory, PortfolioData } from '@/types/portfolio';
import { PIN_CATEGORIES } from '@/types/portfolio';
import * as turf from '@turf/turf';

const STORAGE_KEY = 'farmscope-portfolio';
const EVENT_KEY = 'farmscope-portfolio-changed';

function loadPortfolio(): FarmPin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: PortfolioData = JSON.parse(raw);

    // v1 → v2 migration: add type: 'pin' to existing items
    if (!data.version || data.version === 1) {
      const migrated = (data.pins || []).map(p => ({
        ...p,
        type: p.type || 'pin' as const,
      }));
      const v2Data: PortfolioData = { pins: migrated, version: 2 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v2Data));
      return migrated;
    }

    return data.pins || [];
  } catch {
    return [];
  }
}

function savePortfolio(pins: FarmPin[]) {
  const data: PortfolioData = { pins, version: 2 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(EVENT_KEY));
}

function generateId(): string {
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function usePortfolio() {
  const [pins, setPins] = useState<FarmPin[]>(loadPortfolio);

  // Cross-tab and same-tab sync
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setPins(loadPortfolio());
      }
    };
    const handleCustom = () => {
      setPins(loadPortfolio());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_KEY, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_KEY, handleCustom);
    };
  }, []);

  const addPin = useCallback((lng: number, lat: number, category: PinCategory, name = '') => {
    const now = new Date().toISOString();
    const pin: FarmPin = {
      id: generateId(),
      lng,
      lat,
      category,
      name: name || `Pin at ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      notes: '',
      createdAt: now,
      updatedAt: now,
      type: 'pin',
    };
    const current = loadPortfolio();
    const updated = [...current, pin];
    savePortfolio(updated);
    setPins(updated);
    return pin;
  }, []);

  const addParcel = useCallback((parcelData: {
    lng: number;
    lat: number;
    geometry: GeoJSON.Polygon;
    acres: number;
    parcelNumber: string;
    county: string;
    ownerName: string;
  }, category: PinCategory) => {
    const now = new Date().toISOString();
    const pin: FarmPin = {
      id: generateId(),
      lng: parcelData.lng,
      lat: parcelData.lat,
      category,
      name: parcelData.ownerName !== 'Unknown' ? parcelData.ownerName : `Parcel ${parcelData.parcelNumber}`,
      notes: '',
      createdAt: now,
      updatedAt: now,
      type: 'parcel',
      geometry: parcelData.geometry,
      acres: parcelData.acres,
      parcelNumber: parcelData.parcelNumber,
      county: parcelData.county,
      ownerName: parcelData.ownerName,
    };
    const current = loadPortfolio();
    const updated = [...current, pin];
    savePortfolio(updated);
    setPins(updated);
    return pin;
  }, []);

  const addDrawnPolygon = useCallback((polygonData: {
    geometry: GeoJSON.Polygon;
    acres: number;
  }, category: PinCategory) => {
    const now = new Date().toISOString();
    const centroid = turf.centroid({ type: 'Feature', geometry: polygonData.geometry, properties: {} });
    const [lng, lat] = centroid.geometry.coordinates;
    const pin: FarmPin = {
      id: generateId(),
      lng,
      lat,
      category,
      name: `Drawn area (${polygonData.acres.toFixed(1)} ac)`,
      notes: '',
      createdAt: now,
      updatedAt: now,
      type: 'drawn',
      geometry: polygonData.geometry,
      acres: polygonData.acres,
    };
    const current = loadPortfolio();
    const updated = [...current, pin];
    savePortfolio(updated);
    setPins(updated);
    return pin;
  }, []);

  const updatePin = useCallback((id: string, updates: Partial<Pick<FarmPin, 'name' | 'notes' | 'category'>>) => {
    const current = loadPortfolio();
    const updated = current.map(p =>
      p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    );
    savePortfolio(updated);
    setPins(updated);
  }, []);

  const deletePin = useCallback((id: string) => {
    const current = loadPortfolio();
    const updated = current.filter(p => p.id !== id);
    savePortfolio(updated);
    setPins(updated);
  }, []);

  const pinsGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: pins.map(pin => {
        const catConfig = PIN_CATEGORIES.find(c => c.id === pin.category);
        const isPolygon = (pin.type === 'parcel' || pin.type === 'drawn') && pin.geometry;

        return {
          type: 'Feature' as const,
          geometry: isPolygon
            ? pin.geometry!
            : {
                type: 'Point' as const,
                coordinates: [pin.lng, pin.lat],
              },
          properties: {
            id: pin.id,
            name: pin.name,
            category: pin.category,
            color: catConfig?.color || '#3b82f6',
            notes: pin.notes,
            itemType: pin.type || 'pin',
            acres: pin.acres,
          },
        };
      }),
    };
  }, [pins]);

  const pinsByCategory = useMemo(() => {
    const grouped: Record<PinCategory, FarmPin[]> = {
      'high-priority': [],
      interested: [],
      watching: [],
      purchased: [],
      passed: [],
    };
    pins.forEach(pin => {
      grouped[pin.category].push(pin);
    });
    return grouped;
  }, [pins]);

  return {
    pins,
    addPin,
    addParcel,
    addDrawnPolygon,
    updatePin,
    deletePin,
    pinsGeoJSON,
    pinsByCategory,
  };
}
