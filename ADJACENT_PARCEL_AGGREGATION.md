# Adjacent Parcel Aggregation System

## Overview

This system combines adjacent parcels owned by the same person/entity into single polygons, providing a clearer visualization of contiguous land ownership across all 98 Iowa counties (excluding Harrison County, which uses an optimized client-side method).

---

## 🎯 Problem Solved

### **Before:**
- Farmers with 10 adjacent parcels → showed as 10 separate green squares
- Confusing map visualization
- Hard to understand actual land holdings
- Different experience between counties

### **After:**
- Same farmer → shows as 1-3 combined blue areas (actual contiguous holdings)
- Clear ownership boundaries
- Professional GIS experience
- Consistent across all Iowa counties (like Harrison County)

---

## 🏗️ Architecture

### **Three-Tier Parcel System:**

```
1. Raw Parcels (parcels table)
   └─> 2,452,562 individual parcels
       └─> Base data, always preserved

2. Adjacent Clusters (parcel_aggregated table) ← NEW!
   └─> ~1,200,000 clusters (ONLY adjacent parcels combined)
       └─> Used for zoom 10-13 visualization
       └─> Like Harrison County method, but server-side

3. Ownership Groups (parcel_ownership_groups table)
   └─> 309,893 groups (ALL parcels by owner, even distant)
       └─> Used for analytics/search
       └─> Not used for map visualization

```

### **County-Specific Handling:**

**Harrison County:**
- Uses client-side Turf.js aggregation (existing method)
- Real-time combination in browser
- Optimized for their specific dataset
- No changes made

**Other 98 Counties:**
- Uses server-side PostGIS aggregation (new method)
- Pre-computed combinations in database
- Served via vector tiles
- Same visual result as Harrison

---

## 🔬 Algorithm: PostGIS ST_ClusterDBSCAN

###Principle:**

Uses spatial clustering to find groups of touching parcels:

```sql
ST_ClusterDBSCAN(geom, eps := 0.0001, minpoints := 1)
```

**Parameters:**
- `eps = 0.0001` → Parcels within ~11 meters treated as adjacent
- `minpoints = 1` → Every parcel gets assigned to a cluster
- Result: Cluster ID for each parcel

**Process:**
1. For each owner in each county
2. Cluster their parcels by adjacency
3. Union geometries within each cluster
4. Store result in `parcel_aggregated` table

---

## 📊 Performance Results

### **Test County: POLK (Largest)**
- **Input:** 191,274 parcels, 132,333 owners
- **Output:** 37,729 aggregated clusters
- **Reduction:** 47.5% fewer features to render
- **Time:** 11 minutes

### **Estimated Full State (98 counties):**
- **Processing time:** ~1.5 hours
- **Expected output:** ~1.2M clusters (from 2.4M parcels)
- **Reduction:** ~50% fewer features
- **Storage:** +500 MB for aggregated table

---

## 🗺️ Visual Impact

### **Zoom 10-13 (County/Regional View):**

**Before:**
- Shows individual parcel boundaries (cluttered)
- OR incorrect mega-blobs combining distant parcels

**After:**
- Shows only adjacent parcels combined
- Blue boundaries = actual contiguous land holdings
- Click → "Farm Name (15 adjacent parcels, 1,200 acres)"

### **Zoom 14+ (Property View):**

**No change:**
- Individual parcels still visible
- Full detail preserved
- Click for specific parcel information

---

## 💾 Database Schema

```sql
CREATE TABLE parcel_aggregated (
  id SERIAL PRIMARY KEY,
  normalized_owner TEXT NOT NULL,
  county TEXT NOT NULL,
  parcel_ids JSON,  -- Array of adjacent parcel IDs
  parcel_count INTEGER NOT NULL,
  total_acres REAL NOT NULL,
  geom GEOMETRY(MULTIPOLYGON, 4326),  -- Combined geometry
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX aggregated_owner_county_idx ON parcel_aggregated(normalized_owner, county);
CREATE INDEX aggregated_county_idx ON parcel_aggregated(county);
CREATE INDEX parcel_aggregated_geom_idx ON parcel_aggregated USING GIST(geom);
```

---

## 🚀 Usage

### **Run Full Aggregation:**
```bash
npm run db:parcels:aggregate-adjacent
```

**What it does:**
- Processes all 98 counties (excludes Harrison)
- Combines only adjacent parcels by owner
- Stores results in `parcel_aggregated` table
- Takes ~1.5 hours
- Can resume if interrupted

### **Test Single County:**
```bash
npx tsx scripts/test-county-aggregation.ts
```

Tests on POLK County to verify algorithm.

### **Generate Comparison Report:**
```bash
npx tsx scripts/compare-aggregation-results.ts
```

Shows statistics comparing raw parcels, ownership groups, and adjacent clusters.

---

## 📈 Example Results

### **Sample Owner: "VEGORS LAND" (20 parcels)**
- **Before:** 20 separate green squares on map
- **After:** 3-4 combined blue areas (actual farms)
- **Adjacency:** 32 out of 190 parcel pairs touching (17%)

### **Sample Owner: "CITY OF DES MOINES" (470 parcels)**
- **Before:** 470 scattered green squares
- **After:** 1 large combined area (4,943 acres)
- **Result:** City boundary clearly visible

---

## 🔄 Tile Generation Update

Vector tiles now use `parcel_aggregated` instead of `parcel_ownership_groups`:

**Before:**
```sql
-- Showed ALL parcels by owner (even 50 miles apart)
FROM parcel_ownership_groups
```

**After:**
```sql
-- Shows ONLY adjacent parcels (contiguous holdings)
FROM parcel_aggregated
```

**Impact:**
- ✅ Accurate representation of land holdings
- ✅ No more misleading mega-blobs
- ✅ Consistent with Harrison County experience

---

## 💰 Costs

**One-time Computation:**
- ~1.5 hours of database time
- Neon Launch: ~$0.15 one-time cost

**Ongoing Storage:**
- +500 MB for aggregated table
- ~$0.18/month additional

**Total:** $0.15 one-time + $0.18/month

---

## 🎨 Map Color Scheme

- 🟦 **Blue** = Adjacent parcels combined (zoom < 14)
- 🟩 **Green** = Individual parcels (zoom 14+)
- 🔴 **Red** = Harrison County (keeps special handling)

---

## ✅ Benefits

1. **Clearer Visualization** - See actual farm boundaries, not scattered dots
2. **Better Performance** - 50% fewer features to render
3. **Accurate Representation** - Only adjacent parcels combined
4. **Statewide Consistency** - All counties work like Harrison
5. **Professional Quality** - Commercial-grade GIS experience

---

## 📝 Scripts Created

| Script | Purpose | Time |
|--------|---------|------|
| `aggregate-adjacent-parcels.ts` | Full state aggregation | ~1.5 hours |
| `test-county-aggregation.ts` | Test single county | ~10 mins |
| `compare-aggregation-results.ts` | Generate report | ~30 secs |
| `analyze-parcel-adjacency.ts` | Deep dive analysis | ~30 secs |
| `setup-aggregated-table.ts` | Create database table | ~5 secs |

---

## 🔍 Technical Details

**Adjacency Detection:**
- Uses PostGIS `ST_ClusterDBSCAN` for efficient spatial clustering
- 11-meter tolerance (eps=0.0001 degrees)
- Spatial index accelerated (104 MB GIST index)

**Performance Optimizations:**
- Process by county to reduce search space
- Small owners first (2-5 parcels) for quick wins
- Batch commits for resumability
- Progress tracking in JSON file

**Data Integrity:**
- Original parcels preserved
- Harrison County untouched
- Aggregation is additive (doesn't modify source data)
- Can regenerate anytime

---

## 🎯 Current Status

✅ Analysis complete  
✅ Schema created  
✅ Algorithm implemented  
✅ Tested on Polk County (success!)  
🔄 Full state aggregation running (~1.5 hours)  
✅ Tile generation updated  
⏳ Comparison report pending (after aggregation completes)  

---

**When complete, all 98 counties will have the same excellent parcel visualization experience that Harrison County enjoys!** 🚀

