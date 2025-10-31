# Soil Database Deployment Checklist

Use this checklist to deploy the Iowa soil database to production.

---

## ✅ Pre-Deployment (5 minutes)

- [ ] Review `SOIL_DATABASE_QUICK_START.md` for overview
- [ ] Review `docs/Soil_Database_Setup_Guide.md` for details
- [ ] Ensure Railway account is active
- [ ] Confirm Railway payment method (Hobby plan: $5/mo)

---

## ✅ Provision Database (2 minutes)

### Option A: Railway Dashboard
- [ ] Login to [Railway Dashboard](https://railway.app/dashboard)
- [ ] Select your TerraValue project
- [ ] Click "+ New" → "Database" → "Add PostgreSQL"
- [ ] Wait for provisioning (~30 seconds)
- [ ] Go to PostgreSQL service → "Variables" tab
- [ ] Copy `DATABASE_URL` value

### Option B: Railway CLI
```bash
railway login
railway add --database postgres
railway variables | grep DATABASE_URL
```

---

## ✅ Configure Environment (2 minutes)

### Local Development
- [ ] Copy PostgreSQL URL from Railway
- [ ] Add to `.env` file:
  ```env
  DATABASE_URL_SOIL=postgresql://postgres:password@railway.app:5432/railway
  ```
- [ ] Verify variable is set: `echo $DATABASE_URL_SOIL`

### Railway Production
- [ ] Go to Railway project → Main application service
- [ ] Click "Variables" tab
- [ ] Click "+ New Variable"
- [ ] Set **Key**: `DATABASE_URL_SOIL`
- [ ] Set **Value**: (paste PostgreSQL DATABASE_URL)
- [ ] Click "Add"
- [ ] Redeploy application (automatic)

---

## ✅ Create Schema (1 minute)

```bash
npm run db:soil:push
```

**Expected output:**
```
✅ PostGIS extension enabled
✅ Tables created: soil_legend, soil_mapunit, soil_component, soil_chorizon
✅ CSR2 ratings table created
✅ Spatial table created
✅ Indexes created
```

**Checklist:**
- [ ] Command completed without errors
- [ ] PostGIS extension enabled
- [ ] All 7 tables created
- [ ] Spatial indexes created

---

## ✅ Load Iowa Data (30-60 minutes)

```bash
npm run db:soil:load
```

**Expected progress:**
```
🚀 Iowa Soil Data Loader
This will load Iowa SSURGO and CSR2 data into your local database.
Estimated time: 30-60 minutes

Setting up PostGIS extension...
✅ PostGIS extension enabled
✅ Spatial indexes created

📍 Loading Iowa survey areas...
Found 99 Iowa survey areas
  Inserted 99/99 legends

============================================================
Processing IA001 (Adair County)
============================================================

🗺️  Loading map units for IA001...
  Found 156 map units
    Inserted 156/156 map units

🧩 Loading components for IA001...
  Found 423 components
    Inserted 423/423 components

📊 Loading horizons for IA001...
  Found 2,134 horizons
    Inserted 2,134/2,134 horizons

🌽 Loading CSR2 ratings for IA001...
  Found 398 CSR2 ratings
    Inserted 398/398 CSR2 ratings

✅ IA001 complete: 156 mapunits, 423 components, 2,134 horizons, 398 CSR2 ratings

... (repeats for all 99 Iowa counties)

📈 Creating materialized view...
✅ Materialized view created

============================================================
✨ Load complete!
⏱️  Total time: 45m 23s
============================================================
```

**Checklist:**
- [ ] All 99 Iowa counties processed
- [ ] No fatal errors
- [ ] Materialized view created successfully
- [ ] Total time < 90 minutes

**If errors occur:**
- Network timeout → Retry the command (it skips completed areas)
- Out of memory → Reduce `BATCH_SIZE` in script
- USDA API error → Wait 5 minutes and retry

---

## ✅ Verify Installation (2 minutes)

### Check Database Contents

```bash
psql $DATABASE_URL_SOIL
```

```sql
-- Should show ~99 Iowa survey areas
SELECT COUNT(*) FROM soil_legend;

-- Should show ~15,000-20,000 map units
SELECT COUNT(*) FROM soil_mapunit;

-- Should show ~40,000-60,000 components
SELECT COUNT(*) FROM soil_component;

-- Should show ~150,000-200,000 horizons
SELECT COUNT(*) FROM soil_chorizon;

-- Should show ~35,000-50,000 ratings
SELECT COUNT(*) FROM soil_csr2_ratings;

-- Should show ~40,000-60,000 rows
SELECT COUNT(*) FROM iowa_soil_summary;

-- Check database size
SELECT pg_size_pretty(pg_database_size(current_database()));
-- Should show 4-6 GB

\q
```

**Checklist:**
- [ ] All tables have expected row counts
- [ ] Database size is 4-6 GB
- [ ] No errors when querying tables

### Test Application

```bash
npm run dev
```

**Test CSR2 query:**
1. [ ] Open http://localhost:5001
2. [ ] Navigate to valuation page
3. [ ] Click on a parcel in Iowa
4. [ ] Check browser console for log:
   ```
   ✅ CSR2 from local DB for (-93.6091, 41.5868): 84.2
   ```
   (NOT "from MSU ImageServer" or "from USDA")
5. [ ] Verify CSR2 result appears in < 1 second

**Performance test:**
- [ ] Point query completes in < 200ms
- [ ] Polygon query (160 acres) completes in < 500ms
- [ ] Console shows "CSR2 from local DB" message

---

## ✅ Deploy to Production (5 minutes)

### Commit Changes

```bash
git add .
git commit -m "Add Iowa soil database for 10-100x faster CSR2 queries"
git push origin main
```

**Checklist:**
- [ ] All new files committed
- [ ] Changes pushed to GitHub
- [ ] Railway auto-deployment triggered

### Verify Production Deployment

1. [ ] Go to Railway dashboard
2. [ ] Check deployment logs for errors
3. [ ] Verify `DATABASE_URL_SOIL` variable is set
4. [ ] Test production URL with CSR2 query
5. [ ] Check logs for "✅ CSR2 from local DB" messages

---

## ✅ Post-Deployment Validation (5 minutes)

### Performance Benchmarks

Test on production:

**Point Query:**
```bash
curl -X POST https://your-app.railway.app/api/csr2/point \
  -H "Content-Type: application/json" \
  -d '{"longitude":-93.6091,"latitude":41.5868}'
```
- [ ] Response time < 500ms
- [ ] Returns CSR2 value

**Polygon Query:**
```bash
curl -X POST https://your-app.railway.app/api/csr2/polygon \
  -H "Content-Type: application/json" \
  -d '{"wkt":"POLYGON((-93.61 41.58,-93.60 41.58,-93.60 41.59,-93.61 41.59,-93.61 41.58))"}'
```
- [ ] Response time < 1000ms
- [ ] Returns mean, min, max, count

### Monitor Logs

```bash
railway logs --service postgresql
```

**Look for:**
- [ ] No connection errors
- [ ] Query times < 500ms
- [ ] No memory warnings

### Check Railway Metrics

Railway Dashboard → PostgreSQL service → Metrics:
- [ ] CPU usage < 50%
- [ ] Memory usage < 80%
- [ ] Storage ~4-6 GB
- [ ] Network activity normal

---

## ✅ User Acceptance Testing (10 minutes)

### Test Scenarios

1. **Iowa Parcel CSR2 Query**
   - [ ] Select parcel in Iowa
   - [ ] CSR2 appears in < 1 second
   - [ ] Value is reasonable (30-95 range)
   - [ ] Console shows "from local DB"

2. **Large Polygon Query**
   - [ ] Draw custom polygon (160+ acres)
   - [ ] CSR2 stats appear in < 2 seconds
   - [ ] Min/max/mean values are logical
   - [ ] Console shows "from local DB"

3. **Multi-Parcel Selection**
   - [ ] Select multiple adjacent parcels
   - [ ] CSR2 for each loads quickly
   - [ ] Values vary appropriately by soil type
   - [ ] No timeout errors

4. **Valuation Pipeline**
   - [ ] Run full valuation with CSR2
   - [ ] Total time < 10 seconds
   - [ ] CSR2 value used in calculation
   - [ ] Report includes CSR2 data

5. **Fallback Test** (optional)
   - [ ] Temporarily unset `DATABASE_URL_SOIL`
   - [ ] Restart app
   - [ ] CSR2 still works (external APIs)
   - [ ] Restore `DATABASE_URL_SOIL`

---

## ✅ Documentation Review

- [ ] `SOIL_DATABASE_QUICK_START.md` reviewed
- [ ] `docs/Soil_Database_Setup_Guide.md` reviewed
- [ ] `IMPLEMENTATION_SUMMARY.md` reviewed
- [ ] `.env.example` includes `DATABASE_URL_SOIL`
- [ ] README.md mentions soil database feature

---

## ✅ Maintenance Setup (5 minutes)

### Schedule Quarterly Updates

Add reminder to check for USDA data updates:

**Option A: Calendar Reminder**
- [ ] Create recurring calendar event (every 3 months)
- [ ] Title: "Check for USDA Iowa soil data updates"
- [ ] Link: https://www.nrcs.usda.gov/wps/portal/nrcs/main/soils/survey/

**Option B: Railway Cron Job** (future enhancement)
```yaml
schedule: "0 0 1 */3 *"  # First day of quarter
command: "npm run db:soil:load && npm run db:soil:refresh"
```

### Monitor Database Health

- [ ] Set up Railway alerts for high memory usage (>90%)
- [ ] Set up Railway alerts for storage (>7GB)
- [ ] Document update procedure in team wiki/docs

---

## ✅ Rollback Plan

If issues occur, soil database can be disabled without breaking the app:

1. **Remove environment variable:**
   ```bash
   railway variables --remove DATABASE_URL_SOIL
   ```
   
2. **Application automatically falls back to external APIs**

3. **No code changes needed**

4. **User experience degrades but app still works**

**Checklist:**
- [ ] Team knows rollback procedure
- [ ] External APIs still accessible
- [ ] Monitoring in place to detect issues

---

## 🎉 Deployment Complete!

When all checkboxes are complete:

- ✅ Iowa soil database is live
- ✅ CSR2 queries are 10-100x faster
- ✅ Application is more reliable
- ✅ User experience is dramatically improved
- ✅ Maintenance procedures documented
- ✅ Rollback plan established

---

## 📊 Success Metrics to Track

Monitor these metrics over the first week:

| Metric | Target | How to Check |
|--------|--------|--------------|
| CSR2 query success rate | >99% | Application logs |
| Average query time | <500ms | Railway metrics |
| Database CPU usage | <50% | Railway dashboard |
| Database memory usage | <80% | Railway dashboard |
| User-reported issues | 0 | Support tickets |

---

## 🆘 Troubleshooting

### Common Issues

**"Soil database not configured"**
- Check `DATABASE_URL_SOIL` is set
- Verify PostgreSQL is running on Railway
- Check connection string format

**Slow queries (>1s)**
- Verify spatial indexes exist: `\di soil_*`
- Check database CPU/memory usage
- Consider upgrading Railway plan

**No data returned**
- Verify data load completed successfully
- Check sync status: `SELECT * FROM soil_sync_status`
- Re-run loader if needed

**Production different from local**
- Verify environment variable in Railway
- Check Railway deployment logs
- Ensure latest code is deployed

---

## 📞 Support

- **Documentation**: `docs/Soil_Database_Setup_Guide.md`
- **Quick Start**: `SOIL_DATABASE_QUICK_START.md`
- **Implementation Details**: `IMPLEMENTATION_SUMMARY.md`
- **Railway Support**: https://railway.app/help

---

**Estimated Total Time**: 50-75 minutes
- Pre-deployment: 5 min
- Provisioning: 2 min
- Configuration: 2 min
- Schema creation: 1 min
- Data loading: 30-60 min
- Verification: 2 min
- Deployment: 5 min
- Testing: 10 min

**Ready to deploy?** Start with the Pre-Deployment section above! 🚀

