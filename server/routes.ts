import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { setupLocalAuth } from "./localAuth";
import { setupWebSocket } from "./websocket";
import { insertRiderOfferSchema, insertDriverRouteSchema, insertBidSchema, users } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
  
  // Local auth routes (email/password registration and login)
  setupLocalAuth(app);
  
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

  app.get('/api/azure-maps/reverse-geocode', async (req, res) => {
    try {
      const { lat, lon } = req.query;
      if (!lat || !lon) {
        return res.status(400).json({ message: 'Latitude and longitude required' });
      }
      const { reverseGeocode } = await import('./azureMapsService');
      const address = await reverseGeocode(parseFloat(lat as string), parseFloat(lon as string));
      res.json({ address });
    } catch (error: any) {
      console.error('Azure Maps reverse geocode error:', error);
      res.status(500).json({ message: error.message || 'Reverse geocoding failed' });
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
      // Support both local auth (session.userId) and Replit auth (req.user.claims.sub)
      const userId = req.session?.userId || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      
      if (user) {
        const maskedUser = {
          ...user,
          passwordHash: undefined, // Never send password hash
          bankAccountNumber: user.bankAccountNumber ? '****' + user.bankAccountNumber.slice(-4) : null,
          bankSortCode: user.bankSortCode ? '**-**-' + user.bankSortCode.slice(-2) : null,
        };
        res.json(maskedUser);
      } else {
        res.json(user);
      }
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
      const { 
        firstName, 
        lastName, 
        dateOfBirth,
        phoneNumber,
        homeAddress,
        city,
        postcode,
        isDriver, 
        driverLicenseUrl,
        driverLicenseNumber,
        driverLicenseExpiry,
        backgroundCheckConsent,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vehicleColor,
        vehicleRegistration,
        vehicleInsuranceExpiry,
        bankAccountName,
        bankSortCode,
        bankAccountNumber,
      } = req.body;
      
      // Basic validation
      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }
      
      if (!dateOfBirth) {
        return res.status(400).json({ message: "Date of birth is required" });
      }
      
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      // Driver-specific validation
      if (isDriver) {
        if (!driverLicenseUrl) {
          return res.status(400).json({ message: "Driver's license upload is required for drivers" });
        }
        if (!driverLicenseNumber || !driverLicenseExpiry) {
          return res.status(400).json({ message: "License number and expiry date are required for drivers" });
        }
        if (!backgroundCheckConsent) {
          return res.status(400).json({ message: "Background check consent is required for drivers" });
        }
        if (!vehicleMake || !vehicleModel || !vehicleRegistration) {
          return res.status(400).json({ message: "Vehicle information (make, model, registration) is required for drivers" });
        }
        if (!bankAccountName || !bankSortCode || !bankAccountNumber) {
          return res.status(400).json({ message: "Bank details are required for drivers to receive payments" });
        }
      }
      
      const user = await storage.completeUserProfile(userId, {
        firstName,
        lastName,
        dateOfBirth,
        phoneNumber,
        homeAddress,
        city,
        postcode,
        isDriver: isDriver || false,
        driverLicenseUrl,
        driverLicenseNumber,
        driverLicenseExpiry,
        backgroundCheckConsent,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vehicleColor,
        vehicleRegistration,
        vehicleInsuranceExpiry,
        bankAccountName,
        bankSortCode,
        bankAccountNumber,
      });
      
      // Mask sensitive data in response
      const maskedUser = {
        ...user,
        bankAccountNumber: user.bankAccountNumber ? '****' + user.bankAccountNumber.slice(-4) : null,
        bankSortCode: user.bankSortCode ? '**-**-' + user.bankSortCode.slice(-2) : null,
      };
      
      res.json(maskedUser);
    } catch (error) {
      console.error("Error completing profile:", error);
      res.status(500).json({ message: "Failed to complete profile" });
    }
  });

  // Upgrade existing user to driver
  app.post('/api/user/upgrade-to-driver', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { 
        driverLicenseUrl,
        driverLicenseNumber,
        driverLicenseExpiry,
        backgroundCheckConsent,
        vehicleMake,
        vehicleModel,
        vehicleYear,
        vehicleColor,
        vehicleRegistration,
        vehicleInsuranceExpiry,
        bankAccountName,
        bankSortCode,
        bankAccountNumber,
      } = req.body;
      
      // Driver-specific validation
      if (!driverLicenseUrl) {
        return res.status(400).json({ message: "Driver's license upload is required" });
      }
      if (!driverLicenseNumber || !driverLicenseExpiry) {
        return res.status(400).json({ message: "License number and expiry date are required" });
      }
      if (!backgroundCheckConsent) {
        return res.status(400).json({ message: "Background check consent is required" });
      }
      if (!vehicleMake || !vehicleModel || !vehicleRegistration) {
        return res.status(400).json({ message: "Vehicle information (make, model, registration) is required" });
      }
      if (!bankAccountName || !bankSortCode || !bankAccountNumber) {
        return res.status(400).json({ message: "Bank details are required to receive payments" });
      }
      
      const [user] = await db
        .update(users)
        .set({
          isDriver: true,
          driverLicenseUrl,
          driverLicenseNumber,
          driverLicenseExpiry,
          backgroundCheckConsent,
          backgroundCheckStatus: 'pending',
          vehicleMake,
          vehicleModel,
          vehicleYear,
          vehicleColor,
          vehicleRegistration,
          vehicleInsuranceExpiry,
          bankAccountName,
          bankSortCode,
          bankAccountNumber,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      
      // Mask sensitive data in response
      const maskedUser = {
        ...user,
        bankAccountNumber: user.bankAccountNumber ? '****' + user.bankAccountNumber.slice(-4) : null,
        bankSortCode: user.bankSortCode ? '**-**-' + user.bankSortCode.slice(-2) : null,
      };
      
      res.json(maskedUser);
    } catch (error) {
      console.error("Error upgrading to driver:", error);
      res.status(500).json({ message: "Failed to upgrade to driver" });
    }
  });

  // Upload driver's license (authenticated - for profile updates)
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

  // Upload driver's license during registration (no auth required)
  app.post('/api/registration/upload-license', licenseUpload.single('license'), async (req: any, res) => {
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

  app.get('/api/rider-offers/mine', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const offers = await storage.getRiderOffersByUser(userId);
      res.json(offers);
    } catch (error) {
      console.error("Error fetching user rider offers:", error);
      res.status(500).json({ message: "Failed to fetch your offers" });
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

  app.patch('/api/rider-offers/:id/revise', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { offerPrice } = req.body;
      
      if (!offerPrice || offerPrice < 1 || offerPrice > 500) {
        return res.status(400).json({ message: "Price must be between £1 and £500" });
      }
      
      const existingOffer = await storage.getRiderOfferById(id);
      if (!existingOffer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      
      if (existingOffer.riderId !== userId) {
        return res.status(403).json({ message: "You can only revise your own offers" });
      }
      
      if (existingOffer.status !== "pending") {
        return res.status(400).json({ message: "Can only revise pending offers" });
      }
      
      const offer = await storage.updateRiderOfferPrice(id, offerPrice);
      res.json(offer);
    } catch (error) {
      console.error("Error revising rider offer:", error);
      res.status(500).json({ message: "Failed to revise rider offer" });
    }
  });

  app.patch('/api/rider-offers/:id/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const existingOffer = await storage.getRiderOfferById(id);
      if (!existingOffer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      
      if (existingOffer.riderId !== userId) {
        return res.status(403).json({ message: "You can only cancel your own offers" });
      }
      
      if (existingOffer.status !== "pending") {
        return res.status(400).json({ message: "Can only cancel pending offers" });
      }
      
      const offer = await storage.updateRiderOfferStatus(id, "cancelled");
      res.json(offer);
    } catch (error) {
      console.error("Error cancelling rider offer:", error);
      res.status(500).json({ message: "Failed to cancel rider offer" });
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
      const riderLat = req.query.riderLat ? parseFloat(req.query.riderLat as string) : undefined;
      const riderLng = req.query.riderLng ? parseFloat(req.query.riderLng as string) : undefined;
      const routes = await storage.getDriverRoutesWithDriverInfo(status, riderLat, riderLng);
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

  // PDF report endpoint for demo data
  app.get('/api/reports/demo-data', async (req, res) => {
    try {
      const PDFDocument = (await import('pdfkit')).default;
      const doc = new PDFDocument({ margin: 50 });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=AtlasRide-Demo-Data.pdf');
      doc.pipe(res);
      
      // Title
      doc.fontSize(24).font('Helvetica-Bold').text('AtlasRide Demo Data', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleString('en-GB')}`, { align: 'center' });
      doc.moveDown(2);
      
      // Get all demo data
      const allRoutes = await storage.getDriverRoutes();
      const allOffers = await storage.getRiderOffers();
      
      // Driver Routes Section
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1E3A5F').text('Driver Routes');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      for (const route of allRoutes) {
        doc.font('Helvetica-Bold').text(`Route ID: ${route.id}`);
        doc.font('Helvetica')
          .text(`Driver ID: ${route.driverId}`)
          .text(`From: ${route.startLocation}`)
          .text(`To: ${route.endLocation}`)
          .text(`Coordinates: (${route.startLat}, ${route.startLng}) → (${route.endLat}, ${route.endLng})`)
          .text(`Departure: ${new Date(route.departureTime).toLocaleString('en-GB')}`)
          .text(`Price per Seat: £${route.pricePerSeat || 'Negotiable'}`)
          .text(`Available Seats: ${route.availableSeats}`)
          .text(`Max Detour: ${route.maxDetourMiles} miles`);
        doc.moveDown(1);
      }
      
      doc.addPage();
      
      // Rider Offers Section
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#FF6B35').text('Rider Offers');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      for (const offer of allOffers) {
        doc.font('Helvetica-Bold').text(`Offer ID: ${offer.id}`);
        doc.font('Helvetica')
          .text(`Rider ID: ${offer.riderId}`)
          .text(`Pickup: ${offer.pickupLocation}`)
          .text(`Dropoff: ${offer.dropoffLocation}`)
          .text(`Coordinates: (${offer.pickupLat}, ${offer.pickupLng}) → (${offer.dropoffLat}, ${offer.dropoffLng})`)
          .text(`Requested Time: ${new Date(offer.requestedTime).toLocaleString('en-GB')}`)
          .text(`Offer Price: £${offer.offerPrice}`)
          .text(`Status: ${offer.status}`);
        doc.moveDown(1);
      }
      
      doc.addPage();
      
      // Test Accounts Section
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1E3A5F').text('Test Accounts');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(12).font('Helvetica-Bold').text('Driver Accounts:');
      doc.fontSize(10).font('Helvetica');
      const driverNames = ["James Smith", "Sarah Johnson", "Mohammed Williams", "Emily Brown", "David Jones", 
                           "Sophie Garcia", "Daniel Miller", "Jessica Davis", "Michael Rodriguez", "Rachel Martinez"];
      for (let i = 0; i < 10; i++) {
        doc.text(`• driver-${i+1}: ${driverNames[i]} (driver${i+1}@atlasride.test)`);
      }
      
      doc.moveDown(1);
      doc.fontSize(12).font('Helvetica-Bold').text('Rider Accounts:');
      doc.fontSize(10).font('Helvetica');
      const riderNames = ["Oliver Garcia", "Emma Miller", "Noah Davis", "Ava Rodriguez", "Liam Martinez",
                          "Mia Smith", "William Johnson", "Isabella Williams", "Lucas Brown", "Charlotte Jones"];
      for (let i = 0; i < 10; i++) {
        doc.text(`• rider-${i+1}: ${riderNames[i]} (rider${i+1}@atlasride.test)`);
      }
      
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#666666')
        .text('Note: These are test accounts created for demo purposes. To test the matching feature, search for locations like "Oxford Circus" to "Waterloo" which have matching driver routes.', { align: 'center' });
      
      doc.end();
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // Notification Routes
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get('/api/notifications/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // Unread messages count endpoint
  app.get('/api/messages/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadMessageCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread message count:", error);
      res.status(500).json({ message: "Failed to fetch unread message count" });
    }
  });

  app.patch('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid notification ID" });
      }
      const userId = req.user.claims.sub;
      const notification = await storage.markNotificationRead(id, userId);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.patch('/api/notifications/read-all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ message: "Failed to mark all notifications read" });
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

  // User Availability Routes
  app.post('/api/user/availability', isAuthenticated, isProfileComplete, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { activeMode, isAvailable, lat, lng } = req.body;
      const user = await storage.updateUserAvailability(userId, activeMode, isAvailable, lat, lng);
      res.json(user);
    } catch (error) {
      console.error("Error updating availability:", error);
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

  app.get('/api/users/available-drivers', async (req, res) => {
    try {
      const drivers = await storage.getAvailableDrivers();
      res.json(drivers);
    } catch (error) {
      console.error("Error fetching available drivers:", error);
      res.status(500).json({ message: "Failed to fetch available drivers" });
    }
  });

  // Rating Routes
  app.post('/api/ratings', isAuthenticated, async (req: any, res) => {
    try {
      const raterId = req.user.claims.sub;
      const { rideId, ratedUserId, raterRole, rating, comment } = req.body;
      
      // Check if already rated
      const hasRated = await storage.hasUserRatedRide(rideId, raterId);
      if (hasRated) {
        return res.status(400).json({ message: "You have already rated this ride" });
      }
      
      // Verify the ride exists and user was part of it
      const ride = await storage.getRideById(rideId);
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }
      
      if (ride.riderId !== raterId && ride.driverId !== raterId) {
        return res.status(403).json({ message: "You are not authorized to rate this ride" });
      }
      
      const newRating = await storage.createRating({
        rideId,
        raterId,
        ratedUserId,
        raterRole,
        rating,
        comment,
      });
      
      // Update the rated user's average rating
      const roleToUpdate = raterRole === 'rider' ? 'driver' : 'rider';
      await storage.updateUserRating(ratedUserId, roleToUpdate);
      
      res.status(201).json(newRating);
    } catch (error) {
      console.error("Error creating rating:", error);
      res.status(500).json({ message: "Failed to create rating" });
    }
  });

  app.get('/api/ratings/ride/:rideId', isAuthenticated, async (req, res) => {
    try {
      const rideId = parseInt(req.params.rideId);
      const ratings = await storage.getRatingsByRideId(rideId);
      res.json(ratings);
    } catch (error) {
      console.error("Error fetching ride ratings:", error);
      res.status(500).json({ message: "Failed to fetch ride ratings" });
    }
  });

  app.get('/api/ratings/user/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      const ratings = await storage.getRatingsForUser(userId);
      res.json(ratings);
    } catch (error) {
      console.error("Error fetching user ratings:", error);
      res.status(500).json({ message: "Failed to fetch user ratings" });
    }
  });

  // Public driver profile endpoint
  app.get('/api/drivers/:id/profile', async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "Driver not found" });
      }
      
      if (!user.isDriver) {
        return res.status(404).json({ message: "User is not a driver" });
      }
      
      // Return only public driver information
      const publicProfile = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName ? user.lastName.charAt(0) + '.' : null,
        profileImageUrl: user.profileImageUrl,
        driverRating: user.driverRating,
        totalRatingsAsDriver: user.totalRatingsAsDriver,
        totalRidesAsDriver: user.totalRidesAsDriver,
        vehicleMake: user.vehicleMake,
        vehicleModel: user.vehicleModel,
        vehicleYear: user.vehicleYear,
        vehicleColor: user.vehicleColor,
        driverVerified: user.driverVerified,
        createdAt: user.createdAt,
      };
      
      res.json(publicProfile);
    } catch (error) {
      console.error("Error fetching driver profile:", error);
      res.status(500).json({ message: "Failed to fetch driver profile" });
    }
  });

  app.get('/api/ratings/check/:rideId', isAuthenticated, async (req: any, res) => {
    try {
      const rideId = parseInt(req.params.rideId);
      const raterId = req.user.claims.sub;
      const hasRated = await storage.hasUserRatedRide(rideId, raterId);
      res.json({ hasRated });
    } catch (error) {
      console.error("Error checking rating:", error);
      res.status(500).json({ message: "Failed to check rating" });
    }
  });

  // Enhanced Ride Lifecycle Routes
  app.patch('/api/rides/:id/start-pickup', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (ride.driverId !== userId) return res.status(403).json({ message: "Unauthorized" });
      
      const updatedRide = await storage.updateRideStatus(id, 'en_route_pickup');
      res.json(updatedRide);
    } catch (error) {
      console.error("Error starting pickup:", error);
      res.status(500).json({ message: "Failed to start pickup" });
    }
  });

  app.patch('/api/rides/:id/start-trip', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (ride.driverId !== userId) return res.status(403).json({ message: "Unauthorized" });
      
      const updatedRide = await storage.updateRideStatus(id, 'in_progress');
      res.json(updatedRide);
    } catch (error) {
      console.error("Error starting trip:", error);
      res.status(500).json({ message: "Failed to start trip" });
    }
  });

  app.patch('/api/rides/:id/complete', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (ride.driverId !== userId) return res.status(403).json({ message: "Unauthorized" });
      
      const updatedRide = await storage.updateRideStatus(id, 'completed');
      
      // Set both users back to inactive
      await storage.updateUserAvailability(ride.riderId, null, false);
      await storage.updateUserAvailability(ride.driverId, null, false);
      
      res.json(updatedRide);
    } catch (error) {
      console.error("Error completing trip:", error);
      res.status(500).json({ message: "Failed to complete trip" });
    }
  });

  app.patch('/api/rides/:id/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (ride.riderId !== userId && ride.driverId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const updatedRide = await storage.updateRideStatus(id, 'cancelled');
      
      // If there was a route, restore the seat
      if (ride.driverRouteId) {
        await storage.incrementRouteSeats(ride.driverRouteId);
      }
      
      // Set both users back to available for matching
      await storage.updateUserAvailability(ride.riderId, 'rider', true);
      if (ride.driverId) {
        await storage.updateUserAvailability(ride.driverId, 'driver', true);
      }
      
      res.json(updatedRide);
    } catch (error) {
      console.error("Error cancelling ride:", error);
      res.status(500).json({ message: "Failed to cancel ride" });
    }
  });

  // Driver route management
  app.patch('/api/driver-routes/:id/close', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const route = await storage.getDriverRouteById(id);
      if (!route) return res.status(404).json({ message: "Route not found" });
      if (route.driverId !== userId) return res.status(403).json({ message: "Unauthorized" });
      
      const updatedRoute = await storage.updateDriverRouteStatus(id, 'cancelled');
      res.json(updatedRoute);
    } catch (error) {
      console.error("Error closing route:", error);
      res.status(500).json({ message: "Failed to close route" });
    }
  });

  // Get rides for a specific route (for multi-stop info)
  app.get('/api/driver-routes/:id/rides', isAuthenticated, async (req: any, res) => {
    try {
      const routeId = parseInt(req.params.id);
      const rides = await storage.getRidesByRouteId(routeId);
      res.json(rides);
    } catch (error) {
      console.error("Error fetching route rides:", error);
      res.status(500).json({ message: "Failed to fetch route rides" });
    }
  });

  // Chat message endpoints
  app.get('/api/rides/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const rideId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(rideId);
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }
      
      if (ride.riderId !== userId && ride.driverId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const messages = await storage.getChatMessagesByRide(rideId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.patch('/api/rides/:id/messages/read', isAuthenticated, async (req: any, res) => {
    try {
      const rideId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const ride = await storage.getRideById(rideId);
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }
      
      if (ride.riderId !== userId && ride.driverId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      await storage.markMessagesAsRead(rideId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ message: "Failed to mark messages as read" });
    }
  });
}
