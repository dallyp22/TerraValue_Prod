# CSR2 Service Monitoring & Resilience

## Overview

The CSR2 (Corn Suitability Rating 2) service uses **Michigan State University's public ImageServer API** with **no authentication required**. This document explains how we monitor and handle potential service changes.

---

## Current Implementation

### Primary Source: MSU ImageServer (Public API)
- **Endpoint:** `https://enterprise.rsgis.msu.edu/imageserver/rest/services/Iowa_Corn_Suitability_Rating/ImageServer`
- **Authentication:** None required (public service)
- **Rate Limiting:** 3 concurrent requests max
- **Caching:** 1-hour cache for repeated queries
- **Timeout:** 10 seconds

### Fallback Source: USDA Soil Data Access
- **Used when:** MSU service is down, requires auth, or returns errors
- **Process:** 4-step multi-API workflow (mukey → AOI → interpretation → WFS)

---

## Enhanced Monitoring (New Features)

### 1. **Authentication Detection**
- Automatically detects if MSU service starts requiring authentication (401/403)
- Switches to USDA fallback immediately when auth is detected
- Logs warning: `⚠️ MSU CSR2 service now requires authentication`

### 2. **Service Health Tracking**
Tracks:
- `lastSuccess`: Timestamp of last successful MSU query
- `lastFailure`: Timestamp of last failure
- `consecutiveFailures`: Counter (auto-disables after 10 failures)
- `requiresAuth`: Boolean flag if auth detected

### 3. **Automatic Service Degradation**
- After **10 consecutive failures**, MSU service is temporarily disabled
- Automatically uses USDA fallback until service recovers
- Prevents wasted API calls to broken service

### 4. **Enhanced Error Logging**
Different log messages for different error types:
- **Auth Required:** `⚠️ MSU CSR2 service authentication required`
- **Timeout:** `⏱️ MSU ImageServer timeout`
- **Server Error:** `🔴 MSU ImageServer server error`
- **Generic:** `⚠️ MSU ImageServer unavailable`

### 5. **User-Agent Header**
- Identifies our app: `TerraValue/1.0 (Agricultural Land Valuation Tool)`
- Good practice for public APIs (shows we're legitimate)

### 6. **Health Check Endpoint**
**GET `/api/health`** now includes CSR2 service status:

```json
{
  "success": true,
  "status": "healthy",
  "services": {
    "database": "connected",
    "api": "operational",
    "csr2": {
      "msuService": "operational",      // or "degraded"
      "requiresAuth": false,
      "consecutiveFailures": 0,
      "lastSuccess": "2025-01-30T12:00:00.000Z",
      "lastFailure": null
    }
  }
}
```

---

## Monitoring Functions

### `getMSUServiceStatus()`
Returns current service health:
```typescript
{
  lastSuccess: string | null,
  lastFailure: string | null,
  consecutiveFailures: number,
  requiresAuth: boolean,
  isHealthy: boolean
}
```

### `resetMSUServiceStatus()`
Manually reset service status (useful for recovery/testing)

---

## Risk Mitigation Strategies

### ✅ Already Implemented:
1. **Rate Limiting** - Only 3 concurrent requests
2. **Caching** - 1-hour cache reduces API calls
3. **Timeout** - 10-second timeout prevents hanging
4. **Automatic Fallback** - USDA service as backup
5. **Health Tracking** - Monitors service availability
6. **Auth Detection** - Detects if auth becomes required

### 🔮 Future Considerations:

#### If MSU Requires Authentication:
1. **Contact MSU** - Request API key or access credentials
2. **Update Code** - Add auth headers to requests
3. **Fallback Priority** - Use USDA as primary if MSU becomes unreliable

#### If MSU Service Goes Down:
1. **Automatic Fallback** - Already implemented (USDA)
2. **Monitor Recovery** - Health check detects when service returns
3. **Alerting** - Set up alerts on `/api/health` endpoint

#### Alternative Data Sources (if needed):
1. **Iowa State University** - May have similar CSR2 data
2. **USDA Primary** - Already implemented as fallback
3. **Local Cache** - Could pre-populate cache for common areas
4. **Third-Party APIs** - Agricultural data providers

---

## Production Monitoring

### Recommended Alerts:
1. **MSU Service Down:** Alert if `consecutiveFailures >= 10`
2. **Auth Required:** Alert if `requiresAuth === true`
3. **Health Check:** Monitor `/api/health` endpoint (uptime monitoring)

### Recommended Dashboards:
- Track `msuService` status over time
- Monitor `consecutiveFailures` trend
- Alert on `requiresAuth` changes

---

## Testing

### Test MSU Service:
```bash
curl "https://enterprise.rsgis.msu.edu/imageserver/rest/services/Iowa_Corn_Suitability_Rating/ImageServer/identify?f=json&geometry=-95.743,41.689&geometryType=esriGeometryPoint&sr=4326"
```

### Test Health Endpoint:
```bash
curl https://web-production-51e54.up.railway.app/api/health
```

### Test Service Status:
```typescript
import { csr2Service } from './services/csr2';
const status = csr2Service.getMSUServiceStatus();
console.log(status);
```

---

## Summary

✅ **Current Status:** Using public MSU API with robust fallback
✅ **Monitoring:** Health tracking and automatic degradation
✅ **Resilience:** USDA fallback ensures continuous operation
✅ **Future-Proof:** Auth detection and service status tracking

The system is **production-ready** and will automatically adapt if MSU changes their API requirements.

