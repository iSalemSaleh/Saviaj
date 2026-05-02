import { db } from "./db";
import { passIdDailyCounters } from "@shared/schema";
import { sql } from "drizzle-orm";
import { getCityCode } from "@shared/data/uk-cities";

// Format: SV + 3-letter city code + YYMMDD + 4-digit zero-padded daily sequence.
// Example for the 42nd London signup on 1 May 2026: "SVLON2605010042".
//
// Atomicity guarantee: the daily sequence is allocated by an upsert on
// `pass_id_daily_counters` that uses `last_seq = pass_id_daily_counters.last_seq + 1`
// in the ON CONFLICT clause. Postgres takes a row-level lock during the
// conflict resolution, so 100 concurrent signups in the same city/day
// receive 100 distinct, monotonic sequence numbers without any
// application-level locking.
//
// We deliberately leave the city code outside the `users.pass_id` UNIQUE
// constraint as the only collision-protection mechanism — the daily counter
// is the real guarantor of uniqueness; the constraint is a safety net.

function formatYymmdd(date: Date): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

async function nextSequence(bucket: string): Promise<number> {
  // Atomic upsert-and-increment. The `excluded` row carries the value we
  // tried to insert (1); the `last_seq + 1` expression on the existing row
  // is what we actually want when there is a conflict.
  const [row] = await db
    .insert(passIdDailyCounters)
    .values({ bucket, lastSeq: 1 })
    .onConflictDoUpdate({
      target: passIdDailyCounters.bucket,
      set: {
        lastSeq: sql`${passIdDailyCounters.lastSeq} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ lastSeq: passIdDailyCounters.lastSeq });

  if (!row) {
    throw new Error("Failed to allocate pass-id sequence");
  }
  return row.lastSeq;
}

// Generate a Saviaj Pass ID for a user signing up in `city` on `signupDate`.
// `signupDate` defaults to "now"; pass an explicit value when backfilling so
// the date in the ID matches the user's original `createdAt`.
//
// Sequence > 9999 in a single city/day rolls into a 5-digit number, which
// pushes the total length to 17 chars. The DB column is `varchar(20)` so
// this is safe up to 999,999 signups in one city in one day.
export async function generatePassId(
  city: string | null | undefined,
  signupDate: Date = new Date(),
): Promise<string> {
  const cityCode = getCityCode(city);
  const datePart = formatYymmdd(signupDate);
  const bucket = `${cityCode}-${datePart}`;
  const seq = await nextSequence(bucket);
  const seqStr = seq < 10000 ? String(seq).padStart(4, "0") : String(seq);
  return `SV${cityCode}${datePart}${seqStr}`;
}
