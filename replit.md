# TerraValue - AI-Powered Agricultural Land Valuation Platform

## Overview
TerraValue is an AI-powered web application designed for agricultural land valuation. It leverages OpenAI's GPT-4o-mini model and vector store technology to provide comprehensive valuations for various land types including Irrigated, Dryland, Pasture, and CRP land. The platform's vision is to offer precise, data-driven insights into agricultural property values, facilitating informed decisions for farmers, investors, and real estate professionals.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Framework**: Shadcn/UI (Radix UI primitives)
- **Styling**: Tailwind CSS
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite
- **UI/UX Decisions**: Mobile-first design, minimalist color scheme (slate tones), high-end typography, consistent card styling with animations, immersive map-centric interface with floating overlays, integrated custom Mapbox style and ownership heatmaps.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **API Design**: RESTful API, structured error handling
- **Development**: Hot reload with Vite middleware

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Provider**: Neon Database (serverless PostgreSQL)
- **Schema Management**: Drizzle Kit
- **Connection**: @neondatabase/serverless for pooling

### Authentication
- Basic session-based authentication with user management and PostgreSQL session store.

### Key Features
- **Valuation Pipeline**: Multi-stage AI process with parallel execution including property input, vector store lookup, GPT-4o analysis, market research, and comprehensive report generation. Market research, Iowa analysis, and corn futures now run in parallel for faster performance.
- **Property Improvements**: Dynamic forms for buildings and infrastructure with AI/manual valuation options.
- **Geospatial Capabilities**: Integrated MapLibre GL for interactive mapping, Iowa CSR2 soil data integration, address geocoding, real-time soil productivity analysis, USDA/ARS ACPF field boundary integration, satellite imagery toggle, and interactive polygon drawing with real-time acreage and CSR2 calculation.
- **Valuation Methods**: Support for CSR2 Quantitative, Income Approach, and AI Market-Adjusted valuations, with interactive selection and real-time updates.
- **Non-Tillable Land Valuation**: Discounts applied for CRP, Timber, and Other non-tillable land types.
- **Market Analysis**: AI-enhanced market analysis using recent sales comparables and county base values.
- **Suggested Rent Calculation**: Real-time corn futures price integration to calculate suggested annual rent per acre.
- **Parcel Integration**: Interactive parcel selection with owner information display for specific regions (e.g., Harrison County custom tileset), highlighting, and automatic county/state population.
- **Reporting**: Comprehensive, enterprise-ready valuation reports with visual hierarchy, animations, and PDF export functionality.
- **Security**: Rate limiting, security headers, input validation, and structured error handling.

## External Dependencies

### Core
- **OpenAI API**: GPT-4o model and vector store (`vs_6858bfe15704819185bf32f276946cab` for agricultural data, `vs_68755fcbdfc081918788b7ce0db68682` for Iowa market data). Assistant instances are reused across sessions for efficiency.
- **Neon Database**: Serverless PostgreSQL hosting.
- **Drizzle ORM**: Type-safe database interactions.
- **Mapbox**: Custom Harrison County parcel tileset (`dpolivka22.3l1693dn`), custom Mapbox style (`mapbox://styles/dpolivka22/cmc3wkk8i014v01rx2e6g8gwt`).
- **MapLibre GL**: Interactive mapping library.
- **Turf.js**: Geospatial analysis.
- **jsPDF** and **html2canvas**: PDF export.
- **Yahoo Finance API**: Real-time corn futures data.
- **OpenStreetMap Nominatim**: Reverse geocoding.

### UI
- **Radix UI**: Accessible component primitives.
- **Tailwind CSS**: Utility-first styling.
- **Lucide React**: Icon library.
- **TanStack React Query**: Server state management.

### Development
- **Vite**: Fast build tool and development server.
- **TypeScript**: Type safety.
- **ESBuild**: Production bundling for server code.