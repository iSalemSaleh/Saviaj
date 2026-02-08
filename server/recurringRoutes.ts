import { Router } from "express";
import { z } from "zod";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  createRecurringSchedule,
  getSchedulesByUser,
  getScheduleById,
  updateScheduleStatus,
  deleteSchedule,
  cancelFutureListings,
} from "./recurringSchedules";

const router = Router();

const recurringEntrySchema = z.object({
  dayOfWeek: z.coerce.number().min(0).max(6),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/),
  startLocation: z.string().min(1),
  endLocation: z.string().min(1),
  startLat: z.coerce.number().optional().nullable(),
  startLng: z.coerce.number().optional().nullable(),
  endLat: z.coerce.number().optional().nullable(),
  endLng: z.coerce.number().optional().nullable(),
  offerPrice: z.coerce.number().min(0.30).max(500).optional().nullable(),
  maxDetourMiles: z.coerce.number().min(0.01).max(100).optional().nullable(),
  availableSeats: z.coerce.number().min(1).max(7).optional().nullable(),
  totalSeats: z.coerce.number().min(1).max(7).optional().nullable(),
  pricePerSeat: z.coerce.number().min(0.01).max(100).optional().nullable(),
  paymentTimeoutMinutes: z.coerce.number().min(1).max(30).optional().nullable(),
});

const createScheduleSchema = z.object({
  type: z.enum(["rider", "driver"]),
  entries: z.array(recurringEntrySchema).min(1).max(14),
});

router.post("/", async (req: any, res) => {
  try {
    const userId = req.session?.userId || req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { type, entries } = createScheduleSchema.parse(req.body);

    if (type === 'driver') {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.driverVerified) {
        return res.status(403).json({ message: "Only verified drivers can create driver schedules" });
      }
    }

    const result = await createRecurringSchedule(
      { userId, type },
      entries
    );

    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error creating recurring schedule:", error);
    res.status(400).json({ message: error.message || "Failed to create schedule" });
  }
});

router.get("/", async (req: any, res) => {
  try {
    const userId = req.session?.userId || req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const schedules = await getSchedulesByUser(userId);
    res.json(schedules);
  } catch (error: any) {
    console.error("Error fetching schedules:", error);
    res.status(500).json({ message: "Failed to fetch schedules" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const userId = req.session?.userId || req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid schedule ID" });

    const schedule = await getScheduleById(id);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    if (schedule.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    res.json(schedule);
  } catch (error: any) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ message: "Failed to fetch schedule" });
  }
});

router.patch("/:id/status", async (req: any, res) => {
  try {
    const userId = req.session?.userId || req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid schedule ID" });

    const schedule = await getScheduleById(id);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    if (schedule.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const { status } = z.object({ status: z.enum(["active", "paused", "cancelled"]) }).parse(req.body);

    if (status === 'cancelled' || status === 'paused') {
      await cancelFutureListings(id);
    }

    const updated = await updateScheduleStatus(id, status);
    res.json(updated);
  } catch (error: any) {
    console.error("Error updating schedule status:", error);
    res.status(400).json({ message: error.message || "Failed to update schedule" });
  }
});

router.delete("/:id", async (req: any, res) => {
  try {
    const userId = req.session?.userId || req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid schedule ID" });

    const schedule = await getScheduleById(id);
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    if (schedule.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    await cancelFutureListings(id);
    await deleteSchedule(id);

    res.json({ message: "Schedule deleted" });
  } catch (error: any) {
    console.error("Error deleting schedule:", error);
    res.status(500).json({ message: "Failed to delete schedule" });
  }
});

export default router;
