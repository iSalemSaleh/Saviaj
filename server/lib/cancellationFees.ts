import type { Ride } from "@shared/schema";

export interface CancellationFeeResult {
  amountPence: number;
  reason: "free" | "early_cancel" | "late_cancel";
  description: string;
  driverSharePence: number;
  platformSharePence: number;
}

const EARLY_FEE_PENCE = 150;
const LATE_THRESHOLD_MINUTES = 30;
const LATE_FEE_PERCENT = 0.5;
const DRIVER_SHARE = 0.8;

export function computeRiderCancelFee(
  ride: Pick<Ride, "scheduledTime" | "agreedPrice" | "status">,
  now: Date = new Date()
): CancellationFeeResult {
  const noFeeStatuses = new Set(["pending_payment", "scheduled", "expired", "cancelled_payment_timeout"]);
  if (ride.status && noFeeStatuses.has(ride.status)) {
    return {
      amountPence: 0,
      reason: "free",
      description: "No driver matched yet — free cancellation",
      driverSharePence: 0,
      platformSharePence: 0,
    };
  }

  const pickupTime = ride.scheduledTime ? new Date(ride.scheduledTime) : null;
  const minutesUntilPickup = pickupTime
    ? Math.floor((pickupTime.getTime() - now.getTime()) / 60000)
    : Number.POSITIVE_INFINITY;

  if (minutesUntilPickup > LATE_THRESHOLD_MINUTES) {
    const amount = EARLY_FEE_PENCE;
    return {
      amountPence: amount,
      reason: "early_cancel",
      description: `£${(amount / 100).toFixed(2)} cancellation fee (more than ${LATE_THRESHOLD_MINUTES} minutes before pickup)`,
      driverSharePence: Math.round(amount * DRIVER_SHARE),
      platformSharePence: amount - Math.round(amount * DRIVER_SHARE),
    };
  }

  const farePounds = parseFloat(ride.agreedPrice as unknown as string) || 0;
  const farePence = Math.round(farePounds * 100);
  const amount = Math.max(EARLY_FEE_PENCE, Math.round(farePence * LATE_FEE_PERCENT));
  return {
    amountPence: amount,
    reason: "late_cancel",
    description: `£${(amount / 100).toFixed(2)} cancellation fee (less than ${LATE_THRESHOLD_MINUTES} minutes before pickup — 50% of fare)`,
    driverSharePence: Math.round(amount * DRIVER_SHARE),
    platformSharePence: amount - Math.round(amount * DRIVER_SHARE),
  };
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
