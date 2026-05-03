/**
 * Fee allocation helpers — bridges the pure-function fee config in
 * `shared/data/platform-fees.ts` with the database (driver lookup +
 * per-route flat fee allocation).
 *
 * Each PaymentIntent creation site in routes.ts calls
 * `computeRideFeeForDriver` to get the fee fields it should persist on
 * the new ride row. After the ride is inserted, sites that have a
 * driver_route_id call `claimRouteFlatFeeIfApplicable` to permanently
 * mark which ride paid the route's £1.50 (no-op if this ride didn't
 * owe the flat fee, e.g. commercial driver, or if another ride beat
 * us to the claim).
 */
import { storage } from "./storage";
import {
  calculatePlatformFeePence,
  type FeeCalculationResult,
} from "../shared/data/platform-fees";

export interface RideFeeForDriver extends FeeCalculationResult {
  isCommercialDriver: boolean;
}

/**
 * Compute the platform fee + driver payout for a ride that's about to
 * be created. Looks up the driver to know if commercial; for casual
 * drivers on a route, peeks at the route to see if the flat fee was
 * already collected on a prior paid ride.
 *
 * Pure of side effects: this function only READS; mutation happens via
 * `claimRouteFlatFeeIfApplicable` after the ride row exists.
 */
export async function computeRideFeeForDriver(args: {
  driverId: string;
  ridePricePence: number;
  driverRouteId?: number | null;
}): Promise<RideFeeForDriver> {
  const driver = await storage.getUser(args.driverId);
  if (!driver) {
    throw new Error(`Driver ${args.driverId} not found for fee calc`);
  }
  const isCommercialDriver = !!driver.isCommercialDriver;

  let routeFlatFeeAlreadyCollected = false;
  if (!isCommercialDriver && args.driverRouteId) {
    const route = await storage.getDriverRouteById(args.driverRouteId);
    routeFlatFeeAlreadyCollected = !!route?.platformFeeCollectedForRideId;
  }

  const fee = calculatePlatformFeePence({
    isCommercialDriver,
    ridePricePence: args.ridePricePence,
    isPartOfRoute: !!args.driverRouteId,
    routeFlatFeeAlreadyCollected,
  });

  return { ...fee, isCommercialDriver };
}

/**
 * Atomically attach a casual-route's flat fee to a specific ride row.
 * Only writes when feeBasis === 'casual_route_first' (i.e. this ride
 * owed the flat fee). Returns true if we won the claim race, false if
 * another concurrent booking beat us to it (in which case the caller
 * should reset the ride's fee fields to £0 to avoid double-charging).
 *
 * NOTE: Prefer `finalizeFeeOnPaymentConfirmed` for new code. The
 * acceptance-time claim left abandoned rides holding the route slot
 * indefinitely; the canonical claim now happens at payment-confirmed
 * time so unpaid/expired rides never block the £1.50.
 */
export async function claimRouteFlatFeeIfApplicable(args: {
  driverRouteId: number | null | undefined;
  rideId: number;
  feePence: number;
  feeBasis: string;
}): Promise<boolean> {
  if (!args.driverRouteId) return false;
  if (args.feeBasis !== "casual_route_first") return false;

  return storage.claimRouteFlatFee({
    driverRouteId: args.driverRouteId,
    rideId: args.rideId,
    feePence: args.feePence,
  });
}

/**
 * Called from every payment-confirmation site (POST
 * /api/rides/:id/confirm-payment, the checkout-confirm webhook
 * handler, etc.) once paymentStatus has flipped to 'paid'.
 *
 * For casual-route rides this is where the £1.50 slot is actually
 * claimed (NOT at acceptance). Idempotent and concurrency-safe via
 * the conditional UPDATE on driver_routes.platform_fee_collected_for_ride_id.
 *
 * Behaviour:
 *  - Non-route ride / commercial driver → no-op.
 *  - Route slot still empty → claim for this ride; ride keeps its
 *    £1.50 fee + corresponding driver_payout_pence (already persisted
 *    at acceptance time as a tentative value).
 *  - Route slot already owned by another paid sibling → set THIS
 *    ride's fee_pence = 0, driver_payout_pence = full price,
 *    fee_basis = 'casual_route_subsequent'.
 */
export async function finalizeFeeOnPaymentConfirmed(rideId: number): Promise<void> {
  const ride = await storage.getRideById(rideId);
  if (!ride) return;
  if (!ride.driverRouteId || !ride.driverId) return;

  const driver = await storage.getUser(ride.driverId);
  if (!driver || driver.isCommercialDriver) return;

  // Try to claim the route slot for this ride.
  const won = await storage.claimRouteFlatFee({
    driverRouteId: ride.driverRouteId,
    rideId: ride.id,
    feePence: (ride as any).platformFeePence ?? 0,
  });

  if (won) {
    // Ensure the ride row reflects "first" basis even if it was
    // tentatively persisted as "subsequent" at acceptance time.
    if ((ride as any).feeBasis !== 'casual_route_first') {
      const ridePricePence = Math.round(parseFloat(ride.agreedPrice as any) * 100);
      const fee = calculatePlatformFeePence({
        isCommercialDriver: false,
        ridePricePence,
        isPartOfRoute: true,
        routeFlatFeeAlreadyCollected: false,
      });
      await storage.setRideFeeFields(ride.id, {
        platformFeePence: fee.feePence,
        driverPayoutPence: fee.driverPayoutPence,
        feeBasis: fee.feeBasis,
        feeCalculationVersion: fee.feeCalculationVersion,
      });
    }
  } else {
    // Lost the race — another paid sibling already owns the slot.
    // Make sure this ride pays £0 and pays the driver full price.
    const ridePricePence = Math.round(parseFloat(ride.agreedPrice as any) * 100);
    await storage.setRideFeeFields(ride.id, {
      platformFeePence: 0,
      driverPayoutPence: ridePricePence,
      feeBasis: 'casual_route_subsequent',
      feeCalculationVersion: (ride as any).feeCalculationVersion ?? 'v1',
    });
  }
}

/**
 * Called from the cancel/refund path AFTER the Stripe refund has
 * been issued. If this ride owned the route's £1.50 slot, clear the
 * ownership and try to promote the next paid sibling that's still
 * sitting at fee=0 ('casual_route_subsequent') so the platform
 * doesn't lose the route fee just because the original first-payer
 * cancelled.
 */
export async function reallocateRouteFeeOnRefund(rideId: number): Promise<void> {
  const ride = await storage.getRideById(rideId);
  if (!ride?.driverRouteId) return;
  const route = await storage.getDriverRouteById(ride.driverRouteId);
  if (!route || (route as any).platformFeeCollectedForRideId !== rideId) return;

  // Release the slot.
  await storage.clearRouteFeeClaim(ride.driverRouteId);

  // Try to promote the earliest paid sibling that's currently a
  // 'casual_route_subsequent' (i.e. paid £0 because we got there
  // first). If found, claim the slot for it and update its fee row.
  const candidate = await storage.findEarliestPaidSiblingOwingRouteFee(
    ride.driverRouteId,
    rideId,
  );
  if (!candidate) return;

  const won = await storage.claimRouteFlatFee({
    driverRouteId: ride.driverRouteId,
    rideId: candidate.id,
    feePence: 150,
  });
  if (!won) return;

  const ridePricePence = Math.round(parseFloat(candidate.agreedPrice as any) * 100);
  const fee = calculatePlatformFeePence({
    isCommercialDriver: false,
    ridePricePence,
    isPartOfRoute: true,
    routeFlatFeeAlreadyCollected: false,
  });
  await storage.setRideFeeFields(candidate.id, {
    platformFeePence: fee.feePence,
    driverPayoutPence: fee.driverPayoutPence,
    feeBasis: fee.feeBasis,
    feeCalculationVersion: fee.feeCalculationVersion,
  });
  console.log(`[fee-realloc] route ${ride.driverRouteId}: promoted ride ${candidate.id} to first-payer after ride ${rideId} refunded`);
}
