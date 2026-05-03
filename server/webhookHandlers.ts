import { getStripeSync } from './stripeClient';
import { handleAccountUpdatedWebhook } from './stripeConnect';
import { handleIdentityWebhook } from './stripeIdentity';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature, uuid);

    // After the sync library has verified the signature and written
    // its standard-event mirror tables, we ALSO dispatch our own
    // handlers for events that the sync library does not own:
    //   - account.updated  (Stripe Connect Express - driver onboarding state)
    //   - identity.verification_session.* (Stripe Identity - KYC outcome)
    // Signature was already verified by sync; safe to JSON.parse.
    try {
      const event = JSON.parse(payload.toString('utf8'));
      switch (event.type) {
        case 'account.updated':
          await handleAccountUpdatedWebhook(event.data.object);
          break;
        case 'identity.verification_session.verified':
        case 'identity.verification_session.requires_input':
        case 'identity.verification_session.canceled':
        case 'identity.verification_session.processing':
          await handleIdentityWebhook(event.type, event.data.object);
          break;
      }
    } catch (err) {
      console.error('[webhookHandlers] custom dispatch error:', err);
      // Do NOT rethrow - sync already succeeded, returning 200 is correct.
    }
  }
}
