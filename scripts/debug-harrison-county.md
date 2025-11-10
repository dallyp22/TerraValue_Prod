# Harrison County Deep Dive Debug Report

## Problem
Harrison County parcels are showing as individual green parcels instead of aggregated larger parcels.

## Current Configuration (from code)

### Source Definition:
```javascript
'harrison-parcels': {
  type: 'vector',
  tiles: [
    'https://api.mapbox.com/v4/dpolivka22.98m684w2/{z}/{x}/{y}.vector.pbf?access_token=...'
  ],
  minzoom: 0,
  maxzoom: 16
}
```

### Layers Using This Source:
1. `harrison-parcels-fill` - source-layer: `harrison_county_all_parcels_o-7g2t48`
2. `harrison-parcels-outline` - source-layer: `harrison_county_all_parcels_o-7g2t48`
3. `harrison-parcels-labels` - source-layer: `harrison_county_all_parcels_o-7g2t48`
4. `harrison-parcels-selected` - source-layer: `harrison_county_all_parcels_o-7g2t48`

### Layer Visibility Logic:
- When `isInHarrisonCounty()` returns true:
  - Show Harrison layers
  - Hide all self-hosted parcel layers
  - Hide ownership layers
  - Clear GeoJSON parcel source

## What Could Be Wrong

### Theory 1: Harrison Layers Not Showing
**Check:** Are layers set to 'none' visibility?
**Status:** Should be 'visible' when in Harrison County

### Theory 2: Wrong Parcels Showing
**Check:** Are we seeing:
- Self-hosted parcels (blue/green from database)?
- ArcGIS parcels (green from FeatureServer)?
- Harrison parcels (should be from Mapbox tileset)?

**Current screenshot shows:** GREEN individual parcels = likely ArcGIS or self-hosted, NOT Harrison tileset

### Theory 3: Source-Layer Mismatch
**Expected:** `harrison_county_all_parcels_o-7g2t48`
**From Mapbox Style JSON:** Confirmed this is correct
**Issue:** None - this matches

### Theory 4: isInHarrisonCounty() Not Detecting Location
**Bounds:**
```javascript
west: -96.137, east: -95.498
south: 41.506, north: 41.866
```

**Woodbine coordinates:** -95.7159, 41.7407
**Should detect:** YES (within bounds)

### Theory 5: Layer Rendering Order
**Issue:** Harrison layers might be behind other layers
**Check order:**
1. Base layers (satellite, OSM)
2. Parcel layers (which comes first?)
3. Harrison layers (might be underneath?)

### Theory 6: useSelfHostedParcels Conflict
**Current setting:** `useSelfHostedParcels={true}`
**Impact:** Self-hosted tiles load for ALL counties
**Fix needed:** Need to explicitly NOT load self-hosted tiles when in Harrison County

## Likely Root Cause

**HYPOTHESIS:** The self-hosted parcel vector tiles are loading from the database BEFORE the Harrison County check happens.

**Evidence:**
- Screenshot shows regular green parcels
- Not blue (would be ownership layer)
- Not showing as aggregated
- Individual parcel boundaries visible

**The issue:** When `useSelfHostedParcels={true}`, the vector tile source is created for all of Iowa, and MapLibre loads tiles automatically - it doesn't wait for the `isInHarrisonCounty()` check.

## Solution Needed

The `isInHarrisonCounty()` function controls LAYER visibility, but the TILES are already loaded by the vector source. We need to either:

1. **Filter tiles at source level** - Add a filter to exclude Harrison County from self-hosted tiles
2. **Use different sources** - Create separate sources for Harrison vs non-Harrison
3. **Disable self-hosted in Harrison** - More aggressive hiding of self-hosted layers

## Recommended Fix

Add a filter to the self-hosted parcel layers to exclude Harrison County coordinates:

```javascript
// In parcel-fill and parcel-outline layers
filter: [
  'all',
  ['!=', ['get', 'county'], 'HARRISON'],  // Exclude Harrison County
  ...existing filters
]
```

OR better: Don't create self-hosted parcel layers at all - just let Harrison tileset handle everything in that county.

