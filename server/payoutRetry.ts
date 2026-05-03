/**
 * Background auto-retry for failed driver payouts.
 *
 * Many transfer failures are transient (Stripe rate-limits, brief
 * `account.updated`-driven capability flips, network blips). Forcing
 * the driver to click "Retry" leaves money sitting visibly broken for
 * hours. This module implements two complementary recovery paths:
 *
 *   1. Webhook-driven (immediate): when Stripe sends an `account.updated`
 *      that flips payouts_enabled to true, we sweep that driver's
 *      failed payouts right away. No backoff is applied — the webhook
 *      itself is the change signal.
 *
 *   2. Scheduled (periodic): the 5-minute job in server/index.ts calls
 *      retryStuckPayouts() to re-attempt any failed rows whose
 *      backoff window has elapsed and whose driver currently has
 *      payouts_enabled = true.
 *
 * Both paths funnel into attemptPayoutRetry(), which is the single
 * place that performs the failed -> pending -> transferred|failed
 * in-place flip. The same function is also used by the manual
 * POST /api/driver/payouts/:id/retry endpoint so manual + automatic
 * retries cannot diverge.
 */
import { storage } from './storage';

// Bounded retries with exponential backoff. Attempt N waits at least
// PAYOUT_RETRY_BASE_MINUTES * 2^(retry_count) minutes since the last
// attempt before being eligible again. With base=5 and max=5 this
// gives windows of ~5, 10, 20, 40, 80 minutes before we give up and
// require manual intervention.
export const PAYOUT_RETRY_MAX_ATTEMPTS = 5;
export const PAYOUT_RETRY_BASE_MINUTES = 5;

export type PayoutRetryOutcome =
  | { status: 'transferred'; stripeTransferId: string }
  | { status: 'failed'; reason: string }
  | { status: 'skipped'; reason: string };

/**
 * Attempt a single failed payout. Caller is responsible for having
 * already loaded the payout (we re-load to defeat TOCTOU) and for
 * deciding whether the driver is currently eligible. We still
 * defensively re-check inside.
 *
 * Notifications: only fired on a NEW failure surface — i.e. when this
 * call itself produced the failure. We don't re-notify on every
 * scheduled re-attempt because the driver already has the original
 * payout_failed notification.
 */
export async function attemptPayoutRetry(
  payoutId: number,
  opts: { notifyOnFailure?: boolean } = {},
): Promise<PayoutRetryOutcome> {
  // Pre-flight: cheap reads to short-circuit obviously ineligible
  // attempts (driver no longer payouts-enabled, etc.) BEFORE we burn
  // a claim. The authoritative concurrency guarantee comes from the
  // atomic claimFailedPayoutForRetry below, not from this read.
  const preview = await storage.getDriverPayoutById(payoutId);
  if (!preview) return { status: 'skipped', reason: 'payout not found' };
  if (preview.status !== 'failed') {
    return { status: 'skipped', reason: `status is '${preview.status}', not 'failed'` };
  }
  const driver = await storage.getUser(preview.driverId);
  if (!driver?.stripeConnectAccountId || !driver?.stripeConnectPayoutsEnabled) {
    return { status: 'skipped', reason: 'driver Connect account not payouts-enabled' };
  }

  // ATOMIC CLAIM. Only the caller whose UPDATE actually matched a
  // status='failed' row gets a non-null claim back. Concurrent
  // workers (e.g. the 5-min sweep racing the webhook sweep, or two
  // node instances behind a load balancer) lose the race and exit
  // before touching Stripe — preventing duplicate transfers.
  const claim = await storage.claimFailedPayoutForRetry(payoutId);
  if (!claim) {
    return { status: 'skipped', reason: 'lost race to another retry attempt' };
  }

  try {
    const { transferToDriver } = await import('./stripeConnect');
    const transfer = await transferToDriver({
      destinationAccountId: driver.stripeConnectAccountId,
      amountPence: claim.amountPence,
      rideId: claim.rideId,
      driverId: claim.driverId,
    });
    await storage.updateDriverPayoutStatus(payoutId, {
      status: 'transferred',
      stripeTransferId: transfer.id,
      bumpRetryCount: true,
    });
    console.log(
      `[payoutRetry] ride ${claim.rideId}: transferred ${claim.amountPence}p (transfer ${transfer.id}, attempt ${claim.retryCount + 1})`,
    );
    return { status: 'transferred', stripeTransferId: transfer.id };
  } catch (transferErr: any) {
    const reason = transferErr?.message?.slice(0, 290) || 'Stripe transfer failed';
    await storage.updateDriverPayoutStatus(payoutId, {
      status: 'failed',
      failureReason: reason,
      bumpRetryCount: true,
    });
    if (opts.notifyOnFailure) {
      try {
        const { notifyDriverPayoutFailed } = await import('./payoutNotify');
        await notifyDriverPayoutFailed({
          driverId: claim.driverId,
          rideId: claim.rideId,
          amountPence: claim.amountPence,
          reason,
        });
      } catch (notifyErr) {
        console.warn('[payoutRetry] notify failed', notifyErr);
      }
    }
    console.error(
      `[payoutRetry] ride ${claim.rideId}: transfer failed (attempt ${claim.retryCount + 1}): ${reason}`,
    );
    return { status: 'failed', reason };
  }
}

/**
 * Retry every failed payout for a single driver right now, without
 * applying the backoff window. Used by the `account.updated` webhook
 * when the driver's payouts capability has just been re-enabled.
 */
export async function retryFailedPayoutsForDriver(driverId: string): Promise<{
  attempted: number;
  recovered: number;
}> {
  const candidates = await storage.listFailedPayoutsToRetry({
    driverId,
    maxRetries: PAYOUT_RETRY_MAX_ATTEMPTS,
    backoffBaseMinutes: PAYOUT_RETRY_BASE_MINUTES,
    ignoreBackoff: true,
    limit: 100,
  });
  let recovered = 0;
  for (const c of candidates) {
    const outcome = await attemptPayoutRetry(c.id);
    if (outcome.status === 'transferred') recovered++;
  }
  if (candidates.length > 0) {
    console.log(
      `[payoutRetry] driver ${driverId}: attempted ${candidates.length} failed payouts, recovered ${recovered}`,
    );
  }
  return { attempted: candidates.length, recovered };
}

/**
 * Sweep all eligible stuck failed payouts across the platform, honoring
 * the per-row backoff window and max-attempts cap. Designed to be safe
 * to call on a fixed interval — if nothing is eligible it does no work.
 */
export async function retryStuckPayouts(): Promise<{
  attempted: number;
  recovered: number;
}> {
  const candidates = await storage.listFailedPayoutsToRetry({
    maxRetries: PAYOUT_RETRY_MAX_ATTEMPTS,
    backoffBaseMinutes: PAYOUT_RETRY_BASE_MINUTES,
    limit: 50,
  });
  let recovered = 0;
  for (const c of candidates) {
    const outcome = await attemptPayoutRetry(c.id);
    if (outcome.status === 'transferred') recovered++;
  }
  if (candidates.length > 0) {
    console.log(
      `[payoutRetry] scheduled sweep: attempted ${candidates.length}, recovered ${recovered}`,
    );
  }
  return { attempted: candidates.length, recovered };
}
