# AtlasRide - Democratized Transportation Marketplace

## Overview

AtlasRide is a two-way transportation marketplace similar to Uber, but completely democratized and based on user-driven pricing and route sharing. Riders can post trip requests with their own price offers, and drivers can accept or decline. Drivers can also post their planned routes with available seats, allowing riders to request to join. The platform uses real-time location tracking via WebSockets and integrates with Azure Maps for geocoding and routing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom theme variables for AtlasRide branding
- **Maps**: Leaflet with OpenStreetMap tiles for map rendering, Azure Maps for geocoding/routing

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints for CRUD operations
- **Real-time**: WebSocket server for live location tracking during rides
- **Authentication**: Replit Auth with OpenID Connect, using Passport.js
- **Session Management**: PostgreSQL-backed sessions via connect-pg-simple

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Key Tables**:
  - `users` - User profiles with driver verification status
  - `sessions` - Authentication sessions
  - `riderOffers` - Ride requests posted by riders with price offers
  - `driverRoutes` - Routes posted by drivers with available seats
  - `rides` - Matched rides between riders and drivers
  - `bids` - Driver bids on rider offers
  - `chatMessages` - Real-time chat messages between riders and drivers

### External Integrations
- **Stripe**: Payment processing via stripe-replit-sync for managed webhooks
- **Azure Maps**: Geocoding and route calculations (API key securely proxied via backend)
- **OpenStreetMap**: Free map tile rendering via Leaflet
- **Replit Auth**: OAuth/OIDC authentication
- **Microsoft Entra External ID**: Email OTP verification for signup (tenant: atlasridecustomers.onmicrosoft.com)

### Key Design Patterns
- **Shared Schema**: Database schema and TypeScript types are defined once in `shared/schema.ts` and used by both frontend and backend
- **API Request Helper**: Centralized `apiRequest` function in `lib/queryClient.ts` handles all HTTP requests with proper error handling
- **Storage Interface**: `IStorage` interface in `server/storage.ts` abstracts database operations for testability
- **WebSocket Rooms**: Location tracking and real-time chat use room-based WebSocket connections per ride
- **Secure API Proxying**: Azure Maps API key is never exposed to frontend; all requests go through backend proxy
- **Real-time Chat**: WebSocket-based chat between riders and drivers with messages persisted to database

## External Dependencies

### Third-Party Services
- **Stripe**: Payment processing (configured via Replit connector)
- **Azure Maps**: Geocoding and routing (requires `AZURE_MAPS_KEY` environment variable)
- **Replit Auth**: User authentication (requires `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`)

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- Drizzle ORM handles schema management with `db:push` command

### Key npm Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM with Zod schema validation
- `express-session` / `connect-pg-simple`: Session management
- `passport` / `openid-client`: Authentication
- `ws`: WebSocket server for real-time features
- `leaflet` / `react-leaflet`: Frontend map rendering
- `stripe` / `stripe-replit-sync`: Payment processing

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption
- `AZURE_MAPS_KEY`: Azure Maps subscription key (for geocoding and routing)
- Stripe credentials are managed via Replit connector

## Azure Deployment

The app is configured for deployment to Azure App Service (Linux):

### Deployment Files
- `AZURE_DEPLOYMENT.md`: Complete step-by-step deployment guide
- `azure-env-template.txt`: Template for Azure environment variables
- `.azure/config`: Azure CLI configuration

### Azure Configuration
- **App Service**: Linux with Node.js 20 runtime
- **Database**: Azure Database for PostgreSQL Flexible Server
- **WebSockets**: Enabled for real-time features
- **Startup Command**: `npm start`

### Hostname Detection
The server automatically detects the hosting environment:
- Replit: Uses `REPLIT_DOMAINS` environment variable
- Azure: Uses `WEBSITE_HOSTNAME` environment variable

This allows Stripe webhooks to work correctly in both environments.
