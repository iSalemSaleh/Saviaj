import {
  users,
  sessions,
  riderOffers,
  driverRoutes,
  rides,
  bids,
  notifications,
  ratings,
  chatMessages,
  driverDailyActivity,
  userProfiles,
  userStats,
  driverProfiles,
  driverAvailability,
  driverCommercial,
  vehicles,
  userBankAccounts,
  driverDocuments,
  routeNegotiations,
  routeNegotiationOffers,
  proHireNegotiations,
  proHireNegotiationOffers,
  type User,
  type UpsertUser,
  type NormalizedUser,
  type RiderOffer,
  type InsertRiderOffer,
  type DriverRoute,
  type InsertDriverRoute,
  type Ride,
  type InsertRide,
  type Bid,
  type InsertBid,
  type Notification,
  type InsertNotification,
  type Rating,
  type InsertRating,
  type ChatMessage,
  type InsertChatMessage,
  type RouteNegotiation,
  type InsertRouteNegotiation,
  type RouteNegotiationOffer,
  type InsertRouteNegotiationOffer,
  type ProHireNegotiation,
  type InsertProHireNegotiation,
  type ProHireNegotiationOffer,
  type InsertProHireNegotiationOffer,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, lt, gt, or, isNotNull, ne, inArray } from "drizzle-orm";
import { pool } from "./db";

// Feature flag for dual-write to new normalized tables
const ENABLE_DUAL_WRITE = true;

// Helper to filter out undefined values from an object
function filterDefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

// Dual-write helper for user profile data - only updates provided fields
async function syncUserProfile(userId: string, data: {
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  homeAddress?: string;
  city?: string;
  postcode?: string;
}) {
  const filtered = filterDefined(data);
  if (Object.keys(filtered).length === 0) return;
  
  const existing = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  if (existing.length > 0) {
    await db.update(userProfiles)
      .set({ ...filtered, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({ userId, ...filtered } as any);
  }
}

// Dual-write helper for driver profile data
async function syncDriverProfile(userId: string, data: {
  isDriver?: boolean;
  driverVerified?: boolean;
  backgroundCheckConsent?: boolean;
  backgroundCheckStatus?: string;
}) {
  const filtered = filterDefined(data);
  if (Object.keys(filtered).length === 0) return;
  
  const existing = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId));
  if (existing.length > 0) {
    await db.update(driverProfiles)
      .set({ ...filtered, updatedAt: new Date() })
      .where(eq(driverProfiles.userId, userId));
  } else {
    await db.insert(driverProfiles).values({ userId, isDriver: data.isDriver ?? false, ...filtered } as any);
  }
}

// Dual-write helper for driver availability data
async function syncDriverAvailability(userId: string, data: {
  activeMode?: string | null;
  isAvailable?: boolean;
  isOnlineForHire?: boolean;
  currentLat?: string;
  currentLng?: string;
  lastLocationUpdate?: Date;
}) {
  const filtered = filterDefined(data);
  if (Object.keys(filtered).length === 0) return;
  
  const existing = await db.select().from(driverAvailability).where(eq(driverAvailability.userId, userId));
  if (existing.length > 0) {
    await db.update(driverAvailability)
      .set({ ...filtered, updatedAt: new Date() })
      .where(eq(driverAvailability.userId, userId));
  } else {
    await db.insert(driverAvailability).values({ userId, ...filtered } as any);
  }
}

// Dual-write helper for user stats
async function syncUserStats(userId: string, data: {
  riderRating?: string;
  driverRating?: string;
  totalRatingsAsRider?: number;
  totalRatingsAsDriver?: number;
}) {
  const filtered = filterDefined(data);
  if (Object.keys(filtered).length === 0) return;
  
  const existing = await db.select().from(userStats).where(eq(userStats.userId, userId));
  if (existing.length > 0) {
    await db.update(userStats)
      .set({ ...filtered, updatedAt: new Date() })
      .where(eq(userStats.userId, userId));
  } else {
    await db.insert(userStats).values({ userId, ...filtered } as any);
  }
}

// Dual-write helper for commercial driver data
async function syncDriverCommercial(userId: string, data: {
  isCommercialDriver?: boolean;
  commercialStatusVerified?: boolean;
  ratePerMile?: string;
  tier1MaxMiles?: string;
  tier1RatePerMile?: string;
  tier2MaxMiles?: string;
  tier2RatePerMile?: string;
  tier3RatePerMile?: string;
  baseMinimumFare?: string;
  driverTagline?: string;
  serviceCategories?: string[];
  dvlaCheckCode?: string;
}) {
  const filtered = filterDefined(data);
  if (Object.keys(filtered).length === 0) return;
  
  const existing = await db.select().from(driverCommercial).where(eq(driverCommercial.userId, userId));
  if (existing.length > 0) {
    await db.update(driverCommercial)
      .set({ ...filtered, updatedAt: new Date() })
      .where(eq(driverCommercial.userId, userId));
  } else {
    await db.insert(driverCommercial).values({ userId, isCommercialDriver: data.isCommercialDriver ?? false, ...filtered } as any);
  }
}

// ============================================
// NORMALIZED USER READ HELPERS (Phase 2)
// ============================================

// Feature flag for reading from normalized tables
const ENABLE_NORMALIZED_READS = true;

// Load NormalizedUser by ID - combines data from all normalized tables
async function getNormalizedUserById(userId: string): Promise<NormalizedUser | null> {
  // Get core user data
  const [user] = await db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    emailVerified: users.emailVerified,
    authProvider: users.authProvider,
    stripeCustomerId: users.stripeCustomerId,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId));
  
  if (!user) return null;
  
  // Load related data in parallel for efficiency
  const [profileResult, statsResult, driverProfileResult, availabilityResult, commercialResult, vehicleResult] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
    db.select().from(userStats).where(eq(userStats.userId, userId)),
    db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId)),
    db.select().from(driverAvailability).where(eq(driverAvailability.userId, userId)),
    db.select().from(driverCommercial).where(eq(driverCommercial.userId, userId)),
    db.select().from(vehicles).where(and(eq(vehicles.userId, userId), eq(vehicles.isPrimary, true))),
  ]);
  
  const profile = profileResult[0];
  const stats = statsResult[0];
  const driverProfile = driverProfileResult[0];
  const availability = availabilityResult[0];
  const commercial = commercialResult[0];
  const vehicle = vehicleResult[0];
  
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.emailVerified,
    authProvider: user.authProvider,
    stripeCustomerId: user.stripeCustomerId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    
    profile: profile ? {
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileImageUrl: profile.profileImageUrl,
      dateOfBirth: profile.dateOfBirth,
      phoneNumber: profile.phoneNumber,
      homeAddress: profile.homeAddress,
      city: profile.city,
      postcode: profile.postcode,
    } : null,
    
    stats: stats ? {
      riderRating: stats.riderRating,
      driverRating: stats.driverRating,
      totalRidesAsRider: stats.totalRidesAsRider,
      totalRidesAsDriver: stats.totalRidesAsDriver,
      totalRatingsAsRider: stats.totalRatingsAsRider,
      totalRatingsAsDriver: stats.totalRatingsAsDriver,
    } : null,
    
    driverProfile: driverProfile ? {
      isDriver: driverProfile.isDriver,
      driverVerified: driverProfile.driverVerified,
      backgroundCheckConsent: driverProfile.backgroundCheckConsent,
      backgroundCheckStatus: driverProfile.backgroundCheckStatus,
    } : null,
    
    availability: availability ? {
      activeMode: availability.activeMode,
      isAvailable: availability.isAvailable,
      isOnlineForHire: availability.isOnlineForHire,
      currentLat: availability.currentLat,
      currentLng: availability.currentLng,
      lastLocationUpdate: availability.lastLocationUpdate,
    } : null,
    
    commercial: commercial ? {
      isCommercialDriver: commercial.isCommercialDriver,
      commercialStatusVerified: commercial.commercialStatusVerified,
      ratePerMile: commercial.ratePerMile,
      tier1MaxMiles: commercial.tier1MaxMiles,
      tier1RatePerMile: commercial.tier1RatePerMile,
      tier2MaxMiles: commercial.tier2MaxMiles,
      tier2RatePerMile: commercial.tier2RatePerMile,
      tier3RatePerMile: commercial.tier3RatePerMile,
      baseMinimumFare: commercial.baseMinimumFare,
      driverTagline: commercial.driverTagline,
      serviceCategories: commercial.serviceCategories,
    } : null,
    
    vehicle: vehicle ? {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      registration: vehicle.registration,
      insuranceExpiry: vehicle.insuranceExpiry,
    } : null,
  };
}

// Individual loaders for specific data needs
async function loadUserProfile(userId: string) {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  return profile || null;
}

async function loadUserStats(userId: string) {
  const [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
  return stats || null;
}

async function loadDriverProfile(userId: string) {
  const [profile] = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId));
  return profile || null;
}

async function loadDriverAvailability(userId: string) {
  const [availability] = await db.select().from(driverAvailability).where(eq(driverAvailability.userId, userId));
  return availability || null;
}

async function loadDriverCommercial(userId: string) {
  const [commercial] = await db.select().from(driverCommercial).where(eq(driverCommercial.userId, userId));
  return commercial || null;
}

async function loadPrimaryVehicle(userId: string) {
  const [vehicle] = await db.select().from(vehicles).where(and(eq(vehicles.userId, userId), eq(vehicles.isPrimary, true)));
  return vehicle || null;
}

// ============================================
// END NORMALIZED USER READ HELPERS
// ============================================

// Haversine formula to calculate distance between two points in miles
function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calculate minimum distance from a point to a route line segment
// Uses projection onto the line segment to find the closest point
function distanceToRouteMiles(
  pointLat: number, 
  pointLon: number, 
  startLat: number, 
  startLon: number, 
  endLat: number, 
  endLon: number
): number {
  // Convert to radians for calculations
  const toRad = (deg: number) => deg * Math.PI / 180;
  
  // Calculate the projection of point onto the line segment
  // Using a simplified planar approximation for short distances
  const dx = endLon - startLon;
  const dy = endLat - startLat;
  
  // If start and end are the same point, return distance to that point
  if (dx === 0 && dy === 0) {
    return calculateDistanceMiles(pointLat, pointLon, startLat, startLon);
  }
  
  // Calculate parameter t for the projection of point onto the line
  // t = 0 means closest to start, t = 1 means closest to end
  const t = Math.max(0, Math.min(1, 
    ((pointLon - startLon) * dx + (pointLat - startLat) * dy) / (dx * dx + dy * dy)
  ));
  
  // Find the closest point on the line segment
  const closestLat = startLat + t * dy;
  const closestLon = startLon + t * dx;
  
  // Return the distance from the point to the closest point on the segment
  return calculateDistanceMiles(pointLat, pointLon, closestLat, closestLon);
}

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  // Active variants exclude soft-deleted users (deletedAt IS NULL).
  // Use these for login, signup duplicate checks, password reset, and OTP requests.
  // Use the raw getUserByEmail/getUserByUsername only when you need to find
  // soft-deleted users (e.g., admin restore, OAuth refusal of deleted accounts).
  getActiveUserByEmail(email: string): Promise<User | undefined>;
  getActiveUserByUsername(username: string): Promise<User | undefined>;
  // Frees the email slot on a soft-deleted user so a new account can be created
  // with the same address. Renames email to <email>+deleted-<id>@deleted.local.
  releaseEmailForDeletedUser(userId: string): Promise<void>;
  // Invalidates all express-session rows belonging to a user (used after password reset).
  invalidateUserSessions(userId: string): Promise<number>;
  getNormalizedUser(id: string): Promise<NormalizedUser | null>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  // Sets the Saviaj Pass ID on a user that does not yet have one.
  // No-op if `passId` is already set — pass IDs are immutable once issued.
  // Used by the new-signup flow and the backfill script.
  setUserPassIdIfMissing(userId: string, passId: string): Promise<User | undefined>;
  // Compliance helpers — each one writes a small, focused subset of the
  // user's compliance state. Routes call these instead of building
  // ad-hoc UPDATEs so we can audit everywhere a status flips.
  recordTaxAcknowledgement(userId: string): Promise<User | undefined>;
  recordDbsCertificate(userId: string, data: {
    dbsCertificateNumber: string;
    dbsCertificateIssueDate: string;
    dbsCertificateExpiry: string;
    dbsCertificateUrl: string;
    dbsUpdateServiceSubscribed?: boolean;
  }): Promise<User | undefined>;
  recordHireRewardInsurance(userId: string, data: {
    hireRewardInsuranceUrl: string;
    hireRewardInsuranceExpiry: string;
  }): Promise<User | undefined>;
  recordDvlaCheck(userId: string, status: 'pending' | 'verified' | 'failed' | 'expired'): Promise<User | undefined>;
  recordKycResult(userId: string, status: 'submitted' | 'verified' | 'failed', provider: string): Promise<User | undefined>;
  recordSanctionsScreening(userId: string, status: 'cleared' | 'flagged'): Promise<User | undefined>;
  updateUserDriverStatus(id: string, isDriver: boolean, licenseUrl?: string): Promise<User>;
  updateUserStripeCustomerId(id: string, stripeCustomerId: string): Promise<User>;
  updateUserStripeConnect(id: string, fields: {
    accountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboarded: boolean;
    requirementsDue: any;
  }): Promise<User>;
  updateUserStripeIdentity(id: string, fields: {
    sessionId?: string;
    lastAttemptAt?: Date;
    kycStatus: string;
    kycProvider?: string;
    failureReason?: string | null;
    verifiedAt?: Date | null;
  }): Promise<User>;
  createDriverPayout(payout: {
    rideId: number;
    driverId: string;
    amountPence: number;
    status: string;
    stripeTransferId?: string;
    failureReason?: string;
  }): Promise<{ id: number }>;
  getDriverPayoutsForRide(rideId: number): Promise<Array<{ id: number; status: string; stripeTransferId: string | null; amountPence: number }>>;
  getDriverPayoutById(id: number): Promise<{ id: number; rideId: number; driverId: string; status: string; stripeTransferId: string | null; amountPence: number; failureReason: string | null; createdAt: Date | null; updatedAt: Date | null } | null>;
  listDriverPayoutsForDriver(driverId: string): Promise<Array<{ id: number; rideId: number; status: string; stripeTransferId: string | null; amountPence: number; failureReason: string | null; createdAt: Date | null; updatedAt: Date | null; pickupLocation: string | null; dropoffLocation: string | null; rideCompletedAt: Date | null }>>;
  updateDriverPayoutStatus(id: number, fields: { status: string; stripeTransferId?: string; failureReason?: string | null }): Promise<void>;
  completeUserProfile(id: string, data: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    phoneNumber?: string;
    homeAddress?: string;
    city?: string;
    postcode?: string;
    isDriver: boolean;
    driverLicenseUrl?: string;
    driverLicenseNumber?: string;
    driverLicenseExpiry?: string;
    backgroundCheckConsent?: boolean;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehicleColor?: string;
    vehicleRegistration?: string;
    vehicleInsuranceExpiry?: string;
    bankAccountName?: string;
    bankSortCode?: string;
    bankAccountNumber?: string;
  }): Promise<User>;
  
  // Rider Offer operations
  createRiderOffer(offer: InsertRiderOffer): Promise<RiderOffer>;
  getRiderOffers(status?: string): Promise<RiderOffer[]>;
  getRiderOffersByUser(userId: string): Promise<RiderOffer[]>;
  getRiderOfferById(id: number): Promise<RiderOffer | undefined>;
  updateRiderOfferStatus(id: number, status: string, driverId?: string): Promise<RiderOffer>;
  updateRiderOfferPrice(id: number, offerPrice: number): Promise<RiderOffer>;
  
  // Driver Route operations
  createDriverRoute(route: InsertDriverRoute): Promise<DriverRoute>;
  getDriverRoutes(status?: string): Promise<DriverRoute[]>;
  getDriverRoutesByUser(userId: string): Promise<DriverRoute[]>;
  getDriverRoutesWithDriverInfo(status?: string, riderLat?: number, riderLng?: number): Promise<Array<DriverRoute & {
    driver: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      driverRating: string | null;
      totalRatingsAsDriver: number | null;
      vehicleMake: string | null;
      vehicleModel: string | null;
      vehicleYear: string | null;
      vehicleColor: string | null;
      vehicleRegistration: string | null;
      driverVerified: boolean | null;
    };
    distanceToRider?: number;
  }>>;
  getDriverRouteById(id: number): Promise<DriverRoute | undefined>;
  updateDriverRouteStatus(id: number, status: string): Promise<DriverRoute>;
  
  // Ride operations
  createRide(ride: InsertRide): Promise<Ride>;
  getRidesByUserId(userId: string): Promise<Ride[]>;
  getRideById(id: number): Promise<Ride | undefined>;
  updateRideStatus(id: number, status: string): Promise<Ride>;
  updateRide(id: number, updates: Partial<{ status: string; paymentStatus: string; paymentIntentId: string }>): Promise<Ride>;
  
  // Bid operations
  createBid(bid: InsertBid): Promise<Bid>;
  getBidsByOfferId(offerId: number): Promise<Bid[]>;
  getBidsByDriverId(driverId: string): Promise<Bid[]>;
  getBidsWithOffersByDriverId(driverId: string): Promise<Array<{
    bid: Bid;
    offer: RiderOffer | null;
    rider: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; riderRating: string | null } | null;
  }>>;
  updateBidStatus(id: number, status: string): Promise<Bid>;
  claimRouteFlatFee(args: { driverRouteId: number; rideId: number; feePence: number }): Promise<boolean>;
  resetRideFeeToZero(rideId: number): Promise<void>;
  clearRouteFeeClaim(driverRouteId: number): Promise<void>;
  findEarliestPaidSiblingOwingRouteFee(driverRouteId: number, excludeRideId: number): Promise<{ id: number; agreedPrice: string } | undefined>;
  setRideFeeFields(rideId: number, fields: { platformFeePence: number; driverPayoutPence: number; feeBasis: string; feeCalculationVersion: string }): Promise<void>;
  acceptBidWithTransaction(
    bidId: number,
    paymentIntentId: string,
    feeFields: {
      platformFeePence: number;
      driverPayoutPence: number;
      feeCalculationVersion: string;
      feeBasis: string;
    },
  ): Promise<{
    bid: Bid;
    ride: Ride;
    offer: RiderOffer;
  }>;
  
  // Notification operations
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number, userId: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  
  // User availability operations
  updateUserAvailability(id: string, activeMode: string | null, isAvailable: boolean, lat?: number, lng?: number): Promise<User>;
  getAvailableDrivers(): Promise<User[]>;
  getActiveRiders(): Promise<User[]>;
  
  // Rating operations
  createRating(rating: InsertRating): Promise<Rating>;
  getRatingsByRideId(rideId: number): Promise<Rating[]>;
  getRatingsForUser(userId: string): Promise<Rating[]>;
  hasUserRatedRide(rideId: number, raterId: string): Promise<boolean>;
  updateUserRating(userId: string, role: 'rider' | 'driver'): Promise<User>;
  
  // Enhanced ride operations
  updateRidePaymentStatus(id: number, status: string): Promise<Ride>;
  updateRidePaymentIntent(id: number, paymentIntentId: string): Promise<Ride>;
  getRideByPaymentIntentId(paymentIntentId: string): Promise<Ride | undefined>;
  getExpiredPendingPayments(): Promise<Ride[]>;
  getStalePendingPaymentRides(cutoffTime: Date): Promise<Ride[]>;
  getExpiredScheduledRides(): Promise<Ride[]>;
  clearUserHistory(userId: string): Promise<void>;
  getRidesByRouteId(routeId: number): Promise<Ride[]>;
  decrementRouteSeats(routeId: number): Promise<DriverRoute>;
  incrementRouteSeats(routeId: number): Promise<DriverRoute>;
  
  // Chat operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessagesByRide(rideId: number): Promise<ChatMessage[]>;
  markMessagesAsRead(rideId: number, receiverId: string): Promise<void>;
  getUnreadMessageCount(userId: string): Promise<number>;
  
  // Driver daily activity (for private driver limits)
  getDriverDailyActivity(driverId: string, date: string): Promise<{ ridesCount: number; totalEarnings: number } | null>;
  incrementDriverDailyActivity(driverId: string, date: string, earnings: number): Promise<void>;
  
  // Commercial driver availability operations
  getOnlineCommercialDrivers(lat: number, lng: number, maxDistanceMiles: number): Promise<Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    driverRating: string | null;
    totalRatingsAsDriver: number | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: string | null;
    vehicleColor: string | null;
    vehicleRegistration: string | null;
    ratePerMile: string | null;
    tier1MaxMiles: string | null;
    tier1RatePerMile: string | null;
    tier2MaxMiles: string | null;
    tier2RatePerMile: string | null;
    tier3RatePerMile: string | null;
    baseMinimumFare: string | null;
    distanceFromPickup: number;
    currentLat: string | null;
    currentLng: string | null;
  }>>;
  updateDriverOnlineStatus(id: string, isOnlineForHire: boolean, ratePerMile?: number, driverTagline?: string, lat?: number, lng?: number, serviceCategories?: string[], tierRates?: { tier1MaxMiles?: number; tier1RatePerMile?: number; tier2MaxMiles?: number; tier2RatePerMile?: number; tier3RatePerMile?: number; baseMinimumFare?: number }): Promise<User>;
  
  // Settings and account management operations
  updateUserProfile(id: string, data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    homeAddress?: string;
    city?: string;
    postcode?: string;
    profileImageUrl?: string;
  }): Promise<User>;
  updateUserPassword(id: string, newPasswordHash: string): Promise<User>;
  softDeleteUser(id: string, reason?: string, deletedBy?: string): Promise<User>;
  restoreUser(id: string): Promise<User>;
  getDeletedUsers(): Promise<User[]>;
  verifyUserPassword(id: string, passwordHash: string): Promise<boolean>;
  
  // Route Negotiation operations
  createRouteNegotiation(data: InsertRouteNegotiation): Promise<RouteNegotiation>;
  getRouteNegotiationById(id: number): Promise<RouteNegotiation | undefined>;
  getRouteNegotiationsByUser(userId: string): Promise<RouteNegotiation[]>;
  getRouteNegotiationsByRoute(routeId: number): Promise<RouteNegotiation[]>;
  updateRouteNegotiation(id: number, data: Partial<RouteNegotiation>): Promise<RouteNegotiation>;
  createRouteNegotiationOffer(data: InsertRouteNegotiationOffer): Promise<RouteNegotiationOffer>;
  getRouteNegotiationOffers(negotiationId: number): Promise<RouteNegotiationOffer[]>;
  getLatestRouteNegotiationOffer(negotiationId: number): Promise<RouteNegotiationOffer | undefined>;
  
  // Pro Hire Negotiation operations
  createProHireNegotiation(data: InsertProHireNegotiation): Promise<ProHireNegotiation>;
  getProHireNegotiationById(id: number): Promise<ProHireNegotiation | undefined>;
  getProHireNegotiationsByUser(userId: string): Promise<ProHireNegotiation[]>;
  updateProHireNegotiation(id: number, data: Partial<ProHireNegotiation>): Promise<ProHireNegotiation>;
  createProHireNegotiationOffer(data: InsertProHireNegotiationOffer): Promise<ProHireNegotiationOffer>;
  getProHireNegotiationOffers(negotiationId: number): Promise<ProHireNegotiationOffer[]>;
  getLatestProHireNegotiationOffer(negotiationId: number): Promise<ProHireNegotiationOffer | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`);
    return user;
  }

  async getActiveUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail} AND ${users.deletedAt} IS NULL`);
    return user;
  }

  async getActiveUserByUsername(username: string): Promise<User | undefined> {
    const normalizedUsername = username.toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${normalizedUsername} AND ${users.deletedAt} IS NULL`);
    return user;
  }

  async releaseEmailForDeletedUser(userId: string): Promise<void> {
    // Append a unique suffix to the email so the original address is free
    // for a brand-new account. The username column is varchar(30) and the
    // raw suffix is ~24 chars on its own, so we NULL out the username
    // instead of trying to keep it (it has a UNIQUE constraint, and a NULL
    // username is allowed by Postgres uniqueness rules — multiple soft-
    // deleted shells can coexist with NULL usernames). The original handle
    // becomes available for a fresh signup.
    const emailSuffix = `+deleted-${userId.slice(0, 8)}-${Date.now()}`;
    await db.execute(sql`
      UPDATE ${users}
      SET email = CASE
            WHEN email IS NULL THEN NULL
            ELSE split_part(email, '@', 1) || ${emailSuffix} || '@deleted.local'
          END,
          username = NULL
      WHERE id = ${userId} AND ${users.deletedAt} IS NOT NULL
    `);
  }

  async invalidateUserSessions(userId: string): Promise<number> {
    // express-session JSON shape varies by auth flow:
    //   - localAuth login:        sess.userId = "<id>"
    //   - Replit Auth (direct):   sess.user.claims.sub = "<id>"
    //   - Passport + Replit Auth: sess.passport.user.claims.sub = "<id>"
    //   - Passport + local user:  sess.passport.user.id = "<id>" (since
    //                             serializeUser is the identity function)
    // Wipe every shape that could carry this user's id so password-reset
    // and account-deletion fully sign the user out everywhere.
    const result = await db.execute(sql`
      DELETE FROM ${sessions}
      WHERE sess->>'userId' = ${userId}
         OR sess->'user'->'claims'->>'sub' = ${userId}
         OR sess->'user'->>'id' = ${userId}
         OR sess->'passport'->'user'->'claims'->>'sub' = ${userId}
         OR sess->'passport'->'user'->>'id' = ${userId}
         OR sess->'passport'->>'user' = ${userId}
    `);
    return (result as any).rowCount ?? 0;
  }
  
  async getNormalizedUser(id: string): Promise<NormalizedUser | null> {
    return getNormalizedUserById(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const normalizedUsername = username.toLowerCase();
    const [user] = await db.select().from(users).where(sql`lower(${users.username}) = ${normalizedUsername}`);
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    
    // Dual-write to normalized tables using safe helpers
    if (ENABLE_DUAL_WRITE) {
      await syncUserProfile(user.id, {
        firstName: userData.firstName ?? undefined,
        lastName: userData.lastName ?? undefined,
        profileImageUrl: userData.profileImageUrl ?? undefined,
        dateOfBirth: userData.dateOfBirth ?? undefined,
        phoneNumber: userData.phoneNumber ?? undefined,
        homeAddress: userData.homeAddress ?? undefined,
        city: userData.city ?? undefined,
        postcode: userData.postcode ?? undefined,
      });
    }
    
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    // Dual-write to normalized tables using safe helpers
    if (ENABLE_DUAL_WRITE) {
      await syncUserProfile(user.id, {
        firstName: userData.firstName ?? undefined,
        lastName: userData.lastName ?? undefined,
        profileImageUrl: userData.profileImageUrl ?? undefined,
        dateOfBirth: userData.dateOfBirth ?? undefined,
        phoneNumber: userData.phoneNumber ?? undefined,
        homeAddress: userData.homeAddress ?? undefined,
        city: userData.city ?? undefined,
        postcode: userData.postcode ?? undefined,
      });
    }
    
    return user;
  }

  async setUserPassIdIfMissing(userId: string, passId: string): Promise<User | undefined> {
    // Conditional update: only writes the passId when the column is still
    // NULL. This protects against a race where two concurrent requests both
    // try to issue a pass ID for the same user (the second update simply
    // returns no rows and we discard it).
    const [user] = await db
      .update(users)
      .set({ passId, updatedAt: new Date() })
      .where(sql`${users.id} = ${userId} AND ${users.passId} IS NULL`)
      .returning();
    return user;
  }

  // -----------------------------------------------------------
  // Compliance helpers. Every status flip below also bumps
  // updatedAt so cache invalidation in the FE works for free.
  // -----------------------------------------------------------

  async recordTaxAcknowledgement(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        taxSelfEmploymentAcknowledged: true,
        taxAcknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async recordDbsCertificate(userId: string, data: {
    dbsCertificateNumber: string;
    dbsCertificateIssueDate: string;
    dbsCertificateExpiry: string;
    dbsCertificateUrl: string;
    dbsUpdateServiceSubscribed?: boolean;
  }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        dbsCertificateNumber: data.dbsCertificateNumber,
        dbsCertificateIssueDate: data.dbsCertificateIssueDate,
        dbsCertificateExpiry: data.dbsCertificateExpiry,
        dbsCertificateUrl: data.dbsCertificateUrl,
        dbsUpdateServiceSubscribed: data.dbsUpdateServiceSubscribed ?? false,
        // Submitting a DBS cert flips background-check status to "submitted"
        // even though we still need a human / API verification step before
        // it counts as "approved". This keeps the booking layer pessimistic.
        backgroundCheckStatus: 'submitted',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async recordHireRewardInsurance(userId: string, data: {
    hireRewardInsuranceUrl: string;
    hireRewardInsuranceExpiry: string;
  }): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        hireRewardInsuranceUrl: data.hireRewardInsuranceUrl,
        hireRewardInsuranceExpiry: data.hireRewardInsuranceExpiry,
        // Verification is a separate admin / underwriter step; uploading
        // the document just registers it for review.
        hireRewardInsuranceVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async recordDvlaCheck(userId: string, status: 'pending' | 'verified' | 'failed' | 'expired'): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        dvlaCheckStatus: status,
        dvlaLastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async recordKycResult(userId: string, status: 'submitted' | 'verified' | 'failed', provider: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        kycStatus: status,
        kycProvider: provider,
        kycVerifiedAt: status === 'verified' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async recordSanctionsScreening(userId: string, status: 'cleared' | 'flagged'): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({
        sanctionsScreeningStatus: status,
        sanctionsScreenedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserDriverStatus(id: string, isDriver: boolean, licenseUrl?: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        isDriver,
        driverLicenseUrl: licenseUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    
    // Dual-write to normalized tables using safe helpers
    if (ENABLE_DUAL_WRITE) {
      await syncDriverProfile(id, { isDriver });
      
      // Create driver availability entry if becoming a driver
      if (isDriver) {
        await syncDriverAvailability(id, { isAvailable: false, isOnlineForHire: false });
      }
    }
    
    return user;
  }

  async updateUserStripeCustomerId(id: string, stripeCustomerId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserStripeConnect(id: string, fields: {
    accountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboarded: boolean;
    requirementsDue: any;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeConnectAccountId: fields.accountId,
        stripeConnectChargesEnabled: fields.chargesEnabled,
        stripeConnectPayoutsEnabled: fields.payoutsEnabled,
        stripeConnectOnboarded: fields.onboarded,
        stripeConnectRequirementsDue: fields.requirementsDue,
        stripeConnectUpdatedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserStripeIdentity(id: string, fields: {
    sessionId?: string;
    lastAttemptAt?: Date;
    kycStatus: string;
    kycProvider?: string;
    failureReason?: string | null;
    verifiedAt?: Date | null;
  }): Promise<User> {
    const updates: any = {
      kycStatus: fields.kycStatus,
      updatedAt: new Date(),
    };
    if (fields.sessionId !== undefined) updates.stripeIdentitySessionId = fields.sessionId;
    if (fields.lastAttemptAt !== undefined) updates.stripeIdentityLastAttemptAt = fields.lastAttemptAt;
    if (fields.kycProvider !== undefined) updates.kycProvider = fields.kycProvider;
    if (fields.failureReason !== undefined) updates.stripeIdentityFailureReason = fields.failureReason;
    if (fields.verifiedAt !== undefined) updates.kycVerifiedAt = fields.verifiedAt;
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createDriverPayout(payout: {
    rideId: number;
    driverId: string;
    amountPence: number;
    status: string;
    stripeTransferId?: string;
    failureReason?: string;
  }): Promise<{ id: number }> {
    const res = await db.execute(sql`
      INSERT INTO driver_payouts (
        ride_id, driver_id, amount_pence, status,
        stripe_transfer_id, failure_reason, created_at, updated_at
      ) VALUES (
        ${payout.rideId}, ${payout.driverId}, ${payout.amountPence}, ${payout.status},
        ${payout.stripeTransferId ?? null}, ${payout.failureReason ?? null},
        NOW(), NOW()
      ) RETURNING id
    `);
    return { id: (res.rows[0] as any).id as number };
  }

  async getDriverPayoutsForRide(rideId: number): Promise<Array<{ id: number; status: string; stripeTransferId: string | null; amountPence: number }>> {
    const res = await db.execute(sql`
      SELECT id, status, stripe_transfer_id AS "stripeTransferId", amount_pence AS "amountPence"
      FROM driver_payouts WHERE ride_id = ${rideId}
    `);
    return res.rows as any;
  }

  async updateDriverPayoutStatus(id: number, fields: { status: string; stripeTransferId?: string; failureReason?: string | null }): Promise<void> {
    // Note: failure_reason uses COALESCE with NULL-as-keep semantics ONLY
    // when the caller passes undefined. An explicit `null` is a request
    // to clear the reason (used on a successful retry); we encode that
    // with a sentinel-string check via `clear_failure_reason`.
    const clearReason = fields.failureReason === null;
    await db.execute(sql`
      UPDATE driver_payouts
      SET status = ${fields.status},
          stripe_transfer_id = COALESCE(${fields.stripeTransferId ?? null}, stripe_transfer_id),
          failure_reason = CASE
            WHEN ${clearReason} THEN NULL
            ELSE COALESCE(${fields.failureReason ?? null}, failure_reason)
          END,
          updated_at = NOW()
      WHERE id = ${id}
    `);
  }

  async getDriverPayoutById(id: number) {
    const res = await db.execute(sql`
      SELECT id,
             ride_id            AS "rideId",
             driver_id          AS "driverId",
             status,
             stripe_transfer_id AS "stripeTransferId",
             amount_pence       AS "amountPence",
             failure_reason     AS "failureReason",
             created_at         AS "createdAt",
             updated_at         AS "updatedAt"
      FROM driver_payouts WHERE id = ${id}
    `);
    return (res.rows[0] as any) ?? null;
  }

  async listDriverPayoutsForDriver(driverId: string) {
    const res = await db.execute(sql`
      SELECT p.id,
             p.ride_id            AS "rideId",
             p.status,
             p.stripe_transfer_id AS "stripeTransferId",
             p.amount_pence       AS "amountPence",
             p.failure_reason     AS "failureReason",
             p.created_at         AS "createdAt",
             p.updated_at         AS "updatedAt",
             r.pickup_location    AS "pickupLocation",
             r.dropoff_location   AS "dropoffLocation",
             r.completed_at       AS "rideCompletedAt"
      FROM driver_payouts p
      LEFT JOIN rides r ON r.id = p.ride_id
      WHERE p.driver_id = ${driverId}
      ORDER BY p.created_at DESC
      LIMIT 200
    `);
    return res.rows as any;
  }

  async completeUserProfile(id: string, data: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    phoneNumber?: string;
    homeAddress?: string;
    city?: string;
    postcode?: string;
    isDriver: boolean;
    driverLicenseUrl?: string;
    driverLicenseNumber?: string;
    driverLicenseExpiry?: string;
    backgroundCheckConsent?: boolean;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehicleColor?: string;
    vehicleRegistration?: string;
    vehicleInsuranceExpiry?: string;
    bankAccountName?: string;
    bankSortCode?: string;
    bankAccountNumber?: string;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        phoneNumber: data.phoneNumber,
        homeAddress: data.homeAddress,
        city: data.city,
        postcode: data.postcode,
        isDriver: data.isDriver,
        driverLicenseUrl: data.driverLicenseUrl,
        driverLicenseNumber: data.driverLicenseNumber,
        driverLicenseExpiry: data.driverLicenseExpiry,
        backgroundCheckConsent: data.backgroundCheckConsent,
        backgroundCheckStatus: data.backgroundCheckConsent ? 'pending' : null,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        vehicleColor: data.vehicleColor,
        vehicleRegistration: data.vehicleRegistration,
        vehicleInsuranceExpiry: data.vehicleInsuranceExpiry,
        bankAccountName: data.bankAccountName,
        bankSortCode: data.bankSortCode,
        bankAccountNumber: data.bankAccountNumber,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    
    // Dual-write to normalized tables using safe helpers
    if (ENABLE_DUAL_WRITE) {
      await syncUserProfile(id, {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        phoneNumber: data.phoneNumber,
        homeAddress: data.homeAddress,
        city: data.city,
        postcode: data.postcode,
      });
      
      if (data.isDriver) {
        await syncDriverProfile(id, {
          isDriver: data.isDriver,
          backgroundCheckConsent: data.backgroundCheckConsent,
          backgroundCheckStatus: data.backgroundCheckConsent ? 'pending' : undefined,
        });
        await syncDriverAvailability(id, { isAvailable: false, isOnlineForHire: false });
      }
      
      // Sync vehicle data if provided
      if (data.vehicleMake || data.vehicleRegistration) {
        const existingVehicle = await db.select().from(vehicles).where(eq(vehicles.userId, id));
        if (existingVehicle.length > 0) {
          await db.update(vehicles)
            .set({
              make: data.vehicleMake,
              model: data.vehicleModel,
              year: data.vehicleYear,
              color: data.vehicleColor,
              registration: data.vehicleRegistration,
              insuranceExpiry: data.vehicleInsuranceExpiry,
              updatedAt: new Date(),
            })
            .where(eq(vehicles.userId, id));
        } else {
          await db.insert(vehicles).values({
            userId: id,
            make: data.vehicleMake,
            model: data.vehicleModel,
            year: data.vehicleYear,
            color: data.vehicleColor,
            registration: data.vehicleRegistration,
            insuranceExpiry: data.vehicleInsuranceExpiry,
            isPrimary: true,
          });
        }
      }
      
      // Sync bank account data if provided
      if (data.bankAccountName || data.bankAccountNumber) {
        const existingBank = await db.select().from(userBankAccounts).where(eq(userBankAccounts.userId, id));
        if (existingBank.length > 0) {
          await db.update(userBankAccounts)
            .set({
              accountName: data.bankAccountName,
              sortCode: data.bankSortCode,
              accountNumber: data.bankAccountNumber,
              updatedAt: new Date(),
            })
            .where(eq(userBankAccounts.userId, id));
        } else {
          await db.insert(userBankAccounts).values({
            userId: id,
            accountName: data.bankAccountName,
            sortCode: data.bankSortCode,
            accountNumber: data.bankAccountNumber,
          });
        }
      }
    }
    
    return user;
  }

  // Rider Offer operations
  async createRiderOffer(offer: InsertRiderOffer): Promise<RiderOffer> {
    const [riderOffer] = await db
      .insert(riderOffers)
      .values(offer as any)
      .returning();
    return riderOffer;
  }

  async getRiderOffers(status?: string): Promise<RiderOffer[]> {
    if (status) {
      return await db
        .select()
        .from(riderOffers)
        .where(eq(riderOffers.status, status))
        .orderBy(desc(riderOffers.createdAt));
    }
    return await db
      .select()
      .from(riderOffers)
      .orderBy(desc(riderOffers.createdAt));
  }

  async getRiderOffersByUser(userId: string): Promise<RiderOffer[]> {
    return await db
      .select()
      .from(riderOffers)
      .where(eq(riderOffers.riderId, userId))
      .orderBy(desc(riderOffers.createdAt));
  }

  async getRiderOfferById(id: number): Promise<RiderOffer | undefined> {
    const [offer] = await db
      .select()
      .from(riderOffers)
      .where(eq(riderOffers.id, id));
    return offer;
  }

  async updateRiderOfferStatus(id: number, status: string, driverId?: string): Promise<RiderOffer> {
    const [offer] = await db
      .update(riderOffers)
      .set({
        status,
        acceptedDriverId: driverId,
        updatedAt: new Date(),
      })
      .where(eq(riderOffers.id, id))
      .returning();
    return offer;
  }

  async updateRiderOfferPrice(id: number, offerPrice: number): Promise<RiderOffer> {
    const [offer] = await db
      .update(riderOffers)
      .set({
        offerPrice: offerPrice.toString(),
        updatedAt: new Date(),
      })
      .where(eq(riderOffers.id, id))
      .returning();
    return offer;
  }

  // Driver Route operations
  async createDriverRoute(route: InsertDriverRoute): Promise<DriverRoute> {
    const [driverRoute] = await db
      .insert(driverRoutes)
      .values(route as any)
      .returning();
    return driverRoute;
  }

  async getDriverRoutes(status?: string): Promise<DriverRoute[]> {
    if (status) {
      return await db
        .select()
        .from(driverRoutes)
        .where(eq(driverRoutes.status, status))
        .orderBy(desc(driverRoutes.createdAt));
    }
    return await db
      .select()
      .from(driverRoutes)
      .orderBy(desc(driverRoutes.createdAt));
  }

  async getDriverRoutesByUser(userId: string): Promise<DriverRoute[]> {
    return await db
      .select()
      .from(driverRoutes)
      .where(eq(driverRoutes.driverId, userId))
      .orderBy(desc(driverRoutes.createdAt));
  }

  async getDriverRoutesWithDriverInfo(status?: string, riderLat?: number, riderLng?: number): Promise<Array<DriverRoute & {
    driver: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      driverRating: string | null;
      totalRatingsAsDriver: number | null;
      vehicleMake: string | null;
      vehicleModel: string | null;
      vehicleYear: string | null;
      vehicleColor: string | null;
      vehicleRegistration: string | null;
      driverVerified: boolean | null;
    };
    distanceToRider?: number;
  }>> {
    const query = db
      .select({
        route: driverRoutes,
        driver: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          driverRating: users.driverRating,
          totalRatingsAsDriver: users.totalRatingsAsDriver,
          vehicleMake: users.vehicleMake,
          vehicleModel: users.vehicleModel,
          vehicleYear: users.vehicleYear,
          vehicleColor: users.vehicleColor,
          vehicleRegistration: users.vehicleRegistration,
          driverVerified: users.driverVerified,
        }
      })
      .from(driverRoutes)
      .innerJoin(users, eq(driverRoutes.driverId, users.id));
    
    let results;
    if (status) {
      results = await query
        .where(eq(driverRoutes.status, status))
        .orderBy(desc(driverRoutes.createdAt));
    } else {
      results = await query.orderBy(desc(driverRoutes.createdAt));
    }
    
    // If rider location is provided, calculate distance and filter routes based on proximity
    if (riderLat !== undefined && riderLng !== undefined) {
      const routesWithDistance = results.map(r => {
        const routeStartLat = parseFloat(r.route.startLat?.toString() || "0");
        const routeStartLng = parseFloat(r.route.startLng?.toString() || "0");
        const routeEndLat = parseFloat(r.route.endLat?.toString() || "0");
        const routeEndLng = parseFloat(r.route.endLng?.toString() || "0");
        const maxDetour = parseFloat(r.route.maxDetourMiles?.toString() || "5"); // Default 5 miles if not set
        
        // Skip distance calculation if route has invalid coordinates
        if (routeStartLat === 0 && routeStartLng === 0) {
          return {
            ...r.route,
            driver: r.driver,
            distanceToRider: undefined
          };
        }
        
        // Calculate distance from rider's pickup to the route (in miles)
        const distanceToRoute = distanceToRouteMiles(
          riderLat, 
          riderLng, 
          routeStartLat, 
          routeStartLng, 
          routeEndLat, 
          routeEndLng
        );
        
        return {
          ...r.route,
          driver: r.driver,
          distanceToRider: Math.round(distanceToRoute * 1000) / 1000 // Keep 3 decimal places for better precision
        };
      });
      
      // Filter: only show routes where rider is within driver's max detour radius
      const filteredRoutes = routesWithDistance.filter(route => {
        // Include routes without valid coordinates (let frontend decide)
        if (route.distanceToRider === undefined) return true;
        const maxDetour = parseFloat(route.maxDetourMiles?.toString() || "5");
        return route.distanceToRider <= maxDetour;
      });
      
      // Sort by distance (closest first)
      return filteredRoutes.sort((a, b) => (a.distanceToRider || 999) - (b.distanceToRider || 999));
    }
    
    return results.map(r => ({
      ...r.route,
      driver: r.driver
    }));
  }

  async getDriverRouteById(id: number): Promise<DriverRoute | undefined> {
    const [route] = await db
      .select()
      .from(driverRoutes)
      .where(eq(driverRoutes.id, id));
    return route;
  }

  async updateDriverRouteStatus(id: number, status: string): Promise<DriverRoute> {
    const [route] = await db
      .update(driverRoutes)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(driverRoutes.id, id))
      .returning();
    return route;
  }

  // Ride operations
  async createRide(ride: InsertRide): Promise<Ride> {
    console.log('[DEBUG createRide] Input coordinates:', {
      pickupLat: ride.pickupLat,
      pickupLng: ride.pickupLng,
      dropoffLat: ride.dropoffLat,
      dropoffLng: ride.dropoffLng,
      pickupLocation: ride.pickupLocation,
      dropoffLocation: ride.dropoffLocation,
    });
    const [newRide] = await db
      .insert(rides)
      .values(ride as any)
      .returning();
    console.log('[DEBUG createRide] Stored ride coordinates:', {
      id: newRide.id,
      pickupLat: newRide.pickupLat,
      pickupLng: newRide.pickupLng,
      dropoffLat: newRide.dropoffLat,
      dropoffLng: newRide.dropoffLng,
    });
    return newRide;
  }

  async getRidesByUserId(userId: string): Promise<Ride[]> {
    return await db
      .select()
      .from(rides)
      .where(
        sql`${rides.riderId} = ${userId} OR ${rides.driverId} = ${userId}`
      )
      .orderBy(desc(rides.createdAt));
  }

  async getRideById(id: number): Promise<Ride | undefined> {
    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, id));
    return ride;
  }

  async updateRideStatus(id: number, status: string): Promise<Ride> {
    const [ride] = await db
      .update(rides)
      .set({
        status,
        updatedAt: new Date(),
        ...(status === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(rides.id, id))
      .returning();
    return ride;
  }

  async claimRouteFlatFee(args: { driverRouteId: number; rideId: number; feePence: number }): Promise<boolean> {
    // Atomic claim: only the first ride to update this route wins the
    // £1.50 fee assignment. Subsequent concurrent attempts get 0 rows
    // updated, signalling they should reset their own ride fee to 0.
    const res = await db.execute(sql`
      UPDATE driver_routes
      SET platform_fee_collected_for_ride_id = ${args.rideId},
          platform_fee_collected_pence = ${args.feePence},
          updated_at = NOW()
      WHERE id = ${args.driverRouteId}
        AND platform_fee_collected_for_ride_id IS NULL
    `);
    return (res.rowCount ?? 0) > 0;
  }

  async resetRideFeeToZero(rideId: number): Promise<void> {
    // Used when we lost a race for the casual-route flat-fee claim:
    // bump our ride's fee to 0 and refund the driver payout to the
    // full ride price. feeBasis becomes "casual_route_subsequent".
    await db.execute(sql`
      UPDATE rides
      SET platform_fee_pence = 0,
          driver_payout_pence = ROUND(agreed_price * 100)::int,
          fee_basis = 'casual_route_subsequent',
          updated_at = NOW()
      WHERE id = ${rideId}
    `);
  }

  async clearRouteFeeClaim(driverRouteId: number): Promise<void> {
    await db.execute(sql`
      UPDATE driver_routes
      SET platform_fee_collected_for_ride_id = NULL,
          platform_fee_collected_pence = 0,
          updated_at = NOW()
      WHERE id = ${driverRouteId}
    `);
  }

  async findEarliestPaidSiblingOwingRouteFee(
    driverRouteId: number,
    excludeRideId: number,
  ): Promise<{ id: number; agreedPrice: string } | undefined> {
    const res = await db.execute(sql`
      SELECT id, agreed_price AS "agreedPrice"
      FROM rides
      WHERE driver_route_id = ${driverRouteId}
        AND id <> ${excludeRideId}
        AND payment_status = 'paid'
        AND fee_basis = 'casual_route_subsequent'
        AND status NOT IN ('cancelled', 'cancelled_by_rider', 'cancelled_by_driver')
      ORDER BY created_at ASC
      LIMIT 1
    `);
    const row = res.rows[0] as any;
    return row ? { id: row.id, agreedPrice: row.agreedPrice } : undefined;
  }

  async setRideFeeFields(
    rideId: number,
    fields: { platformFeePence: number; driverPayoutPence: number; feeBasis: string; feeCalculationVersion: string },
  ): Promise<void> {
    await db.execute(sql`
      UPDATE rides
      SET platform_fee_pence = ${fields.platformFeePence},
          driver_payout_pence = ${fields.driverPayoutPence},
          fee_basis = ${fields.feeBasis},
          fee_calculation_version = ${fields.feeCalculationVersion},
          updated_at = NOW()
      WHERE id = ${rideId}
    `);
  }

  async updateRide(id: number, updates: Partial<{ status: string; paymentStatus: string; paymentIntentId: string }>): Promise<Ride> {
    const [ride] = await db
      .update(rides)
      .set({
        ...updates,
        updatedAt: new Date(),
        ...(updates.status === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(rides.id, id))
      .returning();
    return ride;
  }

  // Bid operations
  async createBid(bid: InsertBid): Promise<Bid> {
    const [newBid] = await db
      .insert(bids)
      .values(bid as any)
      .returning();
    return newBid;
  }

  async getBidById(id: number): Promise<Bid | undefined> {
    const [bid] = await db
      .select()
      .from(bids)
      .where(eq(bids.id, id));
    return bid;
  }

  async getBidsByOfferId(offerId: number): Promise<Bid[]> {
    return await db
      .select()
      .from(bids)
      .where(eq(bids.riderOfferId, offerId))
      .orderBy(desc(bids.createdAt));
  }

  async getBidsByDriverId(driverId: string): Promise<Bid[]> {
    return await db
      .select()
      .from(bids)
      .where(eq(bids.driverId, driverId))
      .orderBy(desc(bids.createdAt));
  }

  async getBidsWithOffersByDriverId(driverId: string): Promise<Array<{
    bid: Bid;
    offer: RiderOffer | null;
    rider: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null; riderRating: string | null } | null;
  }>> {
    const result = await db
      .select({
        bid: bids,
        offer: riderOffers,
        rider: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          riderRating: users.riderRating,
        }
      })
      .from(bids)
      .leftJoin(riderOffers, eq(bids.riderOfferId, riderOffers.id))
      .leftJoin(users, eq(riderOffers.riderId, users.id))
      .where(eq(bids.driverId, driverId))
      .orderBy(desc(bids.createdAt));
    return result;
  }

  async updateBidStatus(id: number, status: string): Promise<Bid> {
    const [bid] = await db
      .update(bids)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(bids.id, id))
      .returning();
    return bid;
  }

  async acceptBidWithTransaction(
    bidId: number,
    paymentIntentId: string,
    feeFields: {
      platformFeePence: number;
      driverPayoutPence: number;
      feeCalculationVersion: string;
      feeBasis: string;
    },
  ): Promise<{
    bid: Bid;
    ride: Ride;
    offer: RiderOffer;
  }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get the bid
      const bidResult = await client.query(
        'SELECT * FROM bids WHERE id = $1 FOR UPDATE',
        [bidId]
      );
      if (bidResult.rows.length === 0) {
        throw new Error('Bid not found');
      }
      const bid = bidResult.rows[0];
      
      if (bid.status !== 'pending') {
        throw new Error('Bid is no longer available');
      }
      
      // Lock and get the rider offer
      const offerResult = await client.query(
        'SELECT * FROM rider_offers WHERE id = $1 FOR UPDATE',
        [bid.rider_offer_id]
      );
      if (offerResult.rows.length === 0) {
        throw new Error('Offer not found');
      }
      const offer = offerResult.rows[0];
      
      if (offer.status !== 'pending') {
        throw new Error('This offer has already been accepted');
      }
      
      // Update the accepted bid
      await client.query(
        'UPDATE bids SET status = $1, updated_at = NOW() WHERE id = $2',
        ['accepted', bidId]
      );
      
      // Reject all other pending bids on this offer
      await client.query(
        'UPDATE bids SET status = $1, updated_at = NOW() WHERE rider_offer_id = $2 AND id != $3 AND status = $4',
        ['rejected', bid.rider_offer_id, bidId, 'pending']
      );
      
      // Update the offer status
      await client.query(
        'UPDATE rider_offers SET status = $1, accepted_driver_id = $2, updated_at = NOW() WHERE id = $3',
        ['accepted', bid.driver_id, bid.rider_offer_id]
      );
      
      // Create the ride with pending_payment status. Fee fields are
      // computed at the route layer (where we know if driver is
      // commercial) and persisted here so they're immutable for the
      // life of the ride.
      const paymentDeadline = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const rideResult = await client.query(
        `INSERT INTO rides (
          rider_id, driver_id, pickup_location, dropoff_location,
          pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
          agreed_price, scheduled_time, status, payment_status,
          rider_offer_id, payment_deadline,
          payment_intent_id,
          platform_fee_pence, driver_payout_pence,
          fee_calculation_version, fee_basis,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
        RETURNING *`,
        [
          offer.rider_id,
          bid.driver_id,
          offer.pickup_location,
          offer.dropoff_location,
          offer.pickup_lat,
          offer.pickup_lng,
          offer.dropoff_lat,
          offer.dropoff_lng,
          bid.bid_price,
          offer.requested_time,
          'pending_payment',
          'pending',
          offer.id,
          paymentDeadline,
          paymentIntentId,
          feeFields.platformFeePence,
          feeFields.driverPayoutPence,
          feeFields.feeCalculationVersion,
          feeFields.feeBasis,
        ]
      );
      
      await client.query('COMMIT');
      
      // Convert snake_case to camelCase for the returned objects
      const convertToCamelCase = (obj: any) => {
        const result: any = {};
        for (const key in obj) {
          const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          result[camelKey] = obj[key];
        }
        return result;
      };
      
      return {
        bid: convertToCamelCase(bidResult.rows[0]) as Bid,
        ride: convertToCamelCase(rideResult.rows[0]) as Ride,
        offer: convertToCamelCase(offerResult.rows[0]) as RiderOffer,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Notification operations
  async getNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values(notification as any)
      .returning();
    return newNotification;
  }

  async markNotificationRead(id: number, userId: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return notification;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result[0]?.count ?? 0;
  }

  // User availability operations
  async updateUserAvailability(id: string, activeMode: string | null, isAvailable: boolean, lat?: number, lng?: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        activeMode,
        isAvailable,
        currentLat: lat?.toString(),
        currentLng: lng?.toString(),
        lastLocationUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    
    // Dual-write to normalized tables
    if (ENABLE_DUAL_WRITE) {
      await syncDriverAvailability(id, {
        activeMode,
        isAvailable,
        currentLat: lat?.toString(),
        currentLng: lng?.toString(),
        lastLocationUpdate: new Date(),
      });
    }
    
    return user;
  }

  async getAvailableDrivers(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(eq(users.activeMode, 'driver'), eq(users.isAvailable, true)));
  }

  async getActiveRiders(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(eq(users.activeMode, 'rider'), eq(users.isAvailable, true)));
  }

  // Rating operations
  async createRating(rating: InsertRating): Promise<Rating> {
    const [newRating] = await db
      .insert(ratings)
      .values(rating as any)
      .returning();
    return newRating;
  }

  async getRatingsByRideId(rideId: number): Promise<Rating[]> {
    return await db
      .select()
      .from(ratings)
      .where(eq(ratings.rideId, rideId));
  }

  async getRatingsForUser(userId: string): Promise<Rating[]> {
    return await db
      .select()
      .from(ratings)
      .where(eq(ratings.ratedUserId, userId))
      .orderBy(desc(ratings.createdAt));
  }

  async hasUserRatedRide(rideId: number, raterId: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(ratings)
      .where(and(eq(ratings.rideId, rideId), eq(ratings.raterId, raterId)));
    return existing.length > 0;
  }

  async updateUserRating(userId: string, role: 'rider' | 'driver'): Promise<User> {
    const userRatings = await db
      .select({ rating: ratings.rating })
      .from(ratings)
      .where(and(eq(ratings.ratedUserId, userId), eq(ratings.raterRole, role === 'rider' ? 'driver' : 'rider')));
    
    if (userRatings.length === 0) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      return user;
    }
    
    const avgRating = userRatings.reduce((sum, r) => sum + r.rating, 0) / userRatings.length;
    
    const updateData = role === 'rider' 
      ? { riderRating: avgRating.toFixed(2), totalRatingsAsRider: userRatings.length }
      : { driverRating: avgRating.toFixed(2), totalRatingsAsDriver: userRatings.length };
    
    const [user] = await db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    
    // Dual-write to normalized tables
    if (ENABLE_DUAL_WRITE) {
      await syncUserStats(userId, role === 'rider' 
        ? { riderRating: avgRating.toFixed(2), totalRatingsAsRider: userRatings.length }
        : { driverRating: avgRating.toFixed(2), totalRatingsAsDriver: userRatings.length }
      );
    }
    
    return user;
  }

  // Enhanced ride operations
  async updateRidePaymentStatus(id: number, status: string): Promise<Ride> {
    const updateData: any = { paymentStatus: status, updatedAt: new Date() };
    if (status === 'completed') {
      updateData.status = 'matched';
    }
    const [ride] = await db
      .update(rides)
      .set(updateData)
      .where(eq(rides.id, id))
      .returning();
    return ride;
  }

  async getExpiredPendingPayments(): Promise<Ride[]> {
    return await db
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.status, 'pending_payment'),
          lt(rides.paymentDeadline, new Date())
        )
      );
  }

  async getStalePendingPaymentRides(cutoffTime: Date): Promise<Ride[]> {
    return await db
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.status, 'pending_payment'),
          lt(rides.createdAt, cutoffTime)
        )
      );
  }

  async getExpiredScheduledRides(): Promise<Ride[]> {
    const now = new Date();
    // Only expire rides that are still pending payment or pending driver confirmation
    // Once payment is confirmed (status becomes 'scheduled' or later), 
    // rides should NEVER expire automatically - only manual cancellation by a party is allowed
    const unpaidStatuses = ['pending_payment', 'pending_driver_confirmation'];
    return await db
      .select()
      .from(rides)
      .where(
        and(
          inArray(rides.status, unpaidStatuses),
          lt(rides.scheduledTime, now)
        )
      );
  }

  async clearUserHistory(userId: string): Promise<void> {
    const historyStatuses = ['completed', 'cancelled', 'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_payment_timeout', 'expired'];
    await db
      .update(rides)
      .set({ hiddenByRider: true })
      .where(
        and(
          eq(rides.riderId, userId),
          inArray(rides.status, historyStatuses)
        )
      );
    await db
      .update(rides)
      .set({ hiddenByDriver: true })
      .where(
        and(
          eq(rides.driverId, userId),
          inArray(rides.status, historyStatuses)
        )
      );
  }

  async updateRidePaymentIntent(id: number, paymentIntentId: string): Promise<Ride> {
    const [updated] = await db
      .update(rides)
      .set({ paymentIntentId })
      .where(eq(rides.id, id))
      .returning();
    return updated;
  }

  async getRideByPaymentIntentId(paymentIntentId: string): Promise<Ride | undefined> {
    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.paymentIntentId, paymentIntentId));
    return ride;
  }

  async getRidesByRouteId(routeId: number): Promise<Ride[]> {
    return await db
      .select()
      .from(rides)
      .where(eq(rides.driverRouteId, routeId))
      .orderBy(desc(rides.createdAt));
  }

  async decrementRouteSeats(routeId: number): Promise<DriverRoute> {
    const route = await this.getDriverRouteById(routeId);
    if (!route) throw new Error('Route not found');
    
    const newSeats = Math.max(0, route.availableSeats - 1);
    const newStatus = newSeats === 0 ? 'full' : 'active';
    
    const [updated] = await db
      .update(driverRoutes)
      .set({ availableSeats: newSeats, status: newStatus, updatedAt: new Date() })
      .where(eq(driverRoutes.id, routeId))
      .returning();
    return updated;
  }

  async incrementRouteSeats(routeId: number): Promise<DriverRoute> {
    const route = await this.getDriverRouteById(routeId);
    if (!route) throw new Error('Route not found');
    
    const newSeats = Math.min(route.totalSeats, route.availableSeats + 1);
    const newStatus = newSeats > 0 ? 'active' : 'full';
    
    const [updated] = await db
      .update(driverRoutes)
      .set({ availableSeats: newSeats, status: newStatus, updatedAt: new Date() })
      .where(eq(driverRoutes.id, routeId))
      .returning();
    return updated;
  }

  // Chat operations
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [chatMessage] = await db
      .insert(chatMessages)
      .values(message as any)
      .returning();
    return chatMessage;
  }

  async getChatMessagesByRide(rideId: number): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.rideId, rideId))
      .orderBy(chatMessages.createdAt);
  }

  async markMessagesAsRead(rideId: number, receiverId: string): Promise<void> {
    await db
      .update(chatMessages)
      .set({ read: true })
      .where(
        and(
          eq(chatMessages.rideId, rideId),
          eq(chatMessages.receiverId, receiverId)
        )
      );
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(eq(chatMessages.receiverId, userId), eq(chatMessages.read, false)));
    return result[0]?.count ?? 0;
  }

  // Driver daily activity (for private driver limits)
  async getDriverDailyActivity(driverId: string, date: string): Promise<{ ridesCount: number; totalEarnings: number } | null> {
    const [activity] = await db
      .select()
      .from(driverDailyActivity)
      .where(and(
        eq(driverDailyActivity.driverId, driverId),
        eq(driverDailyActivity.date, date)
      ));
    
    if (!activity) return null;
    
    return {
      ridesCount: activity.ridesCount || 0,
      totalEarnings: parseFloat(activity.totalEarnings || "0"),
    };
  }

  async incrementDriverDailyActivity(driverId: string, date: string, earnings: number): Promise<void> {
    const existing = await this.getDriverDailyActivity(driverId, date);
    
    if (existing) {
      await db
        .update(driverDailyActivity)
        .set({
          ridesCount: (existing.ridesCount || 0) + 1,
          totalEarnings: (existing.totalEarnings + earnings).toFixed(2),
          updatedAt: new Date(),
        })
        .where(and(
          eq(driverDailyActivity.driverId, driverId),
          eq(driverDailyActivity.date, date)
        ));
    } else {
      await db
        .insert(driverDailyActivity)
        .values({
          driverId,
          date,
          ridesCount: 1,
          totalEarnings: earnings.toFixed(2),
        });
    }
  }

  // Commercial driver availability operations
  async getOnlineCommercialDrivers(lat: number, lng: number, maxDistanceMiles: number): Promise<Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    driverRating: string | null;
    totalRatingsAsDriver: number | null;
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: string | null;
    vehicleColor: string | null;
    vehicleRegistration: string | null;
    ratePerMile: string | null;
    tier1MaxMiles: string | null;
    tier1RatePerMile: string | null;
    tier2MaxMiles: string | null;
    tier2RatePerMile: string | null;
    tier3RatePerMile: string | null;
    baseMinimumFare: string | null;
    driverTagline: string | null;
    serviceCategories: string[] | null;
    distanceFromPickup: number;
    currentLat: string | null;
    currentLng: string | null;
  }>> {
    // Get all online commercial drivers with their current locations
    const onlineDrivers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        driverRating: users.driverRating,
        totalRatingsAsDriver: users.totalRatingsAsDriver,
        vehicleMake: users.vehicleMake,
        vehicleModel: users.vehicleModel,
        vehicleYear: users.vehicleYear,
        vehicleColor: users.vehicleColor,
        vehicleRegistration: users.vehicleRegistration,
        ratePerMile: users.ratePerMile,
        tier1MaxMiles: users.tier1MaxMiles,
        tier1RatePerMile: users.tier1RatePerMile,
        tier2MaxMiles: users.tier2MaxMiles,
        tier2RatePerMile: users.tier2RatePerMile,
        tier3RatePerMile: users.tier3RatePerMile,
        baseMinimumFare: users.baseMinimumFare,
        driverTagline: users.driverTagline,
        serviceCategories: users.serviceCategories,
        currentLat: users.currentLat,
        currentLng: users.currentLng,
      })
      .from(users)
      .where(
        and(
          eq(users.isCommercialDriver, true),
          eq(users.isOnlineForHire, true),
          // Allow visibility if either driverVerified OR commercialStatusVerified is true
          or(
            eq(users.driverVerified, true),
            eq(users.commercialStatusVerified, true)
          ),
          sql`${users.currentLat} IS NOT NULL`,
          sql`${users.currentLng} IS NOT NULL`
        )
      );

    // Calculate distance for each driver and filter by maxDistanceMiles
    const driversWithDistance = onlineDrivers
      .map(driver => {
        const driverLat = parseFloat(driver.currentLat || "0");
        const driverLng = parseFloat(driver.currentLng || "0");
        const distanceFromPickup = this.calculateDistanceMiles(lat, lng, driverLat, driverLng);
        return {
          ...driver,
          distanceFromPickup,
        };
      })
      .filter(driver => driver.distanceFromPickup <= maxDistanceMiles)
      .sort((a, b) => a.distanceFromPickup - b.distanceFromPickup);

    return driversWithDistance;
  }

  // Helper function to calculate distance between two coordinates in miles
  private calculateDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  async updateDriverOnlineStatus(id: string, isOnlineForHire: boolean, ratePerMile?: number, driverTagline?: string, lat?: number, lng?: number, serviceCategories?: string[], tierRates?: { tier1MaxMiles?: number; tier1RatePerMile?: number; tier2MaxMiles?: number; tier2RatePerMile?: number; tier3RatePerMile?: number; baseMinimumFare?: number }): Promise<User> {
    const updateData: any = {
      isOnlineForHire,
      updatedAt: new Date(),
    };
    
    if (ratePerMile !== undefined) {
      updateData.ratePerMile = ratePerMile.toFixed(2);
    }
    
    if (driverTagline !== undefined) {
      updateData.driverTagline = driverTagline;
    }
    
    if (serviceCategories !== undefined) {
      updateData.serviceCategories = serviceCategories;
    }
    
    if (tierRates) {
      if (tierRates.tier1MaxMiles !== undefined) updateData.tier1MaxMiles = tierRates.tier1MaxMiles.toFixed(2);
      if (tierRates.tier1RatePerMile !== undefined) updateData.tier1RatePerMile = tierRates.tier1RatePerMile.toFixed(2);
      if (tierRates.tier2MaxMiles !== undefined) updateData.tier2MaxMiles = tierRates.tier2MaxMiles.toFixed(2);
      if (tierRates.tier2RatePerMile !== undefined) updateData.tier2RatePerMile = tierRates.tier2RatePerMile.toFixed(2);
      if (tierRates.tier3RatePerMile !== undefined) updateData.tier3RatePerMile = tierRates.tier3RatePerMile.toFixed(2);
      if (tierRates.baseMinimumFare !== undefined) updateData.baseMinimumFare = tierRates.baseMinimumFare.toFixed(2);
    }
    
    if (lat !== undefined && lng !== undefined) {
      updateData.currentLat = lat.toFixed(7);
      updateData.currentLng = lng.toFixed(7);
      updateData.lastLocationUpdate = new Date();
    }
    
    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    
    // Dual-write to normalized tables
    if (ENABLE_DUAL_WRITE) {
      await syncDriverAvailability(id, {
        isOnlineForHire,
        currentLat: lat !== undefined ? lat.toFixed(7) : undefined,
        currentLng: lng !== undefined ? lng.toFixed(7) : undefined,
        lastLocationUpdate: lat !== undefined && lng !== undefined ? new Date() : undefined,
      });
      
      if (ratePerMile !== undefined || driverTagline !== undefined || tierRates) {
        await syncDriverCommercial(id, {
          ratePerMile: ratePerMile !== undefined ? ratePerMile.toFixed(2) : undefined,
          driverTagline,
          serviceCategories,
          tier1MaxMiles: tierRates?.tier1MaxMiles !== undefined ? tierRates.tier1MaxMiles.toFixed(2) : undefined,
          tier1RatePerMile: tierRates?.tier1RatePerMile !== undefined ? tierRates.tier1RatePerMile.toFixed(2) : undefined,
          tier2MaxMiles: tierRates?.tier2MaxMiles !== undefined ? tierRates.tier2MaxMiles.toFixed(2) : undefined,
          tier2RatePerMile: tierRates?.tier2RatePerMile !== undefined ? tierRates.tier2RatePerMile.toFixed(2) : undefined,
          tier3RatePerMile: tierRates?.tier3RatePerMile !== undefined ? tierRates.tier3RatePerMile.toFixed(2) : undefined,
          baseMinimumFare: tierRates?.baseMinimumFare !== undefined ? tierRates.baseMinimumFare.toFixed(2) : undefined,
        });
      }
    }
    
    return user;
  }

  async getPendingRideRequests(driverId: string): Promise<Ride[]> {
    // Get direct ride requests (Pro Driver requests)
    const directRequests = await db
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.driverId, driverId),
          eq(rides.status, 'pending_driver_confirmation')
        )
      )
      .orderBy(desc(rides.createdAt));
    
    // Get route seat requests (riders requesting seats on driver's routes)
    const routeRequests = await db
      .select({ ride: rides })
      .from(rides)
      .innerJoin(driverRoutes, eq(rides.driverRouteId, driverRoutes.id))
      .where(
        and(
          eq(driverRoutes.driverId, driverId),
          eq(rides.status, 'pending_driver_confirmation')
        )
      )
      .orderBy(desc(rides.createdAt));
    
    // Combine and return unique rides (direct requests already have driverId set)
    const routeRides = routeRequests.map(r => r.ride);
    const allRequests = [...directRequests, ...routeRides];
    
    // Remove duplicates (in case a ride appears in both)
    const uniqueRequests = allRequests.filter((ride, index, self) => 
      index === self.findIndex(r => r.id === ride.id)
    );
    
    return uniqueRequests;
  }

  // Settings and account management operations
  async updateUserProfile(id: string, data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    homeAddress?: string;
    city?: string;
    postcode?: string;
    profileImageUrl?: string;
  }): Promise<User> {
    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    };
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    
    // Dual-write to normalized tables
    if (ENABLE_DUAL_WRITE) {
      await syncUserProfile(id, data);
    }
    
    return user;
  }

  async updateUserPassword(id: string, newPasswordHash: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        passwordHash: newPasswordHash,
        updatedAt: new Date() 
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async softDeleteUser(id: string, reason?: string, deletedBy?: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        deletedAt: new Date(),
        deletedReason: reason || 'User requested account deletion',
        deletedBy: deletedBy || 'self',
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async restoreUser(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        deletedAt: null,
        deletedReason: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getDeletedUsers(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(isNotNull(users.deletedAt))
      .orderBy(desc(users.deletedAt));
  }

  async verifyUserPassword(id: string, passwordHash: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user?.passwordHash === passwordHash;
  }

  // Route Negotiation operations
  async createRouteNegotiation(data: InsertRouteNegotiation): Promise<RouteNegotiation> {
    const [negotiation] = await db
      .insert(routeNegotiations)
      .values(data)
      .returning();
    return negotiation;
  }

  async getRouteNegotiationById(id: number): Promise<RouteNegotiation | undefined> {
    const [negotiation] = await db
      .select()
      .from(routeNegotiations)
      .where(eq(routeNegotiations.id, id));
    return negotiation;
  }

  async getRouteNegotiationsByUser(userId: string): Promise<RouteNegotiation[]> {
    return db
      .select()
      .from(routeNegotiations)
      .where(
        or(
          eq(routeNegotiations.riderId, userId),
          eq(routeNegotiations.driverId, userId)
        )
      )
      .orderBy(desc(routeNegotiations.updatedAt));
  }

  async getRouteNegotiationsByRoute(routeId: number): Promise<RouteNegotiation[]> {
    return db
      .select()
      .from(routeNegotiations)
      .where(eq(routeNegotiations.driverRouteId, routeId))
      .orderBy(desc(routeNegotiations.createdAt));
  }

  async updateRouteNegotiation(id: number, data: Partial<RouteNegotiation>): Promise<RouteNegotiation> {
    const [updated] = await db
      .update(routeNegotiations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(routeNegotiations.id, id))
      .returning();
    return updated;
  }

  async createRouteNegotiationOffer(data: InsertRouteNegotiationOffer): Promise<RouteNegotiationOffer> {
    const [offer] = await db
      .insert(routeNegotiationOffers)
      .values(data)
      .returning();
    return offer;
  }

  async getRouteNegotiationOffers(negotiationId: number): Promise<RouteNegotiationOffer[]> {
    return db
      .select()
      .from(routeNegotiationOffers)
      .where(eq(routeNegotiationOffers.negotiationId, negotiationId))
      .orderBy(routeNegotiationOffers.createdAt);
  }

  async getLatestRouteNegotiationOffer(negotiationId: number): Promise<RouteNegotiationOffer | undefined> {
    const [offer] = await db
      .select()
      .from(routeNegotiationOffers)
      .where(eq(routeNegotiationOffers.negotiationId, negotiationId))
      .orderBy(desc(routeNegotiationOffers.createdAt))
      .limit(1);
    return offer;
  }

  // Pro Hire Negotiation operations
  async createProHireNegotiation(data: InsertProHireNegotiation): Promise<ProHireNegotiation> {
    const [negotiation] = await db
      .insert(proHireNegotiations)
      .values(data)
      .returning();
    return negotiation;
  }

  async getProHireNegotiationById(id: number): Promise<ProHireNegotiation | undefined> {
    const [negotiation] = await db
      .select()
      .from(proHireNegotiations)
      .where(eq(proHireNegotiations.id, id));
    return negotiation;
  }

  async getProHireNegotiationsByUser(userId: string): Promise<ProHireNegotiation[]> {
    return db
      .select()
      .from(proHireNegotiations)
      .where(
        or(
          eq(proHireNegotiations.riderId, userId),
          eq(proHireNegotiations.driverId, userId)
        )
      )
      .orderBy(desc(proHireNegotiations.updatedAt));
  }

  async updateProHireNegotiation(id: number, data: Partial<ProHireNegotiation>): Promise<ProHireNegotiation> {
    const [updated] = await db
      .update(proHireNegotiations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(proHireNegotiations.id, id))
      .returning();
    return updated;
  }

  async createProHireNegotiationOffer(data: InsertProHireNegotiationOffer): Promise<ProHireNegotiationOffer> {
    const [offer] = await db
      .insert(proHireNegotiationOffers)
      .values(data)
      .returning();
    return offer;
  }

  async getProHireNegotiationOffers(negotiationId: number): Promise<ProHireNegotiationOffer[]> {
    return db
      .select()
      .from(proHireNegotiationOffers)
      .where(eq(proHireNegotiationOffers.negotiationId, negotiationId))
      .orderBy(proHireNegotiationOffers.createdAt);
  }

  async getLatestProHireNegotiationOffer(negotiationId: number): Promise<ProHireNegotiationOffer | undefined> {
    const [offer] = await db
      .select()
      .from(proHireNegotiationOffers)
      .where(eq(proHireNegotiationOffers.negotiationId, negotiationId))
      .orderBy(desc(proHireNegotiationOffers.createdAt))
      .limit(1);
    return offer;
  }
}

export const storage = new DatabaseStorage();
