import { vi } from "vitest";

export interface FakeStripe {
  transfers: {
    create: ReturnType<typeof vi.fn>;
    createReversal: ReturnType<typeof vi.fn>;
  };
  refunds: { create: ReturnType<typeof vi.fn> };
  paymentIntents: {
    create: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  customers: { create: ReturnType<typeof vi.fn> };
  accounts: {
    create: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
  };
  accountLinks: { create: ReturnType<typeof vi.fn> };
  checkout: { sessions: { create: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> } };
}

let nextId = 1;
export function nextStripeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${nextId++}`;
}

export function makeFakeStripe(): FakeStripe {
  return {
    transfers: {
      create: vi.fn(async (args: any) => ({
        id: nextStripeId("tr"),
        object: "transfer",
        amount: args.amount,
        destination: args.destination,
        transfer_group: args.transfer_group,
      })),
      createReversal: vi.fn(async (transferId: string, args: any) => ({
        id: nextStripeId("trr"),
        object: "transfer_reversal",
        transfer: transferId,
        amount: args?.amount,
      })),
    },
    refunds: {
      create: vi.fn(async (args: any) => ({
        id: nextStripeId("re"),
        object: "refund",
        payment_intent: args.payment_intent,
        amount: args.amount,
        status: "succeeded",
      })),
    },
    paymentIntents: {
      create: vi.fn(async (args: any) => ({
        id: nextStripeId("pi"),
        object: "payment_intent",
        amount: args.amount,
        currency: args.currency,
        client_secret: "cs_test",
      })),
      retrieve: vi.fn(),
      cancel: vi.fn(),
    },
    customers: {
      create: vi.fn(async (args: any) => ({ id: nextStripeId("cus"), email: args.email })),
    },
    accounts: {
      create: vi.fn(async (args: any) => ({
        id: nextStripeId("acct"),
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: { currently_due: [] },
        metadata: args.metadata,
      })),
      retrieve: vi.fn(),
    },
    accountLinks: {
      create: vi.fn(async () => ({ url: "https://stripe.test/onboard" })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: nextStripeId("cs") })),
        retrieve: vi.fn(),
      },
    },
  };
}
