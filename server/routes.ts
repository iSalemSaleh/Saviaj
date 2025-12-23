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
import { eq, sql } from "drizzle-orm";

// UK-specific validation functions
// DVLA format: 16 alphanumeric characters (SSSSS YYMMDD IICCC)
function validateUkDrivingLicense(license: string): { valid: boolean; error?: string } {
  const normalized = license.toUpperCase().replace(/\s/g, '');
  if (normalized.length !== 16) {
    return { valid: false, error: "UK license must be 16 characters" };
  }
  // UK DVLA format: 5 letters/9 + 6 digits + 5 alphanumeric
  // Examples: MORGA753116SM9IJ, SMITH701019AB9CD
  const pattern = /^[A-Z9]{5}[0-9]{6}[A-Z0-9]{5}$/;
  if (!pattern.test(normalized)) {
    return { valid: false, error: "Invalid UK license format" };
  }
  return { valid: true };
}

function validateInsuranceExpiry(dateStr: string): { valid: boolean; error?: string } {
  if (!dateStr) {
    return { valid: false, error: "Insurance expiry date is required" };
  }
  const expiryDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + 30);
  
  if (expiryDate < minDate) {
    return { valid: false, error: "Insurance must be valid for at least 30 days" };
  }
  return { valid: true };
}

function validateUkSortCode(sortCode: string): { valid: boolean; error?: string } {
  const digitsOnly = sortCode.replace(/\D/g, '');
  if (digitsOnly.length !== 6) {
    return { valid: false, error: "Sort code must be 6 digits" };
  }
  return { valid: true };
}

function validateUkAccountNumber(accountNumber: string): { valid: boolean; error?: string } {
  const digitsOnly = accountNumber.replace(/\D/g, '');
  if (digitsOnly.length !== 8) {
    return { valid: false, error: "Account number must be 8 digits" };
  }
  return { valid: true };
}

// Private driver limits (non-commercial drivers)
const PRIVATE_DRIVER_RIDE_LIMIT = 5;
const PRIVATE_DRIVER_EARNINGS_LIMIT = 99.99;

async function checkPrivateDriverLimits(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const user = await storage.getUser(userId);
  
  // Commercial drivers have no limits
  if (user?.isCommercialDriver && user?.commercialStatusVerified) {
    return { allowed: true };
  }
  
  // Check daily activity
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const activity = await storage.getDriverDailyActivity(userId, today);
  
  if (!activity) {
    return { allowed: true };
  }
  
  if (activity.ridesCount >= PRIVATE_DRIVER_RIDE_LIMIT) {
    return { 
      allowed: false, 
      message: "You've reached the private driver limit.\nPrivate drivers are limited to 5 rides and up to £100 in earnings.\nUpgrade to Commercial status to publish more rides and earn more."
    };
  }
  
  if (activity.totalEarnings >= PRIVATE_DRIVER_EARNINGS_LIMIT) {
    return { 
      allowed: false, 
      message: "You've reached the private driver limit.\nPrivate drivers are limited to 5 rides and up to £100 in earnings.\nUpgrade to Commercial status to publish more rides and earn more."
    };
  }
  
  return { allowed: true };
}

async function wouldExceedEarningsLimit(userId: string, newEarnings: number): Promise<boolean> {
  const user = await storage.getUser(userId);
  
  // Commercial drivers have no limits
  if (user?.isCommercialDriver && user?.commercialStatusVerified) {
    return false;
  }
  
  const today = new Date().toISOString().split('T')[0];
  const activity = await storage.getDriverDailyActivity(userId, today);
  
  const currentEarnings = activity?.totalEarnings || 0;
  return (currentEarnings + newEarnings) > PRIVATE_DRIVER_EARNINGS_LIMIT;
}

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

  // Phone OTP verification endpoints (unauthenticated - for pre-registration)
  app.post('/api/auth/otp/request', async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      // Validate international phone number format (must start with + and country code)
      const normalizedPhone = phoneNumber.replace(/\s/g, '');
      const internationalPhonePattern = /^\+\d{7,15}$/;
      if (!internationalPhonePattern.test(normalizedPhone)) {
        return res.status(400).json({ message: "Please enter a valid phone number with country code" });
      }
      
      const { phoneVerifications } = await import("@shared/schema");
      
      // Rate limiting: check for recent requests from this phone number
      const recentVerification = await db
        .select()
        .from(phoneVerifications)
        .where(eq(phoneVerifications.phoneNumber, normalizedPhone))
        .orderBy(sql`${phoneVerifications.createdAt} DESC`)
        .limit(1);
      
      if (recentVerification.length > 0) {
        const lastRequest = recentVerification[0];
        const timeSinceLastRequest = Date.now() - new Date(lastRequest.createdAt!).getTime();
        if (timeSinceLastRequest < 60000) { // 60 second cooldown
          return res.status(429).json({ 
            message: "Please wait before requesting another code",
            waitSeconds: Math.ceil((60000 - timeSinceLastRequest) / 1000)
          });
        }
      }
      
      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Hash the OTP code for secure storage
      const bcrypt = await import("bcrypt");
      const hashedOtp = await bcrypt.default.hash(otpCode, 10);
      
      // Create verification record (expires in 5 minutes)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      
      // Invalidate any existing pending verifications for this phone
      await db.update(phoneVerifications)
        .set({ status: "expired" })
        .where(eq(phoneVerifications.phoneNumber, normalizedPhone));
      
      await db.insert(phoneVerifications).values({
        phoneNumber: normalizedPhone,
        otpCode: hashedOtp,
        status: "pending",
        attempts: 0,
        expiresAt,
      });
      
      // Try to send via Twilio
      try {
        const { sendVerificationSMS, getTwilioClient } = await import("./twilio");
        
        // Check if Twilio is properly configured by attempting to get the client
        await getTwilioClient();
        
        // Phone number already in international format with +
        const twilioPhone = normalizedPhone;
        
        const smsSent = await sendVerificationSMS(twilioPhone, otpCode);
        
        if (smsSent) {
          return res.json({ 
            success: true, 
            message: "Verification code sent to your phone"
          });
        } else {
          // Twilio is configured but SMS failed - return error, not demo mode
          console.error("Twilio SMS failed to send");
          return res.status(500).json({ 
            message: "Failed to send verification code. Please try again."
          });
        }
      } catch (twilioError: any) {
        // In production, always return error - no demo mode fallback
        console.error("Twilio error:", twilioError.message);
        return res.status(500).json({ 
          message: "Failed to send verification code. Please try again."
        });
      }
    } catch (error) {
      console.error("OTP request error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post('/api/auth/otp/verify', async (req, res) => {
    try {
      const { phoneNumber, code } = req.body;
      
      if (!phoneNumber || !code) {
        return res.status(400).json({ message: "Phone number and code are required" });
      }
      
      const normalizedPhone = phoneNumber.replace(/\s/g, '');
      const { phoneVerifications } = await import("@shared/schema");
      const bcrypt = await import("bcrypt");
      
      // Find the most recent pending verification for this phone
      const [verification] = await db
        .select()
        .from(phoneVerifications)
        .where(eq(phoneVerifications.phoneNumber, normalizedPhone))
        .orderBy(sql`${phoneVerifications.createdAt} DESC`)
        .limit(1);
      
      if (!verification) {
        return res.status(400).json({ message: "No verification request found. Please request a new code." });
      }
      
      if (verification.status !== "pending") {
        return res.status(400).json({ message: "This code has already been used. Please request a new code." });
      }
      
      // Check attempts BEFORE verifying (strict lockout)
      if ((verification.attempts || 0) >= 3) {
        await db.update(phoneVerifications)
          .set({ status: "expired" })
          .where(eq(phoneVerifications.id, verification.id));
        return res.status(400).json({ message: "Too many attempts. Please request a new code." });
      }
      
      if (new Date() > verification.expiresAt) {
        await db.update(phoneVerifications)
          .set({ status: "expired" })
          .where(eq(phoneVerifications.id, verification.id));
        return res.status(400).json({ message: "Code has expired. Please request a new code." });
      }
      
      // Verify the hashed code
      const isValidCode = await bcrypt.default.compare(code, verification.otpCode);
      
      if (!isValidCode) {
        await db.update(phoneVerifications)
          .set({ attempts: (verification.attempts || 0) + 1 })
          .where(eq(phoneVerifications.id, verification.id));
        return res.status(400).json({ message: "Invalid code. Please try again." });
      }
      
      // Code is correct - generate cryptographically secure verification token
      const crypto = await import("crypto");
      const verificationToken = crypto.randomBytes(32).toString("hex");
      
      await db.update(phoneVerifications)
        .set({ 
          status: "verified",
          verificationToken,
          verifiedAt: new Date()
        })
        .where(eq(phoneVerifications.id, verification.id));
      
      res.json({ 
        success: true, 
        verificationToken,
        phoneNumber: normalizedPhone
      });
    } catch (error) {
      console.error("OTP verification error:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  // Email OTP verification endpoints (using Microsoft Entra External ID)
  app.post('/api/auth/email-otp/request', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Validate email format
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Rate limiting: check for recent requests from this email
      const { emailVerifications } = await import("@shared/schema");
      const recentVerification = await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.email, normalizedEmail))
        .orderBy(sql`${emailVerifications.createdAt} DESC`)
        .limit(1);
      
      if (recentVerification.length > 0) {
        const lastRequest = recentVerification[0];
        const timeSinceLastRequest = Date.now() - new Date(lastRequest.createdAt!).getTime();
        if (timeSinceLastRequest < 60000) { // 1 minute cooldown
          return res.status(429).json({ 
            message: "Please wait before requesting another code",
            waitSeconds: Math.ceil((60000 - timeSinceLastRequest) / 1000)
          });
        }
      }
      
      // Try to use Entra External ID for email OTP
      try {
        const { initiateEmailOtpSignUp } = await import("./entraEmailOtp");
        const result = await initiateEmailOtpSignUp(normalizedEmail);
        
        if (result.success && result.continuationToken) {
          // Store the continuation token in database for later verification
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
          
          // Invalidate any existing pending verifications
          await db.update(emailVerifications)
            .set({ status: "expired" })
            .where(eq(emailVerifications.email, normalizedEmail));
          
          // Store with placeholder OTP (Entra handles the actual code)
          const bcrypt = await import("bcrypt");
          const placeholderHash = await bcrypt.default.hash("entra-managed", 10);
          
          await db.insert(emailVerifications).values({
            email: normalizedEmail,
            otpCode: placeholderHash,
            verificationToken: result.continuationToken,
            status: "pending",
            attempts: 0,
            expiresAt,
          });
          
          return res.json({ 
            success: true, 
            message: `Verification code sent to ${result.challengeTargetLabel || email}`,
            codeLength: result.codeLength || 8,
            continuationToken: result.continuationToken,
          });
        } else {
          throw new Error(result.error || "Failed to send verification code");
        }
      } catch (entraError: any) {
        // In production, always return error - no demo mode fallback
        console.error("Entra Email OTP error:", entraError.message);
        return res.status(500).json({ 
          message: "Failed to send verification code. Please check your email and try again."
        });
      }
    } catch (error) {
      console.error("Email OTP request error:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post('/api/auth/email-otp/verify', async (req, res) => {
    try {
      const { email, code, continuationToken } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      const { emailVerifications } = await import("@shared/schema");
      const bcrypt = await import("bcrypt");
      
      // Find the most recent pending verification for this email
      const [verification] = await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.email, normalizedEmail))
        .orderBy(sql`${emailVerifications.createdAt} DESC`)
        .limit(1);
      
      if (!verification) {
        return res.status(400).json({ message: "No verification request found. Please request a new code." });
      }
      
      if (verification.status !== "pending") {
        return res.status(400).json({ message: "This code has already been used. Please request a new code." });
      }
      
      if ((verification.attempts || 0) >= 5) {
        await db.update(emailVerifications)
          .set({ status: "expired" })
          .where(eq(emailVerifications.id, verification.id));
        return res.status(400).json({ message: "Too many attempts. Please request a new code." });
      }
      
      if (new Date() > verification.expiresAt) {
        await db.update(emailVerifications)
          .set({ status: "expired" })
          .where(eq(emailVerifications.id, verification.id));
        return res.status(400).json({ message: "Code has expired. Please request a new code." });
      }
      
      // If we have a continuation token, verify with Entra
      if (verification.verificationToken && continuationToken) {
        try {
          const { verifyEmailOtp } = await import("./entraEmailOtp");
          const result = await verifyEmailOtp(continuationToken, code);
          
          if (result.verified) {
            const crypto = await import("crypto");
            const newVerificationToken = crypto.randomBytes(32).toString("hex");
            
            await db.update(emailVerifications)
              .set({ 
                status: "verified",
                verificationToken: newVerificationToken,
                verifiedAt: new Date()
              })
              .where(eq(emailVerifications.id, verification.id));
            
            return res.json({ 
              success: true, 
              verificationToken: newVerificationToken,
              email: normalizedEmail
            });
          } else {
            await db.update(emailVerifications)
              .set({ attempts: (verification.attempts || 0) + 1 })
              .where(eq(emailVerifications.id, verification.id));
            return res.status(400).json({ message: result.error || "Invalid code. Please try again." });
          }
        } catch (entraError: any) {
          console.error("Entra verification error:", entraError);
          // Fall through to demo mode verification
        }
      }
      
      // Demo mode verification (or fallback)
      const isValidCode = await bcrypt.default.compare(code, verification.otpCode);
      
      if (!isValidCode) {
        await db.update(emailVerifications)
          .set({ attempts: (verification.attempts || 0) + 1 })
          .where(eq(emailVerifications.id, verification.id));
        return res.status(400).json({ message: "Invalid code. Please try again." });
      }
      
      const crypto = await import("crypto");
      const verificationTokenNew = crypto.randomBytes(32).toString("hex");
      
      await db.update(emailVerifications)
        .set({ 
          status: "verified",
          verificationToken: verificationTokenNew,
          verifiedAt: new Date()
        })
        .where(eq(emailVerifications.id, verification.id));
      
      res.json({ 
        success: true, 
        verificationToken: verificationTokenNew,
        email: normalizedEmail
      });
    } catch (error) {
      console.error("Email OTP verification error:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  app.post('/api/auth/email-otp/validate-token', async (req, res) => {
    try {
      const { verificationToken, email } = req.body;
      
      if (!verificationToken || !email) {
        return res.status(400).json({ valid: false });
      }
      
      const { emailVerifications } = await import("@shared/schema");
      const normalizedEmail = email.toLowerCase().trim();
      
      const [verification] = await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.verificationToken, verificationToken))
        .limit(1);
      
      if (!verification || verification.email !== normalizedEmail || verification.status !== "verified") {
        return res.status(400).json({ valid: false });
      }
      
      // Token is valid for 30 minutes after verification
      const tokenValidUntil = new Date(verification.verifiedAt!.getTime() + 30 * 60 * 1000);
      if (new Date() > tokenValidUntil) {
        return res.status(400).json({ valid: false, message: "Verification expired" });
      }
      
      res.json({ valid: true, email: normalizedEmail });
    } catch (error) {
      console.error("Token validation error:", error);
      res.status(500).json({ valid: false });
    }
  });

  // Validate phone verification token (used during registration)
  app.post('/api/auth/otp/validate-token', async (req, res) => {
    try {
      const { verificationToken, phoneNumber } = req.body;
      
      if (!verificationToken || !phoneNumber) {
        return res.status(400).json({ valid: false });
      }
      
      const { phoneVerifications } = await import("@shared/schema");
      const normalizedPhone = phoneNumber.replace(/\s/g, '');
      
      const [verification] = await db
        .select()
        .from(phoneVerifications)
        .where(eq(phoneVerifications.verificationToken, verificationToken))
        .limit(1);
      
      if (!verification || verification.phoneNumber !== normalizedPhone || verification.status !== "verified") {
        return res.status(400).json({ valid: false });
      }
      
      // Token is valid for 30 minutes after verification
      const tokenValidUntil = new Date(verification.verifiedAt!.getTime() + 30 * 60 * 1000);
      if (new Date() > tokenValidUntil) {
        return res.status(400).json({ valid: false, message: "Verification expired" });
      }
      
      res.json({ valid: true, phoneNumber: normalizedPhone });
    } catch (error) {
      console.error("Token validation error:", error);
      res.status(500).json({ valid: false });
    }
  });

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
        // Commercial driver fields
        isCommercialDriver,
        privateHireLicenseUrl,
        privateHireLicenseNumber,
        dvlaCheckCode,
        commercialInsuranceUrl,
        commercialInsuranceExpiry,
        vehicleInspectionUrl,
        vehicleInspectionExpiry,
        phvLicenseUrl,
        phvLicenseNumber,
        phvLicenseExpiry,
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
      
      // UK-specific format validations
      const licenseValidation = validateUkDrivingLicense(driverLicenseNumber);
      if (!licenseValidation.valid) {
        return res.status(400).json({ message: licenseValidation.error });
      }
      
      const insuranceValidation = validateInsuranceExpiry(vehicleInsuranceExpiry);
      if (!insuranceValidation.valid) {
        return res.status(400).json({ message: insuranceValidation.error });
      }
      
      const sortCodeValidation = validateUkSortCode(bankSortCode);
      if (!sortCodeValidation.valid) {
        return res.status(400).json({ message: sortCodeValidation.error });
      }
      
      const accountValidation = validateUkAccountNumber(bankAccountNumber);
      if (!accountValidation.valid) {
        return res.status(400).json({ message: accountValidation.error });
      }
      
      // Normalize the data before saving
      const normalizedLicense = driverLicenseNumber.toUpperCase().replace(/\s/g, '');
      const normalizedSortCode = bankSortCode.replace(/\D/g, '');
      const normalizedAccountNumber = bankAccountNumber.replace(/\D/g, '');
      
      const [user] = await db
        .update(users)
        .set({
          isDriver: true,
          driverLicenseUrl,
          driverLicenseNumber: normalizedLicense,
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
          bankSortCode: normalizedSortCode,
          bankAccountNumber: normalizedAccountNumber,
          // Commercial driver fields
          isCommercialDriver: isCommercialDriver || false,
          privateHireLicenseUrl: isCommercialDriver ? privateHireLicenseUrl : null,
          privateHireLicenseNumber: isCommercialDriver ? privateHireLicenseNumber : null,
          dvlaCheckCode: isCommercialDriver ? dvlaCheckCode : null,
          commercialInsuranceUrl: isCommercialDriver ? commercialInsuranceUrl : null,
          commercialInsuranceExpiry: isCommercialDriver ? commercialInsuranceExpiry : null,
          vehicleInspectionUrl: isCommercialDriver ? vehicleInspectionUrl : null,
          vehicleInspectionExpiry: isCommercialDriver ? vehicleInspectionExpiry : null,
          phvLicenseUrl: isCommercialDriver ? phvLicenseUrl : null,
          phvLicenseNumber: isCommercialDriver ? phvLicenseNumber : null,
          phvLicenseExpiry: isCommercialDriver ? phvLicenseExpiry : null,
          // TESTING ONLY: Auto-verify commercial drivers before March 1, 2026
          // This allows testing Pro driver features without manual verification
          // This script expires on March 1, 2026 and should be removed after that date
          commercialStatusVerified: isCommercialDriver && new Date() < new Date('2026-03-01T00:00:00Z'),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      
      // Mask sensitive data in response (sort code stored as 6 digits)
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
      
      // Check private driver limits
      const limitCheck = await checkPrivateDriverLimits(driverId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.message,
          limitReached: true 
        });
      }
      
      // Get the offer first to check earnings limit
      const existingOffer = await storage.getRiderOfferById(id);
      if (!existingOffer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      
      // Check if this would exceed earnings limit
      const price = parseFloat(existingOffer.offerPrice || "0");
      if (await wouldExceedEarningsLimit(driverId, price)) {
        return res.status(403).json({ 
          message: "You've reached the private driver limit.\nPrivate drivers are limited to 5 rides and up to £100 in earnings.\nUpgrade to Commercial status to publish more rides and earn more.",
          limitReached: true 
        });
      }
      
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
      
      // Track daily activity for private driver limits
      await storage.incrementDriverDailyActivity(driverId, new Date().toISOString().split('T')[0], price);
      
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
      
      // Check private driver limits
      const limitCheck = await checkPrivateDriverLimits(userId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.message,
          limitReached: true 
        });
      }
      
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

  app.get('/api/driver-routes/mine', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const routes = await storage.getDriverRoutesByUser(userId);
      res.json(routes);
    } catch (error) {
      console.error("Error fetching user driver routes:", error);
      res.status(500).json({ message: "Failed to fetch your routes" });
    }
  });

  // Driver daily activity (for showing limits)
  app.get('/api/driver/daily-activity', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Commercial drivers have no limits
      if (user?.isCommercialDriver && user?.commercialStatusVerified) {
        return res.json({
          isCommercial: true,
          ridesCount: 0,
          totalEarnings: 0,
          ridesLimit: null,
          earningsLimit: null,
          limitReached: false
        });
      }
      
      const today = new Date().toISOString().split('T')[0];
      const activity = await storage.getDriverDailyActivity(userId, today);
      
      const ridesCount = activity?.ridesCount || 0;
      const totalEarnings = activity?.totalEarnings || 0;
      
      res.json({
        isCommercial: false,
        ridesCount,
        totalEarnings,
        ridesLimit: PRIVATE_DRIVER_RIDE_LIMIT,
        earningsLimit: PRIVATE_DRIVER_EARNINGS_LIMIT,
        limitReached: ridesCount >= PRIVATE_DRIVER_RIDE_LIMIT || totalEarnings >= PRIVATE_DRIVER_EARNINGS_LIMIT
      });
    } catch (error) {
      console.error("Error fetching driver daily activity:", error);
      res.status(500).json({ message: "Failed to fetch daily activity" });
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
      
      // Get the bid first to check the driver's limits
      const existingBid = await storage.getBidById(bidId);
      if (!existingBid) {
        return res.status(404).json({ message: "Bid not found" });
      }
      
      // Check if the driver has reached their daily limits before accepting
      const limitCheck = await checkPrivateDriverLimits(existingBid.driverId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: "This driver has reached their daily limit and cannot accept new rides.",
          limitReached: true 
        });
      }
      
      // Check if this would exceed the driver's earnings limit
      const price = parseFloat(existingBid.bidPrice || "0");
      if (await wouldExceedEarningsLimit(existingBid.driverId, price)) {
        return res.status(403).json({ 
          message: "This driver has reached their daily limit and cannot accept new rides.",
          limitReached: true 
        });
      }
      
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
      
      // Track daily activity for private driver limits
      await storage.incrementDriverDailyActivity(bid.driverId, new Date().toISOString().split('T')[0], price);
      
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

  // Commercial Driver Availability Routes
  app.post('/api/driver/online-status', isAuthenticated, isProfileComplete, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { isOnlineForHire, ratePerMile, driverTagline, lat, lng } = req.body;
      
      // Verify user is a commercial driver
      const user = await storage.getUser(userId);
      if (!user?.isCommercialDriver) {
        return res.status(403).json({ message: "Only commercial drivers can go online for hire" });
      }
      
      if (!user.driverVerified && !user.commercialStatusVerified) {
        return res.status(403).json({ message: "Your driver account must be verified before going online" });
      }
      
      // Rate per mile is required when going online
      if (isOnlineForHire && (!ratePerMile || ratePerMile <= 0)) {
        return res.status(400).json({ message: "Rate per mile is required when going online" });
      }
      
      const updatedUser = await storage.updateDriverOnlineStatus(userId, isOnlineForHire, ratePerMile, driverTagline, lat, lng);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating online status:", error);
      res.status(500).json({ message: "Failed to update online status" });
    }
  });

  app.get('/api/drivers/nearby', async (req, res) => {
    try {
      const { lat, lng, maxDistance } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ message: "Pickup location (lat, lng) is required" });
      }
      
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      const maxDistanceMiles = parseFloat(maxDistance as string) || 10; // Default 10 miles
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Invalid coordinates" });
      }
      
      const nearbyDrivers = await storage.getOnlineCommercialDrivers(latitude, longitude, maxDistanceMiles);
      res.json(nearbyDrivers);
    } catch (error) {
      console.error("Error fetching nearby drivers:", error);
      res.status(500).json({ message: "Failed to fetch nearby drivers" });
    }
  });

  // Pro Driver Direct Hire Request
  app.post('/api/pro-driver/request-ride', isAuthenticated, isProfileComplete, async (req: any, res) => {
    try {
      const riderId = req.user.claims.sub;
      const { driverId, pickupLocation, dropoffLocation, pickupLat, pickupLng, dropoffLat, dropoffLng, estimatedPrice, scheduledTime } = req.body;
      
      // Verify driver is online for hire
      const driver = await storage.getUser(driverId);
      if (!driver || !driver.isOnlineForHire || !driver.isCommercialDriver) {
        return res.status(400).json({ message: "This driver is not available for hire" });
      }
      
      // Create the ride with status pending_driver_confirmation
      const ride = await storage.createRide({
        riderId,
        driverId,
        pickupLocation,
        dropoffLocation,
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        agreedPrice: estimatedPrice,
        scheduledTime: new Date(scheduledTime),
        status: 'pending_driver_confirmation',
      });
      
      // Send notification to driver (via WebSocket if connected)
      const { broadcast } = await import('./websocket');
      broadcast({
        type: 'NEW_RIDE_REQUEST',
        rideId: ride.id,
        riderId,
        pickupLocation,
        dropoffLocation,
        estimatedPrice,
        scheduledTime,
      }, driverId);
      
      res.status(201).json(ride);
    } catch (error) {
      console.error("Error creating Pro Driver ride request:", error);
      res.status(500).json({ message: "Failed to request ride" });
    }
  });
  
  // Pro Driver Accept/Decline Ride Request
  app.patch('/api/pro-driver/respond-to-request/:rideId', isAuthenticated, async (req: any, res) => {
    try {
      const driverId = req.user.claims.sub;
      const rideId = parseInt(req.params.rideId);
      const { action } = req.body; // 'accept' or 'decline'
      
      const ride = await storage.getRideById(rideId);
      if (!ride) {
        return res.status(404).json({ message: "Ride not found" });
      }
      
      if (ride.driverId !== driverId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      if (ride.status !== 'pending_driver_confirmation') {
        return res.status(400).json({ message: "This ride is no longer pending confirmation" });
      }
      
      let newStatus: string;
      if (action === 'accept') {
        newStatus = 'pending_payment';
      } else if (action === 'decline') {
        newStatus = 'cancelled';
      } else {
        return res.status(400).json({ message: "Invalid action" });
      }
      
      const updatedRide = await storage.updateRideStatus(rideId, newStatus);
      
      // Notify rider
      const { broadcast } = await import('./websocket');
      broadcast({
        type: action === 'accept' ? 'RIDE_REQUEST_ACCEPTED' : 'RIDE_REQUEST_DECLINED',
        rideId: ride.id,
        status: newStatus,
      }, ride.riderId);
      
      res.json(updatedRide);
    } catch (error) {
      console.error("Error responding to Pro Driver ride request:", error);
      res.status(500).json({ message: "Failed to respond to request" });
    }
  });
  
  // Get pending ride requests for a Pro Driver
  app.get('/api/pro-driver/pending-requests', isAuthenticated, async (req: any, res) => {
    try {
      const driverId = req.user.claims.sub;
      const pendingRequests = await storage.getPendingRideRequests(driverId);
      res.json(pendingRequests);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      res.status(500).json({ message: "Failed to fetch pending requests" });
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
