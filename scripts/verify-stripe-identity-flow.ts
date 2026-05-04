/**
 * Verifies the STRIPE_IDENTITY_FLOW_ID is valid by creating a real
 * VerificationSession against Stripe, then immediately cancelling it.
 *
 * Usage: npx tsx scripts/verify-stripe-identity-flow.ts
 */
import { getUncachableStripeClient } from "../server/stripeClient";

(async () => {
  const flowId = process.env.STRIPE_IDENTITY_FLOW_ID;
  if (!flowId) {
    console.error("FAIL: STRIPE_IDENTITY_FLOW_ID is not set");
    process.exit(1);
  }
  console.log(`Using flow ID: ${flowId}\n`);

  const stripe = await getUncachableStripeClient();

  let session;
  try {
    session = await stripe.identity.verificationSessions.create({
      verification_flow: flowId,
      metadata: { test: "verify-flow-script" },
    });
  } catch (err: any) {
    console.error("FAIL: Stripe rejected the verification session create");
    console.error(`  type:    ${err.type}`);
    console.error(`  code:    ${err.code}`);
    console.error(`  message: ${err.message}`);
    process.exit(1);
  }

  console.log("PASS: Verification session created");
  console.log(`  id:            ${session.id}`);
  console.log(`  status:        ${session.status}`);
  console.log(`  type:          ${session.type}`);
  console.log(`  client_secret: ${session.client_secret ? "present" : "MISSING"}`);
  console.log(`  url:           ${session.url || "(none)"}`);

  try {
    await stripe.identity.verificationSessions.cancel(session.id);
    console.log("\nCleanup: cancelled the test session.");
  } catch (err: any) {
    console.warn(`\nWarning: could not cancel test session: ${err.message}`);
  }

  console.log("\nAll checks passed. Flow is wired up correctly.");
  process.exit(0);
})();
