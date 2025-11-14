# Iowa Parcel Data Verification Report
**Date**: November 13, 2025  
**Status**: ⚠️ INCOMPLETE - Action Required

---

## Executive Summary

Your Iowa parcel database has **2 out of 3 tables complete**, but the critical **adjacent parcel aggregation is only 6% complete**.

### Current Status

| Table | Status | Count | Expected | Completeness |
|-------|--------|-------|----------|--------------|
| **parcels** | ✅ Complete | 2,452,562 | ~2.45M | 100% |
| **parcel_ownership_groups** | ✅ Complete | 309,893 | ~310K | 100% |
| **parcel_aggregated** | ❌ Incomplete | 24,803 | ~639K | **3.9%** |

---

## Detailed Findings

### ✅ 1. Raw Parcels Table - COMPLETE
**Status**: Fully loaded and operational

- **Total parcels**: 2,452,562
- **Counties covered**: All 99 Iowa counties
- **Geometries**: 100% (all parcels have valid geometries)
- **Spatial indexes**: Present and functional
- **Top counties by parcel count**:
  1. POLK: 191,309 parcels
  2. LINN: 104,295 parcels
  3. SCOTT: 73,122 parcels
  4. BLACK HAWK: 67,869 parcels
  5. JOHNSON: 66,681 parcels

**Conclusion**: Base parcel data is perfect. ✅

---

### ✅ 2. Ownership Groups Table - COMPLETE
**Status**: Fully aggregated and operational

- **Total ownership groups**: 309,893 unique owners
- **Parcels tracked**: 1,566,499 parcels
- **Average parcels per owner**: 5.05
- **Largest single owner**: State of Iowa (8,689 parcels)
- **Combined geometries**: 100% complete

**Top 5 Landowners**:
1. STATE OF IOWA: 8,689 parcels (254,657 acres)
2. CITY OF DES MOINES: 6,437 parcels (20,703 acres)
3. UNITED STATES OF AMERICA: 3,003 parcels (205,839 acres)
4. STREET: 2,810 parcels (10,744 acres)
5. POLK COUNTY: 2,673 parcels (23,001 acres)

**Conclusion**: Ownership aggregation is perfect. ✅

---

### ❌ 3. Adjacent Parcels Table - INCOMPLETE
**Status**: Only 6 counties processed (out of 98)

#### Current State
- **Total clusters**: 24,803
- **Counties completed**: 6 (ADAIR, ADAMS, ALLAMAKEE, APPANOOSE, AUDUBON, BENTON)
- **Counties missing**: 92
- **Data created**: November 13, 2025 (TODAY)
- **Completeness**: 3.9%

#### What Happened

**Timeline of Events**:
1. **November 10, 2025**: Full aggregation completed successfully
   - ✅ Processed all 98 counties
   - ✅ Created 639,245 clusters
   - ✅ Processed 1,531,933 parcels
   - ⏱️ Completed in 44.2 minutes

2. **Between November 10-13**: Data was lost
   - Cause: Unknown (possible database issue, manual deletion, or script re-run)

3. **November 13, 2025 (TODAY)**: Partial re-run started
   - Started fresh (no progress file detected)
   - Script cleared table with `TRUNCATE TABLE parcel_aggregated`
   - Only completed 6 counties before stopping
   - Process interrupted or crashed

#### What's Missing

92 counties worth of aggregated parcel data, including major counties:
- ❌ POLK (largest county, 191K parcels)
- ❌ LINN (104K parcels)
- ❌ SCOTT (73K parcels)
- ❌ BLACK HAWK (67K parcels)
- ❌ JOHNSON (66K parcels)
- ❌ And 87 more counties...

---

## Impact on Application

### What Works ✅
- Viewing individual parcels
- Searching by parcel number
- Ownership lookup
- Basic parcel queries
- Harrison County (uses separate client-side method)

### What Doesn't Work ❌
- **Aggregated Parcels Toggle**: Shows only 6 counties worth of data
- **Adjacent ownership visualization**: Missing for 92 counties
- **Combined parcel display**: Incomplete statewide coverage
- **Map performance**: May be degraded (showing individual parcels instead of clusters)

---

## Recommended Action

### Option 1: Resume Aggregation (RECOMMENDED)
Re-run the aggregation process to complete the remaining 92 counties.

```bash
npm run db:parcels:aggregate-adjacent
```

**Expected outcome**:
- ⏱️ Time: ~40-45 minutes
- 📊 Will create: ~615,000 additional clusters
- 🗺️ Will process: ~1.4M additional parcels
- ✅ Result: Full statewide coverage

**Notes**:
- Process has resume capability (saves progress)
- If interrupted, can restart and continue
- Database space needed: ~500 MB additional

### Option 2: Restore from Backup (if available)
If you have a database backup from November 10th, you could restore just the `parcel_aggregated` table.

### Option 3: Investigate Data Loss
Check if there's a database backup, logs, or recent schema changes that might explain the data loss.

---

## Technical Details

### Database Health
- ✅ PostGIS extension: Enabled (v3.5)
- ✅ Spatial indexes: Present and functioning
- ✅ Connection: Working
- ✅ Table structure: Correct

### Script Behavior
The aggregation script (`aggregate-adjacent-parcels.ts`):
- Looks for progress file: `adjacent-parcel-progress.json`
- If **no progress file found**: Assumes fresh start
  - Runs `TRUNCATE TABLE parcel_aggregated` (clears all data)
  - Starts from county 1
- If **progress file exists**: Resumes from last completed county

**This explains the data loss**: When the script ran today without a progress file, it cleared the November 10th data and started fresh.

### Progress File
Currently: **Does not exist**

When aggregation runs, it creates: `./adjacent-parcel-progress.json`

Example content:
```json
{
  "completedCounties": ["ADAIR", "ADAMS", ...],
  "totalClusters": 24803,
  "totalParcelsProcessed": 63099
}
```

---

## Verification Commands

### Check current status:
```bash
npx tsx scripts/verify-parcel-data.ts
```

### Check aggregation progress during run:
```bash
cat adjacent-parcel-progress.json
```

### Monitor live aggregation:
```bash
npm run db:parcels:aggregate-adjacent 2>&1 | tee adjacent-aggregation-$(date +%Y%m%d-%H%M).log
```

---

## SQL Verification Queries

### Count by table:
```sql
SELECT 'parcels' as table_name, COUNT(*) FROM parcels
UNION ALL
SELECT 'ownership_groups', COUNT(*) FROM parcel_ownership_groups
UNION ALL
SELECT 'aggregated', COUNT(*) FROM parcel_aggregated;
```

### County coverage in aggregated table:
```sql
SELECT 
  county, 
  COUNT(*) as clusters,
  SUM(parcel_count) as parcels,
  SUM(total_acres)::int as acres
FROM parcel_aggregated
GROUP BY county
ORDER BY county;
```

### Check for recent data changes:
```sql
SELECT 
  'parcels' as table_name,
  MIN(created_at) as earliest,
  MAX(created_at) as latest,
  COUNT(*) as count
FROM parcels
UNION ALL
SELECT 
  'aggregated',
  MIN(created_at),
  MAX(created_at),
  COUNT(*)
FROM parcel_aggregated;
```

---

## Next Steps

1. **Immediate**: Run aggregation to complete the data
   ```bash
   npm run db:parcels:aggregate-adjacent
   ```

2. **Monitor**: Watch the progress (should complete in ~45 minutes)
   
3. **Verify**: Run verification script again after completion
   ```bash
   npx tsx scripts/verify-parcel-data.ts
   ```

4. **Backup**: Consider creating a database backup after successful completion

5. **Investigate**: Determine why the November 10th data was lost (check logs, database history)

---

## Expected Final State

After running the aggregation, you should see:

| Table | Count | Status |
|-------|-------|--------|
| parcels | 2,452,562 | ✅ |
| parcel_ownership_groups | 309,893 | ✅ |
| parcel_aggregated | ~639,000 | ✅ |

**Counties with aggregated data**: 98 (all except Harrison)

---

## Contact Support

If the aggregation fails or you need assistance:
1. Check the log file: `adjacent-aggregation-[timestamp].log`
2. Review error messages
3. Ensure database has sufficient storage (~500 MB needed)
4. Check database connection stability

---

**Report Generated**: November 13, 2025  
**Script Used**: `scripts/verify-parcel-data.ts`  
**Database**: Neon PostgreSQL with PostGIS 3.5

