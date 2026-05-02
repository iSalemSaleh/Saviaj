import type { Express, RequestHandler } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { z } from "zod";

const SALT_ROUNDS = 12;

// In-memory rate limiting for login attempts with memory protection
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_TRACKED_IDS = 10000; // Cap to prevent memory exhaustion
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Cleanup every 5 minutes

// Periodic cleanup of expired entries to prevent memory buildup
let lastCleanup = Date.now();
function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  for (const [key, record] of loginAttempts.entries()) {
    // Remove entries that are outside the attempt window and not locked
    if (now - record.lastAttempt > ATTEMPT_WINDOW && record.lockedUntil < now) {
      loginAttempts.delete(key);
    }
  }
}

function checkLoginRateLimit(identifier: string): { allowed: boolean; waitSeconds?: number } {
  cleanupExpiredEntries();
  
  const normalizedId = identifier.toLowerCase().trim();
  const now = Date.now();
  const record = loginAttempts.get(normalizedId);
  
  if (!record) {
    return { allowed: true };
  }
  
  // Check if locked out
  if (record.lockedUntil > now) {
    return { 
      allowed: false, 
      waitSeconds: Math.ceil((record.lockedUntil - now) / 1000) 
    };
  }
  
  // Reset if outside attempt window
  if (now - record.lastAttempt > ATTEMPT_WINDOW) {
    loginAttempts.delete(normalizedId);
    return { allowed: true };
  }
  
  return { allowed: true };
}

function evictOldestEntry(): void {
  // Find and remove the oldest non-locked entry to make room
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  const now = Date.now();
  
  for (const [key, record] of loginAttempts.entries()) {
    // Prefer evicting unlocked expired entries first
    if (record.lockedUntil < now && record.lastAttempt < oldestTime) {
      oldestTime = record.lastAttempt;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    loginAttempts.delete(oldestKey);
  }
}

function recordLoginAttempt(identifier: string, success: boolean): void {
  const normalizedId = identifier.toLowerCase().trim();
  const now = Date.now();
  
  if (success) {
    loginAttempts.delete(normalizedId);
    return;
  }
  
  // Enforce size cap to prevent memory exhaustion from bogus identifiers
  if (loginAttempts.size >= MAX_TRACKED_IDS && !loginAttempts.has(normalizedId)) {
    // At capacity - run cleanup first
    cleanupExpiredEntries();
    // If still at capacity, evict the oldest entry to make room
    if (loginAttempts.size >= MAX_TRACKED_IDS) {
      evictOldestEntry();
    }
  }
  
  const record = loginAttempts.get(normalizedId);
  
  if (!record || now - record.lastAttempt > ATTEMPT_WINDOW) {
    loginAttempts.set(normalizedId, { count: 1, lastAttempt: now, lockedUntil: 0 });
    return;
  }
  
  const newCount = record.count + 1;
  const lockedUntil = newCount >= MAX_LOGIN_ATTEMPTS ? now + LOCKOUT_DURATION : 0;
  
  loginAttempts.set(normalizedId, { 
    count: newCount, 
    lastAttempt: now, 
    lockedUntil 
  });
}

const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  emailVerificationToken: z.string().min(1, "Email verification token is required"),
  username: z.string().regex(usernameRegex, "Username must be 3-30 characters, alphanumeric and underscores only").optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  phoneNumber: z.string().optional(),
  homeAddress: z.string().optional(),
  // City is REQUIRED — the Saviaj Pass ID encodes a 3-letter city code, so
  // we must have a value at signup. The frontend uses postcodes.io to
  // autofill this from a UK postcode and falls back to a city dropdown.
  city: z.string().min(1, "City is required"),
  postcode: z.string().optional(),
  profileImageUrl: z.string().optional(),
  isDriver: z.boolean().default(false),
  driverLicenseUrl: z.string().optional(),
  driverLicenseNumber: z.string().optional(),
  driverLicenseExpiry: z.string().optional(),
  backgroundCheckConsent: z.boolean().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleYear: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehicleRegistration: z.string().optional(),
  vehicleInsuranceExpiry: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankSortCode: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  // Commercial driver (Pro Account) fields
  isCommercialDriver: z.boolean().default(false),
  privateHireLicenseUrl: z.string().optional(),
  privateHireLicenseNumber: z.string().optional(),
  dvlaCheckCode: z.string().optional(),
  commercialInsuranceUrl: z.string().optional(),
  commercialInsuranceExpiry: z.string().optional(),
  vehicleInspectionUrl: z.string().optional(),
  vehicleInspectionExpiry: z.string().optional(),
  phvLicenseUrl: z.string().optional(),
  phvLicenseNumber: z.string().optional(),
  phvLicenseExpiry: z.string().optional(),
  // Local Licensing Authority (council, or TfL for Greater London) that
  // issues this driver's PHV / taxi licence — required when the user
  // opts into commercial driver status during signup.
  licensingCouncil: z.string().optional(),
  // Legal acceptance — must be true to register
  acceptedLegal: z.literal(true, {
    errorMap: () => ({
      message:
        "You must accept the Terms of Service, Privacy Policy, Refund Policy and Cancellation Policy to create an account.",
    }),
  }),
});

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

export function setupLocalAuth(app: Express) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      // Validate email verification token
      const { emailVerifications } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const normalizedEmail = validatedData.email.toLowerCase().trim();
      
      const [verification] = await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.verificationToken, validatedData.emailVerificationToken))
        .limit(1);
      
      if (!verification) {
        return res.status(400).json({ message: "Invalid email verification. Please verify your email again." });
      }
      
      if (verification.email !== normalizedEmail) {
        return res.status(400).json({ message: "Email verification mismatch. Please verify your email again." });
      }
      
      if (verification.status !== "verified") {
        return res.status(400).json({ message: "Email not verified. Please complete email verification." });
      }
      
      // Token is valid for 30 minutes after verification
      if (!verification.verifiedAt) {
        return res.status(400).json({ message: "Email verification incomplete. Please verify again." });
      }
      
      const tokenValidUntil = new Date(verification.verifiedAt.getTime() + 30 * 60 * 1000);
      if (new Date() > tokenValidUntil) {
        return res.status(400).json({ message: "Email verification expired. Please verify your email again." });
      }
      
      const existingActiveUser = await storage.getActiveUserByEmail(validatedData.email);
      if (existingActiveUser) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      // If a soft-deleted user owns this email, free the slot so the new
      // signup can succeed (the email column has a UNIQUE constraint).
      const anyUserWithEmail = await storage.getUserByEmail(validatedData.email);
      if (anyUserWithEmail && anyUserWithEmail.deletedAt) {
        await storage.releaseEmailForDeletedUser(anyUserWithEmail.id);
      }

      // Check username uniqueness if provided (active accounts only)
      if (validatedData.username) {
        const existingActiveUsername = await storage.getActiveUserByUsername(validatedData.username);
        if (existingActiveUsername) {
          return res.status(400).json({ message: "This username is already taken" });
        }
      }

      if (validatedData.isDriver) {
        if (!validatedData.driverLicenseUrl || !validatedData.driverLicenseNumber || !validatedData.driverLicenseExpiry) {
          return res.status(400).json({ message: "License details are required for drivers" });
        }
        if (!validatedData.backgroundCheckConsent) {
          return res.status(400).json({ message: "Background check consent is required for drivers" });
        }
        if (!validatedData.vehicleMake || !validatedData.vehicleModel || !validatedData.vehicleRegistration) {
          return res.status(400).json({ message: "Vehicle information is required for drivers" });
        }
        if (!validatedData.bankAccountName || !validatedData.bankSortCode || !validatedData.bankAccountNumber) {
          return res.status(400).json({ message: "Bank details are required for drivers" });
        }
        // Commercial drivers MUST declare a Local Licensing Authority so
        // the booking layer can later cross-check their PHV plate.
        if (validatedData.isCommercialDriver) {
          const { isValidCouncil } = await import("@shared/data/uk-councils");
          if (!validatedData.licensingCouncil || !isValidCouncil(validatedData.licensingCouncil)) {
            return res.status(400).json({
              message:
                "Please select the Local Licensing Authority (council) that issues your PHV / taxi licence.",
            });
          }
        }
      }

      const passwordHash = await bcrypt.hash(validatedData.password, SALT_ROUNDS);

      // Allocate a Saviaj Pass ID up front, before the user row exists.
      // Doing it this way means the very first SELECT of the new row in
      // any code path that runs after createUser already sees the
      // populated `passId`. The generator is atomic over the daily
      // sequence counter, so concurrent signups don't collide.
      const { generatePassId } = await import("./passIdGenerator");
      const passId = await generatePassId(validatedData.city);

      const acceptedAt = new Date();
      const user = await storage.createUser({
        passId,
        email: validatedData.email,
        username: validatedData.username ? validatedData.username.toLowerCase() : undefined,
        passwordHash,
        authProvider: "local",
        emailVerified: true, // Email was verified via OTP
        termsAcceptedAt: acceptedAt,
        privacyAcceptedAt: acceptedAt,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        profileImageUrl: validatedData.profileImageUrl,
        dateOfBirth: validatedData.dateOfBirth,
        phoneNumber: validatedData.phoneNumber,
        homeAddress: validatedData.homeAddress,
        city: validatedData.city,
        postcode: validatedData.postcode,
        isDriver: validatedData.isDriver,
        driverLicenseUrl: validatedData.driverLicenseUrl,
        driverLicenseNumber: validatedData.driverLicenseNumber,
        driverLicenseExpiry: validatedData.driverLicenseExpiry,
        backgroundCheckConsent: validatedData.backgroundCheckConsent,
        backgroundCheckStatus: validatedData.isDriver ? 'pending' : undefined,
        vehicleMake: validatedData.vehicleMake,
        vehicleModel: validatedData.vehicleModel,
        vehicleYear: validatedData.vehicleYear,
        vehicleColor: validatedData.vehicleColor,
        vehicleRegistration: validatedData.vehicleRegistration,
        vehicleInsuranceExpiry: validatedData.vehicleInsuranceExpiry,
        bankAccountName: validatedData.bankAccountName,
        bankSortCode: validatedData.bankSortCode,
        bankAccountNumber: validatedData.bankAccountNumber,
        isCommercialDriver: validatedData.isCommercialDriver,
        privateHireLicenseUrl: validatedData.privateHireLicenseUrl,
        privateHireLicenseNumber: validatedData.privateHireLicenseNumber,
        dvlaCheckCode: validatedData.dvlaCheckCode,
        commercialInsuranceUrl: validatedData.commercialInsuranceUrl,
        commercialInsuranceExpiry: validatedData.commercialInsuranceExpiry,
        vehicleInspectionUrl: validatedData.vehicleInspectionUrl,
        vehicleInspectionExpiry: validatedData.vehicleInspectionExpiry,
        phvLicenseUrl: validatedData.phvLicenseUrl,
        phvLicenseNumber: validatedData.phvLicenseNumber,
        phvLicenseExpiry: validatedData.phvLicenseExpiry,
        licensingCouncil: validatedData.isCommercialDriver ? validatedData.licensingCouncil : undefined,
        // TESTING ONLY: Auto-verify commercial drivers before March 1, 2026
        // This allows testing Pro driver features without manual verification
        // This script expires on March 1, 2026 and should be removed after that date
        commercialStatusVerified: validatedData.isCommercialDriver && new Date() < new Date('2026-03-01T00:00:00Z'),
      });

      // Invalidate the verification token to prevent reuse
      await db.update(emailVerifications)
        .set({ status: "used", verificationToken: null })
        .where(eq(emailVerifications.id, verification.id));

      (req.session as any).userId = user.id;
      (req.session as any).user = {
        claims: { sub: user.id },
      };

      const maskedUser = {
        ...user,
        passwordHash: undefined,
        bankAccountNumber: user.bankAccountNumber ? '****' + user.bankAccountNumber.slice(-4) : null,
        bankSortCode: user.bankSortCode ? '**-**-' + user.bankSortCode.slice(-2) : null,
      };

      res.status(201).json({ message: "Registration successful", user: maskedUser });
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.errors[0]?.message || "Validation failed" });
      }
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      // Check rate limiting before processing
      const rateCheck = checkLoginRateLimit(validatedData.identifier);
      if (!rateCheck.allowed) {
        return res.status(429).json({ 
          message: "Too many login attempts. Please try again later.",
          waitSeconds: rateCheck.waitSeconds
        });
      }
      
      // Check if identifier is an email or username
      const isEmail = validatedData.identifier.includes('@');
      let user;
      
      if (isEmail) {
        user = await storage.getActiveUserByEmail(validatedData.identifier);
      } else {
        user = await storage.getActiveUserByUsername(validatedData.identifier);
      }
      
      if (!user || !user.passwordHash) {
        recordLoginAttempt(validatedData.identifier, false);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(validatedData.password, user.passwordHash);
      if (!isValidPassword) {
        recordLoginAttempt(validatedData.identifier, false);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Successful login - clear rate limit record
      recordLoginAttempt(validatedData.identifier, true);

      (req.session as any).userId = user.id;
      (req.session as any).user = {
        claims: { sub: user.id },
      };

      const maskedUser = {
        ...user,
        passwordHash: undefined,
        bankAccountNumber: user.bankAccountNumber ? '****' + user.bankAccountNumber.slice(-4) : null,
        bankSortCode: user.bankSortCode ? '**-**-' + user.bankSortCode.slice(-2) : null,
      };

      res.json({ message: "Login successful", user: maskedUser });
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.errors[0]?.message || "Validation failed" });
      }
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post('/api/auth/local-logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Check username availability
  app.get('/api/auth/username-available', async (req, res) => {
    try {
      const username = req.query.username as string;
      
      if (!username) {
        return res.status(400).json({ available: false, message: "Username is required" });
      }
      
      if (!usernameRegex.test(username)) {
        return res.status(400).json({ available: false, message: "Username must be 3-30 characters, alphanumeric and underscores only" });
      }
      
      // Only block on usernames held by ACTIVE accounts. Soft-deleted users
      // get their username suffixed by releaseEmailForDeletedUser, so the
      // original handle is fair game for someone else.
      const existingUser = await storage.getActiveUserByUsername(username);
      res.json({ available: !existingUser });
    } catch (error) {
      console.error("Username availability check error:", error);
      res.status(500).json({ available: false, message: "Failed to check username" });
    }
  });
}
