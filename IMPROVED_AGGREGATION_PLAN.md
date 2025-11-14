# Improved Parcel Aggregation Plan
**Date**: November 13, 2025  
**Goal**: Re-aggregate all Iowa parcels with enhanced fuzzy name matching

---

## Executive Summary

This plan will re-run the statewide parcel aggregation with **improved deed holder name matching** to combine parcels where owners have slight name variations (e.g., "John Smith", "John & Jill Smith", "Smith Family Trust").

### What's Different from Before

**Previous Aggregation** (November 10th):
- ❌ Exact match only on `deed_holder_normalized`
- ❌ "John Smith" ≠ "John & Jill Smith" ≠ "Smith Family Trust"
- ❌ Treated as separate owners

**New Aggregation** (This Plan):
- ✅ Fuzzy matching using Levenshtein distance
- ✅ Configurable similarity threshold
- ✅ Groups similar owner names together
- ✅ "John Smith" ≈ "John & Jill Smith" ≈ "Smith Family Trust"
- ✅ Review and override capability

---

## Phase 1: Data Verification ✅

### Current State (Verified)

| Component | Status | Count |
|-----------|--------|-------|
| Raw parcels | ✅ Ready | 2,452,562 |
| Parcels with owner | ✅ Ready | 2,416,242 |
| Parcels with normalized names | ✅ Ready | 2,415,591 |
| Counties | ✅ Ready | 99 |

**Conclusion**: Base parcel data is complete and ready for aggregation.

### Sample Name Variations Found

Real examples from your database showing the problem:

```
"SMITH, HANK INC"          → Normalized: "HANK INC SMITH"
"SMITH, JAMES F & MARY ANN" → Normalized: "JAMES F MARY ANN SMITH"
"SMITH DOYLE REVOCABLE TRUST" → Normalized: "SMITH DOYLE REVOCABLE"
"SMITH TRUST, ROBERT W"     → Normalized: "ROBERT W SMITH TRUST"
"SMITH, LYLE L."            → Normalized: "LYLE L SMITH"
```

These are likely the same family/entity but treated as 5 separate owners!

---

## Phase 2: Enhanced Name Matching System

### 2.1 Create Owner Fuzzy Matching Table

New database table: `parcel_owner_groups`

```sql
CREATE TABLE parcel_owner_groups (
  id SERIAL PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,  -- The "master" name for the group
  member_names TEXT[] NOT NULL,          -- Array of similar variations
  similarity_threshold REAL NOT NULL,    -- How similar names must be (0.0-1.0)
  manual_override BOOLEAN DEFAULT false, -- If manually reviewed/adjusted
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_owner_groups_canonical ON parcel_owner_groups(canonical_name);
```

### 2.2 Fuzzy Matching Algorithm

**Multiple matching strategies** (in order of confidence):

#### Strategy 1: High Confidence (Auto-merge)
- **Levenshtein distance** ≤ 3 characters
- **Jaro-Winkler similarity** ≥ 0.9
- **Common patterns**:
  - Same last name + adding spouse: "John Smith" → "John & Jill Smith"
  - Adding entity type: "Smith" → "Smith Trust" → "Smith Family Trust"
  - Minor typos: "Smith" vs "Smyth"

#### Strategy 2: Medium Confidence (Review suggested)
- **Levenshtein distance** 4-6 characters
- **Jaro-Winkler similarity** 0.8-0.89
- **Shared keywords** (surname extraction)

#### Strategy 3: Substring Matching
- "Smith Family Trust" contains "Smith"
- "John M Smith" contains "Smith"
- Must share at least 60% of normalized tokens

### 2.3 Matching Rules

```typescript
interface MatchingRule {
  priority: number;
  autoMerge: boolean;
  condition: (name1: string, name2: string) => boolean;
}

const rules = [
  // Rule 1: Exact match after aggressive normalization
  {
    priority: 1,
    autoMerge: true,
    condition: (n1, n2) => {
      const strip = (s) => s.replace(/\s*(AND|&|TRUST|LLC|INC|FAMILY).*$/i, '');
      return strip(n1) === strip(n2);
    }
  },
  
  // Rule 2: Same surname + first name variation
  {
    priority: 2,
    autoMerge: true,
    condition: (n1, n2) => {
      const surname1 = n1.split(' ').pop();
      const surname2 = n2.split(' ').pop();
      return surname1 === surname2 && levenshteinDistance(n1, n2) <= 3;
    }
  },
  
  // Rule 3: Levenshtein distance threshold
  {
    priority: 3,
    autoMerge: false, // Needs review
    condition: (n1, n2) => levenshteinDistance(n1, n2) <= 5
  },
  
  // Rule 4: Jaro-Winkler similarity
  {
    priority: 4,
    autoMerge: true,
    condition: (n1, n2) => jaroWinklerSimilarity(n1, n2) >= 0.92
  }
];
```

---

## Phase 3: Implementation Scripts

### 3.1 Script: Analyze Name Variations
**File**: `scripts/analyze-owner-name-variations.ts`

**Purpose**: Find clusters of similar owner names and estimate merge impact

**Output**:
```
📊 Owner Name Variation Analysis
================================

Exact matches: 309,893 unique owners
Potential fuzzy matches: 45,231 groups (est. 89,456 owners)

Sample merge candidates:
  Group 1: "SMITH FARMS" (confidence: 95%)
    - SMITH FARMS LLC (234 parcels)
    - SMITH FARMS INC (156 parcels)
    - SMITH FARM (89 parcels)
    → Combined: 479 parcels

  Group 2: "JOHNSON FAMILY" (confidence: 88%)
    - JOHNSON FAMILY TRUST (345 parcels)
    - JOHNSON FAMILY LLC (123 parcels)
    - JOHNSON FAM TRUST (67 parcels)
    → Combined: 535 parcels

Total estimated impact:
  Before: 309,893 unique owners
  After: ~265,000 unique owners
  Reduction: ~45,000 duplicate variations (14.5%)
```

### 3.2 Script: Generate Owner Groups
**File**: `scripts/generate-owner-groups.ts`

**Purpose**: Create the `parcel_owner_groups` table with fuzzy matches

**Process**:
1. Load all unique `deed_holder_normalized` values
2. Apply fuzzy matching algorithms
3. Group similar names together
4. Assign canonical name to each group
5. Store in `parcel_owner_groups` table
6. Generate review file for manual checking

**Options**:
- `--threshold=0.9` - Similarity threshold (0.0-1.0)
- `--auto-merge` - Automatically merge high-confidence matches
- `--review-only` - Generate review file without DB changes
- `--county=POLK` - Test on single county first

### 3.3 Script: Review Owner Groups
**File**: `scripts/review-owner-groups.ts`

**Purpose**: Interactive CLI to review and adjust suggested merges

**Interface**:
```
🔍 Reviewing 234 suggested owner groups...

Group 45/234 (Medium Confidence: 87%)
─────────────────────────────────────
Canonical: SMITH FAMILY TRUST

Members (5):
  1. SMITH FAMILY TRUST (234 parcels)
  2. SMITH FAMILY REVOCABLE TRUST (156 parcels)
  3. SMITH FAM TRUST (89 parcels)
  4. SMITH FAMILY (67 parcels)
  5. SMITH FAMILIY TRUST (12 parcels)  ← typo

Actions:
  [A] Accept merge
  [R] Reject merge
  [E] Edit (remove members)
  [S] Skip for now
  [Q] Quit and save

Choice: _
```

### 3.4 Script: Apply Owner Groups to Parcels
**File**: `scripts/apply-owner-groups.ts`

**Purpose**: Add `owner_group_id` to parcels table

```sql
-- Add new column to parcels table
ALTER TABLE parcels ADD COLUMN IF NOT EXISTS owner_group_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_parcels_owner_group ON parcels(owner_group_id);

-- Update parcels with their group ID
UPDATE parcels p
SET owner_group_id = og.id
FROM parcel_owner_groups og
WHERE p.deed_holder_normalized = ANY(og.member_names);
```

### 3.5 Script: Enhanced Adjacent Aggregation
**File**: `scripts/aggregate-adjacent-enhanced.ts`

**Purpose**: Run aggregation using `owner_group_id` instead of exact name match

**Key changes**:
```typescript
// OLD: Group by exact normalized name
WHERE deed_holder_normalized = $1

// NEW: Group by owner_group_id (fuzzy matched)
WHERE owner_group_id = $1
  OR (owner_group_id IS NULL AND deed_holder_normalized = $1)
```

---

## Phase 4: Testing Plan

### 4.1 Test on Single County (POLK)

**Why POLK**: Largest county (191K parcels) - if it works here, it works everywhere.

```bash
# Step 1: Analyze
npx tsx scripts/analyze-owner-name-variations.ts --county=POLK

# Step 2: Generate groups
npx tsx scripts/generate-owner-groups.ts --county=POLK --review-only

# Step 3: Review output
cat owner-groups-POLK-preview.json

# Step 4: Apply (if looks good)
npx tsx scripts/generate-owner-groups.ts --county=POLK --auto-merge

# Step 5: Run aggregation
npx tsx scripts/aggregate-adjacent-enhanced.ts --county=POLK

# Step 6: Compare results
npx tsx scripts/compare-aggregation-results.ts --county=POLK
```

### 4.2 Compare Old vs New

**Metrics to check**:
- Number of aggregated clusters (should be fewer with fuzzy matching)
- Average parcels per cluster (should be higher)
- Visual spot checks on map
- Specific known cases (e.g., Smith family variations)

---

## Phase 5: Full State Rollout

### 5.1 Pre-flight Checklist

- [ ] Test county (POLK) completed successfully
- [ ] Results reviewed and validated
- [ ] Database backup created
- [ ] Sufficient database storage available (~1 GB)
- [ ] Estimated runtime confirmed (~2-3 hours)
- [ ] Progress tracking enabled

### 5.2 Execution Steps

```bash
# Step 1: Backup current state
pg_dump $DATABASE_URL -t parcel_aggregated > backup_aggregated_$(date +%Y%m%d).sql

# Step 2: Analyze all counties
npx tsx scripts/analyze-owner-name-variations.ts > name-analysis-full.log

# Step 3: Generate owner groups (auto-merge high confidence)
npx tsx scripts/generate-owner-groups.ts --auto-merge --threshold=0.9 > owner-groups.log

# Step 4: Review medium confidence matches
npx tsx scripts/review-owner-groups.ts

# Step 5: Apply groups to parcels
npx tsx scripts/apply-owner-groups.ts

# Step 6: Run enhanced aggregation
npx tsx scripts/aggregate-adjacent-enhanced.ts 2>&1 | tee aggregation-enhanced-$(date +%Y%m%d).log

# Step 7: Verify results
npx tsx scripts/verify-parcel-data.ts
```

### 5.3 Safety Features

All scripts include:
- ✅ Dry-run mode
- ✅ Progress tracking with resume capability
- ✅ Automatic backups before major changes
- ✅ Rollback capability
- ✅ Detailed logging

---

## Phase 6: Validation & QA

### 6.1 Automated Checks

```typescript
// Verify counts make sense
const checks = {
  totalParcels: 2_452_562,  // Should not change
  ownerGroups: '< 309,893',  // Should be fewer (merged)
  aggregatedClusters: '< 639,000',  // Should be fewer (better merging)
  avgParcelsPerCluster: '> 2.4',  // Should be higher
};
```

### 6.2 Manual Spot Checks

Test cases to verify:
1. **Smith Family**: All variations merged correctly
2. **Major landowners**: State of Iowa, cities, etc. unchanged
3. **Edge cases**: Single-owner counties still work
4. **Visual check**: Harrison County unaffected

### 6.3 Performance Validation

- Map load times (should be faster with fewer clusters)
- API response times
- Database query performance
- Tile generation speed

---

## Phase 7: Documentation & Cleanup

### 7.1 Update Documentation

Files to update:
- `PARCEL_DATA_SYSTEM.md` - Add fuzzy matching section
- `ADJACENT_PARCEL_AGGREGATION.md` - Update with new algorithm
- `PARCEL_DATA_VERIFICATION_REPORT.md` - New baseline numbers

### 7.2 Cleanup

```bash
# Remove old progress files
rm -f adjacent-parcel-progress.json

# Archive old logs
mkdir -p logs/archive
mv adjacent-aggregation-*.log logs/archive/

# Clean up test files
rm -f owner-groups-*-preview.json
```

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Verification | 5 minutes | None |
| Phase 2: Script development | 2 hours | Phase 1 |
| Phase 3: Single county test | 30 minutes | Phase 2 |
| Phase 4: Review & adjustments | 1 hour | Phase 3 |
| Phase 5: Full state rollout | 2-3 hours | Phase 4 |
| Phase 6: Validation | 30 minutes | Phase 5 |
| Phase 7: Documentation | 30 minutes | Phase 6 |
| **Total** | **7-8 hours** | - |

**Note**: Most of Phase 5 is automated processing time.

---

## Expected Results

### Before (Current State)
```
Owner: "SMITH, JOHN"           → 12 parcels → 3 clusters
Owner: "JOHN & JILL SMITH"     → 8 parcels  → 2 clusters
Owner: "SMITH FAMILY TRUST"    → 15 parcels → 4 clusters
────────────────────────────────────────────────────────
Total: 35 parcels → 9 separate clusters
```

### After (Fuzzy Matching)
```
Owner Group: "SMITH FAMILY"
  ├─ "SMITH, JOHN"             12 parcels
  ├─ "JOHN & JILL SMITH"       8 parcels
  └─ "SMITH FAMILY TRUST"      15 parcels
────────────────────────────────────────────────────────
Total: 35 parcels → 4-5 combined clusters
```

**Impact**: More accurate ownership representation, fewer but larger clusters.

---

## Rollback Plan

If something goes wrong:

```bash
# Option 1: Restore from backup
psql $DATABASE_URL < backup_aggregated_YYYYMMDD.sql

# Option 2: Re-run old aggregation
npm run db:parcels:aggregate-adjacent

# Option 3: Drop owner groups and revert parcels
DROP TABLE parcel_owner_groups;
ALTER TABLE parcels DROP COLUMN owner_group_id;
```

---

## Configuration Options

### Tunable Parameters

```typescript
// Fuzzy matching sensitivity
const CONFIG = {
  // Levenshtein distance (characters different)
  maxEditDistance: 3,          // Lower = stricter (0-10)
  
  // Jaro-Winkler similarity (0.0-1.0)
  minSimilarity: 0.90,         // Higher = stricter (0.8-1.0)
  
  // Auto-merge threshold
  autoMergeConfidence: 0.95,   // Higher = fewer auto-merges
  
  // Minimum parcels to consider
  minParcelsForMerge: 2,       // Don't merge single-parcel owners
  
  // County-specific overrides
  countyOverrides: {
    'HARRISON': { enabled: false },  // Keep client-side
    'POLK': { maxEditDistance: 2 },  // Stricter for large county
  }
};
```

---

## Next Steps

To begin implementation:

1. **Review this plan** - Approve approach and parameters
2. **Create scripts** - Build the 5 new TypeScript files
3. **Test on POLK** - Validate on largest county
4. **Review results** - Check if merging is working correctly
5. **Run statewide** - Execute on all 98 counties
6. **Validate** - Verify data quality and completeness

**Recommendation**: Start with Phase 2 (script development) and test on POLK County before committing to full state rollout.

---

## Questions to Answer

Before proceeding, please consider:

1. **Matching threshold**: How aggressive should fuzzy matching be?
   - Conservative (90% similarity): Fewer merges, higher confidence
   - Moderate (85% similarity): Balanced approach
   - Aggressive (80% similarity): More merges, needs more review

2. **Manual review**: Do you want to manually review suggested merges?
   - Yes: Use interactive review script
   - No: Trust high-confidence auto-merge only

3. **Existing data**: Should we preserve the old aggregation for comparison?
   - Yes: Create `parcel_aggregated_old` backup table
   - No: Overwrite directly

4. **Testing scope**: Start with full state or test county first?
   - Recommended: Test on POLK County first

---

**Status**: ✅ Plan Complete - Ready for Implementation  
**Next Action**: Begin Phase 2 (Script Development) upon approval

