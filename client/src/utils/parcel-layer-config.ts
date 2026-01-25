/**
 * Parcel layer configuration
 * Static configuration for all parcel layer groups
 */

import type { ParcelLayerGroup } from '@/types/parcel-display';

/**
 * Harrison County, Iowa bounds
 * Used to detect when the map view is within Harrison County
 */
export const HARRISON_COUNTY_BOUNDS = {
  west: -96.137,
  east: -95.498,
  south: 41.506,
  north: 42.081,
} as const;

/**
 * ArcGIS parcel layer group (green parcels from Iowa Parcels 2017)
 * Uses GeoJSON source loaded on demand
 */
export const ARCGIS_LAYER_GROUP: ParcelLayerGroup = {
  id: 'arcgis',
  layers: {
    fill: 'parcels-fill',
    outline: 'parcels-outline',
    labels: 'parcels-labels',
  },
  source: 'parcels',
};

/**
 * Self-hosted ownership layer group (blue aggregated parcels)
 * Uses vector tiles from self-hosted tile server
 */
export const SELF_HOSTED_LAYER_GROUP: ParcelLayerGroup = {
  id: 'selfHosted',
  layers: {
    fill: 'ownership-fill',
    outline: 'ownership-outline',
    labels: 'ownership-labels',
    selected: 'ownership-selected',
  },
  source: 'parcels-vector',
  sourceLayer: 'ownership',
};

/**
 * Harrison County parcel layer group (green parcels, overlays other layers)
 * Uses Mapbox-hosted vector tiles
 */
export const HARRISON_LAYER_GROUP: ParcelLayerGroup = {
  id: 'harrison',
  layers: {
    fill: 'harrison-parcels-fill',
    outline: 'harrison-parcels-outline',
    labels: 'harrison-parcels-labels',
    selected: 'harrison-parcels-selected',
  },
  source: 'harrison-parcels',
  sourceLayer: 'harrison_county_all_parcels_o-7g2t48',
};

/**
 * All layer IDs for each group
 */
export const ALL_ARCGIS_LAYERS = [
  ARCGIS_LAYER_GROUP.layers.fill,
  ARCGIS_LAYER_GROUP.layers.outline,
  ARCGIS_LAYER_GROUP.layers.labels,
];

export const ALL_SELF_HOSTED_LAYERS = [
  SELF_HOSTED_LAYER_GROUP.layers.fill,
  SELF_HOSTED_LAYER_GROUP.layers.outline,
  SELF_HOSTED_LAYER_GROUP.layers.labels,
  SELF_HOSTED_LAYER_GROUP.layers.selected!,
];

export const ALL_HARRISON_LAYERS = [
  HARRISON_LAYER_GROUP.layers.fill,
  HARRISON_LAYER_GROUP.layers.outline,
  HARRISON_LAYER_GROUP.layers.labels,
  HARRISON_LAYER_GROUP.layers.selected!,
];

/**
 * All parcel layers combined (for bulk operations)
 */
export const ALL_PARCEL_LAYERS = [
  ...ALL_ARCGIS_LAYERS,
  ...ALL_SELF_HOSTED_LAYERS,
  ...ALL_HARRISON_LAYERS,
];
