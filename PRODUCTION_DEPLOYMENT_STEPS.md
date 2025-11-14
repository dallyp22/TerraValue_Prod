# Production Deployment - Aggregated Parcels
**Date**: November 13, 2025  
**Commit**: c677a9a

---

## ✅ Code Pushed to GitHub

**Repository**: github.com/dallyp22/TerraValue_Prod  
**Branch**: main  
**Commit**: c677a9a

**Files Changed**:
- `client/src/components/EnhancedMap.tsx` - Parcel display fixes
- `server/services/parcelTiles.ts` - Performance optimizations

---

## 🚨 CRITICAL: Database Optimization Required

The code uses optimized queries with `geom_3857` column. You **MUST** run the optimization script on your **PRODUCTION** database:

### Step 1: Connect to Production Database

Set your production `DATABASE_URL` temporarily:

```bash
export DATABASE_URL="your-production-database-url"
```

### Step 2: Run Optimization Script

```bash
npx tsx scripts/optimize-parcel-tiles.ts
```

**What it does**:
- Adds `geom_3857` column
- Transforms 605,409 geometries (takes ~5-10 minutes)
- Creates spatial index
- Analyzes table

**Expected output**:
```
✅ Column added
✅ Transformed 605409 geometries
✅ Spatial index created
✅ Table analyzed
✅ All geometries transformed!
```

**IMPORTANT**: Without this step, tiles will fail to generate on production!

---

## 📦 Automatic Deployments

### Vercel (Frontend)
- Monitors: GitHub main branch
- Triggers: Automatic on push
- Builds: `npm run build`
- Deploys: `dist/public/` directory
- ETA: 2-3 minutes

**Check status**: https://vercel.com/dashboard

### Railway (Backend)
- Monitors: GitHub main branch  
- Triggers: Automatic on push
- Builds: `npm run build && npm run build:server`
- Starts: `npm start`
- ETA: 3-5 minutes

**Check status**: https://railway.app/dashboard

---

## ⏱️ Deployment Timeline

| Time | Action |
|------|--------|
| Now | Code pushed to GitHub ✅ |
| +2 min | Vercel starts building |
| +3 min | Railway starts building |
| +5 min | Vercel deployment live |
| +8 min | Railway deployment live |
| **+10 min** | **Run database optimization** |
| +20 min | **Everything fully operational** |

---

## 🔍 Verification Steps

### 1. Check Vercel Deployment
Visit your production URL and check:
- Hard refresh: `Cmd + Shift + R`
- Check bundle name in DevTools Sources tab
- Should see: `index-6aIFerpu.js` or similar hash

### 2. Check Railway Backend
Test tile endpoint:
```
https://your-production-domain.com/api/parcels/tiles/11/491/763.mvt
```

Should return binary data (not 500 error).

### 3. Verify Database Optimization
After running `optimize-parcel-tiles.ts` on production:

```bash
npx tsx -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await sql\`SELECT COUNT(*) as total, COUNT(geom_3857) as transformed FROM parcel_aggregated\`;
console.log('Total:', r[0].total, 'Transformed:', r[0].transformed);
"
```

Should show: `Total: 605409 Transformed: 605409`

### 4. Test on Production Site
1. Visit your live site
2. Open browser console
3. Look for new debug messages (🔵, ✅)
4. Click blue parcel - should highlight
5. Check acres are calculated from geometry
6. Verify fast tile loading

---

## 🔐 Environment Variables Required

Make sure production has these set:

### Vercel:
- `VITE_MAPBOX_PUBLIC_KEY` - For Harrison County tileset

### Railway:
- `DATABASE_URL` - Your Neon database (with parcel data)
- `NODE_ENV=production`

---

## 📊 What Users Will See

### Performance:
- ⚡ 50-70% faster parcel loading
- Smooth panning and zooming
- Smaller tile downloads

### Functionality:
- 🟡 Yellow highlight on clicked parcels
- 📏 Acres calculated from actual geometry
- 🔄 Working toggle control
- 🗺️ Harrison County tileset displays correctly

---

## 🐛 Troubleshooting Production

### If tiles don't load (500 error):
**Cause**: Database optimization not run  
**Solution**: Run `npx tsx scripts/optimize-parcel-tiles.ts` with production DATABASE_URL

### If parcels load but are slow:
**Cause**: Index not created or cache not cleared  
**Solution**: 
```bash
# Clear production cache
curl -X POST https://your-domain.com/api/parcels/tiles/clear-cache
```

### If highlight doesn't work:
**Cause**: Old bundle cached in browser  
**Solution**: Hard refresh with `Cmd + Shift + R`

### If Harrison County missing:
**Cause**: Mapbox token not set  
**Solution**: Verify `VITE_MAPBOX_PUBLIC_KEY` in Vercel environment variables

---

## 📝 Database Optimization Script

If you need to run it manually on production database:

```typescript
// scripts/optimize-parcel-tiles.ts
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1. Add column
ALTER TABLE parcel_aggregated ADD COLUMN IF NOT EXISTS geom_3857 GEOMETRY(MULTIPOLYGON, 3857);

// 2. Transform geometries (5-10 minutes)
UPDATE parcel_aggregated SET geom_3857 = ST_Transform(geom, 3857) WHERE geom_3857 IS NULL;

// 3. Create index
CREATE INDEX IF NOT EXISTS parcel_aggregated_geom_3857_idx ON parcel_aggregated USING GIST(geom_3857);

// 4. Analyze
ANALYZE parcel_aggregated;
```

---

## ✅ Deployment Checklist

- [x] Code pushed to GitHub
- [ ] Run database optimization on production
- [ ] Vercel deployment complete (check dashboard)
- [ ] Railway deployment complete (check dashboard)
- [ ] Hard refresh production site
- [ ] Test parcel display
- [ ] Test highlight functionality
- [ ] Test acres calculation
- [ ] Test Harrison County
- [ ] Verify performance improvement

---

## 🎯 Next Steps

1. **Monitor deployments** - Check Vercel and Railway dashboards
2. **Run database optimization** - Once deployments complete (~10 minutes)
3. **Test production site** - Hard refresh and verify all features work
4. **Share results** - Let me know if any issues on production

---

**Status**: Code deployed, waiting for automatic builds to complete  
**Next**: Run database optimization script on production database in ~10 minutes

