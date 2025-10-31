# TerraValue - Agricultural Land Valuation Platform

![TerraValue](https://img.shields.io/badge/status-production-green)
![License](https://img.shields.io/badge/license-MIT-blue)

A sophisticated agricultural land valuation platform combining AI-powered analysis, CSR2 soil productivity data, market comparables, and income capitalization methods to provide comprehensive property valuations.

## 🌾 Features

### Core Valuation Methods
- **CSR2 Soil Analysis**: Iowa Corn Suitability Rating using USDA Soil Data Access API
- **AI Market Valuation**: OpenAI GPT-4o powered market analysis
- **Income Capitalization**: Cash rent and cap rate calculations
- **Market Comparables**: Real Iowa sales data integration
- **Property Improvements**: AI or manual valuation of buildings, irrigation, etc.

### Interactive Mapping
- MapLibre GL with Mapbox vector tiles
- Iowa parcel boundaries
- Custom polygon drawing
- Multi-section parcel support
- Real-time CSR2 sampling (grid-based)

### Advanced Features
- Blended tillable/non-tillable land valuations
- Corn futures integration for rent estimates
- County-specific base values
- Weighted soil component analysis
- Comprehensive PDF reports
- **Optional local soil database for 10-100x faster CSR2 queries**

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Neon, Vercel Postgres, or local)
- OpenAI API key
- Mapbox access token (optional, included for demo)

### Installation

```bash
# Clone the repository
git clone https://github.com/dallyp22/TerraValue_Prod.git
cd TerraValue_Prod

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials (see Environment Variables section)

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:5001`

### Optional: Iowa Soil Database Setup

For **10-100x faster** CSR2 queries, set up a local soil database:

```bash
# Quick setup (see SOIL_DATABASE_QUICK_START.md for details)
npm run db:soil:push     # Create tables
npm run db:soil:load     # Load Iowa data (30-60 min)
```

This is **optional** - the app works with external APIs if not configured.

### Environment Variables

Create a `.env` file with the following:

```env
# Database Configuration (REQUIRED)
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# Soil Database (OPTIONAL - for 10-100x faster CSR2 queries)
# See SOIL_DATABASE_QUICK_START.md for setup
DATABASE_URL_SOIL=postgresql://user:password@host:port/soildb?sslmode=require

# OpenAI API Key (REQUIRED for AI valuations)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Mapbox Public Key (for maps)
VITE_MAPBOX_PUBLIC_KEY=pk.your-mapbox-token-here

# Optional: Reuse existing OpenAI assistants
AGRICULTURAL_ASSISTANT_ID=asst_xxxxx
IOWA_MARKET_ASSISTANT_ID=asst_xxxxx
VECTOR_STORE_ID=vs_xxxxx
IOWA_VECTOR_STORE_ID=vs_xxxxx
```

## 📊 CSR2 Integration

TerraValue uses a multi-tier fallback system for CSR2 (Corn Suitability Rating) data:

### Data Sources (in order of preference):

**For Soil Properties (slope, drainage, texture, soil series):**
1. **Local PostgreSQL Database** (optional, recommended)
   - Instant access (50-200ms) to comprehensive soil data
   - 125,960 soil horizons with texture, pH, organic matter
   - 29,924 soil components with slope and drainage
   - See `SOIL_DATABASE_QUICK_START.md` for setup
   - **Performance: 50-200ms per query**

**For CSR2 Ratings:**
1. **Michigan State ImageServer** (external API)
   - Endpoint: `https://enterprise.rsgis.msu.edu/imageserver/.../Iowa_Corn_Suitability_Rating`
   - Direct raster value queries
   - Fast when available
   - **Performance: 2-5s per point**

3. **USDA Soil Data Access API** (final fallback)
   - Creates persistent Area of Interest (AOI)
   - Runs Iowa CSR2 interpretation (attributekey: 189)
   - Queries WFS thematic layer for rating values
   - Fully functional and tested
   - **Performance: 3-8s per point**

### CSR2 Workflow
```
User clicks parcel → 
Try local DB (if configured) → 
Fallback to ImageServer → 
Fallback to USDA SDA → 
Calculate weighted average → 
Display CSR2 rating
```

**Performance:**
- **Soil properties** (local DB): 50-200ms ⚡
- **CSR2 ratings** (external APIs): 2-60s (unchanged)
- 1-hour caching per query
- **Hybrid approach**: Fast soil data + external CSR2

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js + Node.js
- **Database**: PostgreSQL with Drizzle ORM (dual database architecture)
  - Primary DB: Application data (Neon)
  - Soil DB: Iowa SSURGO soil properties (Railway) - slope, drainage, texture, soil series
- **Maps**: MapLibre GL + Mapbox vector tiles
- **AI**: OpenAI GPT-4o with vector stores
- **Styling**: Tailwind CSS + shadcn/ui components

### Project Structure
```
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Page components
│   │   └── lib/         # Utilities
├── server/              # Express backend
│   ├── services/        # Business logic
│   │   ├── csr2.ts      # CSR2 data retrieval (local DB + external APIs)
│   │   ├── valuation.ts # Valuation pipeline
│   │   ├── openai.ts    # AI services
│   │   └── cornPrice.ts # Futures integration
│   ├── routes.ts        # API endpoints
│   ├── db.ts            # Main database connection
│   └── soil-db.ts       # Soil database connection (optional)
├── shared/              # Shared types/schemas
│   ├── schema.ts        # Application schema
│   └── soil-schema.ts   # Soil database schema
├── scripts/             # Utility scripts
│   ├── load-iowa-soil-data.ts  # Soil data loader
│   └── refresh-materialized-view.ts
├── migrations/          # Application database migrations
├── migrations-soil/     # Soil database migrations
└── docs/                # Documentation
    ├── Soil_Database_Setup_Guide.md
    └── ...
```

## 🔌 API Endpoints

### Valuations
- `POST /api/valuations` - Start new valuation
- `GET /api/valuations/:id` - Get valuation status/results
- `GET /api/valuations` - List all valuations

### CSR2 Data
- `POST /api/csr2/polygon` - Get CSR2 stats for WKT geometry
- `POST /api/csr2/point` - Get CSR2 for coordinates
- `POST /api/average-csr2` - Calculate average CSR2 for polygon

### Geocoding
- `POST /api/geocode` - Convert address to coordinates
- `POST /api/geocode/reverse` - Get county/state from coordinates

### Field Boundaries
- `GET /api/fields/search` - Search fields in bounding box
- `GET /api/fields/:fieldId` - Get specific field
- `POST /api/fields/nearby` - Find fields near point
- `GET /api/parcels` - Get parcel data for map

### Health
- `GET /api/health` - Application health check

## 🗺️ External Services

The application integrates with:

1. **USDA Soil Data Access** ([docs](https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx))
   - CSR2 interpretations
   - Soil property data
   - No authentication required

2. **OpenAI API**
   - AI-powered valuations
   - Market analysis
   - Improvement valuations

3. **OpenStreetMap Nominatim**
   - Geocoding
   - Reverse geocoding
   - No authentication required

4. **Yahoo Finance**
   - Corn futures prices
   - No authentication required

## 🚢 Deployment

### Production Build
```bash
npm run build
npm start
```

### Vercel Deployment
The application is optimized for Vercel:
- Automatic PostgreSQL integration
- Environment variable management
- Zero-config deployment

### Environment Variables for Production
Ensure all required environment variables are set in your deployment platform:
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `VITE_MAPBOX_PUBLIC_KEY`

## 🧪 Testing

### Health Check
```bash
curl http://localhost:5001/api/health
```

### CSR2 Test
```bash
curl -X POST http://localhost:5001/api/csr2/polygon \
  -H "Content-Type: application/json" \
  -d '{"wkt":"POINT(-95.743 41.689)"}'
```

Expected response:
```json
{
  "success": true,
  "mean": 78,
  "min": 78,
  "max": 78,
  "count": 1
}
```

## 📝 Development

### Database Schema Changes
```bash
npm run db:push
```

### Type Checking
```bash
npm run check
```

## 🎯 Key Improvements from Original

1. **✅ CSR2 Data Working**
   - Implemented USDA Soil Data Access fallback
   - 4-step interpretation workflow
   - WFS thematic layer queries
   - Graceful degradation if unavailable

2. **✅ Environment Configuration**
   - Added dotenv support
   - Proper .env file loading
   - Secure credential management

3. **✅ macOS Compatibility**
   - Changed port 5000 → 5001 (AirPlay conflict)
   - Removed `reusePort` option
   - Universal macOS/Linux support

4. **✅ Production Ready**
   - Rate limiting on all endpoints
   - Comprehensive error handling
   - Database connection pooling
   - Graceful shutdown handling

## 📖 Usage

1. **Open the application** at http://localhost:5001
2. **Navigate the map** to an Iowa property
3. **Click a parcel** or draw a custom polygon
4. **Fill in property details** (acreage, land type, improvements)
5. **Run valuation** - Get comprehensive report with:
   - CSR2-based valuation
   - Income capitalization
   - AI market analysis
   - Final blended value

## 🤝 Contributing

This is a production application. For contributions or issues, please contact the repository owner.

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- **USDA NRCS** - Soil Data Access API
- **Iowa State University** - CSR2 methodology
- **OpenAI** - AI valuation services
- **Mapbox** - Vector tile infrastructure

---

**Built with ❤️ for agricultural professionals**

