import {
  users,
  riderOffers,
  driverRoutes,
  rides,
  bids,
  notifications,
  ratings,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, lt, gt } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
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
  getRiderOfferById(id: number): Promise<RiderOffer | undefined>;
  updateRiderOfferStatus(id: number, status: string, driverId?: string): Promise<RiderOffer>;
  
  // Driver Route operations
  createDriverRoute(route: InsertDriverRoute): Promise<DriverRoute>;
  getDriverRoutes(status?: string): Promise<DriverRoute[]>;
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
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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
      .values(notification)
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
}

export const storage = new DatabaseStorage();
