/**
 * Stripe Connect Express - driver payout accounts.
 *
 * We use the "separate charges and transfers" model:
 *   1. Riders pay the full ride amount into our PLATFORM Stripe account
 *      (via the existing PaymentIntents in stripeService.createPaymentIntent).
 *   2. After the ride is marked completed (PATCH /api/rides/:id/complete),
 *      we issue a Stripe Transfer of `rides.driver_payout_pence` to the
 *      driver's connected account. The platform retains
 *      `rides.platform_fee_pence`.
 *   3. Stripe automatically pays out the driver's connected-account
 *      balance to their bank on Stripe's standard schedule (default
 *      daily, configurable per-account).
 *
 * Why "Express" (not Standard or Custom)?
 *   - Stripe-hosted onboarding (no need to build KYC forms ourselves).
 *   - Drivers get a Stripe Express dashboard (earnings, bank changes).
 *   - We still own the customer relationship (drivers don't see Stripe
 *     branding in OUR app).
 */
import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";

function getDeploymentBaseUrl(): string {
  // Preference order: explicit env var > Replit dev domain > Azure host > localhost.
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  if (process.env.WEBSITE_HOSTNAME) return `https://${process.env.WEBSITE_HOSTNAME}`;
  return "http://localhost:5000";
}

/**
 * Create a Stripe Express account for a driver if they don't already
 * have one. Returns the account id (acct_xxx). Idempotent: re-uses the
 * existing account from `users.stripe_connect_account_id` if present.
 */
export async function ensureExpressAccountForDriver(args: {
  userId: string;
  email: string;
}): Promise<string> {
  const user = await storage.getUser(args.userId);
  if (!user) throw new Error(`User ${args.userId} not found`);
  if (user.stripeConnectAccountId) return user.stripeConnectAccountId;

  const stripe = await getUncachableStripeClient();
  const account = await stripe.accounts.create({
    type: "express",
    country: "GB",
    email: args.email,
    capabilities: {
      transfers: { requested: true },
      // card_payments NOT requested - rider charges go to the platform
      // account, not the driver's connected account, under separate
      // charges & transfers.
    },
    business_type: "individual",
    metadata: { userId: args.userId },
  });

  await storage.updateUserStripeConnect(args.userId, {
    accountId: account.id,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    onboarded: false,
    requirementsDue: account.requirements?.currently_due ?? [],
    defaultCurrency: account.default_currency ?? null,
  });

  return account.id;
}

/**
 * Generate a one-time onboarding link the driver should be redirected to.
 * Stripe-hosted - the driver fills out their personal details, ID,
 * bank account, etc. On completion, Stripe sends them back to
 * `return_url`. The `account.updated` webhook then flips
 * `stripeConnectOnboarded` true (assuming Stripe accepts the data).
 */
export async function createOnboardingLink(accountId: string): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const base = getDeploymentBaseUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/settings?stripeConnect=refresh`,
    return_url: `${base}/settings?stripeConnect=complete`,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Pull the latest account state from Stripe and write the cached cols
 * to our DB. Used when the FE polls /api/driver/connect/refresh after
 * the driver returns from onboarding (gives us a fresh snapshot before
 * the webhook fires).
 */
export async function syncAccountFromStripe(accountId: string): Promise<Stripe.Account> {
  const stripe = await getUncachableStripeClient();
  const account = await stripe.accounts.retrieve(accountId);
  const userId = (account.metadata?.userId as string) || null;
  if (userId) {
    await storage.updateUserStripeConnect(userId, {
      accountId: account.id,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      onboarded: !!account.details_submitted,
      requirementsDue: account.requirements?.currently_due ?? [],
      defaultCurrency: account.default_currency ?? null,
    });
  }
  return account;
}

/**
 * Issue a Stripe Transfer from the platform balance to the driver's
 * connected account. Called from the ride-completion path after we
 * have a successful payment.
 */
export async function transferToDriver(args: {
  destinationAccountId: string;
  amountPence: number;
  rideId: number;
  driverId: string;
  /** Source charge ID, if known. Stripe uses it to link the transfer
   *  to the original charge for refund-reversal accounting. */
  sourceCharge?: string;
}): Promise<Stripe.Transfer> {
  const stripe = await getUncachableStripeClient();
  return stripe.transfers.create({
    amount: args.amountPence,
    currency: "gbp",
    destination: args.destinationAccountId,
    transfer_group: `ride_${args.rideId}`,
    ...(args.sourceCharge ? { source_transaction: args.sourceCharge } : {}),
    metadata: {
      rideId: args.rideId.toString(),
      driverId: args.driverId,
    },
  });
}

/**
 * Reverse a previously-issued transfer when a ride is refunded.
 * Returns the reversal object. If the driver's connected balance is
 * too low to fully reverse, Stripe will create a "negative balance"
 * on the driver's account - the caller should mark our payout row
 * `reversed_with_debt` in that case.
 */
export async function reverseDriverTransfer(args: {
  stripeTransferId: string;
  amountPence?: number; // omit for full reversal
  reason?: string;
}): Promise<Stripe.TransferReversal> {
  const stripe = await getUncachableStripeClient();
  return stripe.transfers.createReversal(args.stripeTransferId, {
    ...(args.amountPence !== undefined ? { amount: args.amountPence } : {}),
    metadata: { reason: args.reason || "ride_refunded" },
  });
}

/**
 * Webhook event handler for `account.updated`. Stripe sends this every
 * time a Connect account's state changes (onboarding complete, KYC
 * outcome, capability flip, etc). We mirror the relevant flags into
 * our users table so the gate checks (canDriverEarn) are fast.
 */
export async function handleAccountUpdatedWebhook(account: Stripe.Account): Promise<void> {
  const userId = (account.metadata?.userId as string) || null;
  if (!userId) {
    console.warn(`[stripeConnect] account.updated for ${account.id} has no userId metadata`);
    return;
  }
  // Snapshot the prior payouts flag so we can detect a false -> true
  // edge and trigger an immediate sweep of any failed payouts that
  // were waiting on this driver's Connect account to come back.
  const priorUser = await storage.getUser(userId);
  const wasPayoutsEnabled = !!priorUser?.stripeConnectPayoutsEnabled;
  await storage.updateUserStripeConnect(userId, {
    accountId: account.id,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    onboarded: !!account.details_submitted,
    requirementsDue: account.requirements?.currently_due ?? [],
    defaultCurrency: account.default_currency ?? null,
  });
  console.log(
    `[stripeConnect] synced ${userId}: charges=${account.charges_enabled} payouts=${account.payouts_enabled} onboarded=${account.details_submitted}`,
  );

  if (!wasPayoutsEnabled && !!account.payouts_enabled) {
    // Fire-and-forget: webhook handler must return promptly so Stripe
    // doesn't time out and replay the event. Errors are logged inside
    // retryFailedPayoutsForDriver and on the catch below.
    void (async () => {
      try {
        const { retryFailedPayoutsForDriver } = await import('./payoutRetry');
        await retryFailedPayoutsForDriver(userId);
      } catch (err) {
        console.error(`[stripeConnect] auto-retry sweep failed for ${userId}`, err);
      }
    })();
  }
}

/**
 * Single source of truth for "is this driver allowed to earn money
 * right now?" Used by every gate in routes.ts (online-status, bid
 * creation, ride completion, route publish).
 */
export function canDriverEarn(user: {
  stripeConnectPayoutsEnabled?: boolean | null;
  stripeConnectOnboarded?: boolean | null;
}): { allowed: true } | { allowed: false; reason: string; code: string } {
  if (!user.stripeConnectOnboarded) {
    return {
      allowed: false,
      code: "stripe_connect_not_onboarded",
      reason: "Complete Stripe onboarding before you can earn. Open Settings to start.",
    };
  }
  if (!user.stripeConnectPayoutsEnabled) {
    return {
      allowed: false,
      code: "stripe_connect_payouts_disabled",
      reason: "Stripe has paused payouts on your account. Open Settings to see what's needed.",
    };
  }
  return { allowed: true };
}
