// Timezone helpers shared by the CSV export endpoint and the
// PayoutHistory date-range presets on the client. The driver's stored
// `users.timezone` (an IANA identifier like "Europe/London") is the
// source of truth; we fall back to Europe/London for the launch
// market, and finally to UTC if even that fails (e.g. an exotic
// runtime without full ICU data).

export const DEFAULT_TIMEZONE = "Europe/London";

// Validate an IANA zone by asking Intl. Returns the input on success,
// or undefined if the runtime rejects it. We deliberately accept any
// string — the column is free-form so legacy / hand-edited rows can
// hold typos and we want to fall back rather than 500.
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Resolve a usable IANA zone given a possibly-null stored value.
// Order: stored → Europe/London → UTC. Always returns a string the
// rest of this module can hand to Intl without throwing.
export function resolveTimezone(stored: string | null | undefined): string {
  if (stored && isValidTimeZone(stored)) return stored;
  if (isValidTimeZone(DEFAULT_TIMEZONE)) return DEFAULT_TIMEZONE;
  return "UTC";
}

// Convert a wall-clock Y/M/D H:M:S.ms in `tz` into the equivalent UTC
// Date instant. Standard "iterate via Intl" trick: take a UTC guess at
// the requested wall time, format that instant in `tz`, measure the
// drift, and subtract it. One pass is enough except across a DST
// "spring forward" boundary, but for our use (00:00:00 / 23:59:59 of
// a YYYY-MM-DD) that's fine — both sides of the gap round to the same
// inclusive day slice.
function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  tz: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  if (tz === "UTC") return new Date(utcGuess);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
    ms,
  );
  const offset = asUtc - utcGuess;
  return new Date(utcGuess - offset);
}

// Parse a YYYY-MM-DD string interpreted in `tz`, returning a Date
// pinned to the start (00:00:00.000) or end (23:59:59.999) of that
// local day. Anything else (full ISO timestamp, garbage) is left for
// the caller's plain `new Date()` parser to handle so existing
// behaviour is preserved for non-bare inputs.
export function parseYmdInZone(
  ymd: string,
  end: boolean,
  tz: string,
): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Reject impossible calendar dates (e.g. 2026-02-31, 2026-13-01).
  // Without this check, Date.UTC silently rolls them forward and we
  // would export a wrong-but-plausible slice instead of returning the
  // 400 the caller expects for invalid input.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  if (end) {
    return zonedWallTimeToUtc(year, month, day, 23, 59, 59, 999, tz);
  }
  return zonedWallTimeToUtc(year, month, day, 0, 0, 0, 0, tz);
}

// Return today's wall-clock Y/M/D in `tz`. Used by the client to
// compute the UK tax-year preset relative to the driver's local
// calendar rather than the browser's, so a driver in another zone
// near midnight on 5/6 April still sees the right tax year.
export function todayYmdInZone(
  tz: string,
  now: Date = new Date(),
): { year: number; month: number; day: number } {
  if (tz === "UTC") {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    };
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}
