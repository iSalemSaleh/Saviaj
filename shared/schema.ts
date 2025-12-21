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
  // Commercial driver rates
  ratePerMile: decimal("rate_per_mile", { precision: 5, scale: 2 }), // Rate in GBP per mile for commercial drivers
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
  totalSeats: integer("total_seats").notNull().default(3),
  pricePerSeat: decimal("price_per_seat", { precision: 10, scale: 2 }),
  paymentTimeoutMinutes: integer("payment_timeout_minutes").default(5),
  status: varchar("status", { length: 50 }).default("active"), // active, full, completed, cancelled
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
  pricePerSeat: z.coerce.number().min(1).max(100).optional().nullable(),
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
  status: varchar("status", { length: 50 }).default("pending_payment"), // pending_payment, matched, en_route_pickup, in_progress, completed, cancelled, expired
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending"), // pending, completed, refunded, failed
  paymentDeadline: timestamp("payment_deadline"),
  stopOrder: integer("stop_order"),
  estimatedPickupTime: timestamp("estimated_pickup_time"),
  estimatedDropoffTime: timestamp("estimated_dropoff_time"),
  actualPickupTime: timestamp("actual_pickup_time"),
  actualDropoffTime: timestamp("actual_dropoff_time"),
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
