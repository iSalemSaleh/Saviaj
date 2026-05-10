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
- **Stripe Connect Express**: Separate charges and transfers model for driver payouts, with onboarding, status synchronization, and payout triggers. On Capacitor (Android/iOS), the onboarding URL is opened via `@capacitor/browser` so users return to the app via the deep-linked `return_url`; status auto-refreshes when the in-app browser closes. Web continues to use a same-tab redirect.
- **Stripe Identity**: Hosted document and selfie verification for KYC, integrating with existing `kyc_status` fields.
- **Signup Flow**: Step 1 requires email + phone verification (both mandatory, SMS OTP via Twilio). Address lookup via Azure Maps postcode search with dropdown + manual entry fallback. Login accepts email, phone, or username.
- **Auth Lifecycle Rules**: Strict rules for active user lookups, account deletion, re-signup after deletion, OTP flow tracking, and password reset hardening.
- **Entra CIAM Limitation**: Native Auth sign-in with email OTP is NOT supported by Microsoft CIAM (returns 404). Only sign-up OTP works. Workarounds:
  - *Orphan accounts* (Entra has user, local DB doesn't): auto-verify and skip OTP since email was previously verified.
  - *Password reset*: falls back to Twilio SMS OTP when Entra can't send email OTP to existing users.

## Production Schema Sync (Azure)
- Prod DB (`saviaj-server.postgres.database.azure.com`) sits behind a private endpoint and is only reachable from the App Service. `npm run db:push` is **not** executed automatically during deploy.
- After any merge that touches `shared/schema.ts`, regenerate `scripts/prod-full-schema-sync.sql` from dev (introspection-based, idempotent), commit, deploy, then SSH into App Service and run:
  ```
  cd /home/site/wwwroot && node scripts/run-prod-schema-sync.cjs
  ```
  The runner executes the full file in one transaction; every statement is `CREATE/ADD ... IF NOT EXISTS` so re-runs are safe.
- Restart the App Service after the sync so cached query plans refresh.

## Chat 10/10 — Optional Integrations
The in-app chat ships with Tier 3 (media), Tier 4 (push), and Tier 5 (translate) features. Each
integration is **gracefully gated**: if the env vars are absent the app keeps running and the UI
hides the corresponding controls (queried via `GET /api/chat/integrations`).

| Feature                | Required env vars                                                                 |
|------------------------|-----------------------------------------------------------------------------------|
| Image / voice / file   | `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY`, `AZURE_STORAGE_CONTAINER` (default `chat-media`) |
| Push notifications     | `FIREBASE_SERVICE_ACCOUNT` (full JSON string OR a path to a JSON file). Plus `VITE_FIREBASE_*` config in the client for FCM Web token registration. |
| Auto-translate         | `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, optional `AZURE_TRANSLATOR_ENDPOINT` |

**Container setup (Azure Blob)**
- Create a container named `chat-media` (private access). The server mints SAS PUT URLs valid
  for 10 minutes for upload; SAS GET URLs valid for 14 days are persisted with each message.
- Allowed MIME types: jpg/png/webp/gif, webm/mpeg/mp4/ogg/wav audio, pdf. Max 25 MB per file.

**Firebase / FCM**
- Server uses `firebase-admin` (FCM HTTP v1) — covers Web Push, Android (Capacitor), and iOS
  (Capacitor + APNs via FCM bridging).
- Client uses the Firebase JS SDK + `client/public/firebase-messaging-sw.js` service worker
  to obtain a Web Push token.

## App Store / Play Store Review Accounts
Reviewers (Google / Apple) cannot receive UK SMS or read a real inbox, so we
ship a **review-mode bypass** keyed on env vars. Both bypasses are no-ops when
the env vars are unset, so production users are unaffected.

| Env var               | Purpose                                                  |
|-----------------------|----------------------------------------------------------|
| `REVIEW_TEST_EMAILS`  | Comma-separated emails that skip Entra OTP send/verify   |
| `REVIEW_TEST_PHONES`  | Comma-separated E.164 phones that skip Twilio SMS        |
| `REVIEW_OTP_CODE`     | Fixed OTP for the above (default `000000`)               |

Seed the two reviewer accounts (rider + driver, with KYC pre-approved and a
vehicle for the driver):
```
REVIEW_RIDER_EMAIL=... REVIEW_RIDER_PHONE=... REVIEW_RIDER_PASSWORD=... \
REVIEW_DRIVER_EMAIL=... REVIEW_DRIVER_PHONE=... REVIEW_DRIVER_PASSWORD=... \
npx tsx scripts/seed-play-review.ts
```
The script is idempotent. Run it once on dev and once on prod (via the App
Service SSH console) before submitting builds for review.

## Android (Capacitor)
- **App identity**: `com.saviaj.app` (permanent — used by Play Console).
- **Build outputs**: `android/app/build/outputs/bundle/release/app-release.aab` after `./gradlew bundleRelease`.
- **Signing**: Generate the upload keystore once with `bash scripts/generate-android-keystore.sh`, then set
  `SAVIAJ_KEYSTORE_PATH`, `SAVIAJ_KEYSTORE_PASSWORD`, `SAVIAJ_KEY_ALIAS`, `SAVIAJ_KEY_PASSWORD`. The
  release `signingConfig` is only applied when `SAVIAJ_KEYSTORE_PATH` is set, so unsigned debug builds
  still work without the keystore.
- **Deep links / App Links**: `https://savia.sibranet.com/*` opens in the app via the verified
  intent-filter in `AndroidManifest.xml`. The server hosts `/.well-known/assetlinks.json` — set
  `ANDROID_APP_SIGNING_FINGERPRINTS` (comma-separated SHA256s for upload + Play App Signing keys)
  in the Azure App Service so Google can verify ownership.
- **Background location**: Driver foreground tracking uses `@capacitor-community/background-geolocation`
  via `client/src/lib/nativeBackgroundLocation.ts`. Android shows a persistent "Trip in progress"
  notification while active (required by Android 10+).
- **Push**: Same Firebase project as web (sender 113438282917). Drop `google-services.json` into
  `android/app/` before building; the Gradle plugin auto-detects it.
- **Workflow**:
  1. `npm run build` — compiles web app to `dist/public`
  2. `npx cap sync android` — copies into `android/app/src/main/assets/public`
  3. `cd android && ./gradlew bundleRelease` — produces signed AAB
  4. Upload AAB to Play Console → Internal Testing track (instant, no review)

## External Dependencies
- **Stripe**: Payment processing.
- **Azure Maps**: Geocoding and routing.
- **OpenStreetMap**: Map tile rendering.
- **Replit Auth**: User authentication.
- **Microsoft Entra External ID**: Email OTP verification.
- **Google Sign-In**: OAuth 2.0 for user authentication.
- **PostgreSQL**: Primary database.
- **Twilio**: SMS for phone verification.