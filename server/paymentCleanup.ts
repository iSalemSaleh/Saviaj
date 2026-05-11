import { storage } from './storage';
import { stripeService } from './stripeService';
import { getUncachableStripeClient } from './stripeClient';

const PAYMENT_TIMEOUT_MINUTES_STANDARD = 30;
const PAYMENT_TIMEOUT_MINUTES_PRO_DRIVER = 15;

export async function markExpiredRides(): Promise<void> {
  try {
    const expiredRides = await storage.getExpiredScheduledRides();
    
    if (expiredRides.length === 0) {
      return;
    }
    
    console.log(`[Expired Rides] Found ${expiredRides.length} rides past their scheduled time to mark as expired`);
    
    for (const ride of expiredRides) {
      try {
        await storage.updateRide(ride.id, {
          status: 'expired'
        });
        
        await storage.createNotification({
          userId: ride.riderId,
          type: 'ride_expired',
          title: 'Ride Expired',
          message: `Your ride from ${ride.pickupLocation} to ${ride.dropoffLocation} has expired as the scheduled time has passed.`,
          relatedRideId: ride.id,
          read: false,
        });
        
        if (ride.driverId) {
          await storage.createNotification({
            userId: ride.driverId,
            type: 'ride_expired',
            title: 'Ride Expired',
            message: `The ride from ${ride.pickupLocation} to ${ride.dropoffLocation} has expired as the scheduled time has passed.`,
            relatedRideId: ride.id,
            read: false,
          });
        }
        
        console.log(`[Expired Rides] Marked ride ${ride.id} as expired`);
      } catch (rideError) {
        console.error(`[Expired Rides] Failed to mark ride ${ride.id} as expired:`, rideError);
      }
    }
    
    console.log(`[Expired Rides] Completed marking ${expiredRides.length} rides as expired`);
  } catch (error) {
    console.error('[Expired Rides] Error in expired rides job:', error);
  }
}

export async function cleanupStalePendingPayments(): Promise<void> {
  try {
    // Pro driver rides (no riderOfferId and no driverRouteId) have 15 min timeout
    // Standard rides have 30 min timeout
    const proCutoffTime = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES_PRO_DRIVER * 60 * 1000);
    const standardCutoffTime = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES_STANDARD * 60 * 1000);
    
    // Get all pending payment rides
    const allStaleRides = await storage.getStalePendingPaymentRides(proCutoffTime);
    
    if (allStaleRides.length === 0) {
      return;
    }
    
    // Filter rides based on type and appropriate timeout
    const staleRides = allStaleRides.filter(ride => {
      const isProDriverRide = !ride.riderOfferId && !ride.driverRouteId;
      if (isProDriverRide) {
        // Pro driver rides: 15 min timeout
        return ride.createdAt && new Date(ride.createdAt) < proCutoffTime;
      } else {
        // Standard rides: 30 min timeout
        return ride.createdAt && new Date(ride.createdAt) < standardCutoffTime;
      }
    });
    
    if (staleRides.length === 0) {
      return;
    }
    
    console.log(`[Payment Cleanup] Found ${staleRides.length} stale pending_payment rides to clean up`);
    
    for (const ride of staleRides) {
      try {
        const isProDriverRide = !ride.riderOfferId && !ride.driverRouteId;
        const timeoutMinutes = isProDriverRide ? PAYMENT_TIMEOUT_MINUTES_PRO_DRIVER : PAYMENT_TIMEOUT_MINUTES_STANDARD;
        
        if (ride.paymentIntentId) {
          try {
            await stripeService.cancelPaymentIntent(ride.paymentIntentId);
            console.log(`[Payment Cleanup] Cancelled PaymentIntent ${ride.paymentIntentId} for ride ${ride.id}`);
          } catch (cancelError) {
            console.error(`[Payment Cleanup] Failed to cancel PaymentIntent for ride ${ride.id}:`, cancelError);
          }
        }
        
        await storage.updateRide(ride.id, {
          status: 'cancelled_payment_timeout',
          paymentStatus: 'cancelled'
        });
        
        if (ride.riderOfferId) {
          await storage.updateRiderOfferStatus(ride.riderOfferId, 'pending');
        }
        
        if (ride.driverRouteId) {
          await storage.incrementRouteSeats(ride.driverRouteId);
        }
        
        if (ride.driverId) {
          await storage.createNotification({
            userId: ride.driverId,
            type: 'payment_timeout',
            title: 'Ride Payment Expired',
            message: `The rider did not complete payment within ${timeoutMinutes} minutes. The ride from ${ride.pickupLocation} to ${ride.dropoffLocation} has been cancelled.`,
            relatedRideId: ride.id,
            read: false,
          });
        }
        
        await storage.createNotification({
          userId: ride.riderId,
          type: 'payment_timeout',
          title: 'Payment Window Expired',
          message: `Your payment window for the ride from ${ride.pickupLocation} to ${ride.dropoffLocation} has expired. Please create a new ride request if you still need transportation.`,
          relatedRideId: ride.id,
          read: false,
        });
        
        console.log(`[Payment Cleanup] Cancelled stale ride ${ride.id} (created: ${ride.createdAt})`);
      } catch (rideError) {
        console.error(`[Payment Cleanup] Failed to cleanup ride ${ride.id}:`, rideError);
      }
    }
    
    console.log(`[Payment Cleanup] Completed cleanup of ${staleRides.length} rides`);
  } catch (error) {
    console.error('[Payment Cleanup] Error in cleanup job:', error);
  }
}

// ============================================================================
// Phase 1 — A B4: expire rider offers with no bids
//   - If requestedTime within next 30 min → expire
//   - If created > 60 min ago and zero bids → expire
// ============================================================================
export async function expireUnbidRiderOffers(): Promise<void> {
  try {
    const expired = await storage.expireUnbidRiderOffers();
    if (expired.length === 0) return;
    console.log(`[Offer Expiry] Expired ${expired.length} unbid rider offers`);
    for (const offer of expired) {
      try {
        await storage.createNotification({
          userId: offer.riderId,
          type: 'offer_expired_no_bids',
          title: 'No drivers responded',
          message: `Your ride request from ${offer.pickupLocation} to ${offer.dropoffLocation} expired with no driver bids. Please post a new request if you still need a ride.`,
          read: false,
        });
      } catch (notifyErr) {
        console.error(`[Offer Expiry] notify failed for offer ${offer.id}:`, notifyErr);
      }
    }
  } catch (error) {
    console.error('[Offer Expiry] job failed:', error);
  }
}

// ============================================================================
// Phase 1 — C3: expire bids whose 5-min confirmation window has passed
// ============================================================================
export async function expireStaleBids(): Promise<void> {
  try {
    const expired = await storage.expireStaleBids();
    if (expired.length === 0) return;
    console.log(`[Bid Expiry] Expired ${expired.length} stale bids`);
    const { broadcast } = await import('./websocket');
    for (const bid of expired) {
      try {
        broadcast({ type: 'BID_EXPIRED', bidId: bid.id, riderOfferId: bid.riderOfferId }, bid.driverId);
        await storage.createNotification({
          userId: bid.driverId,
          type: 'bid_expired',
          title: 'Bid expired',
          message: 'Your bid expired before the rider confirmed. You can place a new one.',
          read: false,
        });
      } catch (e) {
        console.error(`[Bid Expiry] notify failed for bid ${bid.id}:`, e);
      }
    }
  } catch (error) {
    console.error('[Bid Expiry] job failed:', error);
  }
}

// ============================================================================
// Phase 1 — C5: expire stale commercial-ride-requests (60s hail timeout)
// ============================================================================
export async function expireStaleCommercialRideRequests(): Promise<void> {
  try {
    const expired = await storage.expireStaleCommercialRideRequests();
    if (expired.length === 0) return;
    console.log(`[Hail Expiry] Expired ${expired.length} commercial ride requests`);
    const { broadcast } = await import('./websocket');
    for (const req of expired) {
      try {
        broadcast({ type: 'COMMERCIAL_REQUEST_EXPIRED', requestId: req.id }, req.riderId);
        await storage.createNotification({
          userId: req.riderId,
          type: 'commercial_request_expired',
          title: 'Driver did not respond',
          message: 'The driver did not respond within 60 seconds. Please try another driver.',
          read: false,
        });
      } catch (e) {
        console.error(`[Hail Expiry] notify failed for request ${req.id}:`, e);
      }
    }
  } catch (error) {
    console.error('[Hail Expiry] job failed:', error);
  }
}

// ============================================================================
// Phase 1 — G4: retry failed Stripe captures with backoff
// Up to 3 attempts, 8 hours apart, then escalate to admin.
// ============================================================================
const MAX_CAPTURE_ATTEMPTS = 3;
const HOURS_BETWEEN_CAPTURE_ATTEMPTS = 8;

export async function retryFailedCaptures(): Promise<void> {
  try {
    const candidates = await storage.findRidesNeedingCaptureRetry(
      MAX_CAPTURE_ATTEMPTS,
      HOURS_BETWEEN_CAPTURE_ATTEMPTS,
    );
    if (candidates.length === 0) return;
    console.log(`[Capture Retry] Found ${candidates.length} rides needing capture retry`);
    const stripe = await getUncachableStripeClient();
    for (const ride of candidates) {
      if (!ride.paymentIntentId) {
        await storage.recordCaptureAttempt(ride.id, false, 'no PaymentIntent ID');
        continue;
      }
      try {
        const captured = await stripe.paymentIntents.capture(ride.paymentIntentId);
        const success = captured.status === 'succeeded';
        await storage.recordCaptureAttempt(ride.id, success, success ? undefined : `status=${captured.status}`);
        console.log(`[Capture Retry] ride ${ride.id}: ${success ? 'captured' : 'still failing'}`);
      } catch (captureErr: any) {
        const msg = captureErr?.message || 'Unknown error';
        await storage.recordCaptureAttempt(ride.id, false, msg);
        const attemptsAfter = ((ride.captureAttempts ?? 0) + 1);
        if (attemptsAfter >= MAX_CAPTURE_ATTEMPTS) {
          console.error(`[Capture Retry] ride ${ride.id}: exhausted ${MAX_CAPTURE_ATTEMPTS} attempts — escalating`);
          try {
            await storage.createNotification({
              userId: ride.riderId,
              type: 'capture_failed_escalated',
              title: 'Payment problem on your recent ride',
              message: 'We couldn\'t complete the payment for your ride. A member of our team will be in touch shortly.',
              relatedRideId: ride.id,
              read: false,
            });
          } catch {}
        }
      }
    }
  } catch (error) {
    console.error('[Capture Retry] job failed:', error);
  }
}
