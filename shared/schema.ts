import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  username: varchar("username", { length: 30 }).unique(),
  passwordHash: varchar("password_hash"),
  emailVerified: boolean("email_verified").default(false),
  authProvider: varchar("auth_provider", { length: 20 }).default("local"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Personal info
  dateOfBirth: varchar("date_of_birth"),
  phoneNumber: varchar("phone_number"),
  homeAddress: text("home_address"),
  city: varchar("city"),
  postcode: varchar("postcode"),
  // Driver status
  isDriver: boolean("is_driver").default(false),
  driverLicenseUrl: varchar("driver_license_url"),
  driverVerified: boolean("driver_verified").default(false),
  // Driver-specific fields
  driverLicenseNumber: varchar("driver_license_number"),
  driverLicenseExpiry: varchar("driver_license_expiry"),
  backgroundCheckConsent: boolean("background_check_consent").default(false),
  backgroundCheckStatus: varchar("background_check_status"), // pending, approved, rejected
  // Vehicle info
  vehicleMake: varchar("vehicle_make"),
  vehicleModel: varchar("vehicle_model"),
  vehicleYear: varchar("vehicle_year"),
  vehicleColor: varchar("vehicle_color"),
  vehicleRegistration: varchar("vehicle_registration"),
  vehicleInsuranceExpiry: varchar("vehicle_insurance_expiry"),
  // Payment info
  bankAccountName: varchar("bank_account_name"),
  bankSortCode: varchar("bank_sort_code"),
  bankAccountNumber: varchar("bank_account_number"),
  // Commercial driver (Pro Account) fields
  isCommercialDriver: boolean("is_commercial_driver").default(false),
  privateHireLicenseUrl: varchar("private_hire_license_url"),
  privateHireLicenseNumber: varchar("private_hire_license_number"),
  dvlaCheckCode: varchar("dvla_check_code"),
  commercialInsuranceUrl: varchar("commercial_insurance_url"),
  commercialInsuranceExpiry: varchar("commercial_insurance_expiry"),
  vehicleInspectionUrl: varchar("vehicle_inspection_url"),
  vehicleInspectionExpiry: varchar("vehicle_inspection_expiry"),
  phvLicenseUrl: varchar("phv_license_url"),
  phvLicenseNumber: varchar("phv_license_number"),
  phvLicenseExpiry: varchar("phv_license_expiry"),
  commercialStatusVerified: boolean("commercial_status_verified").default(false),
  // Commercial driver rates (flat rate + optional tiered pricing + base minimum)
  ratePerMile: decimal("rate_per_mile", { precision: 5, scale: 2 }), // Flat rate in GBP per mile (used when no tiers set)
  tier1MaxMiles: decimal("tier1_max_miles", { precision: 6, scale: 2 }),  // Max miles for tier 1 (e.g. 5)
  tier1RatePerMile: decimal("tier1_rate_per_mile", { precision: 5, scale: 2 }), // Rate for tier 1 (e.g. 3.00)
  tier2MaxMiles: decimal("tier2_max_miles", { precision: 6, scale: 2 }),  // Max miles for tier 2 (e.g. 15)
  tier2RatePerMile: decimal("tier2_rate_per_mile", { precision: 5, scale: 2 }), // Rate for tier 2 (e.g. 2.00)
  tier3RatePerMile: decimal("tier3_rate_per_mile", { precision: 5, scale: 2 }), // Rate for tier 3 (beyond tier2Max)
  baseMinimumFare: decimal("base_minimum_fare", { precision: 6, scale: 2 }), // Minimum charge for any trip (e.g. 5.00)
  driverTagline: varchar("driver_tagline", { length: 100 }), // Short message to advertise service
  serviceCategories: text("service_categories").array(), // Driver service categories (up to 3): standard, premium, team, eco, business, budget
  // Availability states
  activeMode: varchar("active_mode", { length: 20 }), // 'rider', 'driver', or null (inactive)
  isAvailable: boolean("is_available").default(false), // true when actively searching/available
  isOnlineForHire: boolean("is_online_for_hire").default(false), // Commercial driver is available for direct hire
  currentLat: decimal("current_lat", { precision: 10, scale: 7 }),
  currentLng: decimal("current_lng", { precision: 10, scale: 7 }),
  lastLocationUpdate: timestamp("last_location_update"),
  // Stats and Stripe
  rating: decimal("rating", { precision: 3, scale: 2 }),
  riderRating: decimal("rider_rating", { precision: 3, scale: 2 }),
  driverRating: decimal("driver_rating", { precision: 3, scale: 2 }),
  totalRides: integer("total_rides").default(0),
  totalRidesAsDriver: integer("total_rides_as_driver").default(0),
  totalRatingsAsRider: integer("total_ratings_as_rider").default(0),
  totalRatingsAsDriver: integer("total_ratings_as_driver").default(0),
  stripeCustomerId: varchar("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Admin and soft-delete fields
  isAdmin: boolean("is_admin").default(false),
  deletedAt: timestamp("deleted_at"),
  deletedReason: varchar("deleted_reason"),
  deletedBy: varchar("deleted_by"), // 'self' or admin userId
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// ============================================
// NORMALIZED TABLES (Phase 0 - New Structure)
// ============================================

// User Profiles - Personal information separated from auth
export const userProfiles = pgTable("user_profiles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  dateOfBirth: varchar("date_of_birth"),
  phoneNumber: varchar("phone_number"),
  homeAddress: text("home_address"),
  city: varchar("city"),
  postcode: varchar("postcode"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// User Stats - Aggregated metrics for riders and drivers
export const userStats = pgTable("user_stats", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  riderRating: decimal("rider_rating", { precision: 3, scale: 2 }),
  driverRating: decimal("driver_rating", { precision: 3, scale: 2 }),
  totalRidesAsRider: integer("total_rides_as_rider").default(0),
  totalRidesAsDriver: integer("total_rides_as_driver").default(0),
  totalRatingsAsRider: integer("total_ratings_as_rider").default(0),
  totalRatingsAsDriver: integer("total_ratings_as_driver").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userStatsRelations = relations(userStats, ({ one }) => ({
  user: one(users, {
    fields: [userStats.userId],
    references: [users.id],
  }),
}));

export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = typeof userStats.$inferInsert;

// Driver Profiles - Basic driver verification info
export const driverProfiles = pgTable("driver_profiles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  isDriver: boolean("is_driver").default(false),
  driverVerified: boolean("driver_verified").default(false),
  backgroundCheckConsent: boolean("background_check_consent").default(false),
  backgroundCheckStatus: varchar("background_check_status", { length: 20 }), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const driverProfilesRelations = relations(driverProfiles, ({ one }) => ({
  user: one(users, {
    fields: [driverProfiles.userId],
    references: [users.id],
  }),
}));

export type DriverProfile = typeof driverProfiles.$inferSelect;
export type InsertDriverProfile = typeof driverProfiles.$inferInsert;

// Driver Documents - All driver documents with history tracking
export const driverDocuments = pgTable("driver_documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  documentType: varchar("document_type", { length: 50 }).notNull(), // driver_license, private_hire_license, commercial_insurance, vehicle_inspection, phv_license
  documentUrl: varchar("document_url"),
  documentNumber: varchar("document_number"),
  expiryDate: varchar("expiry_date"),
  status: varchar("status", { length: 20 }).default("pending"), // pending, verified, expired, rejected
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const driverDocumentsRelations = relations(driverDocuments, ({ one }) => ({
  user: one(users, {
    fields: [driverDocuments.userId],
    references: [users.id],
  }),
}));

export type DriverDocument = typeof driverDocuments.$inferSelect;
export type InsertDriverDocument = typeof driverDocuments.$inferInsert;

// Vehicles - Vehicle information (allows multiple vehicles per driver)
export const vehicles = pgTable("vehicles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  make: varchar("make"),
  model: varchar("model"),
  year: varchar("year"),
  color: varchar("color"),
  registration: varchar("registration"),
  insuranceExpiry: varchar("insurance_expiry"),
  isPrimary: boolean("is_primary").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  user: one(users, {
    fields: [vehicles.userId],
    references: [users.id],
  }),
}));

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

// Driver Commercial - Pro/commercial driver settings
export const driverCommercial = pgTable("driver_commercial", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  isCommercialDriver: boolean("is_commercial_driver").default(false),
  commercialStatusVerified: boolean("commercial_status_verified").default(false),
  ratePerMile: decimal("rate_per_mile", { precision: 5, scale: 2 }),
  tier1MaxMiles: decimal("tier1_max_miles", { precision: 6, scale: 2 }),
  tier1RatePerMile: decimal("tier1_rate_per_mile", { precision: 5, scale: 2 }),
  tier2MaxMiles: decimal("tier2_max_miles", { precision: 6, scale: 2 }),
  tier2RatePerMile: decimal("tier2_rate_per_mile", { precision: 5, scale: 2 }),
  tier3RatePerMile: decimal("tier3_rate_per_mile", { precision: 5, scale: 2 }),
  baseMinimumFare: decimal("base_minimum_fare", { precision: 6, scale: 2 }),
  driverTagline: varchar("driver_tagline", { length: 100 }),
  serviceCategories: text("service_categories").array(),
  dvlaCheckCode: varchar("dvla_check_code"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const driverCommercialRelations = relations(driverCommercial, ({ one }) => ({
  user: one(users, {
    fields: [driverCommercial.userId],
    references: [users.id],
  }),
}));

export type DriverCommercial = typeof driverCommercial.$inferSelect;
export type InsertDriverCommercial = typeof driverCommercial.$inferInsert;

// Driver Availability - Live location and status (high-frequency updates)
export const driverAvailability = pgTable("driver_availability", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  activeMode: varchar("active_mode", { length: 20 }), // 'rider', 'driver', or null
  isAvailable: boolean("is_available").default(false),
  isOnlineForHire: boolean("is_online_for_hire").default(false),
  currentLat: decimal("current_lat", { precision: 10, scale: 7 }),
  currentLng: decimal("current_lng", { precision: 10, scale: 7 }),
  lastLocationUpdate: timestamp("last_location_update"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const driverAvailabilityRelations = relations(driverAvailability, ({ one }) => ({
  user: one(users, {
    fields: [driverAvailability.userId],
    references: [users.id],
  }),
}));

export type DriverAvailability = typeof driverAvailability.$inferSelect;
export type InsertDriverAvailability = typeof driverAvailability.$inferInsert;

// User Bank Accounts - Payment/payout details (sensitive - should be encrypted)
export const userBankAccounts = pgTable("user_bank_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  accountName: varchar("account_name"),
  sortCode: varchar("sort_code"),
  accountNumber: varchar("account_number"), // TODO: Encrypt this field
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userBankAccountsRelations = relations(userBankAccounts, ({ one }) => ({
  user: one(users, {
    fields: [userBankAccounts.userId],
    references: [users.id],
  }),
}));

export type UserBankAccount = typeof userBankAccounts.$inferSelect;
export type InsertUserBankAccount = typeof userBankAccounts.$inferInsert;

// ============================================
// NORMALIZED USER AGGREGATE TYPE (Phase 2)
// ============================================

// NormalizedUser combines core auth data with data from normalized tables
// This replaces the monolithic User type for read operations
export interface NormalizedUser {
  // Core auth fields (from users table - never migrated)
  id: string;
  email: string | null;
  username: string | null;
  emailVerified: boolean | null;
  authProvider: string | null;
  stripeCustomerId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  
  // Profile data (from user_profiles)
  profile: {
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    dateOfBirth: string | null;
    phoneNumber: string | null;
    homeAddress: string | null;
    city: string | null;
    postcode: string | null;
  } | null;
  
  // Stats data (from user_stats)
  stats: {
    riderRating: string | null;
    driverRating: string | null;
    totalRidesAsRider: number | null;
    totalRidesAsDriver: number | null;
    totalRatingsAsRider: number | null;
    totalRatingsAsDriver: number | null;
  } | null;
  
  // Driver profile (from driver_profiles)
  driverProfile: {
    isDriver: boolean | null;
    driverVerified: boolean | null;
    backgroundCheckConsent: boolean | null;
    backgroundCheckStatus: string | null;
  } | null;
  
  // Driver availability (from driver_availability)
  availability: {
    activeMode: string | null;
    isAvailable: boolean | null;
    isOnlineForHire: boolean | null;
    currentLat: string | null;
    currentLng: string | null;
    lastLocationUpdate: Date | null;
  } | null;
  
  // Commercial driver info (from driver_commercial)
  commercial: {
    isCommercialDriver: boolean | null;
    commercialStatusVerified: boolean | null;
    ratePerMile: string | null;
    tier1MaxMiles: string | null;
    tier1RatePerMile: string | null;
    tier2MaxMiles: string | null;
    tier2RatePerMile: string | null;
    tier3RatePerMile: string | null;
    baseMinimumFare: string | null;
    driverTagline: string | null;
    serviceCategories: string[] | null;
  } | null;
  
  // Primary vehicle (from vehicles)
  vehicle: {
    make: string | null;
    model: string | null;
    year: string | null;
    color: string | null;
    registration: string | null;
    insuranceExpiry: string | null;
  } | null;
}

// ============================================
// END NORMALIZED TABLES
// ============================================

// ============================================
// RECURRING SCHEDULES
// ============================================

export const recurringSchedules = pgTable("recurring_schedules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 10 }).notNull(), // 'rider' or 'driver'
  status: varchar("status", { length: 20 }).notNull().default("active"), // active, paused, cancelled
  lastGeneratedDate: timestamp("last_generated_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_recsched_user").on(table.userId),
  index("idx_recsched_type").on(table.type),
  index("idx_recsched_status").on(table.status),
]);

export const recurringScheduleEntries = pgTable("recurring_schedule_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scheduleId: integer("schedule_id").notNull().references(() => recurringSchedules.id, { onDelete: 'cascade' }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, ..., 6=Saturday
  departureTime: varchar("departure_time", { length: 5 }).notNull(), // HH:MM format
  startLocation: text("start_location").notNull(),
  endLocation: text("end_location").notNull(),
  startLat: decimal("start_lat", { precision: 10, scale: 7 }),
  startLng: decimal("start_lng", { precision: 10, scale: 7 }),
  endLat: decimal("end_lat", { precision: 10, scale: 7 }),
  endLng: decimal("end_lng", { precision: 10, scale: 7 }),
  offerPrice: decimal("offer_price", { precision: 10, scale: 2 }),
  maxDetourMiles: decimal("max_detour_miles", { precision: 5, scale: 2 }),
  availableSeats: integer("available_seats"),
  totalSeats: integer("total_seats"),
  pricePerSeat: decimal("price_per_seat", { precision: 10, scale: 2 }),
  paymentTimeoutMinutes: integer("payment_timeout_minutes"),
}, (table) => [
  index("idx_recentry_schedule").on(table.scheduleId),
  index("idx_recentry_day").on(table.dayOfWeek),
]);

export const recurringSchedulesRelations = relations(recurringSchedules, ({ one, many }) => ({
  user: one(users, {
    fields: [recurringSchedules.userId],
    references: [users.id],
  }),
  entries: many(recurringScheduleEntries),
}));

export const recurringScheduleEntriesRelations = relations(recurringScheduleEntries, ({ one }) => ({
  schedule: one(recurringSchedules, {
    fields: [recurringScheduleEntries.scheduleId],
    references: [recurringSchedules.id],
  }),
}));

export const insertRecurringScheduleSchema = createInsertSchema(recurringSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastGeneratedDate: true,
});
export type InsertRecurringSchedule = z.infer<typeof insertRecurringScheduleSchema>;
export type RecurringSchedule = typeof recurringSchedules.$inferSelect;

export const insertRecurringScheduleEntrySchema = createInsertSchema(recurringScheduleEntries, {
  dayOfWeek: z.coerce.number().min(0).max(6),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/),
  offerPrice: z.coerce.number().min(0.30).max(500).optional().nullable(),
  startLat: z.coerce.number().optional().nullable(),
  startLng: z.coerce.number().optional().nullable(),
  endLat: z.coerce.number().optional().nullable(),
  endLng: z.coerce.number().optional().nullable(),
  maxDetourMiles: z.coerce.number().min(0.01).max(100).optional().nullable(),
  availableSeats: z.coerce.number().min(1).max(7).optional().nullable(),
  totalSeats: z.coerce.number().min(1).max(7).optional().nullable(),
  pricePerSeat: z.coerce.number().min(0.01).max(100).optional().nullable(),
  paymentTimeoutMinutes: z.coerce.number().min(1).max(30).optional().nullable(),
}).omit({
  id: true,
});
export type InsertRecurringScheduleEntry = z.infer<typeof insertRecurringScheduleEntrySchema>;
export type RecurringScheduleEntry = typeof recurringScheduleEntries.$inferSelect;

// Rider Offers - Riders post trip requests with their price offer
export const riderOffers = pgTable("rider_offers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  pickupLocation: text("pickup_location").notNull(),
  dropoffLocation: text("dropoff_location").notNull(),
  pickupLat: decimal("pickup_lat", { precision: 10, scale: 7 }),
  pickupLng: decimal("pickup_lng", { precision: 10, scale: 7 }),
  dropoffLat: decimal("dropoff_lat", { precision: 10, scale: 7 }),
  dropoffLng: decimal("dropoff_lng", { precision: 10, scale: 7 }),
  offerPrice: decimal("offer_price", { precision: 10, scale: 2 }).notNull(),
  requestedTime: timestamp("requested_time").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  acceptedDriverId: varchar("accepted_driver_id").references(() => users.id),
  scheduleId: integer("schedule_id").references(() => recurringSchedules.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const riderOffersRelations = relations(riderOffers, ({ one }) => ({
  rider: one(users, {
    fields: [riderOffers.riderId],
    references: [users.id],
  }),
  acceptedDriver: one(users, {
    fields: [riderOffers.acceptedDriverId],
    references: [users.id],
  }),
}));

export const insertRiderOfferSchema = createInsertSchema(riderOffers, {
  offerPrice: z.coerce.number().min(0.30).max(500),
  pickupLat: z.coerce.number().optional(),
  pickupLng: z.coerce.number().optional(),
  dropoffLat: z.coerce.number().optional(),
  dropoffLng: z.coerce.number().optional(),
  requestedTime: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRiderOffer = z.infer<typeof insertRiderOfferSchema>;
export type RiderOffer = typeof riderOffers.$inferSelect;

// Driver Routes - Drivers post their planned routes
export const driverRoutes = pgTable("driver_routes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  driverId: varchar("driver_id").notNull().references(() => users.id),
  startLocation: text("start_location").notNull(),
  endLocation: text("end_location").notNull(),
  startLat: decimal("start_lat", { precision: 10, scale: 7 }),
  startLng: decimal("start_lng", { precision: 10, scale: 7 }),
  endLat: decimal("end_lat", { precision: 10, scale: 7 }),
  endLng: decimal("end_lng", { precision: 10, scale: 7 }),
  departureTime: timestamp("departure_time").notNull(),
  maxDetourMiles: decimal("max_detour_miles", { precision: 5, scale: 2 }).notNull(),
  availableSeats: integer("available_seats").notNull().default(3),
  totalSeats: integer("total_seats").notNull().default(3),
  pricePerSeat: decimal("price_per_seat", { precision: 10, scale: 2 }),
  paymentTimeoutMinutes: integer("payment_timeout_minutes").default(5),
  status: varchar("status", { length: 50 }).default("active"),
  scheduleId: integer("schedule_id").references(() => recurringSchedules.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const driverRoutesRelations = relations(driverRoutes, ({ one }) => ({
  driver: one(users, {
    fields: [driverRoutes.driverId],
    references: [users.id],
  }),
}));

export const insertDriverRouteSchema = createInsertSchema(driverRoutes, {
  maxDetourMiles: z.coerce.number().min(0.01).max(100),
  availableSeats: z.coerce.number().min(1).max(7),
  totalSeats: z.coerce.number().min(1).max(7).optional(),
  pricePerSeat: z.coerce.number().min(0.01).max(100).optional().nullable(),
  paymentTimeoutMinutes: z.coerce.number().min(1).max(30).optional(),
  departureTime: z.coerce.date(),
  startLat: z.coerce.number().optional(),
  startLng: z.coerce.number().optional(),
  endLat: z.coerce.number().optional(),
  endLng: z.coerce.number().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDriverRoute = z.infer<typeof insertDriverRouteSchema>;
export type DriverRoute = typeof driverRoutes.$inferSelect;

// Rides - Accepted/completed rides
export const rides = pgTable("rides", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  driverId: varchar("driver_id").notNull().references(() => users.id),
  pickupLocation: text("pickup_location").notNull(),
  dropoffLocation: text("dropoff_location").notNull(),
  pickupLat: decimal("pickup_lat", { precision: 10, scale: 7 }),
  pickupLng: decimal("pickup_lng", { precision: 10, scale: 7 }),
  dropoffLat: decimal("dropoff_lat", { precision: 10, scale: 7 }),
  dropoffLng: decimal("dropoff_lng", { precision: 10, scale: 7 }),
  agreedPrice: decimal("agreed_price", { precision: 10, scale: 2 }).notNull(),
  scheduledTime: timestamp("scheduled_time").notNull(),
  status: varchar("status", { length: 50 }).default("pending_payment"), // pending_payment, scheduled, matched, en_route_pickup, arrived_pickup, in_progress, arrived_dropoff, completed, cancelled, cancelled_by_rider, cancelled_by_driver, cancelled_payment_timeout, expired
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending"), // pending, authorized, paid, completed, refunded, failed
  paymentIntentId: varchar("payment_intent_id", { length: 255 }), // Stripe PaymentIntent ID
  paymentDeadline: timestamp("payment_deadline"),
  stopOrder: integer("stop_order"),
  estimatedPickupTime: timestamp("estimated_pickup_time"),
  estimatedDropoffTime: timestamp("estimated_dropoff_time"),
  actualPickupTime: timestamp("actual_pickup_time"),
  actualDropoffTime: timestamp("actual_dropoff_time"),
  riderOfferId: integer("rider_offer_id").references(() => riderOffers.id),
  driverRouteId: integer("driver_route_id").references(() => driverRoutes.id),
  seatsRequested: integer("seats_requested").default(1),
  tripMessage: text("trip_message"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
  hiddenByRider: boolean("hidden_by_rider").default(false),
  hiddenByDriver: boolean("hidden_by_driver").default(false),
});

export const ridesRelations = relations(rides, ({ one }) => ({
  rider: one(users, {
    fields: [rides.riderId],
    references: [users.id],
  }),
  driver: one(users, {
    fields: [rides.driverId],
    references: [users.id],
  }),
  riderOffer: one(riderOffers, {
    fields: [rides.riderOfferId],
    references: [riderOffers.id],
  }),
  driverRoute: one(driverRoutes, {
    fields: [rides.driverRouteId],
    references: [driverRoutes.id],
  }),
}));

export const insertRideSchema = createInsertSchema(rides, {
  agreedPrice: z.coerce.number(),
  pickupLat: z.coerce.number().optional(),
  pickupLng: z.coerce.number().optional(),
  dropoffLat: z.coerce.number().optional(),
  dropoffLng: z.coerce.number().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRide = z.infer<typeof insertRideSchema>;
export type Ride = typeof rides.$inferSelect;

// Bids - Drivers can counter-offer on rider requests
export const bids = pgTable("bids", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  riderOfferId: integer("rider_offer_id").notNull().references(() => riderOffers.id),
  driverId: varchar("driver_id").notNull().references(() => users.id),
  bidPrice: decimal("bid_price", { precision: 10, scale: 2 }).notNull(),
  message: text("message"),
  status: varchar("status", { length: 50 }).default("pending"), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bidsRelations = relations(bids, ({ one }) => ({
  riderOffer: one(riderOffers, {
    fields: [bids.riderOfferId],
    references: [riderOffers.id],
  }),
  driver: one(users, {
    fields: [bids.driverId],
    references: [users.id],
  }),
}));

export const insertBidSchema = createInsertSchema(bids, {
  bidPrice: z.coerce.number(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBid = z.infer<typeof insertBidSchema>;
export type Bid = typeof bids.$inferSelect;

// Notifications - User notifications for ride updates, bids, messages
export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(), // bid_received, bid_accepted, ride_accepted, ride_cancelled, message, system
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  relatedRideId: integer("related_ride_id").references(() => rides.id),
  relatedOfferId: integer("related_offer_id").references(() => riderOffers.id),
  relatedBidId: integer("related_bid_id").references(() => bids.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  ride: one(rides, {
    fields: [notifications.relatedRideId],
    references: [rides.id],
  }),
  offer: one(riderOffers, {
    fields: [notifications.relatedOfferId],
    references: [riderOffers.id],
  }),
  bid: one(bids, {
    fields: [notifications.relatedBidId],
    references: [bids.id],
  }),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Ratings - Mutual ratings between riders and drivers
export const ratings = pgTable("ratings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  rideId: integer("ride_id").notNull().references(() => rides.id),
  raterId: varchar("rater_id").notNull().references(() => users.id),
  ratedUserId: varchar("rated_user_id").notNull().references(() => users.id),
  raterRole: varchar("rater_role", { length: 20 }).notNull(), // 'rider' or 'driver'
  rating: integer("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ratingsRelations = relations(ratings, ({ one }) => ({
  ride: one(rides, {
    fields: [ratings.rideId],
    references: [rides.id],
  }),
  rater: one(users, {
    fields: [ratings.raterId],
    references: [users.id],
  }),
  ratedUser: one(users, {
    fields: [ratings.ratedUserId],
    references: [users.id],
  }),
}));

export const insertRatingSchema = createInsertSchema(ratings, {
  rating: z.coerce.number().min(1).max(5),
}).omit({
  id: true,
  createdAt: true,
});
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratings.$inferSelect;

// Chat Messages - Real-time messaging between riders and drivers
export const chatMessages = pgTable("chat_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  rideId: integer("ride_id").notNull().references(() => rides.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  ride: one(rides, {
    fields: [chatMessages.rideId],
    references: [rides.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [chatMessages.receiverId],
    references: [users.id],
  }),
}));

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Daily driver activity tracking for private driver limits
export const driverDailyActivity = pgTable("driver_daily_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  driverId: varchar("driver_id").notNull().references(() => users.id),
  date: varchar("date").notNull(), // YYYY-MM-DD format
  ridesCount: integer("rides_count").default(0),
  totalEarnings: decimal("total_earnings", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const driverDailyActivityRelations = relations(driverDailyActivity, ({ one }) => ({
  driver: one(users, {
    fields: [driverDailyActivity.driverId],
    references: [users.id],
  }),
}));

export const insertDriverDailyActivitySchema = createInsertSchema(driverDailyActivity).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDriverDailyActivity = z.infer<typeof insertDriverDailyActivitySchema>;
export type DriverDailyActivity = typeof driverDailyActivity.$inferSelect;

// Phone Verifications - OTP verification before registration
export const phoneVerifications = pgTable("phone_verifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  otpCode: varchar("otp_code", { length: 72 }).notNull(), // bcrypt hash is 60 chars
  verificationToken: varchar("verification_token", { length: 64 }),
  status: varchar("status", { length: 20 }).default("pending"), // pending, verified, expired
  attempts: integer("attempts").default(0),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPhoneVerificationSchema = createInsertSchema(phoneVerifications).omit({
  id: true,
  createdAt: true,
});
export type InsertPhoneVerification = z.infer<typeof insertPhoneVerificationSchema>;
export type PhoneVerification = typeof phoneVerifications.$inferSelect;

// Email Verifications - OTP verification before registration
export const emailVerifications = pgTable("email_verifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull(),
  otpCode: varchar("otp_code", { length: 72 }).notNull(), // bcrypt hash is 60 chars
  verificationToken: text("verification_token"), // Changed to text for long Entra continuation tokens
  status: varchar("status", { length: 20 }).default("pending"), // pending, verified, expired
  attempts: integer("attempts").default(0),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailVerificationSchema = createInsertSchema(emailVerifications).omit({
  id: true,
  createdAt: true,
});
export type InsertEmailVerification = z.infer<typeof insertEmailVerificationSchema>;
export type EmailVerification = typeof emailVerifications.$inferSelect;

// Password Reset Tokens - for forgot password flow
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull(),
  continuationToken: text("continuation_token").notNull(), // Entra continuation token for OTP verification
  resetToken: text("reset_token"), // Secure token generated after OTP verification
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, verified, used, expired
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Route Negotiations - Riders can negotiate price on driver routes
export const routeNegotiations = pgTable("route_negotiations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  driverRouteId: integer("driver_route_id").notNull().references(() => driverRoutes.id),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  driverId: varchar("driver_id").notNull().references(() => users.id),
  seatsRequested: integer("seats_requested").default(1).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, accepted, declined, expired, cancelled
  agreedPrice: decimal("agreed_price", { precision: 10, scale: 2 }),
  lastOfferBy: varchar("last_offer_by", { length: 20 }).notNull(), // 'rider' or 'driver'
  rideId: integer("ride_id").references(() => rides.id), // Set when accepted and ride created
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const routeNegotiationsRelations = relations(routeNegotiations, ({ one, many }) => ({
  driverRoute: one(driverRoutes, {
    fields: [routeNegotiations.driverRouteId],
    references: [driverRoutes.id],
  }),
  rider: one(users, {
    fields: [routeNegotiations.riderId],
    references: [users.id],
    relationName: "negotiationRider",
  }),
  driver: one(users, {
    fields: [routeNegotiations.driverId],
    references: [users.id],
    relationName: "negotiationDriver",
  }),
  ride: one(rides, {
    fields: [routeNegotiations.rideId],
    references: [rides.id],
  }),
  offers: many(routeNegotiationOffers),
}));

export const insertRouteNegotiationSchema = createInsertSchema(routeNegotiations, {
  seatsRequested: z.coerce.number().min(1).max(7),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRouteNegotiation = z.infer<typeof insertRouteNegotiationSchema>;
export type RouteNegotiation = typeof routeNegotiations.$inferSelect;

// Route Negotiation Offers - Individual offers in a negotiation thread
export const routeNegotiationOffers = pgTable("route_negotiation_offers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  negotiationId: integer("negotiation_id").notNull().references(() => routeNegotiations.id),
  offeredByRole: varchar("offered_by_role", { length: 20 }).notNull(), // 'rider' or 'driver'
  offeredByUserId: varchar("offered_by_user_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routeNegotiationOffersRelations = relations(routeNegotiationOffers, ({ one }) => ({
  negotiation: one(routeNegotiations, {
    fields: [routeNegotiationOffers.negotiationId],
    references: [routeNegotiations.id],
  }),
  offeredBy: one(users, {
    fields: [routeNegotiationOffers.offeredByUserId],
    references: [users.id],
  }),
}));

export const insertRouteNegotiationOfferSchema = createInsertSchema(routeNegotiationOffers, {
  amount: z.coerce.number().min(0.30),
}).omit({
  id: true,
  createdAt: true,
});
export type InsertRouteNegotiationOffer = z.infer<typeof insertRouteNegotiationOfferSchema>;
export type RouteNegotiationOffer = typeof routeNegotiationOffers.$inferSelect;

// Pro Hire Negotiations - Riders can negotiate rate with Pro drivers
export const proHireNegotiations = pgTable("pro_hire_negotiations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  driverId: varchar("driver_id").notNull().references(() => users.id),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  pickupLocation: text("pickup_location").notNull(),
  dropoffLocation: text("dropoff_location").notNull(),
  pickupLat: decimal("pickup_lat", { precision: 10, scale: 7 }),
  pickupLng: decimal("pickup_lng", { precision: 10, scale: 7 }),
  dropoffLat: decimal("dropoff_lat", { precision: 10, scale: 7 }),
  dropoffLng: decimal("dropoff_lng", { precision: 10, scale: 7 }),
  estimatedDistance: decimal("estimated_distance", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, accepted, declined, expired, cancelled
  agreedPrice: decimal("agreed_price", { precision: 10, scale: 2 }),
  lastOfferBy: varchar("last_offer_by", { length: 20 }).notNull(), // 'rider' or 'driver'
  rideId: integer("ride_id").references(() => rides.id), // Set when accepted and ride created
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const proHireNegotiationsRelations = relations(proHireNegotiations, ({ one, many }) => ({
  driver: one(users, {
    fields: [proHireNegotiations.driverId],
    references: [users.id],
    relationName: "proNegotiationDriver",
  }),
  rider: one(users, {
    fields: [proHireNegotiations.riderId],
    references: [users.id],
    relationName: "proNegotiationRider",
  }),
  ride: one(rides, {
    fields: [proHireNegotiations.rideId],
    references: [rides.id],
  }),
  offers: many(proHireNegotiationOffers),
}));

export const insertProHireNegotiationSchema = createInsertSchema(proHireNegotiations, {
  pickupLat: z.coerce.number().optional(),
  pickupLng: z.coerce.number().optional(),
  dropoffLat: z.coerce.number().optional(),
  dropoffLng: z.coerce.number().optional(),
  estimatedDistance: z.coerce.number().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProHireNegotiation = z.infer<typeof insertProHireNegotiationSchema>;
export type ProHireNegotiation = typeof proHireNegotiations.$inferSelect;

// Pro Hire Negotiation Offers - Individual offers in a Pro hire negotiation thread
export const proHireNegotiationOffers = pgTable("pro_hire_negotiation_offers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  negotiationId: integer("negotiation_id").notNull().references(() => proHireNegotiations.id),
  offeredByRole: varchar("offered_by_role", { length: 20 }).notNull(), // 'rider' or 'driver'
  offeredByUserId: varchar("offered_by_user_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const proHireNegotiationOffersRelations = relations(proHireNegotiationOffers, ({ one }) => ({
  negotiation: one(proHireNegotiations, {
    fields: [proHireNegotiationOffers.negotiationId],
    references: [proHireNegotiations.id],
  }),
  offeredBy: one(users, {
    fields: [proHireNegotiationOffers.offeredByUserId],
    references: [users.id],
  }),
}));

export const insertProHireNegotiationOfferSchema = createInsertSchema(proHireNegotiationOffers, {
  amount: z.coerce.number().min(0.30),
}).omit({
  id: true,
  createdAt: true,
});
export type InsertProHireNegotiationOffer = z.infer<typeof insertProHireNegotiationOfferSchema>;
export type ProHireNegotiationOffer = typeof proHireNegotiationOffers.$inferSelect;

// ============================================================
// BUSINESS MODULE - Small Business / Fleet Management
// ============================================================

// Organizations - Business accounts that manage multiple drivers and vehicles
export const organizations = pgTable("organizations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ownerUserId: varchar("owner_user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  businessType: varchar("business_type", { length: 50 }).notNull(),
  registrationNumber: varchar("registration_number", { length: 50 }),
  vatNumber: varchar("vat_number", { length: 30 }),
  businessAddress: text("business_address"),
  businessCity: varchar("business_city", { length: 100 }),
  businessPostcode: varchar("business_postcode", { length: 15 }),
  businessPhone: varchar("business_phone", { length: 20 }),
  businessEmail: varchar("business_email", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  stripeAccountId: varchar("stripe_account_id"),
  logoUrl: varchar("logo_url"),
  description: text("description"),
  maxDrivers: integer("max_drivers").default(20),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_org_owner").on(table.ownerUserId),
  index("idx_org_status").on(table.status),
]);

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerUserId],
    references: [users.id],
  }),
  members: many(orgMembers),
  vehicles: many(orgVehicles),
  documents: many(orgDocuments),
  invitations: many(orgInvitations),
}));

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  stripeAccountId: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// Organization Members - Links drivers to businesses with roles
export const orgMembers = pgTable("org_members", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: varchar("role", { length: 20 }).notNull().default("driver"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_orgmember_org").on(table.orgId),
  index("idx_orgmember_user").on(table.userId),
  index("idx_orgmember_status").on(table.status),
]);

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [orgMembers.userId],
    references: [users.id],
  }),
}));

export const insertOrgMemberSchema = createInsertSchema(orgMembers).omit({
  id: true,
  joinedAt: true,
  updatedAt: true,
});
export type InsertOrgMember = z.infer<typeof insertOrgMemberSchema>;
export type OrgMember = typeof orgMembers.$inferSelect;

// Organization Vehicles - Vehicles owned by the business
export const orgVehicles = pgTable("org_vehicles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  assignedDriverUserId: varchar("assigned_driver_user_id").references(() => users.id),
  make: varchar("make", { length: 50 }).notNull(),
  model: varchar("model", { length: 50 }).notNull(),
  year: integer("year").notNull(),
  color: varchar("color", { length: 30 }),
  licensePlate: varchar("license_plate", { length: 20 }).notNull(),
  vehicleType: varchar("vehicle_type", { length: 30 }).default("sedan"),
  seats: integer("seats").default(4),
  insuranceExpiryDate: varchar("insurance_expiry_date"),
  motExpiryDate: varchar("mot_expiry_date"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_orgvehicle_org").on(table.orgId),
  index("idx_orgvehicle_driver").on(table.assignedDriverUserId),
  index("idx_orgvehicle_status").on(table.status),
]);

export const orgVehiclesRelations = relations(orgVehicles, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgVehicles.orgId],
    references: [organizations.id],
  }),
  assignedDriver: one(users, {
    fields: [orgVehicles.assignedDriverUserId],
    references: [users.id],
  }),
}));

export const insertOrgVehicleSchema = createInsertSchema(orgVehicles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  assignedDriverUserId: true,
  status: true,
});
export type InsertOrgVehicle = z.infer<typeof insertOrgVehicleSchema>;
export type OrgVehicle = typeof orgVehicles.$inferSelect;

// Organization Invitations - Invite drivers to join a business
export const orgInvitations = pgTable("org_invitations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("driver"),
  token: varchar("token", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  invitedByUserId: varchar("invited_by_user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_orginvite_org").on(table.orgId),
  index("idx_orginvite_email").on(table.email),
  index("idx_orginvite_token").on(table.token),
  index("idx_orginvite_status").on(table.status),
]);

export const orgInvitationsRelations = relations(orgInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgInvitations.orgId],
    references: [organizations.id],
  }),
  invitedBy: one(users, {
    fields: [orgInvitations.invitedByUserId],
    references: [users.id],
  }),
}));

export const insertOrgInvitationSchema = createInsertSchema(orgInvitations).omit({
  id: true,
  createdAt: true,
  token: true,
  status: true,
});
export type InsertOrgInvitation = z.infer<typeof insertOrgInvitationSchema>;
export type OrgInvitation = typeof orgInvitations.$inferSelect;

// Organization Documents - Business registration certificates, licenses, etc.
export const orgDocuments = pgTable("org_documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  orgId: integer("org_id").notNull().references(() => organizations.id),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  documentUrl: varchar("document_url").notNull(),
  fileName: varchar("file_name", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  uploadedByUserId: varchar("uploaded_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_orgdoc_org").on(table.orgId),
  index("idx_orgdoc_type").on(table.documentType),
]);
