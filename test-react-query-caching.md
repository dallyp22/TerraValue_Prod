# React Query Caching Diagnostic Test

## Quick Verification Test

Open your browser console and run this test:

### Step 1: Load the Map
1. Navigate to the Valuation Tool / Map page
2. Open Console (F12)
3. Look for: `✅ Auctions loaded: X total`
4. Note the number of auctions

### Step 2: Check React Query DevTools (Optional)
If you have React Query DevTools installed, you'll see:
- Query key: `["auctions", "bounds...", ...]`
- Status: `success`
- Data: Array of auctions
- Last updated timestamp

### Step 3: Test Navigation Persistence
1. **Stay on the map page**
2. **Open Network tab** in DevTools
3. **Clear network log**
4. **Navigate to Auctions page** (or any other page)
5. **Wait 2 seconds**
6. **Navigate back to Map**
7. **Check Network tab:**
   - Should see 0 new requests immediately (cache hit!)
   - After ~100ms, might see background refetch

### Step 4: Verify Console Logs

**On first load, you should see:**
```
✅ Auctions loaded: 62 total
```

**On navigation back, you should see:**
```
✅ Auctions loaded: 62 total
```
(This confirms refetch happened)

**You should NOT see:**
```
❌ Failed to load auctions: ...
Uncaught ReferenceError: loadAuctions is not defined
```

## Detailed Diagnostic

### Test A: Cache is Working

**In browser console, type:**
```javascript
// Check if React Query is loaded
window.__REACT_QUERY_CLIENT__ !== undefined
```

Should return `true`

### Test B: Auctions are Cached

1. Load map, see auctions
2. Note timestamp in console
3. Navigate away
4. **Immediately** navigate back (< 2 seconds)
5. **Expected:** Auctions appear instantly
6. **If broken:** Blank map for 1-2 seconds

### Test C: Background Refetch

1. Load map, see auctions
2. Wait 3 minutes (> staleTime)
3. Click on the window to refocus
4. **Check Network tab:** Should see new /api/auctions request
5. **Expected:** Background refetch triggered

## What to Look For

### ✅ **WORKING CORRECTLY:**
```
Console:
  ✅ Auctions loaded: 62 total
  (navigate away and back)
  ✅ Auctions loaded: 62 total

Network Tab:
  First load: GET /api/auctions → 200 OK
  Navigate away: (no requests)
  Navigate back: (instant display, then background fetch)

Map:
  Auctions appear instantly on return
```

### ❌ **NOT WORKING:**
```
Console:
  ❌ Failed to load auctions
  TypeError: ...
  Uncaught ReferenceError

Network Tab:
  Navigate back: 2-second delay before request
  Multiple duplicate requests

Map:
  Blank for 1-2 seconds on return
  Auctions disappear randomly
```

## Common Issues

### Issue 1: mapBounds Not Being Set

**Symptom:** Query never runs
**Check:** Console log `mapBounds` value
**Fix:** Verify map initialization sets bounds

Add this temporary debug line in EnhancedMap.tsx:
```typescript
useEffect(() => {
  console.log('🔍 DEBUG: mapBounds =', mapBounds);
}, [mapBounds]);
```

### Issue 2: Query Disabled

**Symptom:** useQuery never executes
**Check:** `enabled` prop conditions
**Fix:** Verify all three conditions are true:
- `!!map.current` → map is initialized
- `showAuctionLayer` → layer is visible
- `!!mapBounds` → bounds are set

Add debug:
```typescript
useEffect(() => {
  console.log('🔍 DEBUG: Query enabled?', {
    hasMap: !!map.current,
    showLayer: showAuctionLayer,
    hasBounds: !!mapBounds,
    enabled: !!map.current && showAuctionLayer && !!mapBounds
  });
}, [map.current, showAuctionLayer, mapBounds]);
```

### Issue 3: Cache Key Changes Too Often

**Symptom:** Never uses cache, always fetches
**Check:** Query key stability
**Fix:** Ensure mapBounds only updates on actual map movement

Add debug:
```typescript
useEffect(() => {
  console.log('🔍 DEBUG: Query key =', buildAuctionQueryKey());
}, [buildAuctionQueryKey()]);
```

## Manual Verification

### Check 1: React Query is Imported
```bash
grep "import.*useQuery.*@tanstack/react-query" client/src/components/EnhancedMap.tsx
```
Should return: `import { useQuery } from '@tanstack/react-query';`

### Check 2: useQuery Hook Exists
```bash
grep -n "useQuery({" client/src/components/EnhancedMap.tsx
```
Should show line number ~491

### Check 3: mapBounds State Exists
```bash
grep "useState<string>('')" client/src/components/EnhancedMap.tsx
```
Should show: `const [mapBounds, setMapBounds] = useState<string>('');`

## If Still Not Working

### Add Enhanced Logging

In `EnhancedMap.tsx`, add these logs:

```typescript
// After useQuery hook
useEffect(() => {
  console.log('🔍 CACHE DEBUG:', {
    queryEnabled: !!map.current && showAuctionLayer && !!mapBounds,
    hasData: !!auctionsData,
    auctionCount: auctionsData?.auctions?.length || 0,
    isLoading: auctionsLoading,
    hasError: !!auctionsError,
    mapBounds: mapBounds.substring(0, 50) + '...'
  });
}, [auctionsData, auctionsLoading, auctionsError, mapBounds]);
```

Run the navigation test and check these logs.

## Expected Behavior Timeline

```
T+0s:     User loads map
T+0.1s:   mapBounds set
T+0.1s:   useQuery enabled
T+0.2s:   Query executes (cache miss)
T+1.2s:   API responds
T+1.2s:   Cache populated
T+1.2s:   Map markers display
T+1.2s:   ✅ "Auctions loaded: 62 total"

T+10s:    User navigates away
T+10s:    Component unmounts
T+10s:    Cache persists

T+15s:    User returns
T+15.05s: Component mounts
T+15.05s: useQuery checks cache
T+15.05s: Cache HIT! (< 2min stale time)
T+15.05s: Instant display
T+15.05s: No API request
T+15.1s:  Background refetch (refetchOnMount: true)
T+16.3s:  Fresh data received
T+16.3s:  ✅ "Auctions loaded: 62 total"
```

## Next Steps

1. Run the verification tests above
2. Share console output
3. Share Network tab screenshot
4. If issues found, we'll add debug logging
