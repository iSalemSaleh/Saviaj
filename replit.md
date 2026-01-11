# AtlasRide - Democratized Transportation Marketplace

## Overview

AtlasRide is a two-way, democratized transportation marketplace similar to Uber, where users control pricing and route sharing. Riders post trip requests with their own price offers, and drivers can accept or decline. Drivers can also post planned routes with available seats for riders to join. The platform integrates real-time location tracking and uses Azure Maps for geocoding and routing, aiming to provide a user-driven, scalable, and secure transportation solution.

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
- **Framework**: React with TypeScript, built with Vite
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS with custom theme
- **Maps**: Leaflet with OpenStreetMap tiles for rendering, Azure Maps for geocoding/routing

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints
- **Real-time**: WebSocket server for live location tracking and chat
- **Authentication**: Replit Auth with OpenID Connect via Passport.js
- **Session Management**: PostgreSQL-backed sessions

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Shared `shared/schema.ts` for frontend and backend
- **Key Tables**: `users`, `riderOffers`, `driverRoutes`, `rides`, `bids`, `chatMessages`, `ratings`.
- **Normalization**: Ongoing migration to normalized tables (`user_profiles`, `driver_profiles`, `vehicles`, etc.) to improve performance and scalability.

### Core Features
- **User-driven marketplace**: Riders set prices, drivers accept or offer routes.
- **Real-time Tracking & Chat**: WebSocket-based for live ride updates and in-app communication.
- **Driver Types**: Private (limited) and Commercial (unlimited, "online for hire" status).
- **Flexible Ride Options**: Post own route, browse driver routes, or find nearby commercial drivers.
- **Secure Payments**: Stripe integration with robust security measures for amount validation, webhook verification, and driver earnings protection.
- **Comprehensive Signup & Driver Onboarding**: Multi-step flow including email verification, personal info, license, vehicle, and bank details.
- **Internationalization**: Support for international phone numbers with country code selection and validation.
- **Mobile-First Design**: Optimized for native mobile experience using Capacitor, including safe area handling, touch target adjustments, and native geolocation.

### Security & Data Protection
- **Authentication**: Password hashing (bcrypt), secure session management, OTP protection, login rate limiting.
- **Payment Security**: Amount validation server-side, webhook verification, authorization checks, refund handling, and sensitive data protection.
- **Data Masking**: Sensitive user data (passwords, bank details) masked in API responses.
- **Access Controls**: Authentication and authorization checks for all sensitive data access.
- **File Upload Security**: Authenticated access for driver license files with ownership verification and validation.

## External Dependencies

- **Stripe**: Payment processing (`stripe-replit-sync`).
- **Azure Maps**: Geocoding and routing (requires `AZURE_MAPS_KEY`).
- **OpenStreetMap**: Map tile rendering.
- **Replit Auth**: User authentication (requires `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`).
- **Microsoft Entra External ID**: Email OTP verification for signup.
- **PostgreSQL**: Primary database (requires `DATABASE_URL`).
- **Twilio**: SMS for phone verification.

## Security Audit (Phase 1 - Authentication)

### Security Measures in Place
- **Password Hashing**: bcrypt with 12 salt rounds
- **Session Security**: httpOnly, secure, sameSite:'lax' cookies, 7-day expiry, PostgreSQL-backed
- **OTP Protection**: 3 attempts max (phone), 5 attempts max (email), 60-second resend cooldown
- **OTP Storage**: Hashed with bcrypt, 5-minute expiry
- **Email Verification Tokens**: 30-minute validity, invalidated after use
- **Phone Validation**: E.164 international format enforced
- **Login Rate Limiting**: 5 failed attempts triggers 15-minute lockout (in-memory with eviction)
- **Password Requirements**: Minimum 8 characters
- **Error Messages**: Non-revealing ("Invalid credentials" instead of "User not found")

### Future Improvements (for high-traffic deployment)
- Move login rate limiting to Redis for multi-instance deployments
- Add IP-based throttling for distributed attack protection
- Consider CAPTCHA for login after N failed attempts

## Security Audit (Phase 2 - Payments)

### Payment Security Measures
- **Amount Validation**: Payment amounts sourced from database (`ride.agreedPrice`), never from client input
- **Double-Charge Prevention**: Checks `paymentStatus === 'paid'` before creating new payment intents; reuses existing valid payment intents
- **Webhook Verification**: Stripe webhooks verified via stripe-replit-sync with signature validation
- **Webhook Order**: Raw body handler registered BEFORE `express.json()` middleware to preserve Buffer payload
- **Metadata Validation**: Checkout session metadata verified against ride ID to prevent session hijacking
- **Authorization Checks**: All payment endpoints verify `ride.riderId === userId`; ride status updates require user to be rider or driver
- **Refund Handling**: Automatic refunds on cancellation; blocked once ride is `arrived_pickup`, `in_progress`, or `completed`
- **Payment Cleanup**: Stale pending payments auto-cancelled (15min for Pro drivers, 30min for standard)
- **Stripe API Version**: Using `2025-11-17.clover` (current stable)
- **Secure Key Management**: Stripe credentials fetched via Replit connector, never exposed to client

### Driver Earnings Protection
- **Activity Tracking**: Driver daily activity tracked at ride COMPLETION, not acceptance (prevents cancelled rides counting toward limits)
- **Private Driver Limits**: 5 rides/day and £99.99 daily earnings cap enforced server-side
- **Commercial Driver Bypass**: `isCommercialDriver` flag checked before applying limits

## Security Audit (Phase 3 - Data Protection & Privacy)

### Sensitive Data Masking
- **Password Hash**: Never exposed in API responses (explicitly set to `undefined`)
- **Bank Details**: Account numbers masked to last 4 digits (`****1234`), sort codes masked to last 2 digits (`**-**-56`)
- **License URLs**: Converted from static paths to authenticated API paths in responses
- **Helper Functions**: Multiple sanitization helpers ensure consistent data protection across all endpoints

### Helper Functions for Data Sanitization
- **`maskSensitiveUserData(user)`**: For returning user's OWN profile - masks bank details, strips password hash, converts license URLs
- **`getMinimalUserInfo(user)`**: For embedding user info in responses to OTHER users - only id, name, profile image, ratings
- **`getPublicDriverProfile(driver)`**: For driver listings - includes vehicle info, rate, no PII
- **`getDriverInfoForRide(driver)`**: For active rides - includes phone for contact during ride
- **`getRiderInfoForRide(rider)`**: For active rides - includes phone for driver contact

### Public vs Private Data Separation
- **Public Driver Profiles**: When exposing drivers to other users, only safe fields are returned (name, rating, vehicle info, rate per mile)
- **Private Fields Protected**: License URLs, bank details, DOB, full address not exposed to other users
- **Own Data Access**: Users can access their own masked data but not other users' sensitive information

### File Upload Security
- **License Files Protected**: Driver license uploads NOT served statically - require authentication via `/api/uploads/licenses/:filename`
- **Ownership Verification**: License files can only be accessed by the user who uploaded them (checks all license types)
- **URL Conversion**: License URLs stored as `/uploads/licenses/{file}` are converted to `/api/uploads/licenses/{file}` when returned
- **Profile Images Public**: Only profile images are served statically (intentionally public for display)
- **File Type Validation**: Multer validates allowed MIME types (images, PDFs for licenses)
- **Size Limits**: License files 10MB max, profile images 5MB max

### Data Access Controls
- **Authentication Required**: All sensitive data endpoints require valid session
- **Authorization Checks**: Users can only access/modify their own data
- **License Viewing**: Users can only view their own license files, not others'

### Future Improvements
- Consider encrypting license files at rest
- Add audit logging for sensitive data access
- Implement data retention policies for deleted accounts