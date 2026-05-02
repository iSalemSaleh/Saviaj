// One-shot backfill that issues a Saviaj Pass ID to every existing user
// that doesn't already have one. Re-runnable (`setUserPassIdIfMissing`
// is a no-op when `passId` is already populated), so it's safe to invoke
// multiple times if a previous run was interrupted.
//
// Usage:
//   npx tsx scripts/backfill-pass-ids.ts
//
// The script preserves the original signup date so historical pass IDs
// match each user's `createdAt`. Users without a `city` get the "ZZZ"
// fallback (the generator handles this internally).

import { db } from "../server/db";
import { users } from "../shared/schema";
import { storage } from "../server/storage";
import { generatePassId } from "../server/passIdGenerator";
import { asc, isNull, sql } from "drizzle-orm";

async function main() {
  const targets = await db
    .select({ id: users.id, city: users.city, createdAt: users.createdAt })
    .from(users)
    .where(isNull(users.passId))
    .orderBy(asc(users.createdAt));

  console.log(`[backfill] ${targets.length} users need a pass ID`);

  let assigned = 0;
  let skipped = 0;
  for (const u of targets) {
    const date = u.createdAt ?? new Date();
    const passId = await generatePassId(u.city, date);
    const result = await storage.setUserPassIdIfMissing(u.id, passId);
    if (result) {
      assigned += 1;
      if (assigned % 50 === 0) {
        console.log(`[backfill]  ... ${assigned} assigned`);
      }
    } else {
      skipped += 1;
    }
  }

  const stillMissing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(isNull(users.passId));

  console.log(
    `[backfill] done — assigned=${assigned} skipped=${skipped} stillMissing=${stillMissing[0]?.count ?? "?"}`,
  );
  process.exit(stillMissing[0]?.count === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
