# TerraValue — Agricultural Land Valuation Platform

Iowa farmland valuation: CSR2 soil productivity, AI market analysis, income
capitalization, and live auction comparables, served from a same-origin
Cloudflare Pages + Worker stack backed by Neon Postgres.

## Architecture

```
┌────────────────────────────────────────┐
│  Cloudflare Pages (terravalue)         │  ← Vite + React frontend
│    functions/api/[[path]].ts           │  ← /api/* proxy via Service Binding
└────────────────────────┬───────────────┘
                         │
┌────────────────────────▼───────────────┐
│  Cloudflare Worker (terravalue-api)    │  ← Hono on Workers (nodejs_compat)
│  - REST API                            │
│  - Cron Triggers (archiver, scraper)   │
└────────────────────────┬───────────────┘
                         │
┌────────────────────────▼───────────────┐
│  Neon Postgres (Iowa data)             │  ← parcels, auctions, soil, csr2
│  - Neon HTTP driver                    │
└────────────────────────────────────────┘
```

Two deployable units in this repo:

- **`functions/`** + **`dist/public/`** → Cloudflare Pages project `terravalue`
  (config in `wrangler.jsonc`)
- **`worker/`** → Cloudflare Worker `terravalue-api`
  (config in `worker/wrangler.jsonc`)

The `server/` directory is the legacy Express implementation. It is kept as a
local-dev option and as rollback insurance during the migration to Cloudflare.

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, OPENAI_API_KEY, mapbox token
npm run dev            # Express server (legacy local dev)
```

For Workers-native local dev (matches production runtime):

```bash
cd worker
wrangler dev           # local API at http://localhost:8788

# In another terminal, from repo root:
npm run build
wrangler pages dev dist/public  # local Pages + Function proxy
```

## Deployment (Cloudflare)

Both projects deploy via `wrangler`. The first deployment of each was
provisioned manually; subsequent deploys are one command each.

### Worker (API)

```bash
cd worker
wrangler deploy
```

Secrets (set once per environment):

```bash
wrangler secret put DATABASE_URL
wrangler secret put DATABASE_URL_SOIL
wrangler secret put OPENAI_API_KEY
wrangler secret put FIRECRAWL_API_KEY
```

### Pages (frontend)

```bash
npm run build
wrangler pages deploy dist/public --project-name=terravalue
```

`VITE_MAPBOX_PUBLIC_KEY` lives in the Pages project's environment variables,
not as a Worker secret (Vite inlines it at build time).

## Environment variables

```env
# Required
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
OPENAI_API_KEY=sk-...
VITE_MAPBOX_PUBLIC_KEY=pk....

# Optional (same Neon database; keep parity with main DATABASE_URL)
DATABASE_URL_SOIL=postgresql://...neon.tech/neondb?sslmode=require

# Optional OpenAI reuse
AGRICULTURAL_ASSISTANT_ID=
IOWA_MARKET_ASSISTANT_ID=
VECTOR_STORE_ID=
IOWA_VECTOR_STORE_ID=

# Optional
FIRECRAWL_API_KEY=fc-...
```

## API endpoints (Worker)

Everything is mounted under `/api/*` on the same origin via the Pages Function
proxy. Highlights:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | DB connectivity ping |
| POST | `/api/valuations` | Kick off a valuation (returns id; pipeline runs in background via `ctx.waitUntil`) |
| GET | `/api/valuations/:id` | Pipeline status / result |
| GET | `/api/auctions` | Auctions in bbox |
| GET | `/api/auctions/:id` | Single auction |
| POST | `/api/auctions/:id/prepare-valuation` | AI-extract parcel + soil + CSR2 |
| GET | `/api/parcels` | Parcels in bbox |
| GET | `/api/parcels/aggregated` | Pre-dissolved ownership groups (PostGIS) |
| GET | `/api/parcels/tiles/:z/:x/:y.mvt` | Self-hosted vector tiles |
| GET | `/api/soil/mukey/:mukey` | Soil composition by map-unit key |
| POST | `/api/csr2/polygon` | CSR2 stats for a WKT polygon |
| POST | `/api/geocode` | Address → coords |
| POST | `/api/geocode/reverse` | Coords → county/state |

## Cron Triggers (Worker)

```
0 9 * * *   → daily 09:00 UTC (~03:00 CST) → auction archiver
*/5 * * * * → every 5 minutes → scraper schedule check (reads scraperSettings row)
```

## Database

Single Neon Postgres holds everything:

- **Main app**: `auctions`, `archived_auctions`, `auctions_blocklist`,
  `valuations`, `users`, `scraper_settings`, `county_csr2_rates`
- **Parcels** (PostGIS): `parcels` (~2.4M), `parcel_aggregated` (~1.5M
  dissolved ownership groups), `parcel_ownership_groups` (~310K)
- **Soil reference** (SSURGO): `soil_legend`, `soil_mapunit`,
  `soil_component`, `soil_chorizon`, `soil_csr2_ratings`,
  `soil_mapunit_spatial`, `soil_sync_status`

The Worker uses the Neon HTTP driver — stateless per query, no connection
pools to manage across Worker isolates.

## CSR2 lookup chain

1. Local soil DB (`soil_csr2_ratings` + `soil_mapunit_spatial`) — currently
   empty; backfill via `scripts/load-iowa-soil-data.ts`
2. Michigan State ImageServer (external)
3. USDA Soil Data Access (external, multi-step)

For polygon queries the Worker samples a 3×3 grid and averages.

## Project structure

```
.
├── client/              # Vite + React frontend
├── server/              # Legacy Express implementation (local dev + rollback)
├── shared/              # Drizzle schemas shared by both
├── worker/              # Cloudflare Worker (Hono) — production API
│   ├── src/
│   │   ├── index.ts     # fetch + scheduled handlers
│   │   ├── env.ts       # Workers env binding types
│   │   └── routes/
│   │       └── api.ts   # All /api/* routes
│   └── wrangler.jsonc
├── functions/
│   └── api/[[path]].ts  # Pages Function — proxies /api/* to the Worker
├── scripts/             # Drizzle / data-load / one-off maintenance
├── migrations/          # drizzle-kit output
├── shared/
│   ├── schema.ts        # Main app schema
│   └── soil-schema.ts   # SSURGO + CSR2 schema
└── wrangler.jsonc       # Pages project config (root)
```

## License

MIT
