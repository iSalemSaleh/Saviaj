/**
 * Seed two pre-verified accounts (rider + driver) for Google Play / App Store
 * reviewers. Idempotent — safe to re-run.
 *
 * Required env vars (set on Replit and on Azure App Service):
 *   REVIEW_RIDER_EMAIL       e.g. playreview.rider@saviaj.com
 *   REVIEW_RIDER_PHONE       e.g. +447700900001
 *   REVIEW_RIDER_PASSWORD    strong password
 *   REVIEW_DRIVER_EMAIL      e.g. playreview.driver@saviaj.com
 *   REVIEW_DRIVER_PHONE      e.g. +447700900002
 *   REVIEW_DRIVER_PASSWORD   strong password
 *
 * Run with:
 *   npx tsx scripts/seed-play-review.ts
 */
import { db } from "../server/db";
import {
  users,
  userProfiles,
  driverProfiles,
  vehicles,
} from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

interface SeedSpec {
  id: string;
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  isDriver: boolean;
  vehicle?: { make: string; model: string; year: string; color: string; reg: string };
}

async function upsertReviewUser(spec: SeedSpec) {
  const passwordHash = await bcrypt.hash(spec.password, 12);
  const now = new Date();

  // 1) users row — fully verified, KYC approved
  await db
    .insert(users)
    .values({
      id: spec.id,
      email: spec.email,
      firstName: spec.firstName,
      lastName: spec.lastName,
      phoneNumber: spec.phone,
      phoneVerified: true,
      emailVerified: true,
      passwordHash,
      authProvider: "local",
      isDriver: spec.isDriver,
      driverVerified: spec.isDriver,
      kycStatus: spec.isDriver ? "approved" : "pending",
      kycVerifiedAt: spec.isDriver ? now : null,
      kycProvider: spec.isDriver ? "play_review" : null,
      dvlaCheckStatus: spec.isDriver ? "approved" : "pending",
      dvlaLastCheckedAt: spec.isDriver ? now : null,
      hireRewardInsuranceVerified: spec.isDriver,
      hireRewardInsuranceExpiry: spec.isDriver ? "2099-12-31" : null,
      sanctionsScreeningStatus: spec.isDriver ? "approved" : "pending",
      sanctionsScreenedAt: spec.isDriver ? now : null,
      taxSelfEmploymentAcknowledged: spec.isDriver,
      taxAcknowledgedAt: spec.isDriver ? now : null,
      dbsCertificateNumber: spec.isDriver ? "PLAY-REVIEW-DBS" : null,
      dbsCertificateIssueDate: spec.isDriver ? "2025-01-01" : null,
      dbsCertificateExpiry: spec.isDriver ? "2099-12-31" : null,
    } as any)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: spec.email,
        phoneNumber: spec.phone,
        phoneVerified: true,
        emailVerified: true,
        passwordHash,
        isDriver: spec.isDriver,
        driverVerified: spec.isDriver,
        kycStatus: spec.isDriver ? "approved" : "pending",
        kycVerifiedAt: spec.isDriver ? now : null,
      } as any,
    });

  // 2) user_profiles
  await db
    .insert(userProfiles)
    .values({
      userId: spec.id,
      firstName: spec.firstName,
      lastName: spec.lastName,
      phoneNumber: spec.phone,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { firstName: spec.firstName, lastName: spec.lastName, phoneNumber: spec.phone },
    });

  // 3) driver_profiles + vehicle (driver only)
  if (spec.isDriver) {
    await db
      .insert(driverProfiles)
      .values({
        userId: spec.id,
        isDriver: true,
        driverVerified: true,
        backgroundCheckConsent: true,
        backgroundCheckStatus: "approved",
      })
      .onConflictDoUpdate({
        target: driverProfiles.userId,
        set: { isDriver: true, driverVerified: true, backgroundCheckStatus: "approved" },
      });

    if (spec.vehicle) {
      const existing = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.userId, spec.id))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(vehicles).values({
          userId: spec.id,
          make: spec.vehicle.make,
          model: spec.vehicle.model,
          year: spec.vehicle.year,
          color: spec.vehicle.color,
          registration: spec.vehicle.reg,
          insuranceExpiry: "2099-12-31",
          isPrimary: true,
        });
      }
    }
  }

  console.log(`✓ ${spec.isDriver ? "Driver" : "Rider"}: ${spec.email}`);
}

async function main() {
  const required = [
    "REVIEW_RIDER_EMAIL", "REVIEW_RIDER_PHONE", "REVIEW_RIDER_PASSWORD",
    "REVIEW_DRIVER_EMAIL", "REVIEW_DRIVER_PHONE", "REVIEW_DRIVER_PASSWORD",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  await upsertReviewUser({
    id: "play-review-rider",
    email: process.env.REVIEW_RIDER_EMAIL!.toLowerCase(),
    phone: process.env.REVIEW_RIDER_PHONE!,
    password: process.env.REVIEW_RIDER_PASSWORD!,
    firstName: "Play",
    lastName: "Reviewer",
    isDriver: false,
  });

  await upsertReviewUser({
    id: "play-review-driver",
    email: process.env.REVIEW_DRIVER_EMAIL!.toLowerCase(),
    phone: process.env.REVIEW_DRIVER_PHONE!,
    password: process.env.REVIEW_DRIVER_PASSWORD!,
    firstName: "Drive",
    lastName: "Reviewer",
    isDriver: true,
    vehicle: {
      make: "Toyota",
      model: "Prius",
      year: "2022",
      color: "Silver",
      reg: "PLAY 1",
    },
  });

  console.log("\nDone. Make sure REVIEW_TEST_EMAILS, REVIEW_TEST_PHONES,");
  console.log("and REVIEW_OTP_CODE are also set so OTP verification accepts");
  console.log("the fixed code without Twilio / Entra.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
