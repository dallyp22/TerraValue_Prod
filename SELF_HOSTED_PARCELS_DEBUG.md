# Self-Hosted Parcels Debug Guide

## Problem
Ownership layers set to "visible" but blue parcels not showing in POLK County.

## What We Know Works
- ✅ Database has 639,245 clusters (created Nov 9, 2025)
- ✅ POLK has 37,729 clusters including 571-parcel "STREET" cluster
- ✅ Tiles generating correctly (54KB test file)
- ✅ API endpoint `/api/parcels/tiles/{z}/{x}/{y}.mvt` returns data
- ✅ Layers set to "visible" in console logs
- ✅ Worked at 10am today (user confirmed)

## Current Configuration

### Sources:
- `parcels-vector` - Vector tiles from `/api/parcels/tiles/` 
- `parcels` - GeoJSON from ArcGIS

### Layers:
- `ownership-fill` - source: parcels-vector, source-layer: ownership
- `ownership-outline` - source: parcels-vector, source-layer: ownership
- `ownership-labels` - source: parcels-vector, source-layer: ownership

## Debugging Steps

### 1. Check in Browser Console:
```javascript
// Check if source exists
map.getSource('parcels-vector')

// Check if layers exist
map.getStyle().layers.filter(l => l.id.includes('ownership'))

// Check layer visibility
map.getLayoutProperty('ownership-fill', 'visibility')

// Enable tile boundaries to see if tiles are loading
map.showTileBoundaries = true

// Check if tiles are being requested
// Look in Network tab for requests to /api/parcels/tiles/
```

### 2. Possible Issues:

**Issue A: Layers Created Before Source**
If layers created before parcels-vector source exists, they won't work.
Solution: Ensure parcels-vector created first.

**Issue B: Layer Rendering Order**
Ownership layers might be behind ArcGIS layers.
Solution: Add ownership layers AFTER ArcGIS layers or use beforeId.

**Issue C: Tiles Not Loading**
Source exists but not requesting tiles.
Solution: Check Network tab, verify tile requests happening.

**Issue D: Source-Layer Name Wrong**
'ownership' might not match what tiles provide.
Solution: Test tile content, verify source-layer exists.

## Quick Fix to Test

Try recreating the ownership layers when toggle changes:

```javascript
// In useEffect for useSelfHostedParcels
if (useSelfHostedParcels) {
  // Remove and readd layers to ensure they connect to source
  if (map.current.getLayer('ownership-fill')) {
    map.current.removeLayer('ownership-fill');
  }
  // Recreate layer...
}
```

## What Changed Since 10am?

Between working state and now:
1. Multiple Harrison County fixes
2. Added/removed ownership layers several times
3. Changed source names
4. Added debugging

Likely broke during one of these changes.

## Recommendation

Simplest fix: Ensure ownership layers are created AFTER parcels-vector source, with proper initialization order.

