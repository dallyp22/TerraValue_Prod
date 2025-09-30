# 🌾 Iowa Field Boundary Integration Setup Guide

## Overview

This guide provides step-by-step instructions to integrate the USDA/ARS ACPF Iowa Field Boundaries dataset into LandIQ, enabling precise field-level analysis with authentic agricultural field data.

## Data Source Information

**ACPF Field Boundary Dataset: Iowa**
- **Provider**: USDA Agricultural Research Service, National Laboratory of Agriculture and the Environment
- **Contact**: David James <david.james@ars.usda.gov>
- **Address**: 1015 N University Blvd., Ames, Iowa 50011
- **Phone**: (515) 294-6858
- **Version**: 2019 (Updated April 1, 2020)

## Data Specifications

### Field Attributes
```
FBndID     - Unique field boundary identifier (Primary Key)
Acres      - Field area in acres (Float)
isAG       - Agricultural designation (1 = Agricultural, 0 = Non-agricultural)
Shape_Leng - Perimeter length in meters
Shape_Area - Area in square meters
```

### Coordinate System
- **Original**: USA_Contiguous_Albers_Equal_Area_Conic_USGS_version (EPSG:102039)
- **Target**: WGS84 Geographic (EPSG:4326) for web mapping compatibility

### Coverage Area
- **Extent**: Iowa statewide
- **Bounds**: 
  - West: -96.617765°
  - East: -90.035314°
  - North: 43.587326°
  - South: 40.328169°

## Database Setup Instructions

### 1. Prerequisites

```bash
# Ensure PostGIS is installed
sudo apt-get install postgis postgresql-contrib

# Verify PostGIS version
psql $DATABASE_URL -c "SELECT PostGIS_Version();"

# Install GDAL tools for shapefile processing
sudo apt-get install gdal-bin
```

### 2. Download Iowa Field Boundaries

```bash
# Create data directory
mkdir -p data/iowa_fields

# Download from USDA/ARS or use provided shapefile
# The shapefile should include:
# - IowaFieldBoundaries2019.shp
# - IowaFieldBoundaries2019.shx  
# - IowaFieldBoundaries2019.dbf
# - IowaFieldBoundaries2019.prj
# - IowaFieldBoundaries2019.shp.xml (metadata)
```

### 3. Import Shapefile to PostGIS

```bash
# Import with coordinate transformation to WGS84
shp2pgsql -I -s 102039:4326 \
  data/iowa_fields/IowaFieldBoundaries2019.shp \
  iowa_field_boundaries | \
  psql $DATABASE_URL

# Verify import
psql $DATABASE_URL -c "
SELECT 
  COUNT(*) as total_fields,
  COUNT(*) FILTER (WHERE isag = 1) as agricultural_fields,
  ROUND(AVG(acres)::numeric, 2) as avg_acres,
  ST_Extent(geom) as bounds
FROM iowa_field_boundaries;"
```

### 4. Create Optimized Indexes

```sql
-- Spatial index on geometry column
CREATE INDEX IF NOT EXISTS idx_iowa_fields_geom 
ON iowa_field_boundaries USING GIST (geom);

-- Index on field ID for fast lookups
CREATE INDEX IF NOT EXISTS idx_iowa_fields_fbndid 
ON iowa_field_boundaries (fbndid);

-- Index on agricultural designation
CREATE INDEX IF NOT EXISTS idx_iowa_fields_isag 
ON iowa_field_boundaries (isag);

-- Composite index for agricultural fields with spatial queries
CREATE INDEX IF NOT EXISTS idx_iowa_fields_ag_geom 
ON iowa_field_boundaries USING GIST (geom) 
WHERE isag = 1;

-- Index on acres for size-based queries
CREATE INDEX IF NOT EXISTS idx_iowa_fields_acres 
ON iowa_field_boundaries (acres);
```

### 5. Create Agricultural Fields View

```sql
-- Create view for agricultural fields only
CREATE OR REPLACE VIEW agricultural_fields AS
SELECT 
  fbndid as field_id,
  acres,
  ST_AsText(geom) as wkt,
  ST_X(ST_Centroid(geom)) as center_lon,
  ST_Y(ST_Centroid(geom)) as center_lat,
  ST_XMin(geom) as min_lon,
  ST_XMax(geom) as max_lon,
  ST_YMin(geom) as min_lat,
  ST_YMax(geom) as max_lat,
  ST_Area(geom::geography) / 4047 as acres_calculated, -- Convert m² to acres
  ST_Perimeter(geom::geography) * 3.28084 as perimeter_feet -- Convert m to feet
FROM iowa_field_boundaries 
WHERE isag = 1
  AND acres > 0.5; -- Filter out very small fields

-- Create index on the view
CREATE INDEX IF NOT EXISTS idx_ag_fields_field_id 
ON iowa_field_boundaries (fbndid) WHERE isag = 1;
```

### 6. Performance Optimization

```sql
-- Update table statistics
ANALYZE iowa_field_boundaries;

-- Cluster data by spatial index for better performance
CLUSTER iowa_field_boundaries USING idx_iowa_fields_geom;

-- Create materialized view for frequently accessed data
CREATE MATERIALIZED VIEW field_summary AS
SELECT 
  ST_SnapToGrid(ST_Centroid(geom), 0.01) as grid_point,
  COUNT(*) as field_count,
  ROUND(AVG(acres)::numeric, 2) as avg_acres,
  ROUND(SUM(acres)::numeric, 2) as total_acres
FROM iowa_field_boundaries 
WHERE isag = 1
GROUP BY ST_SnapToGrid(ST_Centroid(geom), 0.01);

CREATE INDEX idx_field_summary_grid ON field_summary USING GIST (grid_point);
```

## Service Configuration

### 1. Update Field Boundary Service

Replace the placeholder implementation in `server/services/fieldBoundaries.ts` with actual database queries:

```typescript
// Example query implementation
async searchFields(minLat: number, maxLat: number, minLon: number, maxLon: number, limit: number = 50) {
  const query = `
    SELECT 
      fbndid as field_id,
      acres,
      ST_AsText(geom) as wkt,
      ST_X(ST_Centroid(geom)) as center_lon,
      ST_Y(ST_Centroid(geom)) as center_lat
    FROM iowa_field_boundaries 
    WHERE isag = 1
      AND geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    ORDER BY acres DESC
    LIMIT $5
  `;
  
  const result = await db.query(query, [minLon, minLat, maxLon, maxLat, limit]);
  // Process and return results
}
```

### 2. Environment Variables

Add to your `.env` or Replit Secrets:
```bash
# Optional: Database connection pool settings for field boundary queries
FIELD_DB_POOL_SIZE=10
FIELD_QUERY_TIMEOUT=30000
```

## API Testing

### 1. Test Field Search

```bash
# Search fields in central Iowa
curl "http://localhost:5000/api/fields/search?minLat=42.0&maxLat=42.1&minLon=-93.7&maxLon=-93.6&limit=10"

# Expected response:
{
  "success": true,
  "fields": [
    {
      "field_id": "F1234567890",
      "acres": 156.78,
      "wkt": "POLYGON((-93.65 42.05, ...))",
      "center_lon": -93.625,
      "center_lat": 42.075
    }
  ],
  "total": 10
}
```

### 2. Test Nearby Fields

```bash
curl -X POST http://localhost:5000/api/fields/nearby \
  -H "Content-Type: application/json" \
  -d '{"latitude": 42.0308, "longitude": -93.6319, "radiusMeters": 500}'
```

### 3. Test Field Details

```bash
curl "http://localhost:5000/api/fields/F1234567890"
```

## Frontend Integration

### 1. Update Map Component

Add field boundary layer to `MapParcelPicker`:

```typescript
// Add field boundaries as vector tiles or GeoJSON
map.current.addSource('field-boundaries', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: [] // Populated from API
  }
});

map.current.addLayer({
  id: 'field-boundaries',
  type: 'line',
  source: 'field-boundaries',
  paint: {
    'line-color': '#10b981',
    'line-width': 2,
    'line-opacity': 0.8
  }
});
```

### 2. Field Selection Logic

```typescript
// Handle field boundary clicks
const handleFieldClick = async (feature: any) => {
  const fieldId = feature.properties.field_id;
  const fieldData = await fetchFieldDetails(fieldId);
  
  // Get CSR2 data for the field
  const csr2Data = await fetchCSR2ForField(fieldData.wkt);
  
  // Update form with field data
  onParcelSelected({
    fieldId,
    wkt: fieldData.wkt,
    acres: fieldData.acres,
    csr2: csr2Data
  });
};
```

## Data Quality Assurance

### 1. Validation Queries

```sql
-- Check data integrity
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT fbndid) as unique_fields,
  COUNT(*) FILTER (WHERE isag = 1) as agricultural_fields,
  COUNT(*) FILTER (WHERE acres > 0) as valid_acres,
  COUNT(*) FILTER (WHERE ST_IsValid(geom)) as valid_geometries
FROM iowa_field_boundaries;

-- Check coordinate ranges
SELECT 
  ST_XMin(ST_Extent(geom)) as min_lon,
  ST_XMax(ST_Extent(geom)) as max_lon,
  ST_YMin(ST_Extent(geom)) as min_lat,
  ST_YMax(ST_Extent(geom)) as max_lat
FROM iowa_field_boundaries;
```

### 2. Performance Monitoring

```sql
-- Monitor query performance
EXPLAIN (ANALYZE, BUFFERS) 
SELECT fbndid, acres 
FROM iowa_field_boundaries 
WHERE isag = 1 
  AND geom && ST_MakeEnvelope(-93.7, 42.0, -93.6, 42.1, 4326)
LIMIT 50;
```

## Troubleshooting

### Common Issues

1. **Import Errors**
   - Verify shapefile completeness (.shp, .shx, .dbf, .prj files)
   - Check coordinate system transformation
   - Ensure sufficient disk space

2. **Slow Queries**
   - Verify spatial indexes are created
   - Check query bounds are reasonable
   - Consider using materialized views

3. **Memory Issues**
   - Increase PostgreSQL shared_buffers
   - Use LIMIT clauses appropriately
   - Implement query result caching

## Security Considerations

### Data Access
- Field boundaries are public agricultural data
- No PII or sensitive ownership information included
- Rate limiting recommended for API endpoints

### Database Security
```sql
-- Create read-only user for field boundary access
CREATE USER field_reader WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE your_db TO field_reader;
GRANT USAGE ON SCHEMA public TO field_reader;
GRANT SELECT ON iowa_field_boundaries TO field_reader;
GRANT SELECT ON agricultural_fields TO field_reader;
```

## Maintenance

### Regular Tasks
1. **Monthly**: Update table statistics with ANALYZE
2. **Quarterly**: Check for data updates from USDA/ARS
3. **Annually**: Review and optimize query performance

### Data Updates
- Monitor USDA/ARS for new field boundary releases
- Test updates in staging environment
- Maintain backward compatibility during updates

## Success Metrics

Upon successful implementation:
- ✅ Field boundary queries return results in < 500ms
- ✅ API endpoints handle concurrent requests without timeout
- ✅ Field selection integrates seamlessly with CSR2 data
- ✅ Map interface displays field boundaries accurately
- ✅ Database maintains sub-meter geometric precision

This integration enables precise field-level agricultural analysis with authentic USDA field boundary data, significantly enhancing the accuracy and credibility of land valuations.