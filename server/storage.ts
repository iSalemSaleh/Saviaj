import {
  users,
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
  type User,
  type UpsertUser,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, lt, gt, or } from "drizzle-orm";

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
  driverTagline?: string;
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
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserDriverStatus(id: string, isDriver: boolean, licenseUrl?: string): Promise<User>;
  updateUserStripeCustomerId(id: string, stripeCustomerId: string): Promise<User>;
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
  
  // Bid operations
  createBid(bid: InsertBid): Promise<Bid>;
  getBidsByOfferId(offerId: number): Promise<Bid[]>;
  getBidsByDriverId(driverId: string): Promise<Bid[]>;
  updateBidStatus(id: number, status: string): Promise<Bid>;
  
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
  getExpiredPendingPayments(): Promise<Ride[]>;
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
    ratePerMile: string | null;
    distanceFromPickup: number;
    currentLat: string | null;
    currentLng: string | null;
  }>>;
  updateDriverOnlineStatus(id: string, isOnlineForHire: boolean, ratePerMile?: number, driverTagline?: string, lat?: number, lng?: number): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
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
    
    // If rider location is provided, filter routes based on proximity
    if (riderLat !== undefined && riderLng !== undefined) {
      return results
        .map(r => {
          const routeStartLat = parseFloat(r.route.startLat?.toString() || "0");
          const routeStartLng = parseFloat(r.route.startLng?.toString() || "0");
          const routeEndLat = parseFloat(r.route.endLat?.toString() || "0");
          const routeEndLng = parseFloat(r.route.endLng?.toString() || "0");
          const maxDetour = parseFloat(r.route.maxDetourMiles?.toString() || "0");
          
          // Calculate distance from rider's pickup to the route
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
            distanceToRider: Math.round(distanceToRoute * 10) / 10
          };
        })
        // Filter: only show routes where rider is within driver's max detour radius
        .filter(route => {
          const maxDetour = parseFloat(route.maxDetourMiles?.toString() || "0");
          return route.distanceToRider !== undefined && route.distanceToRider <= maxDetour;
        })
        // Sort by distance (closest first)
        .sort((a, b) => (a.distanceToRider || 0) - (b.distanceToRider || 0));
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
    const [newRide] = await db
      .insert(rides)
      .values(ride as any)
      .returning();
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
    ratePerMile: string | null;
    driverTagline: string | null;
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
        ratePerMile: users.ratePerMile,
        driverTagline: users.driverTagline,
        currentLat: users.currentLat,
        currentLng: users.currentLng,
      })
      .from(users)
      .where(
        and(
          eq(users.isCommercialDriver, true),
          eq(users.isOnlineForHire, true),
          eq(users.driverVerified, true),
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

  async updateDriverOnlineStatus(id: string, isOnlineForHire: boolean, ratePerMile?: number, driverTagline?: string, lat?: number, lng?: number): Promise<User> {
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
      
      if (ratePerMile !== undefined || driverTagline !== undefined) {
        await syncDriverCommercial(id, {
          ratePerMile: ratePerMile !== undefined ? ratePerMile.toFixed(2) : undefined,
          driverTagline,
        });
      }
    }
    
    return user;
  }

  async getPendingRideRequests(driverId: string): Promise<Ride[]> {
    return db
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.driverId, driverId),
          eq(rides.status, 'pending_driver_confirmation')
        )
      )
      .orderBy(desc(rides.createdAt));
  }
}

export const storage = new DatabaseStorage();
