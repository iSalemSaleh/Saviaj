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

export async function notifyDriverPayoutFailed(args: {
  driverId: string;
  rideId: number;
  amountPence: number;
  reason: string;
}): Promise<void> {
  try {
    const pounds = (args.amountPence / 100).toFixed(2);
    await storage.createNotification({
      userId: args.driverId,
      type: 'payout_failed',
      title: 'Payout failed',
      message: `Your £${pounds} payout for ride #${args.rideId} couldn't be sent: ${args.reason}. Open Settings → Payouts to retry.`,
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
