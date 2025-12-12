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
  // Stats and Stripe
  rating: decimal("rating", { precision: 3, scale: 2 }),
  totalRides: integer("total_rides").default(0),
  stripeCustomerId: varchar("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

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
  status: varchar("status", { length: 50 }).default("pending"), // pending, accepted, completed, cancelled
  acceptedDriverId: varchar("accepted_driver_id").references(() => users.id),
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
  offerPrice: z.coerce.number().min(1).max(500),
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
  pricePerSeat: decimal("price_per_seat", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 50 }).default("active"), // active, completed, cancelled
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
  maxDetourMiles: z.coerce.number().min(0.5).max(20),
  availableSeats: z.coerce.number().min(1).max(7),
  pricePerSeat: z.coerce.number().min(1).max(100).optional().nullable(),
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
  status: varchar("status", { length: 50 }).default("scheduled"), // scheduled, in_progress, completed, cancelled
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending"), // pending, completed, refunded
  riderOfferId: integer("rider_offer_id").references(() => riderOffers.id),
  driverRouteId: integer("driver_route_id").references(() => driverRoutes.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
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
