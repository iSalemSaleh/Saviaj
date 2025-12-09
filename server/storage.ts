import {
  users,
  riderOffers,
  driverRoutes,
  rides,
  bids,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserDriverStatus(id: string, isDriver: boolean, licenseUrl?: string): Promise<User>;
  updateUserStripeCustomerId(id: string, stripeCustomerId: string): Promise<User>;
  
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
}

export const storage = new DatabaseStorage();
