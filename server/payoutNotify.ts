/**
 * Notify a driver that a payout failed so the money doesn't sit
 * invisible. We persist a notification row (badge + list pickup) and
 * fire a websocket nudge so any open client refreshes the payouts
 * query without waiting for the 15s poll. Best-effort: errors here
 * must not break the surrounding payout pipeline, so we swallow
 * internally and the caller doesn't need its own try/catch.
 *
 * Lives in its own module (rather than server/routes.ts where it
 * originated) so server/payoutRetry.ts can call it without importing
 * the entire route surface — which would create a circular import.
 */
import { storage } from './storage';
import { formatMoneyMinorWithCode } from '../shared/money';

export async function notifyDriverPayoutFailed(args: {
  driverId: string;
  rideId: number;
  amountPence: number;
  reason: string;
}): Promise<void> {
  try {
    // Format the amount in the driver's Stripe Connect default
    // currency so a US driver sees "$12.34" and a JP driver sees
    // "¥1234" — never the wrong "£" baked in. Falls back to GBP for
    // legacy rows that haven't synced from Stripe yet.
    const driver = await storage.getUser(args.driverId);
    const formatted = formatMoneyMinorWithCode(
      args.amountPence,
      driver?.stripeConnectDefaultCurrency,
    );
    await storage.createNotification({
      userId: args.driverId,
      type: 'payout_failed',
      title: 'Payout failed',
      message: `Your ${formatted} payout for ride #${args.rideId} couldn't be sent: ${args.reason}. Open Settings → Payouts to retry.`,
      relatedRideId: args.rideId,
      read: false,
    });
    try {
      const { broadcast } = await import('./websocket');
      broadcast({
        type: 'PAYOUT_FAILED',
        rideId: args.rideId,
        amountPence: args.amountPence,
        reason: args.reason,
      }, args.driverId);
    } catch (wsErr) {
      console.warn('[payout] websocket broadcast failed', wsErr);
    }
  } catch (notifErr) {
    console.error('[payout] failed to notify driver of payout failure', notifErr);
  }
}
