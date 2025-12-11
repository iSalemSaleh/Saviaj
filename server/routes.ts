import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupWebSocket } from "./websocket";
import { insertRiderOfferSchema, insertDriverRouteSchema, insertBidSchema } from "@shared/schema";

const isProfileComplete: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const user = await storage.getUser(userId);
    if (!user || !user.firstName) {
      return res.status(403).json({ message: "Profile incomplete. Please complete onboarding." });
    }
    
    next();
  } catch (error) {
    console.error("Profile check error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const uploadDir = path.join(process.cwd(), 'uploads', 'licenses');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const licenseUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req: any, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `license-${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, WebP and PDF are allowed.'));
    }
  },
});

export async function registerRoutes(app: Express, httpServer: Server): Promise<void> {
  // Auth middleware
  await setupAuth(app);
  
  // Setup WebSocket for real-time location tracking on the main server
  setupWebSocket(httpServer);

  // Azure Maps endpoints (secure - key never exposed to frontend)
  app.get('/api/azure-maps/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: 'Query parameter required' });
      }
      const { searchAddress } = await import('./azureMapsService');
      const results = await searchAddress(query);
      res.json({ results });
    } catch (error: any) {
      console.error('Azure Maps search error:', error);
      res.status(500).json({ message: error.message || 'Search failed' });
    }
  });

  app.get('/api/azure-maps/route', async (req, res) => {
    try {
      const { startLat, startLon, endLat, endLon } = req.query;
      if (!startLat || !startLon || !endLat || !endLon) {
        return res.status(400).json({ message: 'All coordinates required' });
      }
      const { getRoute } = await import('./azureMapsService');
      const route = await getRoute(
        parseFloat(startLat as string),
        parseFloat(startLon as string),
        parseFloat(endLat as string),
        parseFloat(endLon as string)
      );
      res.json({ route });
    } catch (error: any) {
      console.error('Azure Maps route error:', error);
      res.status(500).json({ message: error.message || 'Route calculation failed' });
    }
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

  // Complete user profile (onboarding)
  app.post('/api/user/complete-profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName, isDriver, driverLicenseUrl } = req.body;
      
      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }
      
      const user = await storage.completeUserProfile(userId, {
        firstName,
        lastName,
        isDriver: isDriver || false,
        driverLicenseUrl,
      });
      res.json(user);
    } catch (error) {
      console.error("Error completing profile:", error);
      res.status(500).json({ message: "Failed to complete profile" });
    }
  });

  // Upload driver's license
  app.post('/api/user/upload-license', isAuthenticated, licenseUpload.single('license'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const licenseUrl = `/uploads/licenses/${req.file.filename}`;
      res.json({ url: licenseUrl, filename: req.file.filename });
    } catch (error) {
      console.error("Error uploading license:", error);
      res.status(500).json({ message: "Failed to upload license" });
    }
  });

  // Serve uploaded license files (protected - requires authentication)
  app.get('/api/uploads/licenses/:filename', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const filename = req.params.filename;
      
      // Only allow users to view their own license
      if (user?.driverLicenseUrl !== `/uploads/licenses/${filename}`) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const filePath = path.join(uploadDir, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving license:", error);
      res.status(500).json({ message: "Failed to serve file" });
    }
  });

  // Rider Offer Routes
  app.post('/api/rider-offers', isAuthenticated, isProfileComplete, async (req: any, res) => {
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

  app.patch('/api/rider-offers/:id/accept', isAuthenticated, isProfileComplete, async (req: any, res) => {
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
  app.post('/api/driver-routes', isAuthenticated, isProfileComplete, async (req: any, res) => {
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
  app.post('/api/bids', isAuthenticated, isProfileComplete, async (req: any, res) => {
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

  app.patch('/api/bids/:id/accept', isAuthenticated, isProfileComplete, async (req: any, res) => {
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
