// One-shot backfill that fills in users.stripe_connect_default_currency
// for drivers who onboarded before task #24 started caching it.
//
// Task #24 added the column and now populates it whenever
// account.updated fires, the driver re-onboards, or
// syncAccountFromStripe runs. Existing drivers stay NULL until one of
// those happens, so the Payouts page falls back to GBP for them — wrong
// for any non-UK driver already on the platform. This script walks
// every user with a stripe_connect_account_id and reuses
// syncAccountFromStripe so the cached cols stay consistent with the
// live webhook / refresh path.
//
// Usage:
//   npx tsx scripts/backfill-stripe-connect-currency.ts
//
// Re-runnable: syncAccountFromStripe is idempotent. We snapshot the
// cached currency before each call and only count it as an update when
// the value actually changed, so re-runs report a clean "0 updated".

import { db } from "../server/db";
import { users } from "../shared/schema";
import { syncAccountFromStripe } from "../server/stripeConnect";
import { asc, isNotNull } from "drizzle-orm";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function main() {
  const targets = await db
    .select({
      id: users.id,
      stripeConnectAccountId: users.stripeConnectAccountId,
      stripeConnectDefaultCurrency: users.stripeConnectDefaultCurrency,
    })
    .from(users)
    .where(isNotNull(users.stripeConnectAccountId))
    .orderBy(asc(users.createdAt));

  console.log(
    `[backfill-currency] ${targets.length} users have a Stripe Connect account`,
  );

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const u of targets) {
    const accountId = u.stripeConnectAccountId;
    if (!accountId) continue;

    const cached = (u.stripeConnectDefaultCurrency ?? "").toLowerCase();

    try {
      const account = await syncAccountFromStripe(accountId);
      const stripeCurrency = (account.default_currency ?? "").toLowerCase();

      // syncAccountFromStripe only persists when account.metadata.userId
      // is present. If a legacy Connect account is missing metadata or
      // points at a different user, the cached cols (including
      // default_currency) won't actually be written — surface that as a
      // failure so operators can fix the metadata and re-run.
      const metadataUserId = account.metadata?.userId ?? null;
      if (metadataUserId !== u.id) {
        failed += 1;
        console.error(
          `[backfill-currency] user=${u.id} account=${accountId} metadata.userId mismatch (got ${metadataUserId ?? "<missing>"}) — not persisted`,
        );
        continue;
      }

      if (stripeCurrency && stripeCurrency !== cached) {
        updated += 1;
        console.log(
          `[backfill-currency] user=${u.id} account=${accountId} ${cached || "<null>"} -> ${stripeCurrency}`,
        );
      } else {
        unchanged += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(
        `[backfill-currency] user=${u.id} account=${accountId} failed:`,
        errorMessage(err),
      );
    }
  }

  console.log(
    `[backfill-currency] done — updated=${updated} unchanged=${unchanged} failed=${failed}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[backfill-currency] fatal:", errorMessage(err));
  process.exit(1);
});
