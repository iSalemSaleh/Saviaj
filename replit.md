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
  - `users` - Core user accounts (legacy monolithic table, being normalized)
  - `sessions` - Authentication sessions
  - `riderOffers` - Ride requests posted by riders with price offers
  - `driverRoutes` - Routes posted by drivers with available seats
  - `rides` - Matched rides between riders and drivers
  - `bids` - Driver bids on rider offers
  - `chatMessages` - Real-time chat messages between riders and drivers
  - `ratings` - Mutual ratings between riders and drivers
- **Normalized Tables** (Phase 2 in progress - normalized reads available):
  - `user_profiles` - Personal info (name, DOB, phone, address)
  - `user_stats` - Ratings and ride counts
  - `driver_profiles` - Driver status and verification
  - `driver_documents` - License uploads and verification
  - `vehicles` - Vehicle details
  - `driver_commercial` - Pro driver settings (rate per mile, tagline)
  - `driver_availability` - Online status and location
  - `user_bank_accounts` - Payout bank details
- **NormalizedUser Type**: Combined aggregate type for reading from normalized tables
- **Feature Flags**: `ENABLE_DUAL_WRITE` and `ENABLE_NORMALIZED_READS` control migration phases

### External Integrations
- **Stripe**: Payment processing via stripe-replit-sync for managed webhooks
- **Azure Maps**: Geocoding and route calculations (API key securely proxied via backend)
- **OpenStreetMap**: Free map tile rendering via Leaflet
- **Replit Auth**: OAuth/OIDC authentication
- **Microsoft Entra External ID**: Email OTP verification for signup (CIAM tenant: atlasridecustomers.onmicrosoft.com, Client ID: 232d29d0-8723-40a5-98b5-f14e5203d136)

### Key Design Patterns
- **Shared Schema**: Database schema and TypeScript types are defined once in `shared/schema.ts` and used by both frontend and backend
- **API Request Helper**: Centralized `apiRequest` function in `lib/queryClient.ts` handles all HTTP requests with proper error handling
- **Storage Interface**: `IStorage` interface in `server/storage.ts` abstracts database operations for testability
- **WebSocket Rooms**: Location tracking and real-time chat use room-based WebSocket connections per ride
- **Secure API Proxying**: Azure Maps API key is never exposed to frontend; all requests go through backend proxy
- **Real-time Chat**: WebSocket-based chat between riders and drivers with messages persisted to database
- **Nearby Pro Drivers**: Commercial drivers can go online with their rate per mile, and riders can see nearby online Pro drivers with ratings, distance from pickup, and estimated trip cost

### Driver Types
- **Private Drivers**: Limited to 5 rides/day and £99.99 daily earnings. Can post routes and accept ride requests.
- **Commercial (Pro) Drivers**: Licensed drivers with unlimited rides. Can go "online for hire" with rate per mile visibility. Riders can find them directly based on proximity.

### Rider Options for Finding Rides
1. **Post Your Route**: Riders post their trip with a price offer and wait for drivers to accept or bid
2. **View Driver Routes**: Browse routes drivers have posted and request to join
3. **Nearby Pro Drivers**: See commercial drivers currently online with their rates and request rides directly

### Signup Flow
1. **Step 1: Email Verification** - Email with 8-digit OTP via Microsoft Entra, username, and password
2. **Step 2: Account Type** - Choose Rider or Driver
3. **Step 3: Personal Info** - Name, DOB, phone (with international country selector), address
4. **Steps 4-6 (Drivers only)**: License verification, vehicle details, bank info, optional commercial driver upgrade

### International Phone Support
- Country code dropdown with 70+ countries and flag emojis
- Default country is UK (+44)
- Phone numbers stored in international format (e.g., +447123456789)
- Backend validates international phone format with regex: `/^\+\d{7,15}$/`
- Twilio SMS works with any supported country

### Become-Driver Flow
- Modular multi-step form (steps 3-6) matching signup flow
- Step 3: Profile photo (only shown if user doesn't have one)
- Step 4: License + Vehicle info
- Step 5: Insurance + Bank details
- Step 6: Commercial driver (optional)
- Users with profile pictures start at step 4, otherwise step 3
- All required fields validated before final submission

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
