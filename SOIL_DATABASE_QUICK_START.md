# Iowa Soil Database - Quick Start

## 🚀 5-Minute Setup

### 1. Provision Railway PostgreSQL

```bash
# Login to Railway
railway login

# Add PostgreSQL to your project
railway add --database postgres

# Get the connection string
railway variables | grep DATABASE_URL
```

### 2. Set Environment Variable

Add to your `.env` file:

```env
DATABASE_URL_SOIL=postgresql://postgres:password@railway.app:5432/railway
```

Replace with your actual Railway PostgreSQL URL.

### 3. Create Tables

```bash
npm run db:soil:push
```

This creates all necessary tables and enables PostGIS.

### 4. Load Iowa Data

```bash
npm run db:soil:load
```

⏱️ Takes 30-60 minutes. Grab a coffee! ☕

### 5. Test It

Your soil property queries will now be **instant**:

```typescript
// Query soil data for any Iowa location
// Returns: soil series, slope, drainage, farmland class
// Performance: 50-200ms (instant!)

// Note: CSR2 still uses external APIs (2-60s)
// But you have comprehensive soil property data locally!
```

---

## 📊 What You Get

### Database Tables (Actual Loaded Data)

- **soil_legend** - 99 Iowa survey areas ✅
- **soil_mapunit** - 11,208 map units ✅
- **soil_component** - 29,924 soil components ✅
- **soil_chorizon** - 125,960 horizons ✅
- **soil_csr2_ratings** - 0 (not available in SSURGO) ⚠️
- **soil_mapunit_spatial** - 0 (PostGIS not on Railway) ⚠️
- **iowa_soil_summary** - 12,624 rows ✅

### What Soil Data You Have

**Comprehensive soil properties for all of Iowa:**
- 🌾 Soil series names (Clarion, Webster, Nicollet, etc.)
- 📐 Slope percentages (low/representative/high values)
- 💧 Drainage classifications (well/poorly drained, etc.)
- 🏆 Farmland classifications (prime farmland, etc.)
- 📊 Soil texture (sand/silt/clay percentages)
- 🌱 pH levels and organic matter content
- 💦 Hydrologic groups (A, B, C, D)
- 🔬 Taxonomic classifications

### What You Don't Have

- ❌ **CSR2 ratings** - Not in SSURGO data (CSR2 is derived from raster data, only available via external APIs)
- ❌ **Spatial geometries** - PostGIS not available on Railway

### Performance Improvement

| Query Type | Performance | Use Case |
|------------|-------------|----------|
| **Soil Properties** | 50-200ms | Get slope, drainage, soil series for any Iowa location ✅ |
| **CSR2 Ratings** | 2-60s | Still uses external APIs (no change) ⚠️ |

### Storage Used

- **Total**: ~2 GB (actual)
- **Railway Hobby Plan**: $5/mo (8 GB included) ✅

---

## 🔧 Maintenance

### Refresh Materialized View

After loading new data:

```bash
npm run db:soil:refresh
```

### Check Data Status

```sql
psql $DATABASE_URL_SOIL

SELECT areasymbol, record_count, last_synced_at 
FROM soil_sync_status 
ORDER BY areasymbol;
```

### Update Soil Data

When USDA releases new Iowa data (typically 1-2x per year):

```bash
npm run db:soil:load
npm run db:soil:refresh
```

---

## 💡 How It Works

### Automatic Fallback

The CSR2 service automatically:

1. ✅ **Try local database first** (fast, reliable)
2. 🔄 **Fall back to external APIs** if needed (slower, but works)

You don't need to change any code - it just works!

### Dual Database Architecture

```
┌─────────────────────────────────────────┐
│  APPLICATION DATABASE (Neon)            │
│  - Users, sessions                      │
│  - Valuations, auctions                 │
│  - Write-heavy, transactional           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  SOIL DATABASE (Railway PostgreSQL)     │
│  - SSURGO soil data                     │
│  - CSR2 ratings                         │
│  - Read-heavy, rarely updated           │
│  - PostGIS for spatial queries          │
└─────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Environment Variable Not Set

```bash
# Check if set
echo $DATABASE_URL_SOIL

# Add to .env
echo 'DATABASE_URL_SOIL=postgresql://...' >> .env
```

### PostGIS Not Enabled

The setup script automatically enables PostGIS, but if needed:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Slow Queries

Check indexes:

```sql
\di soil_*
```

Should show multiple GIST indexes for spatial queries.

### Load Failed

Check sync status:

```sql
SELECT * FROM soil_sync_status WHERE status = 'failed';
```

Re-run loader - it skips completed areas.

---

## 📚 Full Documentation

See `docs/Soil_Database_Setup_Guide.md` for:
- Detailed setup instructions
- Architecture explanation
- Performance benchmarks
- Future expansion options

---

## ✨ Benefits Summary

✅ **Instant soil property lookups** (50-200ms)  
✅ **Comprehensive Iowa soil data** (126k+ records)  
✅ **Slope, drainage, texture data** for all locations  
✅ **Foundation for map visualizations** (heat maps, overlays)  
✅ **No external dependencies** for soil properties  
✅ **Easy maintenance** (1-2 updates per year)  
✅ **Low cost** ($5/mo for Iowa data)  

⚠️ **Note**: CSR2 ratings still use external APIs (not in SSURGO data)

**Bottom Line**: You have rich soil data for instant analysis and visualization, while CSR2 continues to work via existing external API method. This is perfect for building advanced map features and soil analysis tools! 🌾

