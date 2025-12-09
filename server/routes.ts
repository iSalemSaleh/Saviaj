import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupWebSocket } from "./websocket";
import { insertRiderOfferSchema, insertDriverRouteSchema, insertBidSchema } from "@shared/schema";

export async function registerRoutes(app: Express, httpServer: Server): Promise<void> {
  // Auth middleware
  await setupAuth(app);
  
  // Setup WebSocket for real-time location tracking on the main server
  setupWebSocket(httpServer);

  // Mapbox token endpoint
  app.get('/api/mapbox-token', (req, res) => {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      return res.status(500).json({ message: 'Mapbox token not configured' });
    }
    res.json({ token });
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user driver status (with KYC license upload)
  app.post('/api/user/driver-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { isDriver, driverLicenseUrl } = req.body;
      
      const user = await storage.updateUserDriverStatus(userId, isDriver, driverLicenseUrl);
      res.json(user);
    } catch (error) {
      console.error("Error updating driver status:", error);
      res.status(500).json({ message: "Failed to update driver status" });
    }
  });

  // Rider Offer Routes
  app.post('/api/rider-offers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertRiderOfferSchema.parse({
        ...req.body,
        riderId: userId,
      });
      
      const offer = await storage.createRiderOffer(validatedData);
      res.status(201).json(offer);
    } catch (error: any) {
      console.error("Error creating rider offer:", error);
      res.status(400).json({ message: error.message || "Failed to create rider offer" });
    }
  });

  app.get('/api/rider-offers', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const offers = await storage.getRiderOffers(status);
      res.json(offers);
    } catch (error) {
      console.error("Error fetching rider offers:", error);
      res.status(500).json({ message: "Failed to fetch rider offers" });
    }
  });

  app.get('/api/rider-offers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const offer = await storage.getRiderOfferById(id);
      
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      
      res.json(offer);
    } catch (error) {
      console.error("Error fetching rider offer:", error);
      res.status(500).json({ message: "Failed to fetch rider offer" });
    }
  });

  app.patch('/api/rider-offers/:id/accept', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const driverId = req.user.claims.sub;
      
      const offer = await storage.updateRiderOfferStatus(id, "accepted", driverId);
      
      // Create a ride record
      await storage.createRide({
        riderId: offer.riderId,
        driverId,
        pickupLocation: offer.pickupLocation,
        dropoffLocation: offer.dropoffLocation,
        pickupLat: offer.pickupLat,
        pickupLng: offer.pickupLng,
        dropoffLat: offer.dropoffLat,
        dropoffLng: offer.dropoffLng,
        agreedPrice: offer.offerPrice,
        scheduledTime: offer.requestedTime,
        riderOfferId: offer.id,
      });
      
      res.json(offer);
    } catch (error) {
      console.error("Error accepting rider offer:", error);
      res.status(500).json({ message: "Failed to accept rider offer" });
    }
  });

  // Driver Route Routes
  app.post('/api/driver-routes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertDriverRouteSchema.parse({
        ...req.body,
        driverId: userId,
      });
      
      const route = await storage.createDriverRoute(validatedData);
      res.status(201).json(route);
    } catch (error: any) {
      console.error("Error creating driver route:", error);
      res.status(400).json({ message: error.message || "Failed to create driver route" });
    }
  });

  app.get('/api/driver-routes', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const routes = await storage.getDriverRoutes(status);
      res.json(routes);
    } catch (error) {
      console.error("Error fetching driver routes:", error);
      res.status(500).json({ message: "Failed to fetch driver routes" });
    }
  });

  // Bid Routes
  app.post('/api/bids', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertBidSchema.parse({
        ...req.body,
        driverId: userId,
      });
      
      const bid = await storage.createBid(validatedData);
      res.status(201).json(bid);
    } catch (error: any) {
      console.error("Error creating bid:", error);
      res.status(400).json({ message: error.message || "Failed to create bid" });
    }
  });

  app.get('/api/bids/offer/:offerId', async (req, res) => {
    try {
      const offerId = parseInt(req.params.offerId);
      const bids = await storage.getBidsByOfferId(offerId);
      res.json(bids);
    } catch (error) {
      console.error("Error fetching bids:", error);
      res.status(500).json({ message: "Failed to fetch bids" });
    }
  });

  app.patch('/api/bids/:id/accept', isAuthenticated, async (req: any, res) => {
    try {
      const bidId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      // Update bid status
      const bid = await storage.updateBidStatus(bidId, "accepted");
      
      // Get the rider offer
      const offer = await storage.getRiderOfferById(bid.riderOfferId);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      
      // Check if user is the offer owner
      if (offer.riderId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Update offer status
      await storage.updateRiderOfferStatus(offer.id, "accepted", bid.driverId);
      
      // Create ride
      await storage.createRide({
        riderId: offer.riderId,
        driverId: bid.driverId,
        pickupLocation: offer.pickupLocation,
        dropoffLocation: offer.dropoffLocation,
        pickupLat: offer.pickupLat,
        pickupLng: offer.pickupLng,
        dropoffLat: offer.dropoffLat,
        dropoffLng: offer.dropoffLng,
        agreedPrice: bid.bidPrice,
        scheduledTime: offer.requestedTime,
        riderOfferId: offer.id,
      });
      
      res.json(bid);
    } catch (error) {
      console.error("Error accepting bid:", error);
      res.status(500).json({ message: "Failed to accept bid" });
    }
  });

  // Ride Routes
  app.get('/api/rides', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const rides = await storage.getRidesByUserId(userId);
      res.json(rides);
    } catch (error) {
      console.error("Error fetching rides:", error);
      res.status(500).json({ message: "Failed to fetch rides" });
    }
  });

  app.get('/api/rides/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const ride = await storage.getRideById(id);
      
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }
      
      res.json(ride);
    } catch (error) {
      console.error("Error fetching ride:", error);
      res.status(500).json({ message: "Failed to fetch ride" });
    }
  });

  app.patch('/api/rides/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      const ride = await storage.updateRideStatus(id, status);
      res.json(ride);
    } catch (error) {
      console.error("Error updating ride status:", error);
      res.status(500).json({ message: "Failed to update ride status" });
    }
  });

  // Payment Intent for Google Pay / Apple Pay
  app.post('/api/rides/:id/create-payment-intent', isAuthenticated, async (req: any, res) => {
    try {
      const rideId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(rideId);
      if (!ride) {
        return res.status(404).json({ error: "Ride not found" });
      }

      if (ride.riderId !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const { stripeService } = await import('./stripeService');
      
      const paymentIntent = await stripeService.createPaymentIntent(
        Math.round(parseFloat(ride.agreedPrice) * 100),
        'gbp',
        { rideId: rideId.toString() }
      );

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  // Payment Session (for card checkout redirect)
  app.post('/api/rides/:id/payment-session', isAuthenticated, async (req: any, res) => {
    try {
      const rideId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(rideId);
      if (!ride) {
        return res.status(404).json({ error: "Ride not found" });
      }

      if (ride.riderId !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const { stripeService } = await import('./stripeService');
      const user = await storage.getUser(userId);
      
      let customerId = user?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user?.email || '', userId);
        await storage.updateUserStripeCustomerId(userId, customer.id);
        customerId = customer.id;
      }

      const successUrl = `${req.protocol}://${req.get('host')}/ride/${rideId}?payment=success`;
      const cancelUrl = `${req.protocol}://${req.get('host')}/ride/${rideId}?payment=cancelled`;

      const session = await stripeService.createCheckoutSession(
        customerId,
        parseFloat(ride.agreedPrice),
        rideId,
        successUrl,
        cancelUrl
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating payment session:", error);
      res.status(500).json({ error: "Failed to create payment session" });
    }
  });

  // Legacy Payment Route (keeping for backward compatibility)
  app.post('/api/rides/:id/payment', isAuthenticated, async (req: any, res) => {
    try {
      const rideId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(rideId);
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }

      if (ride.riderId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { stripeService } = await import('./stripeService');
      const user = await storage.getUser(userId);
      
      let customerId = user?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user?.email || '', userId);
        await storage.updateUserStripeCustomerId(userId, customer.id);
        customerId = customer.id;
      }

      const successUrl = `${req.protocol}://${req.get('host')}/ride/${rideId}?payment=success`;
      const cancelUrl = `${req.protocol}://${req.get('host')}/ride/${rideId}?payment=cancelled`;

      const session = await stripeService.createCheckoutSession(
        customerId,
        parseFloat(ride.agreedPrice),
        rideId,
        successUrl,
        cancelUrl
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating payment session:", error);
      res.status(500).json({ message: "Failed to create payment session" });
    }
  });

  // Stripe publishable key endpoint
  app.get('/api/stripe/publishable-key', async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      console.error("Error getting Stripe key:", error);
      res.status(500).json({ message: "Failed to get Stripe key" });
    }
  });
}
