# Testing Aggregated Parcels - Quick Guide
**Date**: November 13, 2025

---

## Critical Fix Applied

**Removed duplicate `ownership-labels` layer** that was:
- Using wrong source ('parcels' GeoJSON instead of 'parcels-vector' tiles)
- Limited to maxzoom: 14 (hiding above zoom 14)
- Conflicting with correct layer

This was causing parcels to appear briefly then disappear!

---

## What to Look For When Testing

### 1. Open Browser Console (F12 or Cmd+Option+I)

You should see this when the page loads:

```
🔵 Map load complete - Initial toggle state: {
  useSelfHostedParcels: true,
  showOwnerLabels: false,
  zoom: 7,
  harrison: false
}
🔵 Initial load: Showing aggregated parcels (toggle is ON)
   ✅ Vector tile source "parcels-vector" found
   ✅ Set ownership-fill to visible
   ✅ Set ownership-outline to visible
```

### 2. Check Network Tab

Look for requests to:
```
/api/parcels/tiles/10/247/394.mvt
/api/parcels/tiles/11/495/788.mvt
...
```

These should return `200 OK` with protobuf data (application/x-protobuf).

### 3. Visual Check

**You should see:**
- Blue polygons across Iowa (not Harrison County)
- Each polygon = group of adjacent parcels with same owner
- Visible at ALL zoom levels
- Clicking shows popup with owner, parcel count, acres, county

**You should NOT see:**
- Parcels appearing then disappearing
- Blank map
- Only Harrison County parcels (red)

---

## If Parcels Still Don't Show

### Check 1: Verify Toggle State
Open Left Sidebar → Map Overlays
- Is "Aggregated Parcels (Self-Hosted)" checked? ✅
- Default should be ON

### Check 2: Check Console for Errors

**Bad signs:**
```
❌ Vector tile source "parcels-vector" NOT FOUND!
❌ Layer ownership-fill not found!
```

**Good signs:**
```
✅ Vector tile source "parcels-vector" found
✅ Set ownership-fill to visible
```

### Check 3: Verify API is Running

Test the tile endpoint directly:
```
http://localhost:5001/api/parcels/tiles/11/495/788.mvt
```

Should return binary data (MVT format), not an error.

### Check 4: Try Toggling Off and On

1. Turn toggle OFF
   - Console: `🔵 Aggregated Parcels Toggle Update: OFF`
   - Blue parcels should disappear

2. Turn toggle ON
   - Console: `🔵 Aggregated Parcels Toggle Update: ON`
   - Blue parcels should appear

### Check 5: Zoom Level

The parcels should show at ALL zoom levels (10-22), but tiles only generate for zoom ≥ 10.

Try zooming to:
- Zoom 11 (state view) - Should show
- Zoom 13 (county view) - Should show
- Zoom 15 (neighborhood view) - Should show

---

## Common Issues & Solutions

### Issue: "Parcels appear then disappear"
**Cause**: Duplicate layer with wrong configuration  
**Solution**: ✅ Fixed! Removed duplicate ownership-labels layer

### Issue: "Network errors in console"
**Cause**: API endpoint not running or wrong URL  
**Solution**: Check if dev server is running on port 5001

### Issue: "Tiles show 404 errors"
**Cause**: Routes not registered or database connection issue  
**Solution**: Check server logs, verify database connection

### Issue: "Nothing shows at all"
**Cause**: Toggle might be OFF or layers not created  
**Solution**: Check console for layer creation messages, verify toggle is ON

---

## Console Messages Explained

### On Page Load:
```
🔵 Map load complete - Initial toggle state: {...}
```
Shows the initial state of toggles and map position.

### When Toggle Changes:
```
🔵 Aggregated Parcels Toggle Update: ON | Zoom: 12.3 | Harrison: false
   └─ ownership-fill: visible (shouldShow: true)
   └─ ownership-outline: visible (shouldShow: true)
```
Shows what layers are being shown/hidden and why.

### On Click:
Popup appears with parcel information.

### On Zoom/Pan:
Tile requests in Network tab show new tiles being loaded.

---

## Expected Data

### Popup Information:
```
Owner: SMITH FAMILY TRUST
Parcels: 15
Acres: 1,234 acres
County: POLK
Aggregated Adjacent Parcels
```

### Label Format (when enabled):
```
SMITH FAMILY TRUST
(15 parcels, 1234 ac)
```

---

## Database Verification

If you need to verify the data is there:

```bash
npx tsx scripts/verify-parcel-data.ts
```

Expected output:
```
✅ ALL THREE TABLES EXIST
   1. Raw Parcels: 2,452,562 individual parcels
   2. Ownership Groups: 309,893 unique owners
   3. Aggregated Parcels: 605,409 adjacent clusters

🎉 DATA LOOKS COMPLETE AND HEALTHY!
```

---

**Status**: Ready for testing with enhanced debugging  
**Next**: Hard refresh browser and check console for detailed logs

