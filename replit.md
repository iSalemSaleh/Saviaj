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

### Saviaj Pass (User Identifier)
- **Field**: `users.pass_id varchar(20) UNIQUE` (nullable for legacy users; backfilled by `scripts/backfill-pass-ids.ts`).
- **Format**: `SV` + 3-letter UK city code + `YYMMDD` + 4-digit zero-padded daily sequence (e.g. `SVLON2605010042`). Sequence > 9999 grows to 5+ digits in the same column.
- **City source**: Required at signup; either chosen from `shared/data/uk-cities.ts` (~200 UK cities, each mapped to a 3-letter code) or autofilled from a UK postcode via `GET /api/lookup/postcode/:postcode` (postcodes.io proxy). Unknown / unmapped cities fall back to the `ZZZ` code so we still issue a valid pass ID.
- **Atomicity**: `pass_id_daily_counters (bucket varchar(12) PK, last_seq int, updated_at timestamp)` — `bucket` is `<CITY3>-<YYMMDD>`. The generator does an `INSERT ... ON CONFLICT (bucket) DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq`, so 100 concurrent signups in the same bucket get 100 distinct sequences without app-level locking. Sequences are guaranteed unique but NOT gap-free: a failed `createUser` after counter increment burns that sequence number.
- **Wired in**: `server/passIdGenerator.ts` is invoked from `createLocalUser` (server/localAuth.ts) and the Google sign-in callback (server/googleAuth.ts) BEFORE `storage.createUser`, so the new row never exists without a pass ID.
- **Immutability**: Pass IDs are issued once and never re-issued. `storage.setUserPassIdIfMissing` only writes when the column is still NULL (used by the backfill script).
- **Display**: Shown on the Settings page profile section as a small pill badge, copy-friendly mono font.

### Commercial Driver Licensing Council
- **Field**: `users.licensing_council varchar(100)` (nullable; required when `is_commercial_driver = true`).
- **Source**: `shared/data/uk-councils.ts` lists ~250 UK Local Licensing Authorities (boroughs / unitary councils + TfL for Greater London). `isValidCouncil(name)` validates server-side; the dropdown lives in the signup form's commercial driver step.
- **Server guards**: `POST /api/auth/register` (server/localAuth.ts), `POST /api/user/upgrade-to-driver` and `POST /api/user/upgrade-to-commercial` (server/routes.ts) all refuse the commercial activation when `licensingCouncil` is missing or not in the curated list. Validation uses `isValidCouncil` from `shared/data/uk-councils`.

### Driver Compliance Stack
End-to-end UK rideshare compliance for every driver. All status flips
go through dedicated `storage.*` helpers so we have a single audited
write path; the FE reads through `GET /api/driver/compliance` (an
aggregate endpoint that returns one snapshot for the Settings dashboard).

- **Self-employment tax notice** (`users.tax_self_employment_acknowledged`,
  `tax_acknowledged_at`): captured at signup (`POST /api/auth/register`)
  and re-checked at `POST /api/user/upgrade-to-driver` and
  `POST /api/user/upgrade-to-commercial`. UK rideshare drivers are self-
  employed, NOT employees — we keep timestamped consent for HMRC's
  6-year record-keeping window. Endpoint: `POST /api/auth/acknowledge-tax-notice`.
- **DBS (Disclosure & Barring Service)** (`dbs_certificate_number/issue_date/expiry/url`,
  `dbs_update_service_subscribed`, `background_check_status`):
  uploaded via `POST /api/driver/dbs` (multer disk storage, same
  guardrails as driving licence uploads). Submitting a cert flips
  `background_check_status` to `submitted`; admin or webhook flips it to
  `approved`. Expiry index `idx_users_dbs_expiry` powers nightly sweeps.
- **DVLA driving licence check** (`dvla_check_code`, `dvla_check_status`,
  `dvla_last_checked_at`): the share-driving-licence code is collected
  during signup. `POST /api/driver/dvla/refresh` records the check
  result. Real DVLA "Share Driving Licence" partner API integration is
  deferred — current implementation is admin-action / webhook-ready.
- **Hire & Reward insurance** (`hire_reward_insurance_url/expiry/verified`):
  hard legal requirement for ALL drivers (private and commercial) — standard
  motor insurance does NOT cover paid passengers. Uploaded via
  `POST /api/driver/hire-reward-insurance`. The
  `/api/user/upgrade-to-commercial` endpoint refuses if H&R is missing
  or expired. Expiry index `idx_users_hire_reward_expiry` powers
  nightly sweeps.
- **KYC** (`kyc_status`, `kyc_verified_at`, `kyc_provider`):
  status enum is provider-agnostic so Onfido / Stripe Identity /
  manual review all use the same column. `POST /api/driver/kyc/start`
  records the intent; the provider's webhook will flip status to
  `verified` / `failed` (provider integration deferred).
- **Sanctions / AML screening** (`sanctions_screening_status`,
  `sanctions_screened_at`): re-screened periodically while the driver
  account is active. Required before any high-value payout.
- **Commercial driver triple-licensing** (already documented above):
  `licensing_council` + PHV licence + vehicle inspection. The
  `/api/driver/compliance` endpoint surfaces these alongside the new
  fields when `is_commercial_driver = true`.

Company-side identifiers live in `shared/data/company-info.ts` as a
single typed source of truth (`SAVIAJ_COMPANY_INFO`):
- Company number 16953498, registered office 75 Beverley Road, BS7 0JW
- ICO ZC129989
- PHV Operator Licence: pending application — placeholder is null and
  the legal index page renders "application pending" until populated
- VAT: not registered (below £90k HMRC threshold) — placeholder is null
- Data Protection Officer contact

The legal index page (`/legal`) renders all of the above in the footer
so the canonical operator details are visible alongside every legal doc.

### Auth Lifecycle Rules
- **Active-user lookups**: All login, signup, OTP, password-reset, and username-availability paths use `getActiveUserByEmail` / `getActiveUserByUsername` (filter `deleted_at IS NULL`). Use the raw `getUserByEmail` / `getUserByUsername` only when you need to find a soft-deleted shell (e.g., for `releaseEmailForDeletedUser`).
- **Account deletion**: `softDeleteUser` sets `deleted_at`; followed by `invalidateUserSessions(userId)` to wipe every session row for that user across all session shapes (`sess.userId`, `sess.user.claims.sub`, `sess.user.id`, `sess.passport.user.claims.sub`, `sess.passport.user.id`, `sess.passport.user` as string).
- **Re-signup after deletion**: At signup, `releaseEmailForDeletedUser` suffixes the soft-deleted user's email (`<local>+deleted-<id8>-<ts>@deleted.local`) and NULLs the username (varchar(30) is too small for the suffix). The original email/username then becomes available for a brand-new account.
- **OTP flow tracking**: Both `email_verifications` (signup OTP) and `password_reset_tokens` (reset OTP) carry a `flow_type` column ('signup' | 'signin') so the verify endpoint posts the OTP to the matching Entra `/{flow}/v1.0/continue` endpoint. Signup OTP falls back to sign-in for soft-deleted re-signups (Entra still owns the email); password reset OTP falls back to sign-up for legacy local-password users (no Entra account).
- **Password reset hardening**: Rate limit runs BEFORE user lookup (no enumeration). Generic success returned for missing accounts and OAuth-only users (no `passwordHash`). Failed verification only burns an attempt when Entra explicitly rejected the code (`success:true, verified:false`); transient errors return 503. Post-reset, `invalidateUserSessions` runs to log the user out everywhere.
- **Google sign-in**: Refuses soft-deleted accounts with a clear "contact support" message — never silently re-activates them.

## External Dependencies

- **Stripe**: Payment processing (`stripe-replit-sync`).
- **Azure Maps**: Geocoding and routing (requires `AZURE_MAPS_KEY`).
- **OpenStreetMap**: Map tile rendering.
- **Replit Auth**: User authentication (requires `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET` for Replit deployments).
- **Microsoft Entra External ID**: Email OTP verification for signup (for Azure deployments).
- **Google Sign-In** (optional): OAuth 2.0 via `passport-google-oauth20`. Requires `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Routes: `/api/auth/google` (initiate), `/api/auth/google/callback`, `/api/auth/google/status`. Frontend `<GoogleSignInButton />` self-hides when status returns `enabled: false`. Verify callback creates a local user with `authProvider: "google"` if no user with that email exists; otherwise it just logs them in via session. Authorised redirect URI in Google Cloud Console must match `https://<host>/api/auth/google/callback`.
- **PostgreSQL**: Primary database (requires `DATABASE_URL`).
- **Twilio**: SMS for phone verification.