/**
 * Stripe Identity - hosted KYC verification.
 *
 * Flow:
 *   1. FE calls POST /api/driver/kyc/stripe-identity/start.
 *   2. Backend creates a VerificationSession; returns the client_secret.
 *   3. FE opens stripe-js Identity modal with that client_secret. User
 *      uploads ID + selfie inside the modal (Stripe-hosted UI).
 *   4. Stripe runs document verification + selfie match.
 *   5. `identity.verification_session.verified` (or `.requires_input` /
 *      `.canceled`) webhook fires; we flip `users.kyc_status`.
 *
 * We mirror Stripe's outcome into the existing provider-agnostic
 * `kyc_status` column so downstream gates (e.g.
 * upgrade-to-commercial requires kyc_status='verified') keep working.
 */
import type Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";

export async function startIdentityVerification(args: {
  userId: string;
  email?: string | null;
}): Promise<{ clientSecret: string; sessionId: string }> {
  const stripe = await getUncachableStripeClient();
  const session = await stripe.identity.verificationSessions.create({
    type: "document",
    metadata: { userId: args.userId },
    options: {
      document: {
        require_matching_selfie: true,
        require_live_capture: true,
        require_id_number: false,
      },
    },
  });

  await storage.updateUserStripeIdentity(args.userId, {
    sessionId: session.id,
    lastAttemptAt: new Date(),
    kycStatus: "in_progress",
    kycProvider: "stripe_identity",
  });

  if (!session.client_secret) {
    throw new Error("Stripe did not return a client_secret for identity session");
  }

  return { clientSecret: session.client_secret, sessionId: session.id };
}

export async function getIdentitySessionStatus(
  sessionId: string,
): Promise<Stripe.Identity.VerificationSession> {
  const stripe = await getUncachableStripeClient();
  return stripe.identity.verificationSessions.retrieve(sessionId);
}

/**
 * Webhook handler for identity.verification_session.* events. Maps
 * Stripe's outcome to our kyc_status enum.
 */
export async function handleIdentityWebhook(
  eventType: string,
  session: Stripe.Identity.VerificationSession,
): Promise<void> {
  const userId = (session.metadata?.userId as string) || null;
  if (!userId) {
    console.warn(`[stripeIdentity] ${eventType} for ${session.id} has no userId metadata`);
    return;
  }

  let kycStatus: string;
  let failureReason: string | null = null;
  let verifiedAt: Date | null = null;

  switch (eventType) {
    case "identity.verification_session.verified":
      kycStatus = "verified";
      verifiedAt = new Date();
      break;
    case "identity.verification_session.requires_input":
      kycStatus = "requires_input";
      failureReason = session.last_error?.reason || session.last_error?.code || null;
      break;
    case "identity.verification_session.canceled":
      kycStatus = "canceled";
      break;
    case "identity.verification_session.processing":
      kycStatus = "processing";
      break;
    default:
      console.log(`[stripeIdentity] ignoring event type ${eventType}`);
      return;
  }

  await storage.updateUserStripeIdentity(userId, {
    sessionId: session.id,
    kycStatus,
    kycProvider: "stripe_identity",
    failureReason,
    verifiedAt,
  });

  console.log(`[stripeIdentity] ${userId} -> ${kycStatus} (event: ${eventType})`);
}
