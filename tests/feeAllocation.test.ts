/**
 * Tests for the casual-route flat-fee allocation invariants in
 * server/feeAllocation.ts. We mock the storage module so the test
 * runs without a real database.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryStorage } from "./helpers/inMemoryStorage";

let storage: InMemoryStorage;
vi.mock("../server/storage", () => ({
  storage: new Proxy(
    {},
    {
      get(_t, prop) {
        const v = (storage as any)[prop];
        return typeof v === "function" ? v.bind(storage) : v;
      },
    },
  ),
}));

beforeEach(() => {
  storage = new InMemoryStorage();
});

describe("finalizeFeeOnPaymentConfirmed", () => {
  it("first paid ride on a casual route claims the £1.50 slot", async () => {
    storage.seedUser({ id: "drv1", isCommercialDriver: false });
    const route = storage.seedRoute({ driverId: "drv1" });
    const ride = storage.seedRide({
      riderId: "r1",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "10.00",
      paymentStatus: "paid",
      platformFeePence: 150,
      driverPayoutPence: 850,
      feeBasis: "casual_route_first",
    });

    const { finalizeFeeOnPaymentConfirmed } = await import("../server/feeAllocation");
    await finalizeFeeOnPaymentConfirmed(ride.id);

    expect(storage.routes.get(route.id)?.platformFeeCollectedForRideId).toBe(ride.id);
    expect(ride.platformFeePence).toBe(150);
    expect(ride.driverPayoutPence).toBe(850);
    expect(ride.feeBasis).toBe("casual_route_first");
  });

  it("second paid ride on same route is downgraded to subsequent (£0 fee)", async () => {
    storage.seedUser({ id: "drv1", isCommercialDriver: false });
    const route = storage.seedRoute({ driverId: "drv1" });
    const first = storage.seedRide({
      riderId: "r1",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "10.00",
      paymentStatus: "paid",
      platformFeePence: 150,
      driverPayoutPence: 850,
      feeBasis: "casual_route_first",
    });
    const second = storage.seedRide({
      riderId: "r2",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "8.00",
      paymentStatus: "paid",
      platformFeePence: 150,
      driverPayoutPence: 650,
      feeBasis: "casual_route_first", // tentatively persisted at acceptance
    });

    const { finalizeFeeOnPaymentConfirmed } = await import("../server/feeAllocation");
    // First wins the slot.
    await finalizeFeeOnPaymentConfirmed(first.id);
    // Second should lose and get downgraded to subsequent.
    await finalizeFeeOnPaymentConfirmed(second.id);

    expect(storage.routes.get(route.id)?.platformFeeCollectedForRideId).toBe(first.id);
    expect(second.platformFeePence).toBe(0);
    expect(second.driverPayoutPence).toBe(800);
    expect(second.feeBasis).toBe("casual_route_subsequent");
  });

  it("commercial-driver rides are no-op (per-ride percent only)", async () => {
    storage.seedUser({ id: "drv1", isCommercialDriver: true });
    const route = storage.seedRoute({ driverId: "drv1" });
    const ride = storage.seedRide({
      riderId: "r1",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "10.00",
      paymentStatus: "paid",
      platformFeePence: 125,
      driverPayoutPence: 875,
      feeBasis: "commercial_per_ride_percent",
    });

    const { finalizeFeeOnPaymentConfirmed } = await import("../server/feeAllocation");
    await finalizeFeeOnPaymentConfirmed(ride.id);

    expect(storage.routes.get(route.id)?.platformFeeCollectedForRideId).toBeNull();
    expect(ride.platformFeePence).toBe(125);
  });
});

describe("reallocateRouteFeeOnRefund", () => {
  it("promotes a sibling subsequent ride to first when first-payer refunds", async () => {
    storage.seedUser({ id: "drv1", isCommercialDriver: false });
    const route = storage.seedRoute({ driverId: "drv1" });
    const first = storage.seedRide({
      riderId: "r1",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "10.00",
      paymentStatus: "paid",
      status: "cancelled_by_rider",
      platformFeePence: 150,
      driverPayoutPence: 850,
      feeBasis: "casual_route_first",
      createdAt: new Date(2026, 4, 1, 10, 0, 0),
    });
    // Mark the route claim as held by `first` BEFORE the refund.
    storage.routes.get(route.id)!.platformFeeCollectedForRideId = first.id;
    storage.routes.get(route.id)!.platformFeeCollectedPence = 150;

    const sibling = storage.seedRide({
      riderId: "r2",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "8.00",
      paymentStatus: "paid",
      status: "accepted",
      platformFeePence: 0,
      driverPayoutPence: 800,
      feeBasis: "casual_route_subsequent",
      createdAt: new Date(2026, 4, 1, 10, 5, 0),
    });

    const { reallocateRouteFeeOnRefund } = await import("../server/feeAllocation");
    await reallocateRouteFeeOnRefund(first.id);

    expect(storage.routes.get(route.id)?.platformFeeCollectedForRideId).toBe(sibling.id);
    expect(sibling.platformFeePence).toBe(150);
    expect(sibling.driverPayoutPence).toBe(650);
    expect(sibling.feeBasis).toBe("casual_route_first");
  });

  it("clears the slot but does not promote when no paid sibling owes the fee", async () => {
    storage.seedUser({ id: "drv1", isCommercialDriver: false });
    const route = storage.seedRoute({ driverId: "drv1" });
    const first = storage.seedRide({
      riderId: "r1",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "10.00",
      paymentStatus: "paid",
      status: "cancelled_by_rider",
      platformFeePence: 150,
      driverPayoutPence: 850,
      feeBasis: "casual_route_first",
    });
    storage.routes.get(route.id)!.platformFeeCollectedForRideId = first.id;

    const { reallocateRouteFeeOnRefund } = await import("../server/feeAllocation");
    await reallocateRouteFeeOnRefund(first.id);

    expect(storage.routes.get(route.id)?.platformFeeCollectedForRideId).toBeNull();
  });

  it("is a no-op when the refunded ride did not own the route slot", async () => {
    storage.seedUser({ id: "drv1", isCommercialDriver: false });
    const route = storage.seedRoute({ driverId: "drv1" });
    const owner = storage.seedRide({
      riderId: "rO",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "10.00",
      paymentStatus: "paid",
      feeBasis: "casual_route_first",
    });
    storage.routes.get(route.id)!.platformFeeCollectedForRideId = owner.id;

    const other = storage.seedRide({
      riderId: "r2",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "8.00",
      paymentStatus: "paid",
      status: "cancelled_by_rider",
      feeBasis: "casual_route_subsequent",
    });

    const { reallocateRouteFeeOnRefund } = await import("../server/feeAllocation");
    await reallocateRouteFeeOnRefund(other.id);

    // Owner still holds the slot.
    expect(storage.routes.get(route.id)?.platformFeeCollectedForRideId).toBe(owner.id);
  });
});
