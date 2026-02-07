import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FarmPin, PinCategory, PortfolioData } from '@/types/portfolio';
import { PIN_CATEGORIES } from '@/types/portfolio';

const STORAGE_KEY = 'farmscope-portfolio';
const EVENT_KEY = 'farmscope-portfolio-changed';

function loadPortfolio(): FarmPin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: PortfolioData = JSON.parse(raw);
    return data.pins || [];
  } catch {
    return [];
  }
}

function savePortfolio(pins: FarmPin[]) {
  const data: PortfolioData = { pins, version: 1 };
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
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [pin.lng, pin.lat],
          },
          properties: {
            id: pin.id,
            name: pin.name,
            category: pin.category,
            color: catConfig?.color || '#3b82f6',
            notes: pin.notes,
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
    updatePin,
    deletePin,
    pinsGeoJSON,
    pinsByCategory,
  };
}
