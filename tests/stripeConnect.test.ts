/**
 * Tests for the Stripe Connect boundary functions in
 * server/stripeConnect.ts. The Stripe SDK is fully mocked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeFakeStripe, type FakeStripe } from "./helpers/fakeStripe";

let fake: FakeStripe;
vi.mock("../server/stripeClient", () => ({
  getUncachableStripeClient: vi.fn(async () => fake),
}));
vi.mock("../server/storage", () => ({
  storage: {
    getUser: vi.fn(),
    updateUserStripeConnect: vi.fn(),
  },
}));

beforeEach(() => {
  fake = makeFakeStripe();
});

describe("canDriverEarn", () => {
  it("blocks drivers who have not finished onboarding", async () => {
    const { canDriverEarn } = await import("../server/stripeConnect");
    const result = canDriverEarn({
      stripeConnectOnboarded: false,
      stripeConnectPayoutsEnabled: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("stripe_connect_not_onboarded");
    }
  });

  it("blocks drivers whose payouts are disabled", async () => {
    const { canDriverEarn } = await import("../server/stripeConnect");
    const result = canDriverEarn({
      stripeConnectOnboarded: true,
      stripeConnectPayoutsEnabled: false,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("stripe_connect_payouts_disabled");
    }
  });

  it("allows drivers who are onboarded and payout-enabled", async () => {
    const { canDriverEarn } = await import("../server/stripeConnect");
    const result = canDriverEarn({
      stripeConnectOnboarded: true,
      stripeConnectPayoutsEnabled: true,
    });
    expect(result.allowed).toBe(true);
  });
});

describe("transferToDriver", () => {
  it("creates a Stripe transfer with the correct shape and ride metadata", async () => {
    const { transferToDriver } = await import("../server/stripeConnect");
    const transfer = await transferToDriver({
      destinationAccountId: "acct_123",
      amountPence: 850,
      rideId: 42,
      driverId: "drv1",
    });

    expect(fake.transfers.create).toHaveBeenCalledTimes(1);
    const args = (fake.transfers.create.mock.calls[0] as any[])[0];
    expect(args).toMatchObject({
      amount: 850,
      currency: "gbp",
      destination: "acct_123",
      transfer_group: "ride_42",
      metadata: { rideId: "42", driverId: "drv1" },
    });
    expect(transfer.id).toMatch(/^tr_/);
  });
});

describe("reverseDriverTransfer", () => {
  it("creates a partial reversal when an amount is given", async () => {
    const { reverseDriverTransfer } = await import("../server/stripeConnect");
    await reverseDriverTransfer({
      stripeTransferId: "tr_xyz",
      amountPence: 500,
      reason: "ride_refunded",
    });
    expect(fake.transfers.createReversal).toHaveBeenCalledWith("tr_xyz", {
      amount: 500,
      metadata: { reason: "ride_refunded" },
    });
  });

  it("creates a full reversal when no amount is given", async () => {
    const { reverseDriverTransfer } = await import("../server/stripeConnect");
    await reverseDriverTransfer({ stripeTransferId: "tr_full" });
    expect(fake.transfers.createReversal).toHaveBeenCalledWith("tr_full", {
      metadata: { reason: "ride_refunded" },
    });
  });
});
