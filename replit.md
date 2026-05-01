# AtlasRide - Democratized Transportation Marketplace

## Overview

**Production URL**: `https://saviaj-eag6c8epg9hzaze6.canadacentral-01.azurewebsites.net` (Azure App Service "Saviaj", Canada Central). Always use this hostname for OAuth callbacks, webhooks, deep links, share links, and any documentation that references the live site.

AtlasRide is a democratized transportation marketplace aiming to disrupt traditional ride-sharing by giving users control over pricing and route sharing. Riders post trip requests with custom price offers, and drivers can accept or decline. Drivers can also publish planned routes with available seats. The platform integrates real-time location tracking, leverages Azure Maps for geocoding and routing, and focuses on scalability, security, and a user-driven experience. The business vision is to create a community-driven transportation network, offering flexible and personalized travel options.

## User Preferences

Preferred communication style: Simple, everyday language.

### Design Preferences
- **Map Icons**: Blue dot for pickup location, red location pin for dropoff/destination (always use red for destination pins)
- **Self-dealing Prevention**: Users cannot bid on their own ride requests or accept bids where they are both rider and driver

### Database Design Principles
- **Scalability First**: Design all new fields and tables assuming millions of records
- **Indexing Strategy**: Add indexes on foreign keys, frequently queried columns, and columns used in WHERE/ORDER BY clauses
- **Data Types**: Use appropriate types for scale (e.g., `bigint` for high-volume counters, proper precision for decimals)
- **Normalization**: Prefer normalized tables over monolithic designs to reduce row size and improve query performance
- **Partitioning Ready**: Consider future partitioning needs (e.g., by date for time-series data, by user_id for sharding)

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript (Vite)
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS with custom theme
- **Maps**: Leaflet with OpenStreetMap tiles for rendering, Azure Maps for geocoding/routing
- **Mobile Integration**: Optimized for native mobile experience using Capacitor, including safe area handling and native geolocation.

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints
- **Real-time**: WebSocket server for live location tracking and chat
- **Authentication**: Replit Auth with OpenID Connect via Passport.js (local deployment), or email/password with Microsoft Entra External ID for OTP (Azure deployment).
- **Session Management**: PostgreSQL-backed sessions

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Shared `shared/schema.ts` for frontend and backend, with ongoing normalization efforts (e.g., `user_profiles`, `driver_profiles`, `vehicles`).

### Core Features
- **User-driven Marketplace**: Riders set prices, drivers accept or offer routes.
- **Real-time Tracking & Chat**: WebSocket-based for live updates with smooth driver marker animation.
- **Driver Types**: Private (limited) and Commercial (unlimited, "online for hire" status) with configurable service categories and tiered distance pricing.
- **Recurring Journeys**: Users can schedule recurring ride requests or driver routes, with system auto-generating listings.
- **Flexible Ride Options**: Post routes, browse driver routes, or find nearby commercial drivers.
- **Secure Payments**: Stripe integration for transactions, driver earnings protection, and secure refunds.
- **Comprehensive Signup & Driver Onboarding**: Multi-step flow including identity, vehicle, and bank details.
- **Internationalization**: Support for international phone numbers.

### Security & Data Protection
- **Authentication**: bcrypt password hashing, secure session management, OTP, login rate limiting.
- **Payment Security**: Server-side amount validation, webhook verification, authorization checks, double-charge prevention.
- **Data Masking**: Sensitive user data (passwords, bank details) masked in API responses.
- **Access Controls**: Authentication and authorization for all sensitive data and file uploads (e.g., driver licenses).
- **Input Validation**: Extensive use of Zod schemas and helper functions to prevent SQL injection and XSS.
- **API Security Headers**: Standard headers (X-Frame-Options, X-Content-Type-Options, etc.) to mitigate common web vulnerabilities.

## External Dependencies

- **Stripe**: Payment processing (`stripe-replit-sync`).
- **Azure Maps**: Geocoding and routing (requires `AZURE_MAPS_KEY`).
- **OpenStreetMap**: Map tile rendering.
- **Replit Auth**: User authentication (requires `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET` for Replit deployments).
- **Microsoft Entra External ID**: Email OTP verification for signup (for Azure deployments).
- **Google Sign-In** (optional): OAuth 2.0 via `passport-google-oauth20`. Requires `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Routes: `/api/auth/google` (initiate), `/api/auth/google/callback`, `/api/auth/google/status`. Frontend `<GoogleSignInButton />` self-hides when status returns `enabled: false`. Verify callback creates a local user with `authProvider: "google"` if no user with that email exists; otherwise it just logs them in via session. Authorised redirect URI in Google Cloud Console must match `https://<host>/api/auth/google/callback`.
- **PostgreSQL**: Primary database (requires `DATABASE_URL`).
- **Twilio**: SMS for phone verification.