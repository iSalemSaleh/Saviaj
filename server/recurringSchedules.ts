import { db } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  recurringSchedules,
  recurringScheduleEntries,
  riderOffers,
  driverRoutes,
  type RecurringSchedule,
  type RecurringScheduleEntry,
  type InsertRecurringSchedule,
  type InsertRecurringScheduleEntry,
} from "@shared/schema";

const ADVANCE_DAYS = 14;

export async function createRecurringSchedule(
  data: Omit<InsertRecurringSchedule, 'status'>,
  entries: Omit<InsertRecurringScheduleEntry, 'scheduleId'>[]
): Promise<{ schedule: RecurringSchedule; entries: RecurringScheduleEntry[] }> {
  const [schedule] = await db.insert(recurringSchedules).values({
    ...data,
    status: 'active',
  } as any).returning();

  const createdEntries: RecurringScheduleEntry[] = [];
  for (const entry of entries) {
    const [created] = await db.insert(recurringScheduleEntries).values({
      ...entry,
      scheduleId: schedule.id,
    } as any).returning();
    createdEntries.push(created);
  }

  await generateListingsForSchedule(schedule.id);

  return { schedule, entries: createdEntries };
}

export async function getSchedulesByUser(userId: string): Promise<(RecurringSchedule & { entries: RecurringScheduleEntry[] })[]> {
  const schedules = await db.select().from(recurringSchedules)
    .where(eq(recurringSchedules.userId, userId))
    .orderBy(desc(recurringSchedules.createdAt));

  const results = [];
  for (const schedule of schedules) {
    const entries = await db.select().from(recurringScheduleEntries)
      .where(eq(recurringScheduleEntries.scheduleId, schedule.id));
    results.push({ ...schedule, entries });
  }
  return results;
}

export async function getScheduleById(id: number): Promise<(RecurringSchedule & { entries: RecurringScheduleEntry[] }) | null> {
  const [schedule] = await db.select().from(recurringSchedules)
    .where(eq(recurringSchedules.id, id)).limit(1);
  if (!schedule) return null;

  const entries = await db.select().from(recurringScheduleEntries)
    .where(eq(recurringScheduleEntries.scheduleId, id));
  return { ...schedule, entries };
}

export async function updateScheduleStatus(id: number, status: string): Promise<RecurringSchedule | null> {
  const [updated] = await db.update(recurringSchedules)
    .set({ status, updatedAt: new Date() })
    .where(eq(recurringSchedules.id, id))
    .returning();
  return updated || null;
}

export async function deleteSchedule(id: number): Promise<void> {
  await db.delete(recurringScheduleEntries).where(eq(recurringScheduleEntries.scheduleId, id));
  await db.delete(recurringSchedules).where(eq(recurringSchedules.id, id));
}

export async function generateListingsForSchedule(scheduleId: number): Promise<number> {
  const schedule = await getScheduleById(scheduleId);
  if (!schedule || schedule.status !== 'active') return 0;

  const entries = schedule.entries;
  if (entries.length === 0) return 0;

  const now = new Date();
  const startDate = schedule.lastGeneratedDate
    ? new Date(Math.max(new Date(schedule.lastGeneratedDate).getTime(), now.getTime()))
    : now;
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + ADVANCE_DAYS);

  let generated = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const matchingEntries = entries.filter(e => e.dayOfWeek === dayOfWeek);

    for (const entry of matchingEntries) {
      const [hours, minutes] = entry.departureTime.split(':').map(Number);
      const departureDate = new Date(d);
      departureDate.setHours(hours, minutes, 0, 0);

      if (departureDate <= now) continue;

      if (schedule.type === 'rider') {
        const existing = await db.select().from(riderOffers)
          .where(and(
            eq(riderOffers.scheduleId, scheduleId),
            eq(riderOffers.requestedTime, departureDate),
            eq(riderOffers.pickupLocation, entry.startLocation),
            eq(riderOffers.dropoffLocation, entry.endLocation),
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(riderOffers).values({
            riderId: schedule.userId,
            pickupLocation: entry.startLocation,
            dropoffLocation: entry.endLocation,
            pickupLat: entry.startLat,
            pickupLng: entry.startLng,
            dropoffLat: entry.endLat,
            dropoffLng: entry.endLng,
            offerPrice: entry.offerPrice || '0',
            requestedTime: departureDate,
            status: 'pending',
            scheduleId: scheduleId,
          } as any);
          generated++;
        }
      } else if (schedule.type === 'driver') {
        const existing = await db.select().from(driverRoutes)
          .where(and(
            eq(driverRoutes.scheduleId, scheduleId),
            eq(driverRoutes.departureTime, departureDate),
            eq(driverRoutes.startLocation, entry.startLocation),
            eq(driverRoutes.endLocation, entry.endLocation),
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(driverRoutes).values({
            driverId: schedule.userId,
            startLocation: entry.startLocation,
            endLocation: entry.endLocation,
            startLat: entry.startLat,
            startLng: entry.startLng,
            endLat: entry.endLat,
            endLng: entry.endLng,
            departureTime: departureDate,
            maxDetourMiles: entry.maxDetourMiles || '1',
            availableSeats: entry.availableSeats || 3,
            totalSeats: entry.totalSeats || 3,
            pricePerSeat: entry.pricePerSeat,
            paymentTimeoutMinutes: entry.paymentTimeoutMinutes || 5,
            status: 'active',
            scheduleId: scheduleId,
          } as any);
          generated++;
        }
      }
    }
  }

  await db.update(recurringSchedules)
    .set({ lastGeneratedDate: new Date(), updatedAt: new Date() })
    .where(eq(recurringSchedules.id, scheduleId));

  return generated;
}

export async function generateAllActiveSchedules(): Promise<number> {
  const activeSchedules = await db.select().from(recurringSchedules)
    .where(eq(recurringSchedules.status, 'active'));

  let totalGenerated = 0;
  for (const schedule of activeSchedules) {
    try {
      const count = await generateListingsForSchedule(schedule.id);
      totalGenerated += count;
    } catch (error) {
      console.error(`Failed to generate listings for schedule ${schedule.id}:`, error);
    }
  }
  return totalGenerated;
}

export async function cancelFutureListings(scheduleId: number): Promise<void> {
  const now = new Date();

  await db.update(riderOffers)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(
      eq(riderOffers.scheduleId, scheduleId),
      eq(riderOffers.status, 'pending'),
      gte(riderOffers.requestedTime, now),
    ));

  await db.update(driverRoutes)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(
      eq(driverRoutes.scheduleId, scheduleId),
      eq(driverRoutes.status, 'active'),
      gte(driverRoutes.departureTime, now),
    ));
}
