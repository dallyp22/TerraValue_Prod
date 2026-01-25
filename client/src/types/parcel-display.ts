/**
 * Parcel display system types
 * Unified type definitions for parcel layer management
 */

/** Parcel display mode - controls which parcel layers are visible */
export type ParcelDisplayMode = 'off' | 'arcgis' | 'self-hosted';

/** Visibility state for MapLibre layers */
export type LayerVisibility = 'visible' | 'none';

/** Visibility state for a layer group */
export interface LayerGroupVisibility {
  shapes: LayerVisibility;
  labels: LayerVisibility;
  selected?: LayerVisibility;
}

/** Configuration for a parcel layer group */
export interface ParcelLayerGroup {
  id: string;
  layers: {
    fill: string;
    outline: string;
    labels: string;
    selected?: string;
  };
  source: string;
  sourceLayer?: string;
}

/** Visibility state for all layer groups */
export interface AllGroupVisibilities {
  arcgis: LayerGroupVisibility;
  selfHosted: LayerGroupVisibility;
  harrison: LayerGroupVisibility;
}

/** Options for the useParcelDisplay hook */
export interface UseParcelDisplayOptions {
  map: maplibregl.Map | null;
  mode: ParcelDisplayMode;
  showLabels: boolean;
  selectedParcelId: string | null;
  onLoadArcGISParcels: () => void;
}

/** Return type for the useParcelDisplay hook */
export interface UseParcelDisplayReturn {
  isInHarrisonCounty: boolean;
  updateVisibility: () => void;
}
