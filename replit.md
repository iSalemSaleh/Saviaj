# AtlasRide - Democratized Transportation Marketplace

## Overview
AtlasRide is a democratized transportation marketplace aiming to disrupt traditional ride-sharing by giving users control over pricing and route sharing. Riders can post trip requests with custom price offers, and drivers can accept or decline. Drivers can also publish planned routes with available seats. The platform integrates real-time location tracking, leverages Azure Maps for geocoding and routing, and focuses on scalability, security, and a user-driven experience. The business vision is to create a community-driven transportation network, offering flexible and personalized travel options.

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

### Frontend
- **Framework**: React with TypeScript (Vite)
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS with custom theme
- **Maps**: Leaflet with OpenStreetMap tiles for rendering, Azure Maps for geocoding/routing
- **Mobile Integration**: Optimized for native mobile experience using Capacitor.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints
- **Real-time**: WebSocket server for live location tracking and chat
- **Authentication**: Replit Auth with OpenID Connect via Passport.js, or email/password with Microsoft Entra External ID for OTP.
- **Session Management**: PostgreSQL-backed sessions

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Shared `shared/schema.ts` for frontend and backend, with normalization efforts for `user_profiles`, `driver_profiles`, and `vehicles`.

### Core Features
- **User-driven Marketplace**: Riders set prices, drivers accept or offer routes.
- **Real-time Tracking & Chat**: WebSocket-based for live updates.
- **Driver Types**: Private and Commercial drivers with configurable service categories.
- **Recurring Journeys**: Schedule recurring ride requests or driver routes.
- **Flexible Ride Options**: Post routes, browse driver routes, or find nearby commercial drivers.
- **Secure Payments**: Stripe integration for transactions, driver earnings protection, and refunds.
- **Comprehensive Onboarding**: Multi-step signup for users and drivers.
- **Internationalization**: Support for international phone numbers.

### Security & Data Protection
- **Authentication**: bcrypt password hashing, secure session management, OTP, login rate limiting.
- **Payment Security**: Server-side amount validation, webhook verification, authorization checks.
- **Data Masking**: Sensitive user data masked in API responses.
- **Access Controls**: Authentication and authorization for sensitive data and file uploads.
- **Input Validation**: Zod schemas to prevent SQL injection and XSS.
- **API Security Headers**: Standard headers to mitigate common web vulnerabilities.

### System Design
- **Saviaj Pass (User Identifier)**: Unique `pass_id` for users with a structured format and atomic generation mechanism.
- **Commercial Driver Licensing**: Integration with UK Local Licensing Authorities for commercial driver verification.
- **Driver Compliance Stack**: Comprehensive compliance for UK rideshare drivers covering self-employment tax, DBS checks, DVLA licence checks, Hire & Reward insurance, KYC, and Sanctions/AML screening.
- **Platform Fees**: Centralized management of platform fees with per-ride accounting and specific logic for casual route allocation.
- **Stripe Connect Express**: Separate charges and transfers model for driver payouts, with onboarding, status synchronization, and payout triggers.
- **Stripe Identity**: Hosted document and selfie verification for KYC, integrating with existing `kyc_status` fields.
- **Auth Lifecycle Rules**: Strict rules for active user lookups, account deletion, re-signup after deletion, OTP flow tracking, and password reset hardening.

## External Dependencies
- **Stripe**: Payment processing.
- **Azure Maps**: Geocoding and routing.
- **OpenStreetMap**: Map tile rendering.
- **Replit Auth**: User authentication.
- **Microsoft Entra External ID**: Email OTP verification.
- **Google Sign-In**: OAuth 2.0 for user authentication.
- **PostgreSQL**: Primary database.
- **Twilio**: SMS for phone verification.