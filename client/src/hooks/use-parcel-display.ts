/**
 * useParcelDisplay Hook
 *
 * Unified hook for managing parcel layer visibility across all display modes.
 * Eliminates race conditions by consolidating 6 separate useEffects into 2.
 *
 * Features:
 * - Single source of truth for parcel visibility state
 * - Atomic layer updates (all layers update together)
 * - Harrison County detection with moveend listener
 * - No stale closure issues (uses refs)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ParcelDisplayMode } from '@/types/parcel-display';
import {
  applyAllVisibilities,
  checkIsInHarrisonCounty,
} from '@/utils/parcel-layer-visibility';

export interface UseParcelDisplayOptions {
  map: maplibregl.Map | null;
  mode: ParcelDisplayMode;
  showLabels: boolean;
  selectedParcelId: string | null;
  onLoadArcGISParcels: () => void;
}

export interface UseParcelDisplayReturn {
  isInHarrisonCounty: boolean;
  updateVisibility: () => void;
}

/**
 * Debounce helper
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Hook for managing parcel display layer visibility
 */
export function useParcelDisplay({
  map,
  mode,
  showLabels,
  selectedParcelId,
  onLoadArcGISParcels,
}: UseParcelDisplayOptions): UseParcelDisplayReturn {
  // Track Harrison County state
  const [isInHarrisonCounty, setIsInHarrisonCounty] = useState(false);

  // Refs to avoid stale closures in event handlers
  const stateRef = useRef({
    mode,
    showLabels,
    selectedParcelId,
    isInHarrisonCounty: false,
  });

  // Keep refs in sync with props
  useEffect(() => {
    stateRef.current = {
      mode,
      showLabels,
      selectedParcelId,
      isInHarrisonCounty: stateRef.current.isInHarrisonCounty,
    };
  }, [mode, showLabels, selectedParcelId]);

  /**
   * Update all layer visibilities based on current state
   */
  const updateVisibility = useCallback(() => {
    if (!map || !map.isStyleLoaded()) return;

    const { mode, showLabels, selectedParcelId, isInHarrisonCounty } = stateRef.current;

    applyAllVisibilities(
      map,
      mode,
      isInHarrisonCounty,
      showLabels,
      !!selectedParcelId
    );
  }, [map]);

  /**
   * Main effect: Handle mode/label/selection changes
   */
  useEffect(() => {
    if (!map) return;

    // Wait for style to load before manipulating layers
    if (!map.isStyleLoaded()) {
      const onStyleLoad = () => {
        updateVisibility();
        map.off('styledata', onStyleLoad);
      };
      map.on('styledata', onStyleLoad);
      return;
    }

    // Update visibility
    updateVisibility();

    // Load ArcGIS parcels when mode switches to arcgis
    if (mode === 'arcgis') {
      onLoadArcGISParcels();
    }
  }, [map, mode, showLabels, selectedParcelId, updateVisibility, onLoadArcGISParcels]);

  /**
   * Moveend effect: Handle location-based Harrison County detection
   */
  useEffect(() => {
    if (!map) return;

    // Check if currently in Harrison County
    const checkHarrison = () => {
      const center = map.getCenter();
      const inHarrison = checkIsInHarrisonCounty({ lng: center.lng, lat: center.lat });

      // Only update if changed
      if (inHarrison !== stateRef.current.isInHarrisonCounty) {
        stateRef.current.isInHarrisonCounty = inHarrison;
        setIsInHarrisonCounty(inHarrison);
        updateVisibility();
      }
    };

    // Debounced moveend handler
    const handleMoveEnd = debounce(() => {
      checkHarrison();
    }, 100);

    // Initial check
    if (map.isStyleLoaded()) {
      checkHarrison();
    } else {
      map.once('load', checkHarrison);
    }

    // Listen for map movements
    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, updateVisibility]);

  return {
    isInHarrisonCounty,
    updateVisibility,
  };
}
