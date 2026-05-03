-- =============================================================================
-- Saviaj production schema migration
-- Adds columns/tables introduced by the Stripe platform-fees, Connect Express,
-- and Identity KYC work. Safe to re-run (idempotent: IF NOT EXISTS / ADD COLUMN
-- IF NOT EXISTS / CREATE TABLE IF NOT EXISTS).
--
-- HOW TO RUN against your Azure Postgres prod DB:
--   psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/prod-migration-2026-05-03.sql
--
-- After running, restart the Azure App Service so the cleanup jobs pick up
-- the new schema.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- rides: per-ride fee + payout breakdown
-- ---------------------------------------------------------------------------
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS platform_fee_pence       integer,
  ADD COLUMN IF NOT EXISTS driver_payout_pence      integer,
  ADD COLUMN IF NOT EXISTS fee_calculation_version  varchar(20),
  ADD COLUMN IF NOT EXISTS fee_basis                varchar(40);

-- ---------------------------------------------------------------------------
-- driver_routes: marker so casual route flow only charges £1.50 once
-- ---------------------------------------------------------------------------
ALTER TABLE driver_routes
  ADD COLUMN IF NOT EXISTS platform_fee_collected_pence         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_collected_for_ride_id   integer;

-- ---------------------------------------------------------------------------
-- users: Stripe Connect Express + Stripe Identity KYC bookkeeping
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kyc_status                       varchar(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kyc_verified_at                  timestamp,
  ADD COLUMN IF NOT EXISTS kyc_provider                     varchar(40),
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id        varchar,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_requirements_due  jsonb,
  ADD COLUMN IF NOT EXISTS stripe_connect_updated_at        timestamp,
  ADD COLUMN IF NOT EXISTS stripe_identity_session_id       varchar,
  ADD COLUMN IF NOT EXISTS stripe_identity_last_attempt_at  timestamp,
  ADD COLUMN IF NOT EXISTS stripe_identity_failure_reason   varchar(200);

-- ---------------------------------------------------------------------------
-- driver_payouts: ledger of Stripe transfers per ride
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_payouts (
  id                  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ride_id             integer NOT NULL REFERENCES rides(id),
  driver_id           varchar NOT NULL REFERENCES users(id),
  stripe_transfer_id  varchar(80),
  amount_pence        integer NOT NULL,
  status              varchar(30) NOT NULL DEFAULT 'pending',
  failure_reason      varchar(300),
  retry_count         integer NOT NULL DEFAULT 0,
  last_attempt_at     timestamp,
  created_at          timestamp DEFAULT now(),
  updated_at          timestamp DEFAULT now()
);

-- In case the table already existed from a partial earlier attempt, make sure
-- the auto-retry columns are present.
ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS retry_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at   timestamp;

-- At most ONE active payout (pending or transferred) per ride. Failed /
-- reversed rows are excluded so retries are still allowed after a failure.
CREATE UNIQUE INDEX IF NOT EXISTS driver_payouts_one_active_per_ride
  ON driver_payouts (ride_id)
  WHERE status IN ('pending', 'transferred');

COMMIT;

-- Sanity check — should print the new columns:
--   \d rides
--   \d driver_payouts
