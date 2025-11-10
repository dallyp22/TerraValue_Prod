# Harrison County Tileset Fix - Complete

## 🔍 Root Cause Identified

**The Issue:** Self-hosted parcel tiles from the database were rendering in Harrison County, overlapping/hiding the Mapbox tileset.

---

## ✅ Fixes Applied

### 1. **Excluded Harrison from Self-Hosted Tiles**
Updated `server/services/parcelTiles.ts` to exclude HARRISON county from both zoom levels:

```sql
-- Zoom 14+
WHERE county_name != 'HARRISON'

-- Zoom < 14  
WHERE county != 'HARRISON'
```

**Result:** Self-hosted tiles now return empty for Harrison County area.

### 2. **Correct Tileset Configuration**
- **Tileset ID:** `dpolivka22.98m684w2` ✅
- **Source-layer:** `harrison_county_all_parcels_o-7g2t48` ✅
- **Tile URL:** `https://api.mapbox.com/v4/dpolivka22.98m684w2/{z}/{x}/{y}.vector.pbf` ✅
- **Zoom range:** 12-16 (matching tileset capabilities) ✅

### 3. **Added Debug Logging**
Console logs now show:
- When Harrison County is detected
- Which layers are visible/hidden
- Zoom level and map center
- Helps diagnose any future issues

### 4. **Layer Visibility Logic**
When in Harrison County:
- ✅ Show Harrison Mapbox tileset layers
- ❌ Hide self-hosted parcel layers
- ❌ Hide ownership aggregation layers
- ❌ Hide ArcGIS GeoJSON parcels

### 5. **Created Test Page**
Built `/test-harrison` page that ONLY loads Harrison tileset:
- Shows RED parcels if tileset loads
- Isolated from other map complexity
- Easy to verify tileset access

---

## 📊 Tileset Verification

**Tested:**
```bash
curl https://api.mapbox.com/v4/dpolivka22.98m684w2.json?access_token=...
```

**Results:**
- ✅ Tileset exists and is public
- ✅ Has aggregated parcel data
- ✅ Vector layer: `harrison_county_all_parcels_o-7g2t48`
- ✅ Zoom range: 12-16
- ✅ Bounds cover Harrison County

---

## 🧪 How to Test

### **Test Page (Isolated):**
Visit: **http://localhost:5001/test-harrison**

**Expected:**
- RED parcels in Harrison County
- Zoom 13 centered on Woodbine
- If shows red → tileset works!

### **Main Map:**
Visit: **http://localhost:5001**

1. Navigate to **Harrison County** (Woodbine, Iowa: -95.7159, 41.7407)
2. **Zoom to 12 or higher** (important! Tileset only has zoom 12-16)
3. Open browser console (F12)
4. Look for logs:
   ```
   🔍 Harrison Check: { center: {...}, inHarrison: true, zoom: 13 }
   📍 IN HARRISON COUNTY - Showing Harrison tileset
   Harrison source exists? true
   🚫 Hiding other parcel layers for Harrison County
   ```

**Expected Result:**
- Green aggregated parcels (from Mapbox tileset)
- NOT individual small parcels
- Can click to see combined ownership info

---

## ⚠️ Important Notes

### **Zoom Level Requirement**
The Harrison tileset ONLY works at **zoom 12-16**.
- Below zoom 12: No tiles available
- Must zoom in to see parcels

### **API Key**
Uses: `VITE_MAPBOX_PUBLIC_KEY` from .env
- Confirmed accessible
- Tileset is public

### **What Changed from Original**
- **Tileset ID:** `3l1693dn` → `98m684w2` ✅
- **Source-layer:** `TMV-79tjod` → `harrison_county_all_parcels_o-7g2t48` ✅
- **Minzoom:** 0 → 12 (matches tileset) ✅

---

## 🚀 Deployment Status

**Commit:** `468a64b`  
**Deployed:** To production  
**ETA:** ~3-5 minutes until live  

**After deployment:**
1. Hard refresh browser (`Cmd + Shift + R`)
2. Visit `/test-harrison` to verify tileset loads (should see RED)
3. Navigate to Harrison County on main map
4. Zoom to 12+ to see aggregated parcels

---

## 🎯 Summary

**Configuration:** ✅ Correct  
**Tileset Access:** ✅ Verified  
**Self-hosted Exclusion:** ✅ Fixed  
**Debug Logging:** ✅ Added  
**Test Page:** ✅ Created  
**Tile Cache:** ✅ Cleared  

**Harrison County should now display correctly with aggregated parcels from the Mapbox tileset `dpolivka22.98m684w2`!**

The key requirement: **Must be zoomed to level 12 or higher** to see the tileset data.

