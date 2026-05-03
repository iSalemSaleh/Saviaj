/**
 * End-to-end-ish tests for the payout pipeline. We mount the real
 * route handlers from server/routes.ts via registerRoutes, with the
 * heavy-side modules (storage, Stripe SDK, websocket, auth, db)
 * stubbed. Tests cover the four invariants called out in task #4:
 *
 *   1. Concurrent /complete fires exactly one Stripe transfer.
 *   2. /cancel after a transfer reverses that transfer.
 *   3. /cancel of a route's first-payer promotes the next paid
 *      sibling to be the new first-payer.
 *   4. Drivers without an active Connect account are gated out of
 *      bid creation (canDriverEarn).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";
import { InMemoryStorage } from "./helpers/inMemoryStorage";
import { makeFakeStripe, type FakeStripe } from "./helpers/fakeStripe";

// ---------- module mocks (must be declared at top, hoisted) ----------
let storage: InMemoryStorage;
let stripe: FakeStripe;

vi.mock("../server/storage", () => ({
  storage: new Proxy(
    {},
    {
      get(_t, prop) {
        const v = (storage as any)?.[prop];
        return typeof v === "function" ? v.bind(storage) : v;
      },
    },
  ),
}));

vi.mock("../server/stripeClient", () => ({
  getUncachableStripeClient: vi.fn(async () => stripe),
  getStripePublishableKey: vi.fn(async () => "pk_test"),
  getStripeSecretKey: vi.fn(async () => "sk_test"),
  getStripeSync: vi.fn(async () => ({ syncBackfill: async () => {} })),
}));

vi.mock("../server/stripeService", () => {
  class StripeService {
    async createRefund(paymentIntentId: string, reason?: string) {
      return stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
        metadata: { cancellation_reason: reason || "Ride cancelled" },
      });
    }
    async createPaymentIntent(amount: number, currency: string, metadata: Record<string, string>) {
      return stripe.paymentIntents.create({ amount, currency, metadata });
    }
    async createCustomer(email: string, userId: string) {
      return stripe.customers.create({ email, metadata: { userId } });
    }
    async retrievePaymentIntent() { return null; }
    async retrieveCheckoutSession() { return null; }
    async cancelPaymentIntent() { return null; }
    async createCheckoutSession() { return { id: "cs_test" }; }
    async getProduct() { return null; }
    async getSubscription() { return null; }
  }
  return { StripeService, stripeService: new StripeService() };
});

vi.mock("../server/websocket", () => ({
  broadcast: vi.fn(),
  setupWebSocket: vi.fn(),
}));

vi.mock("../server/replitAuth", () => ({
  setupAuth: vi.fn(async (app: Express) => {
    app.use((req: any, _res, next) => {
      const u = req.headers["x-test-user"];
      if (u) {
        req.session = { userId: u, user: { claims: { sub: u } } };
        req.user = { claims: { sub: u } };
        req.isAuthenticated = () => true;
      } else {
        req.session = {};
        req.isAuthenticated = () => false;
      }
      next();
    });
  }),
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
}));

vi.mock("../server/localAuth", () => ({ setupLocalAuth: vi.fn() }));
vi.mock("../server/googleAuth", () => ({
  setupGoogleAuth: vi.fn(),
  isGoogleAuthEnabled: () => false,
}));

vi.mock("../server/db", () => ({
  db: new Proxy({}, { get: () => () => { throw new Error("db not stubbed for this op"); } }),
  pool: { end: async () => {} },
}));

// ---------- shared test app ----------
let app: Express;

async function buildApp(): Promise<Express> {
  const a = express();
  a.use(express.json());
  const httpServer = createServer(a);
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(a, httpServer);
  return a;
}

beforeEach(async () => {
  storage = new InMemoryStorage();
  stripe = makeFakeStripe();
  app = await buildApp();
});

// ---------- helpers ----------
function seedHappyDriver(id = "drv1") {
  return storage.seedUser({
    id,
    email: `${id}@test.dev`,
    isCommercialDriver: true,
    stripeConnectAccountId: "acct_drv1",
    stripeConnectPayoutsEnabled: true,
    stripeConnectChargesEnabled: true,
    stripeConnectOnboarded: true,
    driverVerified: true,
  });
}

function seedRider(id = "rdr1") {
  return storage.seedUser({ id, email: `${id}@test.dev` });
}

// ---------- tests ----------
describe("PATCH /api/rides/:id/complete — concurrent calls fire exactly one transfer", () => {
  it("two simultaneous /complete requests result in a single Stripe transfer", async () => {
    seedHappyDriver();
    seedRider();
    const ride = storage.seedRide({
      riderId: "rdr1",
      driverId: "drv1",
      agreedPrice: "10.00",
      paymentStatus: "paid",
      paymentIntentId: "pi_test",
      status: "in_progress",
      platformFeePence: 125,
      driverPayoutPence: 875,
      feeBasis: "commercial_per_ride_percent",
    });

    // Slow down the Stripe transfer so the second /complete enters the
    // critical section while the first is mid-flight.
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((res) => (releaseFirst = res));
    let callCount = 0;
    stripe.transfers.create.mockImplementation(async (args: any) => {
      callCount++;
      if (callCount === 1) {
        await firstStarted; // wait for the test to release
      }
      return {
        id: `tr_${callCount}`,
        object: "transfer",
        amount: args.amount,
        destination: args.destination,
      } as any;
    });

    const req1 = request(app)
      .patch(`/api/rides/${ride.id}/complete`)
      .set("x-test-user", "drv1")
      .send({});
    // Yield so req1 reaches the createDriverPayout call.
    await new Promise((r) => setTimeout(r, 50));
    const req2 = request(app)
      .patch(`/api/rides/${ride.id}/complete`)
      .set("x-test-user", "drv1")
      .send({});
    // Let req2 race; it should hit the 23505 unique-violation and skip.
    await new Promise((r) => setTimeout(r, 50));
    releaseFirst();

    const [r1, r2] = await Promise.all([req1, req2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Exactly one transfer hit Stripe.
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    // Exactly one active payout row exists for the ride.
    const payouts = storage.payouts.filter((p) => p.rideId === ride.id);
    expect(payouts.length).toBe(1);
    expect(payouts[0].status).toBe("transferred");
    expect(payouts[0].amountPence).toBe(875);
  });

  it("repeat /complete on an already-completed ride is a fast-path no-op", async () => {
    seedHappyDriver();
    seedRider();
    const ride = storage.seedRide({
      riderId: "rdr1",
      driverId: "drv1",
      agreedPrice: "10.00",
      paymentStatus: "paid",
      status: "completed",
      driverPayoutPence: 875,
      platformFeePence: 125,
    });
    const res = await request(app)
      .patch(`/api/rides/${ride.id}/complete`)
      .set("x-test-user", "drv1")
      .send({});
    expect(res.status).toBe(200);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(storage.payouts.length).toBe(0);
  });
});

describe("PATCH /api/rides/:id/cancel — refund reverses the prior transfer", () => {
  it("reversing a paid+transferred ride issues a Stripe transfer reversal", async () => {
    seedHappyDriver();
    seedRider();
    const ride = storage.seedRide({
      riderId: "rdr1",
      driverId: "drv1",
      agreedPrice: "10.00",
      paymentStatus: "paid",
      paymentIntentId: "pi_paid",
      status: "accepted",
      platformFeePence: 125,
      driverPayoutPence: 875,
      feeBasis: "commercial_per_ride_percent",
    });
    // Pre-existing transferred payout row.
    storage.payouts.push({
      id: 99,
      rideId: ride.id,
      driverId: "drv1",
      amountPence: 875,
      status: "transferred",
      stripeTransferId: "tr_existing",
      failureReason: null,
    });

    const res = await request(app)
      .patch(`/api/rides/${ride.id}/cancel`)
      .set("x-test-user", "rdr1")
      .send({ reason: "Plans changed" });

    expect(res.status).toBe(200);
    expect(res.body.refundProcessed).toBe(true);

    // Refund was issued.
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    expect(stripe.refunds.create.mock.calls[0][0]).toMatchObject({ payment_intent: "pi_paid" });

    // Transfer reversal was issued for the existing transfer.
    expect(stripe.transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(stripe.transfers.createReversal.mock.calls[0][0]).toBe("tr_existing");

    // Payout row was flipped to 'reversed'.
    expect(storage.payouts.find((p) => p.id === 99)?.status).toBe("reversed");
    // Ride is marked refunded.
    expect(storage.rides.get(ride.id)?.paymentStatus).toBe("refunded");
  });

  it("flags 'reversed_with_debt' when Stripe rejects the reversal", async () => {
    seedHappyDriver();
    seedRider();
    const ride = storage.seedRide({
      riderId: "rdr1",
      driverId: "drv1",
      agreedPrice: "10.00",
      paymentStatus: "paid",
      paymentIntentId: "pi_paid",
      status: "accepted",
      driverPayoutPence: 875,
      platformFeePence: 125,
    });
    storage.payouts.push({
      id: 100,
      rideId: ride.id,
      driverId: "drv1",
      amountPence: 875,
      status: "transferred",
      stripeTransferId: "tr_low_balance",
      failureReason: null,
    });
    stripe.transfers.createReversal.mockRejectedValueOnce(
      new Error("Insufficient funds in connected account"),
    );

    const res = await request(app)
      .patch(`/api/rides/${ride.id}/cancel`)
      .set("x-test-user", "rdr1")
      .send({ reason: "Plans changed" });
    expect(res.status).toBe(200);

    const payout = storage.payouts.find((p) => p.id === 100)!;
    expect(payout.status).toBe("reversed_with_debt");
    expect(payout.failureReason).toMatch(/Insufficient funds/);
  });
});

describe("PATCH /api/rides/:id/cancel — route first-payer refund promotes a sibling", () => {
  it("when the first paying ride on a casual route is refunded, the earliest paid sibling is promoted", async () => {
    storage.seedUser({
      id: "drv1",
      email: "drv1@test.dev",
      isCommercialDriver: false,
      stripeConnectAccountId: "acct_drv1",
      stripeConnectPayoutsEnabled: true,
      stripeConnectOnboarded: true,
    });
    seedRider("rdr1");
    seedRider("rdr2");
    const route = storage.seedRoute({ driverId: "drv1" });

    const first = storage.seedRide({
      riderId: "rdr1",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "10.00",
      paymentStatus: "paid",
      paymentIntentId: "pi_first",
      status: "accepted",
      platformFeePence: 150,
      driverPayoutPence: 850,
      feeBasis: "casual_route_first",
      createdAt: new Date(2026, 4, 1, 10, 0, 0),
    });
    storage.routes.get(route.id)!.platformFeeCollectedForRideId = first.id;
    storage.routes.get(route.id)!.platformFeeCollectedPence = 150;

    const sibling = storage.seedRide({
      riderId: "rdr2",
      driverId: "drv1",
      driverRouteId: route.id,
      agreedPrice: "8.00",
      paymentStatus: "paid",
      paymentIntentId: "pi_sib",
      status: "accepted",
      platformFeePence: 0,
      driverPayoutPence: 800,
      feeBasis: "casual_route_subsequent",
      createdAt: new Date(2026, 4, 1, 10, 5, 0),
    });

    const res = await request(app)
      .patch(`/api/rides/${first.id}/cancel`)
      .set("x-test-user", "rdr1")
      .send({ reason: "Plans changed" });
    expect(res.status).toBe(200);
    expect(res.body.refundProcessed).toBe(true);

    // Sibling has been promoted.
    expect(storage.routes.get(route.id)?.platformFeeCollectedForRideId).toBe(sibling.id);
    expect(sibling.platformFeePence).toBe(150);
    expect(sibling.driverPayoutPence).toBe(650);
    expect(sibling.feeBasis).toBe("casual_route_first");
  });
});

describe("POST /api/bids — driver without active Connect cannot accept", () => {
  it("rejects bid creation for a driver who has not finished Connect onboarding", async () => {
    storage.seedUser({
      id: "drv1",
      email: "drv1@test.dev",
      isCommercialDriver: true,
      stripeConnectAccountId: null,
      stripeConnectPayoutsEnabled: false,
      stripeConnectOnboarded: false,
      driverVerified: true,
    });
    seedRider("rdr1");
    // The bid route also needs a rider offer to bid on. We don't have
    // a full storage impl for offers, so monkey-patch what the route
    // reads here on a per-test basis.
    (storage as any).getRiderOfferById = vi.fn(async () => ({
      id: 1,
      riderId: "rdr1",
      pickupLocation: "A",
      dropoffLocation: "B",
    }));
    // The isProfileComplete middleware reads the user; mark profile
    // complete so we get past it and reach the canDriverEarn gate.
    const u = storage.users.get("drv1")!;
    (u as any).firstName = "F";
    (u as any).lastName = "L";
    (u as any).phoneNumber = "+447000000000";
    (u as any).homeAddress = "1 St";
    (u as any).city = "City";
    (u as any).postcode = "AA1 1AA";
    (u as any).profileCompleted = true;

    const res = await request(app)
      .post("/api/bids")
      .set("x-test-user", "drv1")
      .send({
        riderOfferId: 1,
        bidAmount: "10.00",
        estimatedArrival: "10 min",
      });
    // The handler returns 403 with stripeConnectRequired flag.
    expect(res.status).toBe(403);
    expect(res.body.stripeConnectRequired).toBe(true);
    expect(res.body.code).toBe("stripe_connect_not_onboarded");
  });

  it("allows bid creation once the driver is fully onboarded", async () => {
    seedHappyDriver();
    const u = storage.users.get("drv1")!;
    (u as any).firstName = "F";
    (u as any).lastName = "L";
    (u as any).phoneNumber = "+447000000000";
    (u as any).homeAddress = "1 St";
    (u as any).city = "City";
    (u as any).postcode = "AA1 1AA";
    (u as any).profileCompleted = true;

    seedRider("rdr1");
    (storage as any).getRiderOfferById = vi.fn(async () => ({
      id: 1,
      riderId: "rdr1",
      pickupLocation: "A",
      dropoffLocation: "B",
    }));
    (storage as any).createBid = vi.fn(async (b: any) => ({ id: 1, ...b }));

    const res = await request(app)
      .post("/api/bids")
      .set("x-test-user", "drv1")
      .send({
        riderOfferId: 1,
        bidAmount: "10.00",
        estimatedArrival: "10 min",
      });
    // Either 201 (success) or some validation 400 from insertBidSchema —
    // the critical assertion is we got PAST the canDriverEarn gate
    // (i.e. NOT a 403 with stripe_connect_not_onboarded).
    expect(res.status).not.toBe(403);
  });
});
