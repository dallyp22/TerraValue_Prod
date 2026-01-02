# Auction Display Fix - Testing Guide

## Quick Test (2 minutes)

1. **Navigate to Valuation Tool page**
   - Open browser to your app
   - Go to the Valuation Tool / Map page
   - Wait for auctions to load on map
   - Open browser console (F12)
   - Look for: `✅ Auctions loaded: X total`

2. **Test Navigation**
   - Navigate to Auctions page
   - Navigate back to Valuation Tool page
   - **VERIFY:** Auctions immediately visible (from cache)
   - **VERIFY:** Console shows `✅ Auctions loaded` again

3. **Test Valuation**
   - Run a quick valuation
   - After valuation completes
   - **VERIFY:** Auctions still visible on map

4. **Test Page Refresh**
   - Press F5 to refresh page
   - **VERIFY:** Auctions reload automatically

## Detailed Test (5 minutes)

### Test 1: Cache Persistence
```
1. Load map → See auctions
2. Note the number of auctions shown
3. Navigate to different page
4. Wait 5 seconds
5. Navigate back
6. VERIFY: Same auctions visible immediately
7. VERIFY: New fetch happens in background (check Network tab)
```

### Test 2: Filter Updates
```
1. Load map with auctions
2. Change acreage filter (min: 50 acres)
3. VERIFY: Auctions update to show only 50+ acres
4. Clear filter
5. VERIFY: All auctions return
6. Change county filter
7. VERIFY: Auctions filter by county
```

### Test 3: Map Movement
```
1. Load map → See auctions
2. Pan map to different area
3. Wait 250ms for debounce
4. VERIFY: New auctions load for new area
5. Zoom in significantly
6. VERIFY: Auctions update for zoomed area
```

### Test 4: Layer Toggle
```
1. Load map with auctions
2. Toggle "Show Auctions" OFF
3. VERIFY: Auctions disappear
4. Toggle "Show Auctions" ON
5. VERIFY: Auctions reappear immediately (from cache)
```

### Test 5: Error Handling
```
1. Open Network tab in DevTools
2. Set network to "Offline"
3. Try to load auctions
4. VERIFY: Error handled gracefully (no crash)
5. Set network back to "Online"
6. VERIFY: Auctions load automatically
```

## Console Output to Look For

### Success:
```
✅ Auctions loaded: 42 total
```

### Errors (should NOT see):
```
❌ Failed to load auctions: Error: ...
TypeError: Cannot read property 'auctions' of undefined
```

## Network Tab Verification

### Expected Behavior:
1. **First load:** `GET /api/auctions?minLat=...` → 200 OK
2. **Navigate away & back:** Instant display (cached), then background fetch
3. **Filter change:** New request with updated filters
4. **Map move (debounced):** Request after 250ms pause

### Check Request Headers:
Response should include:
```json
{
  "success": true,
  "auctions": [...],
  "count": 42,
  "timestamp": "2025-01-02T20:30:00.000Z"
}
```

## React Query DevTools (Optional)

If you have React Query DevTools installed:

1. Look for `["auctions", ...]` query
2. Check status: `fresh` → `stale` → `fetching` → `fresh`
3. Verify cache shows data even when component unmounts

## Performance Checks

### Before Fix:
- Multiple duplicate requests
- Empty state on navigation
- Server restart needed

### After Fix:
- Single request per unique view
- Instant cache display
- No server restart needed
- Background refetch keeps data fresh

## Browser Console Commands

Test cache directly (optional):
```javascript
// Check React Query cache
window.__REACT_QUERY_DEVTOOLS__.client.getQueryCache().getAll()

// Force refetch
window.__REACT_QUERY_DEVTOOLS__.client.refetchQueries({ queryKey: ['auctions'] })

// Clear cache
window.__REACT_QUERY_DEVTOOLS__.client.clear()
```

## Common Issues & Solutions

### Issue: Auctions don't load at all
**Check:**
- Browser console for errors
- Network tab for failed requests
- Server is running
- Database connection is active

**Solution:**
- Check server logs
- Verify DATABASE_URL is set
- Restart server if needed

### Issue: Stale data showing
**Check:**
- Response timestamp in Network tab
- React Query staleTime (should be 2 min)

**Solution:**
- Manually refresh (Ctrl+R)
- Cache will auto-refresh in background

### Issue: Auctions load but disappear
**Check:**
- Console for errors
- `showAuctionLayer` state
- Map source in MapLibre

**Solution:**
- Toggle layer off/on
- Check filter settings

## Success Indicators

✅ **Auctions visible** on initial load
✅ **Auctions persist** after navigation
✅ **No server restart** needed
✅ **Fast cache** display (< 100ms)
✅ **Background refresh** keeps data fresh
✅ **Filters work** correctly
✅ **No errors** in console

## Failure Indicators

❌ **Blank map** after navigation
❌ **Errors** in console
❌ **No cache** (every load is slow)
❌ **Duplicate requests** for same data
❌ **Server restart** needed to fix

## Report Issues

If you encounter problems, collect:
1. **Browser console** output (full log)
2. **Network tab** showing requests
3. **Steps to reproduce** the issue
4. **Server logs** if applicable
5. **Screenshot** of the problem

Then create an issue with all this information.
