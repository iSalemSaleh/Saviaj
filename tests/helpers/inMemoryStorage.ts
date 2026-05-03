/**
 * Minimal in-memory implementation of the slice of IStorage that the
 * /complete, /cancel and bid-accept paths exercise. Intentionally
 * NOT a full impl — we only model the fields and methods the four
 * scenarios under test touch:
 *   - users (Stripe Connect flags + commercial flag)
 *   - rides (payment + fee + status)
 *   - driver_routes (the £1.50 claim slot)
 *   - driver_payouts (the unique-active-per-ride invariant)
 *   - notifications (no-op-ish, but stored so we can assert on them)
 *
 * The unique partial index `driver_payouts_one_active_per_ride` is
 * faithfully simulated: a second concurrent insert with status in
 * (pending, transferred) for the same ride throws an error with
 * code === '23505', exactly as Postgres would.
 */
export interface InMemoryUser {
  id: string;
  email?: string;
  isCommercialDriver?: boolean;
  stripeConnectAccountId?: string | null;
  stripeConnectPayoutsEnabled?: boolean | null;
  stripeConnectChargesEnabled?: boolean | null;
  stripeConnectOnboarded?: boolean | null;
  driverVerified?: boolean | null;
}

export interface InMemoryRide {
  id: number;
  riderId: string;
  driverId: string | null;
  driverRouteId: number | null;
  riderOfferId: number | null;
  agreedPrice: string;
  paymentIntentId: string | null;
  paymentStatus: string | null;
  status: string | null;
  pickupLocation: string;
  dropoffLocation: string;
  platformFeePence: number;
  driverPayoutPence: number;
  feeBasis: string | null;
  feeCalculationVersion: string | null;
  createdAt: Date;
}

export interface InMemoryRoute {
  id: number;
  driverId: string;
  platformFeeCollectedForRideId: number | null;
  platformFeeCollectedPence: number;
}

export interface InMemoryPayout {
  id: number;
  rideId: number;
  driverId: string;
  amountPence: number;
  status: string;
  stripeTransferId: string | null;
  failureReason: string | null;
  retryCount?: number;
  lastAttemptAt?: Date | null;
}

export interface InMemoryNotification {
  id: number;
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedRideId?: number | null;
  read: boolean;
}

export class InMemoryStorage {
  users = new Map<string, InMemoryUser>();
  rides = new Map<number, InMemoryRide>();
  routes = new Map<number, InMemoryRoute>();
  payouts: InMemoryPayout[] = [];
  notifications: InMemoryNotification[] = [];

  private rideSeq = 1;
  private routeSeq = 1;
  private payoutSeq = 1;
  private notifSeq = 1;

  // Test fixtures
  seedUser(u: InMemoryUser): InMemoryUser {
    this.users.set(u.id, { ...u });
    return this.users.get(u.id)!;
  }

  seedRide(r: Partial<InMemoryRide> & { riderId: string; driverId: string; agreedPrice: string }): InMemoryRide {
    const id = r.id ?? this.rideSeq++;
    const ride: InMemoryRide = {
      id,
      riderId: r.riderId,
      driverId: r.driverId,
      driverRouteId: r.driverRouteId ?? null,
      riderOfferId: r.riderOfferId ?? null,
      agreedPrice: r.agreedPrice,
      paymentIntentId: r.paymentIntentId ?? null,
      paymentStatus: r.paymentStatus ?? null,
      status: r.status ?? "accepted",
      pickupLocation: r.pickupLocation ?? "Pickup",
      dropoffLocation: r.dropoffLocation ?? "Dropoff",
      platformFeePence: r.platformFeePence ?? 0,
      driverPayoutPence: r.driverPayoutPence ?? 0,
      feeBasis: r.feeBasis ?? null,
      feeCalculationVersion: r.feeCalculationVersion ?? "v1",
      createdAt: r.createdAt ?? new Date(),
    };
    this.rides.set(id, ride);
    if (id >= this.rideSeq) this.rideSeq = id + 1;
    return ride;
  }

  seedRoute(r: { id?: number; driverId: string }): InMemoryRoute {
    const id = r.id ?? this.routeSeq++;
    const route: InMemoryRoute = {
      id,
      driverId: r.driverId,
      platformFeeCollectedForRideId: null,
      platformFeeCollectedPence: 0,
    };
    this.routes.set(id, route);
    if (id >= this.routeSeq) this.routeSeq = id + 1;
    return route;
  }

  // ---- IStorage methods called by the routes under test ----
  async getUser(id: string): Promise<InMemoryUser | undefined> {
    return this.users.get(id);
  }

  async getRideById(id: number) {
    return this.rides.get(id);
  }

  async getDriverRouteById(id: number) {
    return this.routes.get(id);
  }

  async updateRideStatus(id: number, status: string) {
    const r = this.rides.get(id);
    if (!r) throw new Error(`ride ${id} not found`);
    r.status = status;
    return r;
  }

  async updateRide(id: number, updates: Partial<InMemoryRide>) {
    const r = this.rides.get(id);
    if (!r) throw new Error(`ride ${id} not found`);
    Object.assign(r, updates);
    return r;
  }

  async createDriverPayout(p: {
    rideId: number;
    driverId: string;
    amountPence: number;
    status: string;
    stripeTransferId?: string;
    failureReason?: string;
  }): Promise<{ id: number }> {
    // Faithfully simulate the unique partial index
    // `driver_payouts_one_active_per_ride`: at most ONE row per ride
    // with status in ('pending','transferred').
    const ACTIVE = new Set(["pending", "transferred"]);
    if (ACTIVE.has(p.status)) {
      const conflict = this.payouts.find(
        (x) => x.rideId === p.rideId && ACTIVE.has(x.status),
      );
      if (conflict) {
        const err: any = new Error(
          `duplicate key value violates unique constraint "driver_payouts_one_active_per_ride"`,
        );
        err.code = "23505";
        throw err;
      }
    }
    const row: InMemoryPayout = {
      id: this.payoutSeq++,
      rideId: p.rideId,
      driverId: p.driverId,
      amountPence: p.amountPence,
      status: p.status,
      stripeTransferId: p.stripeTransferId ?? null,
      failureReason: p.failureReason ?? null,
      retryCount: 0,
      lastAttemptAt: null,
    };
    this.payouts.push(row);
    return { id: row.id };
  }

  async updateDriverPayoutStatus(
    id: number,
    fields: { status: string; stripeTransferId?: string; failureReason?: string | null; bumpRetryCount?: boolean; setLastAttemptAt?: boolean },
  ): Promise<void> {
    const row = this.payouts.find((p) => p.id === id);
    if (!row) throw new Error(`payout ${id} not found`);
    row.status = fields.status;
    if (fields.stripeTransferId !== undefined) row.stripeTransferId = fields.stripeTransferId;
    if (fields.failureReason === null) row.failureReason = null;
    else if (fields.failureReason !== undefined) row.failureReason = fields.failureReason;
    if (fields.bumpRetryCount) row.retryCount = (row.retryCount ?? 0) + 1;
    if (fields.setLastAttemptAt) row.lastAttemptAt = new Date();
  }

  async claimFailedPayoutForRetry(id: number) {
    // Atomic in JS land because the event loop is single-threaded —
    // this find+mutate sequence cannot be interleaved with another
    // call's find+mutate. Mirrors the Postgres
    // `UPDATE ... WHERE id=? AND status='failed' RETURNING ...`
    // semantics: only the first concurrent caller gets a non-null
    // result; subsequent callers see status='pending' and get null.
    const row = this.payouts.find((p) => p.id === id);
    if (!row || row.status !== 'failed') return null;
    row.status = 'pending';
    row.failureReason = null;
    row.lastAttemptAt = new Date();
    return {
      id: row.id,
      rideId: row.rideId,
      driverId: row.driverId,
      amountPence: row.amountPence,
      retryCount: row.retryCount ?? 0,
    };
  }

  async listFailedPayoutsToRetry(opts: {
    driverId?: string;
    maxRetries: number;
    backoffBaseMinutes: number;
    ignoreBackoff?: boolean;
    limit?: number;
  }) {
    const now = Date.now();
    const limit = opts.limit ?? 50;
    return this.payouts
      .filter((p) => {
        if (p.status !== 'failed') return false;
        if ((p.retryCount ?? 0) >= opts.maxRetries) return false;
        if (opts.driverId && p.driverId !== opts.driverId) return false;
        const u = this.users.get(p.driverId);
        if (!u?.stripeConnectPayoutsEnabled) return false;
        if (opts.ignoreBackoff) return true;
        if (!p.lastAttemptAt) return true;
        const waitMs = opts.backoffBaseMinutes * 60 * 1000 * Math.pow(2, p.retryCount ?? 0);
        return now - p.lastAttemptAt.getTime() >= waitMs;
      })
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        rideId: p.rideId,
        driverId: p.driverId,
        amountPence: p.amountPence,
        retryCount: p.retryCount ?? 0,
      }));
  }

  async getDriverPayoutById(id: number) {
    const p = this.payouts.find((x) => x.id === id);
    if (!p) return null;
    return {
      id: p.id,
      rideId: p.rideId,
      driverId: p.driverId,
      status: p.status,
      stripeTransferId: p.stripeTransferId,
      amountPence: p.amountPence,
      failureReason: p.failureReason,
      retryCount: p.retryCount ?? 0,
      lastAttemptAt: p.lastAttemptAt ?? null,
      createdAt: null,
      updatedAt: null,
    };
  }

  async getDriverPayoutsForRide(rideId: number) {
    return this.payouts
      .filter((p) => p.rideId === rideId)
      .map((p) => ({
        id: p.id,
        status: p.status,
        stripeTransferId: p.stripeTransferId,
        amountPence: p.amountPence,
      }));
  }

  async claimRouteFlatFee(args: { driverRouteId: number; rideId: number; feePence: number }): Promise<boolean> {
    const route = this.routes.get(args.driverRouteId);
    if (!route) return false;
    if (route.platformFeeCollectedForRideId !== null) return false;
    route.platformFeeCollectedForRideId = args.rideId;
    route.platformFeeCollectedPence = args.feePence;
    return true;
  }

  async clearRouteFeeClaim(driverRouteId: number): Promise<void> {
    const route = this.routes.get(driverRouteId);
    if (!route) return;
    route.platformFeeCollectedForRideId = null;
    route.platformFeeCollectedPence = 0;
  }

  async findEarliestPaidSiblingOwingRouteFee(driverRouteId: number, excludeRideId: number) {
    const cands = [...this.rides.values()]
      .filter(
        (r) =>
          r.driverRouteId === driverRouteId &&
          r.id !== excludeRideId &&
          r.paymentStatus === "paid" &&
          r.feeBasis === "casual_route_subsequent" &&
          !["cancelled", "cancelled_by_rider", "cancelled_by_driver"].includes(r.status ?? ""),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const r = cands[0];
    return r ? { id: r.id, agreedPrice: r.agreedPrice } : undefined;
  }

  async setRideFeeFields(
    rideId: number,
    fields: { platformFeePence: number; driverPayoutPence: number; feeBasis: string; feeCalculationVersion: string },
  ): Promise<void> {
    const r = this.rides.get(rideId);
    if (!r) return;
    r.platformFeePence = fields.platformFeePence;
    r.driverPayoutPence = fields.driverPayoutPence;
    r.feeBasis = fields.feeBasis;
    r.feeCalculationVersion = fields.feeCalculationVersion;
  }

  async createNotification(n: Omit<InMemoryNotification, "id">) {
    const row = { id: this.notifSeq++, ...n };
    this.notifications.push(row);
    return row;
  }

  // No-op-ish methods called by the routes that we don't assert on.
  async incrementDriverDailyActivity(_driverId: string, _date: string, _price: number) {}
  async updateUserAvailability(_userId: string | null, _role: string | null, _available: boolean) {}
  async incrementRouteSeats(_routeId: number) {}
  async updateRiderOfferStatus(_offerId: number, _status: string) {}
  async getChatMessagesByRide(_rideId: number) { return []; }
}
