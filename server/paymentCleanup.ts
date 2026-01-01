import { storage } from './storage';
import { stripeService } from './stripeService';

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
