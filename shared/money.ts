/**
 * Shared money formatting helpers for the driver-facing UI and any
 * server-issued strings that quote money to a driver.
 *
 * Drivers are paid in their Stripe Connect default_currency (cached on
 * users.stripe_connect_default_currency). That currency is the source
 * of truth for which symbol, decimal precision, and minor-unit divisor
 * we use when rendering money to that driver — so the dashboard,
 * notifications, push payloads, emails, and CSV exports all agree
 * with what Stripe actually transferred.
 *
 * `pence` here is shorthand for "minor units" — the integer the API
 * stores. Stripe stores GBP/USD/EUR in 1/100, JPY in whole yen, BHD
 * in 1/1000. `makeMoneyFormatter` uses Intl to figure out the right
 * divisor per currency so we never hard-code "÷100".
 */

export type MoneyFormatter = {
  /** Format a minor-unit integer (e.g. pence) as currency. */
  format: (minor: number) => string;
  /** Format a number that's already in major units (e.g. for chart axes). */
  formatMajor: (major: number) => string;
  /** Convert minor units → major units (for chart values). */
  toMajor: (minor: number) => number;
  /** Lowercase ISO 4217 code actually in use ("gbp", "usd", …). */
  currency: string;
  /** Uppercase ISO 4217 code ("GBP", "USD", …) for server-side strings. */
  currencyCode: string;
  /** The currency symbol Intl uses for this locale (e.g. "£", "$", "¥"). */
  symbol: string;
};

export function makeMoneyFormatter(currency: string | null | undefined): MoneyFormatter {
  const lower = (currency || 'gbp').toLowerCase();
  const safe = lower.toUpperCase();
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: safe });
  } catch {
    // Unknown currency code (shouldn't happen with Stripe values, but
    // we guard so a bad cache can't crash the page) — fall back to GBP.
    nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' });
  }
  const minorDigits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = Math.pow(10, minorDigits);
  // Pull the bare currency symbol out of Intl so we can render it in
  // icon slots (input prefixes, badges) without inventing a mapping.
  let symbol = safe;
  try {
    const parts = nf.formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency');
    if (sym && sym.value) symbol = sym.value;
  } catch {
    // keep ISO code as the symbol
  }
  return {
    format: (minor: number) => nf.format((Number(minor) || 0) / divisor),
    formatMajor: (major: number) => nf.format(Number(major) || 0),
    toMajor: (minor: number) => (Number(minor) || 0) / divisor,
    currency: lower,
    currencyCode: safe,
    symbol,
  };
}

/**
 * Format a minor-unit integer with a one-shot currency. Convenience
 * wrapper for server-side callers (notifications, emails) that just
 * need the formatted string and don't want to keep a formatter around.
 */
export function formatMoneyMinor(minor: number, currency: string | null | undefined): string {
  return makeMoneyFormatter(currency).format(minor);
}

/**
 * Format a major-unit number (e.g. an `agreedPrice` string already in
 * pounds/dollars) with a one-shot currency. Same convenience as
 * `formatMoneyMinor` but for values we already have in major units —
 * we don't want to re-multiply by 100 just to divide back.
 */
export function formatMoneyMajor(
  major: number | string | null | undefined,
  currency: string | null | undefined,
): string {
  const n = typeof major === 'string' ? parseFloat(major) : Number(major);
  return makeMoneyFormatter(currency).formatMajor(Number.isFinite(n) ? n : 0);
}

/**
 * Server-issued strings (push notifications, emails, SMS) need to be
 * unambiguous about the currency they're quoting because the symbol
 * alone is not — "$" can mean USD, CAD, AUD, etc. These helpers append
 * the explicit ISO code so the recipient (and any forwarded receipt /
 * downstream tooling) can tell USD from CAD at a glance.
 */
export function formatMoneyMinorWithCode(
  minor: number,
  currency: string | null | undefined,
): string {
  const f = makeMoneyFormatter(currency);
  return `${f.format(minor)} ${f.currencyCode}`;
}

export function formatMoneyMajorWithCode(
  major: number | string | null | undefined,
  currency: string | null | undefined,
): string {
  const n = typeof major === 'string' ? parseFloat(major) : Number(major);
  const f = makeMoneyFormatter(currency);
  return `${f.formatMajor(Number.isFinite(n) ? n : 0)} ${f.currencyCode}`;
}

/**
 * Normalize whatever we have cached on the driver (or null) to the
 * lowercase ISO 4217 string the formatter expects. Falls back to
 * "gbp" for legacy rows that haven't synced from Stripe yet — matches
 * the historical hard-coded behaviour so old payouts keep rendering
 * as "£" until the next account.updated webhook backfills the column.
 */
export function resolveDriverCurrency(currency: string | null | undefined): string {
  return (currency || 'gbp').toLowerCase();
}
