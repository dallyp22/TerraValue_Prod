/**
 * Parcel layer visibility utilities
 * Pure functions for computing and applying layer visibility
 */

import type maplibregl from 'maplibre-gl';
import type {
  ParcelDisplayMode,
  LayerVisibility,
  AllGroupVisibilities,
} from '@/types/parcel-display';
import {
  ALL_ARCGIS_LAYERS,
  ALL_SELF_HOSTED_LAYERS,
  ALL_HARRISON_LAYERS,
  ARCGIS_LAYER_GROUP,
  SELF_HOSTED_LAYER_GROUP,
  HARRISON_LAYER_GROUP,
} from './parcel-layer-config';

/**
 * Pure function to compute visibility state for all layer groups
 *
 * @param mode - Current parcel display mode
 * @param inHarrison - Whether the map center is within Harrison County
 * @param showLabels - Whether owner labels should be shown
 * @param hasSelection - Whether a parcel is currently selected
 * @returns Visibility state for all layer groups
 */
export function computeGroupVisibilities(
  mode: ParcelDisplayMode,
  inHarrison: boolean,
  showLabels: boolean,
  hasSelection: boolean
): AllGroupVisibilities {
  // Off mode - hide all layers
  if (mode === 'off') {
    return {
      arcgis: { shapes: 'none', labels: 'none' },
      selfHosted: { shapes: 'none', labels: 'none', selected: 'none' },
      harrison: { shapes: 'none', labels: 'none', selected: 'none' },
    };
  }

  // ArcGIS mode
  if (mode === 'arcgis') {
    return {
      arcgis: {
        shapes: 'visible',
        labels: showLabels ? 'visible' : 'none',
      },
      selfHosted: {
        shapes: 'none',
        labels: 'none',
        selected: 'none',
      },
      harrison: {
        shapes: inHarrison ? 'visible' : 'none',
        labels: inHarrison && showLabels ? 'visible' : 'none',
        selected: inHarrison ? 'visible' : 'none',
      },
    };
  }

  // Self-hosted/Aggregated mode
  return {
    arcgis: {
      shapes: 'none',
      labels: 'none',
    },
    selfHosted: {
      shapes: 'visible',
      labels: showLabels ? 'visible' : 'none',
      selected: hasSelection ? 'visible' : 'none',
    },
    harrison: {
      shapes: inHarrison ? 'visible' : 'none',
      labels: inHarrison && showLabels ? 'visible' : 'none',
      selected: inHarrison ? 'visible' : 'none',
    },
  };
}

/**
 * Set visibility for a single layer
 */
function setLayerVisibility(
  map: maplibregl.Map,
  layerId: string,
  visibility: LayerVisibility
): void {
  const layer = map.getLayer(layerId);
  if (layer) {
    map.setLayoutProperty(layerId, 'visibility', visibility);
  }
}

/**
 * Apply visibility state for the ArcGIS layer group
 */
function applyArcGISVisibility(
  map: maplibregl.Map,
  visibility: AllGroupVisibilities['arcgis']
): void {
  setLayerVisibility(map, ARCGIS_LAYER_GROUP.layers.fill, visibility.shapes);
  setLayerVisibility(map, ARCGIS_LAYER_GROUP.layers.outline, visibility.shapes);
  setLayerVisibility(map, ARCGIS_LAYER_GROUP.layers.labels, visibility.labels);
}

/**
 * Apply visibility state for the self-hosted layer group
 */
function applySelfHostedVisibility(
  map: maplibregl.Map,
  visibility: AllGroupVisibilities['selfHosted']
): void {
  setLayerVisibility(map, SELF_HOSTED_LAYER_GROUP.layers.fill, visibility.shapes);
  setLayerVisibility(map, SELF_HOSTED_LAYER_GROUP.layers.outline, visibility.shapes);
  setLayerVisibility(map, SELF_HOSTED_LAYER_GROUP.layers.labels, visibility.labels);
  setLayerVisibility(map, SELF_HOSTED_LAYER_GROUP.layers.selected!, visibility.selected || 'none');
}

/**
 * Apply visibility state for the Harrison County layer group
 */
function applyHarrisonVisibility(
  map: maplibregl.Map,
  visibility: AllGroupVisibilities['harrison']
): void {
  setLayerVisibility(map, HARRISON_LAYER_GROUP.layers.fill, visibility.shapes);
  setLayerVisibility(map, HARRISON_LAYER_GROUP.layers.outline, visibility.shapes);
  setLayerVisibility(map, HARRISON_LAYER_GROUP.layers.labels, visibility.labels);
  setLayerVisibility(map, HARRISON_LAYER_GROUP.layers.selected!, visibility.selected || 'none');
}

/**
 * Apply all visibility states atomically to the map
 *
 * @param map - MapLibre map instance
 * @param mode - Current parcel display mode
 * @param inHarrison - Whether the map center is within Harrison County
 * @param showLabels - Whether owner labels should be shown
 * @param hasSelection - Whether a parcel is currently selected
 */
export function applyAllVisibilities(
  map: maplibregl.Map,
  mode: ParcelDisplayMode,
  inHarrison: boolean,
  showLabels: boolean,
  hasSelection: boolean
): void {
  const visibilities = computeGroupVisibilities(mode, inHarrison, showLabels, hasSelection);

  // Log the visibility change
  console.log(
    `Parcel Mode: ${mode} | Harrison: ${inHarrison} | Labels: ${showLabels} | Selection: ${hasSelection}`
  );

  // Apply all visibilities
  applyArcGISVisibility(map, visibilities.arcgis);
  applySelfHostedVisibility(map, visibilities.selfHosted);
  applyHarrisonVisibility(map, visibilities.harrison);
}

/**
 * Check if the map center is within Harrison County bounds
 */
export function checkIsInHarrisonCounty(center: { lng: number; lat: number }): boolean {
  // Harrison County, Iowa bounds
  const bounds = {
    west: -96.137,
    east: -95.498,
    south: 41.506,
    north: 42.081,
  };

  return (
    center.lng >= bounds.west &&
    center.lng <= bounds.east &&
    center.lat >= bounds.south &&
    center.lat <= bounds.north
  );
}
