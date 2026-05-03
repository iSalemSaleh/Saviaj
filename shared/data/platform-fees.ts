/**
 * Platform fees - SINGLE SOURCE OF TRUTH
 *
 * To change a rate, edit the values in PLATFORM_FEES below and redeploy.
 * Existing rides keep the rate they were charged at (recorded on each ride
 * row as `fee_calculation_version`), so changing rates here will NOT
 * retroactively affect already-charged rides.
 *
 * Current model:
 *   - Commercial drivers: 12.5% commission per ride.
 *   - Casual (private) drivers: flat £1.50 per ROUTE (not per ride).
 *     Implemented by charging the fee on the FIRST paid ride for a given
 *     driver_route_id; subsequent rides on the same route pay £0 platform
 *     fee. Casual rides without a route (bid-flow single-passenger rides)
 *     are billed as if they were a "route of one" -> £1.50.
 */

export type FeeStructure =
  | { type: "percentage"; rate: number; minFeePence: number }
  | { type: "flat"; amountPence: number };

export interface PlatformFeeConfig {
  commercial: FeeStructure;
  casual: FeeStructure;
  /** Bumped whenever PLATFORM_FEES is meaningfully changed. Stored on
   *  each ride row so we can audit which rate version was applied. */
  version: string;
}

export const PLATFORM_FEES: PlatformFeeConfig = {
  commercial: { type: "percentage", rate: 0.125, minFeePence: 0 },
  casual: { type: "flat", amountPence: 150 },
  version: "2026-05-03",
};

/** Identifies how the fee for a ride was derived. Stored on rides.fee_basis. */
export type FeeBasis =
  /** Per-ride percentage commission (commercial drivers). */
  | "commercial_per_ride_percent"
  /** First paid ride on a casual driver's route - pays the flat fee. */
  | "casual_route_first"
  /** Subsequent paid ride on a casual driver's route - pays £0 because
   *  the route's flat fee was already collected on an earlier ride. */
  | "casual_route_subsequent"
  /** Bid-flow casual ride with no driver_route_id - treated as a
   *  single-ride route, pays the flat fee. */
  | "casual_single";

export interface FeeCalculationInput {
  isCommercialDriver: boolean;
  ridePricePence: number;
  /** True when the casual driver's flat fee has already been collected
   *  on a different ride for the same driver_route_id. Caller is
   *  responsible for looking this up. Ignored for commercial drivers. */
  routeFlatFeeAlreadyCollected?: boolean;
  /** True when this ride is part of a multi-passenger route (i.e.
   *  ride.driver_route_id is set). Ignored for commercial drivers. */
  isPartOfRoute?: boolean;
}

export interface FeeCalculationResult {
  feePence: number;
  driverPayoutPence: number;
  feeBasis: FeeBasis;
  feeCalculationVersion: string;
  /** Human-readable breakdown for logs / receipts. */
  breakdown: string;
}

export function calculatePlatformFeePence(
  input: FeeCalculationInput,
): FeeCalculationResult {
  const { isCommercialDriver, ridePricePence } = input;
  const version = PLATFORM_FEES.version;

  if (isCommercialDriver) {
    const cfg = PLATFORM_FEES.commercial;
    if (cfg.type !== "percentage") {
      throw new Error("Commercial fee config must be percentage");
    }
    const raw = Math.round(ridePricePence * cfg.rate);
    const feePence = Math.max(raw, cfg.minFeePence);
    return {
      feePence,
      driverPayoutPence: ridePricePence - feePence,
      feeBasis: "commercial_per_ride_percent",
      feeCalculationVersion: version,
      breakdown: `Commercial ${(cfg.rate * 100).toFixed(2)}% of ${pence(ridePricePence)} = ${pence(feePence)}`,
    };
  }

  const cfg = PLATFORM_FEES.casual;
  if (cfg.type !== "flat") {
    throw new Error("Casual fee config must be flat");
  }

  if (input.isPartOfRoute && input.routeFlatFeeAlreadyCollected) {
    return {
      feePence: 0,
      driverPayoutPence: ridePricePence,
      feeBasis: "casual_route_subsequent",
      feeCalculationVersion: version,
      breakdown: `Casual route flat fee already collected on an earlier ride; this ride pays £0 platform fee`,
    };
  }

  // Either this is the first paid ride on a route, or it's a bid-flow
  // single ride with no route. Either way the casual driver owes the
  // flat fee.
  const feePence = Math.min(cfg.amountPence, ridePricePence);
  return {
    feePence,
    driverPayoutPence: ridePricePence - feePence,
    feeBasis: input.isPartOfRoute ? "casual_route_first" : "casual_single",
    feeCalculationVersion: version,
    breakdown: `Casual flat fee ${pence(cfg.amountPence)} on ride of ${pence(ridePricePence)}`,
  };
}

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}
