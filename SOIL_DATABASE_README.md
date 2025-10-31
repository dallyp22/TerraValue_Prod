# 🌾 Iowa Soil Database - Quick Reference

## ✨ What You Have

### 📊 Database Stats

```
┌─────────────────────────────────────────┐
│  IOWA SOIL DATABASE (Railway)           │
├─────────────────────────────────────────┤
│  Survey Areas:      99 counties         │
│  Map Units:         11,208              │
│  Soil Components:   29,924              │
│  Soil Horizons:     125,960             │
│  Storage Used:      ~2 GB               │
│  Query Speed:       50-200ms            │
└─────────────────────────────────────────┘
```

### 🗂️ Available Soil Properties

✅ **Soil Series Names** - Clarion, Webster, Nicollet, etc.  
✅ **Slope Data** - 0-25%+ with low/high ranges  
✅ **Drainage Classes** - Well/poorly drained  
✅ **Hydrologic Groups** - A, B, C, D (runoff)  
✅ **Farmland Classifications** - Prime farmland, etc.  
✅ **Soil Texture** - Sand/silt/clay percentages  
✅ **pH Levels** - Soil acidity  
✅ **Organic Matter** - Percentage  
✅ **Taxonomic Data** - Mollisols, Alfisols, etc.  

❌ **CSR2 Ratings** - Not in SSURGO (uses external APIs)  
❌ **Spatial Geometries** - PostGIS not available  

---

## 🚀 Quick Start

### Test the API

```bash
# List all soil series in Iowa
curl http://localhost:5001/api/soil/series

# Get soil data for a map unit
curl http://localhost:5001/api/soil/mukey/2494708

# Search for prime farmland with low slope
curl -X POST http://localhost:5001/api/soil/search \
  -H "Content-Type: application/json" \
  -d '{"maxSlope": 3, "farmlandClass": "Prime"}'
```

### Use in React

```tsx
import { SoilDataPanel } from '@/components/SoilDataPanel';

function MyComponent() {
  const [mukey, setMukey] = useState(null);
  
  return <SoilDataPanel mukey={mukey} />;
}
```

---

## 🎯 Common Use Cases

### 1. Display Soil Info for Parcel

```tsx
// When user clicks parcel:
// 1. Get mukey (from USDA SDA or cached)
// 2. Display soil panel

const handleParcelClick = async (parcel) => {
  const mukey = await getMukeyForPoint(parcel.lat, parcel.lon);
  setSelectedMukey(mukey);
};

// Then render:
<SoilDataPanel mukey={selectedMukey} />
```

### 2. Search for Specific Soil Types

```tsx
import { useSearchSoilComponents } from '@/hooks/use-soil-data';

const { data: soils } = useSearchSoilComponents({
  minSlope: 0,
  maxSlope: 3,
  drainage: "Well drained",
  farmlandClass: "Prime"
});

// Returns list of matching soil components
```

### 3. List All Soil Series

```tsx
import { useSoilSeriesList } from '@/hooks/use-soil-data';

const { data: series } = useSoilSeriesList();

// Displays: ["Clarion", "Webster", "Nicollet", ...]
```

---

## 📁 File Structure

### Backend
```
server/
├── soil-db.ts                  # Database connection
├── services/
│   ├── soilProperties.ts       # Soil query service ✅
│   └── csr2.ts                 # CSR2 (uses external APIs)
└── routes.ts                   # API endpoints ✅

shared/
└── soil-schema.ts              # Database schema ✅

scripts/
├── load-iowa-soil-data.ts      # Data loader ✅
└── refresh-materialized-view.ts # Maintenance ✅
```

### Frontend
```
client/src/
├── hooks/
│   └── use-soil-data.ts        # React Query hooks ✅
└── components/
    └── SoilDataPanel.tsx       # Soil info panel ✅
```

### Documentation
```
docs/
├── Soil_Database_Setup_Guide.md     # Full setup guide ✅
└── Soil_Data_API_Guide.md           # API reference ✅

SOIL_DATABASE_QUICK_START.md         # 5-min quickstart ✅
IMPLEMENTATION_SUMMARY.md            # Technical details ✅
SOIL_DATABASE_FINAL_STATUS.md        # Current status ✅
```

---

## 🔧 Implementation Status

### ✅ Complete (Ready to Use)
- Database provisioned and loaded
- Backend API endpoints working
- React hooks functional
- SoilDataPanel component built
- Comprehensive documentation

### ⚠️ Pending (To Finish MVP)
- Mukey lookup service (get mukey from coordinates)
- Map integration (connect parcel click to soil panel)
- Sidebar integration (show SoilDataPanel)

### 💡 Future Enhancements
- Map layer overlays (slope heat map, drainage)
- Hover tooltips
- Soil series filtering
- Advanced visualizations

---

## 💰 Cost

- **Railway Hobby**: $5/month
- **Storage**: 2 GB of 8 GB used
- **Queries**: Unlimited (no per-query cost)

---

## 📈 Performance

| Query Type | Speed | Source |
|------------|-------|--------|
| Soil Properties | 50-200ms | Local DB ✅ |
| CSR2 Ratings | 2-60s | External APIs |
| Mukey Lookup | ~1s | USDA SDA API |

---

## 🎓 Learning Resources

- **SSURGO Data Dictionary**: https://www.nrcs.usda.gov/resources/data-and-reports/ssurgo
- **Soil Taxonomy**: https://www.nrcs.usda.gov/resources/education-and-teaching-materials/soil-taxonomy
- **Drainage Classes**: https://www.nrcs.usda.gov/wps/portal/nrcs/detail/soils/survey

---

## 🆘 Troubleshooting

**"Soil database not configured"**
- Check `DATABASE_URL_SOIL` is set in .env
- Verify connection string is correct

**"No soil data found"**
- Verify mukey exists in database
- Check if location is in Iowa
- Query soil_sync_status table

**Slow queries**
- Check database indexes exist
- Verify Railway database has resources
- Review query complexity

---

## 📞 Quick Links

- [Setup Guide](docs/Soil_Database_Setup_Guide.md)
- [API Guide](docs/Soil_Data_API_Guide.md)
- [Implementation Details](IMPLEMENTATION_SUMMARY.md)
- [Current Status](SOIL_DATABASE_FINAL_STATUS.md)

---

**Ready to use!** The foundation is built. Add mukey lookup + map integration to complete the feature. 🎉

