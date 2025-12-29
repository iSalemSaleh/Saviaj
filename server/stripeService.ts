import { getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { sql } from 'drizzle-orm';

export class StripeService {
  async createCustomer(email: string, userId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      metadata: { userId },
    });
  }

  async createPaymentIntent(amount: number, currency: string, metadata: Record<string, string>) {
    const stripe = await getUncachableStripeClient();
    return await stripe.paymentIntents.create({
      amount, // Amount in smallest currency unit (pence for GBP)
      currency,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async createCheckoutSession(customerId: string, amount: number, rideId: number, successUrl: string, cancelUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `AtlasRide - Ride #${rideId}`,
            description: 'Ride payment',
          },
          unit_amount: Math.round(amount * 100), // Convert pounds to pence
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { rideId: rideId.toString() },
    });
  }

  async retrievePaymentIntent(paymentIntentId: string) {
    const stripe = await getUncachableStripeClient();
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error("Error retrieving payment intent:", error);
      return null;
    }
  }

  async createRefund(paymentIntentId: string, reason?: string) {
    const stripe = await getUncachableStripeClient();
    try {
      return await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
        metadata: { cancellation_reason: reason || 'Ride cancelled' },
      });
    } catch (error) {
      console.error("Error creating refund:", error);
      throw error;
    }
  }

  async getProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }
}

export const stripeService = new StripeService();
