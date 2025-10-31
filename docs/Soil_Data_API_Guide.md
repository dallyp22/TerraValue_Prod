# Iowa Soil Data API Guide

## Overview

The Iowa soil database contains comprehensive SSURGO soil property data for all 99 Iowa counties. This guide shows you how to query and use this data in your applications.

---

## 📊 Available Data

### What's in the Database

| Data Type | Records | Description |
|-----------|---------|-------------|
| **Soil Components** | 29,924 | Individual soil types with properties |
| **Map Units** | 11,208 | Soil mapping units |
| **Soil Horizons** | 125,960 | Layer-by-layer soil profiles |
| **Survey Areas** | 99 | Iowa counties |

### Soil Properties Available

**Component-Level Data:**
- `compname` - Soil series name (e.g., "Clarion", "Webster")
- `slope_r` - Representative slope percentage (0-25%+)
- `drainagecl` - Drainage classification
- `hydgrp` - Hydrologic group (A, B, C, D)
- `taxorder` - Taxonomic order (Mollisols, Alfisols, etc.)
- `majcompflag` - Major component indicator

**Map Unit Data:**
- `muname` - Map unit name
- `musym` - Map unit symbol
- `farmlndcl` - Farmland classification

**Horizon Data:**
- `sandtotal_r` - Sand percentage
- `silttotal_r` - Silt percentage
- `claytotal_r` - Clay percentage
- `ph1to1h2o_r` - pH level
- `om_r` - Organic matter percentage
- `ksat_r` - Hydraulic conductivity

---

## 🔌 API Endpoints

### Get Soil Data for Point

**Endpoint:** `GET /api/soil/point`

**Query Parameters:**
- `lon` - Longitude (required)
- `lat` - Latitude (required)

**Example Request:**
```bash
GET /api/soil/point?lon=-93.6091&lat=41.5868
```

**Example Response:**
```json
{
  "soilSeries": "Clarion",
  "slope": 3.5,
  "drainage": "Well drained",
  "hydrologicGroup": "B",
  "farmlandClass": "Prime farmland",
  "texture": {
    "sand": 25,
    "silt": 55,
    "clay": 20
  },
  "ph": 6.2,
  "organicMatter": 4.5
}
```

### Get Soil Data for Polygon

**Endpoint:** `POST /api/soil/polygon`

**Request Body:**
```json
{
  "wkt": "POLYGON((-93.6 41.58, -93.59 41.58, -93.59 41.59, -93.6 41.59, -93.6 41.58))"
}
```

**Example Response:**
```json
{
  "dominantSoil": "Clarion",
  "components": [
    {
      "name": "Clarion",
      "percentage": 65,
      "slope": 3.5,
      "drainage": "Well drained"
    },
    {
      "name": "Webster",
      "percentage": 25,
      "slope": 1.0,
      "drainage": "Poorly drained"
    }
  ],
  "averageSlope": 2.8,
  "farmlandClass": "Prime farmland"
}
```

### Get Dominant Soil

**Endpoint:** `POST /api/soil/dominant`

**Request Body:**
```json
{
  "wkt": "POLYGON(...)"
}
```

**Response:**
```json
{
  "soilSeries": "Clarion",
  "percentage": 65,
  "slope": 3.5,
  "drainage": "Well drained",
  "hydrologicGroup": "B"
}
```

---

## 💻 Usage Examples

### JavaScript/TypeScript

```typescript
// Get soil data for a point
async function getSoilData(lon: number, lat: number) {
  const response = await fetch(
    `/api/soil/point?lon=${lon}&lat=${lat}`
  );
  return await response.json();
}

// Get soil data for a polygon
async function getSoilDataForParcel(wkt: string) {
  const response = await fetch('/api/soil/polygon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wkt })
  });
  return await response.json();
}

// Usage
const soilData = await getSoilData(-93.6091, 41.5868);
console.log(`Soil: ${soilData.soilSeries}, Slope: ${soilData.slope}%`);
```

### React Hook

```typescript
import { useQuery } from '@tanstack/react-query';

export function useSoilData(coordinates?: { lon: number; lat: number }) {
  return useQuery({
    queryKey: ['soil', coordinates],
    queryFn: async () => {
      if (!coordinates) return null;
      const res = await fetch(
        `/api/soil/point?lon=${coordinates.lon}&lat=${coordinates.lat}`
      );
      return res.json();
    },
    enabled: !!coordinates
  });
}

// Usage in component
function ParcelInfo({ lon, lat }) {
  const { data: soilData } = useSoilData({ lon, lat });
  
  return (
    <div>
      <h3>Soil: {soilData?.soilSeries}</h3>
      <p>Slope: {soilData?.slope}%</p>
      <p>Drainage: {soilData?.drainage}</p>
    </div>
  );
}
```

---

## 🗃️ Direct Database Queries

### Get Soil Components for Location

```sql
SELECT 
  c.compname as soil_series,
  c.slope_r as slope_percent,
  c.drainagecl as drainage,
  c.hydgrp as hydrologic_group,
  c.comppct_r as percentage,
  m.farmlndcl as farmland_class
FROM soil_component c
JOIN soil_mapunit m ON c.mukey = m.mukey
WHERE c.majcompflag = 'Yes'
  AND c.mukey = 'YOUR_MUKEY_HERE'
ORDER BY c.comppct_r DESC;
```

### Get Surface Horizon Texture

```sql
SELECT 
  h.sandtotal_r as sand_pct,
  h.silttotal_r as silt_pct,
  h.claytotal_r as clay_pct,
  h.ph1to1h2o_r as ph,
  h.om_r as organic_matter_pct
FROM soil_chorizon h
WHERE h.cokey = 'YOUR_COKEY_HERE'
  AND h.hzdept_r = 0  -- Surface horizon
LIMIT 1;
```

### Get All Soil Series in Area

```sql
SELECT DISTINCT
  c.compname as soil_series,
  COUNT(*) as occurrence_count
FROM soil_component c
JOIN soil_mapunit m ON c.mukey = m.mukey
JOIN soil_legend l ON m.lkey = l.lkey
WHERE l.areasymbol = 'IA169'  -- Story County
GROUP BY c.compname
ORDER BY occurrence_count DESC;
```

---

## 📈 Map Visualization Use Cases

### Slope Heat Map

Query all soil components in visible map bounds, color-code by slope:

```typescript
const getSlopeData = async (bounds) => {
  // Query soil components in bounds
  // Return array of { location, slope }
  // Color code:
  // Green: 0-2% (nearly level)
  // Yellow: 2-6% (gentle slope)
  // Orange: 6-12% (moderate slope)
  // Red: 12%+ (steep)
};
```

### Drainage Classification Layer

```typescript
const getDrainageData = async (bounds) => {
  // Query components in bounds
  // Return array of { location, drainage }
  // Color code:
  // Dark Blue: Very poorly drained
  // Blue: Poorly drained
  // Light Blue: Somewhat poorly drained
  // Green: Well drained
  // Yellow: Excessively drained
};
```

### Farmland Classification

```typescript
const getFarmlandClass = async (bounds) => {
  // Query map units in bounds
  // Return array of { location, farmlandClass }
  // Highlight "Prime farmland" parcels
};
```

---

## 🎯 Common Queries

### Find All Clarion Soils

```sql
SELECT m.mukey, m.muname, c.slope_r, c.drainagecl
FROM soil_component c
JOIN soil_mapunit m ON c.mukey = m.mukey
WHERE c.compname LIKE 'Clarion%'
  AND c.majcompflag = 'Yes'
ORDER BY c.slope_r;
```

### Find Well-Drained Soils with Low Slope

```sql
SELECT 
  c.compname,
  c.slope_r,
  m.farmlndcl
FROM soil_component c
JOIN soil_mapunit m ON c.mukey = m.mukey
WHERE c.drainagecl = 'Well drained'
  AND c.slope_r < 3
  AND c.majcompflag = 'Yes'
  AND m.farmlndcl LIKE '%Prime%';
```

### Get Soil Texture Distribution

```sql
SELECT 
  CASE 
    WHEN h.sandtotal_r > 70 THEN 'Sandy'
    WHEN h.claytotal_r > 40 THEN 'Clay'
    WHEN h.silttotal_r > 70 THEN 'Silty'
    ELSE 'Loam'
  END as texture_class,
  COUNT(*) as count
FROM soil_chorizon h
WHERE h.hzdept_r = 0  -- Surface only
GROUP BY texture_class
ORDER BY count DESC;
```

---

## ⚠️ Important Notes

### What's NOT in the Database

- **CSR2 Ratings**: Not available in SSURGO data. CSR2 is calculated from raster data and only available via external APIs (Michigan State ImageServer or USDA Interpretation Service)
- **Spatial Geometries**: PostGIS not available on Railway. Component locations must be matched by mukey/cokey
- **Real-time Updates**: Data is static (updated 1-2x per year when USDA releases new SSURGO data)

### Best Practices

1. **Cache Results**: Soil data doesn't change frequently
2. **Batch Queries**: Query multiple locations at once when possible
3. **Use Materialized View**: `iowa_soil_summary` has pre-joined common queries
4. **Filter by majcompflag**: Only query major components unless you need all data

### Performance Tips

- Queries typically run in 50-200ms
- Add indexes on frequently queried columns
- Use the materialized view for common joins
- Limit result sets with appropriate WHERE clauses

---

## 🔗 Related Documentation

- [Soil Database Setup Guide](./Soil_Database_Setup_Guide.md) - Installation and configuration
- [Quick Start Guide](../SOIL_DATABASE_QUICK_START.md) - Get started in 5 minutes
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md) - Technical details

---

## 📞 Support

For issues or questions:
- Check the soil_sync_status table for data availability
- Verify mukey/cokey values exist in the database
- Review query performance with EXPLAIN ANALYZE

Happy soil data querying! 🌾

