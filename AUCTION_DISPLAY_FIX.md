# Auction Display Issue - Root Cause Analysis & Solutions

## Problem Statement
Auctions disappear from the map on the Valuation Tool page after:
1. Navigating to the Auctions page and back
2. Running a valuation
3. Other page navigations

Users have been restarting the Railway server to fix this, which suggests possible server-side issues, but the root cause is actually client-side state management.

## Root Cause Analysis

### 1. No React Query Caching for Auctions
**File:** `client/src/components/EnhancedMap.tsx` (line ~493)

The `loadAuctions` function uses direct `fetch` API calls instead of React Query:
```typescript
const loadAuctions = useCallback(async () => {
  // ... builds params ...
  const response = await fetch(`${apiUrl}/api/auctions?${params}`);
  const data = await response.json();
  
  if (data.success && data.auctions) {
    setAuctions(data.auctions);
    // ... updates map source ...
  }
}, [auctionFilters, showAuctionLayer]);
```

**Problems:**
- No automatic caching
- No automatic refetching
- No stale data management
- State is lost on component unmount

### 2. Local Component State
Auctions are stored in local component state:
```typescript
const [auctions, setAuctions] = useState<Auction[]>([]);
```

When the component unmounts (navigation away), this state is lost. When remounting, the state starts empty until `loadAuctions` is called again.

### 3. Race Conditions
Multiple `useEffect` hooks call `loadAuctions`:
- Line 2786-2791: When filters change
- Line 2793-2814: On map moveend (debounced)
- Line 2985-2996: When auction layer visibility changes
- Line 2999-3003: When auction filters change

These can create race conditions where the last call doesn't complete before navigation, leaving the state empty.

### 4. Potential Server Issues
While the main issue is client-side, server restarts fixing the problem suggests:
- Possible memory leaks in the server
- Connection pool exhaustion
- Stale database connections

## Solutions

### Solution 1: Convert to React Query (RECOMMENDED)

This provides automatic caching, background refetching, and better state management.

**File:** `client/src/components/EnhancedMap.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '@/config';

// Replace loadAuctions useCallback with useQuery
const { data: auctionsData, isLoading: auctionsLoading } = useQuery({
  queryKey: ['auctions', auctionFilters, showAuctionLayer, mapBounds],
  queryFn: async () => {
    if (!showAuctionLayer || !map.current) return { auctions: [], count: 0 };
    
    const bounds = map.current.getBounds();
    const params = new URLSearchParams({
      minLat: bounds.getSouth().toString(),
      maxLat: bounds.getNorth().toString(),
      minLon: bounds.getWest().toString(),
      maxLon: bounds.getEast().toString()
    });
    
    // Add filters...
    if (auctionFilters.minAcreage) {
      params.append('minAcreage', auctionFilters.minAcreage.toString());
    }
    // ... etc
    
    const apiUrl = import.meta.env.DEV ? 'http://localhost:5001' : API_BASE_URL;
    const response = await fetch(`${apiUrl}/api/auctions?${params}`);
    const data = await response.json();
    
    return data.success ? data : { auctions: [], count: 0 };
  },
  enabled: !!map.current && showAuctionLayer,
  staleTime: 2 * 60 * 1000, // 2 minutes - data stays fresh
  gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
  refetchOnMount: 'always', // Always refetch on mount to ensure fresh data
  refetchOnWindowFocus: true, // Refetch when window regains focus
});

// Update map source when data changes
useEffect(() => {
  if (!map.current || !auctionsData?.auctions) return;
  
  const features = auctionsData.auctions
    .filter((a: Auction) => a.latitude && a.longitude)
    .map((auction: Auction) => {
      // ... existing marker color logic ...
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [auction.longitude, auction.latitude]
        },
        properties: {
          id: auction.id,
          title: auction.title,
          acreage: auction.acreage,
          county: auction.county,
          state: auction.state,
          markerColor,
          isCountyLevel: auction.rawData?.isCountyLevel || false
        }
      };
    });
  
  const source = map.current.getSource('auctions') as maplibregl.GeoJSONSource;
  if (source) {
    source.setData({
      type: 'FeatureCollection',
      features
    });
  }
}, [auctionsData]);
```

**Benefits:**
- ✅ Automatic caching across page navigations
- ✅ Background refetching keeps data fresh
- ✅ No race conditions
- ✅ Proper loading states
- ✅ Automatic retry on failure
- ✅ Data persists during navigation

### Solution 2: Add Map Bounds to Dependency Array

Track map bounds changes to trigger refetch:

```typescript
const [mapBounds, setMapBounds] = useState<string | null>(null);

// In the map moveend handler
const moveHandler = debounce(() => {
  if (map.current) {
    const bounds = map.current.getBounds();
    const boundsString = `${bounds.getSouth()},${bounds.getNorth()},${bounds.getWest()},${bounds.getEast()}`;
    setMapBounds(boundsString);
  }
}, 250);
```

### Solution 3: Server-Side Improvements

**File:** `server/routes.ts` (line 1003)

Add better error handling and connection management:

```typescript
app.get("/api/auctions", async (req, res) => {
  try {
    // Add request logging
    console.log(`📍 Auctions requested: filters=${JSON.stringify(req.query)}`);
    
    // ... existing query logic ...
    
    // Add response caching headers
    res.set('Cache-Control', 'public, max-age=120'); // Cache for 2 minutes
    
    res.json({ 
      success: true, 
      auctions: filteredAuctions,
      count: filteredAuctions.length,
      totalInDatabase: auctionList.length,
      withoutCoordinates: auctionList.filter(a => !a.latitude || !a.longitude).length,
      timestamp: new Date().toISOString() // Add timestamp for debugging
    });
  } catch (error) {
    console.error("Auction fetch error:", error);
    
    // Don't let one error break the entire app
    res.status(500).json({ 
      success: false, 
      auctions: [], // Return empty array instead of error
      count: 0,
      message: 'Failed to fetch auctions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

### Solution 4: Add Health Check Before Fetching

```typescript
// Add to EnhancedMap.tsx
const checkServerHealth = async () => {
  try {
    const apiUrl = import.meta.env.DEV ? 'http://localhost:5001' : API_BASE_URL;
    const response = await fetch(`${apiUrl}/api/health`, { 
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
};

// In useQuery or loadAuctions
const serverHealthy = await checkServerHealth();
if (!serverHealthy) {
  console.warn('⚠️ Server health check failed, skipping auction fetch');
  return { auctions: [], count: 0 };
}
```

### Solution 5: Add Error Boundary

**File:** `client/src/components/MapErrorBoundary.tsx` (new file)

```typescript
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Map error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h3 className="text-red-800 font-semibold">Map Error</h3>
          <p className="text-red-600 text-sm mt-2">
            {this.state.error?.message || 'An error occurred loading the map'}
          </p>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

Then wrap EnhancedMap:

```typescript
<MapErrorBoundary>
  <EnhancedMap {...props} />
</MapErrorBoundary>
```

## Implementation Priority

1. **HIGH PRIORITY**: Implement Solution 1 (React Query) - This will fix the root cause
2. **MEDIUM**: Add Solution 3 (Server improvements) - Better resilience
3. **LOW**: Add Solution 5 (Error boundary) - Better error handling

## Testing Checklist

After implementing solutions, test:

- [ ] Navigate from Valuation Tool → Auctions → Back to Valuation Tool
- [ ] Run a valuation, then check if auctions still display
- [ ] Refresh page and verify auctions reload
- [ ] Change filters and verify auctions update
- [ ] Pan/zoom map and verify auctions refresh
- [ ] Check browser console for errors
- [ ] Monitor network requests for duplicates
- [ ] Test with slow/intermittent network connection

## Monitoring

Add these console logs for debugging:

```typescript
// In useQuery success callback
onSuccess: (data) => {
  console.log(`✅ Auctions loaded: ${data.auctions.length} total, ${data.count} filtered`);
},

// In useQuery error callback
onError: (error) => {
  console.error('❌ Auction fetch failed:', error);
},
```

## Additional Notes

- The current `staleTime` in queryClient is 5 minutes, which is good
- Consider adding a "Refresh Auctions" button for manual refresh
- Add visual indicator when auctions are loading/refetching
- Consider implementing optimistic updates for better UX
