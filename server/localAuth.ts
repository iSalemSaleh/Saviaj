import type { Express, RequestHandler } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { z } from "zod";

const SALT_ROUNDS = 12;

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  homeAddress: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
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
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export function setupLocalAuth(app: Express) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists" });
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
      }

      const passwordHash = await bcrypt.hash(validatedData.password, SALT_ROUNDS);
      
      const user = await storage.createUser({
        email: validatedData.email,
        passwordHash,
        authProvider: "local",
        emailVerified: false,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
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
      });

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
      
      const user = await storage.getUserByEmail(validatedData.email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValidPassword = await bcrypt.compare(validatedData.password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

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
}
