import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { makeMoneyFormatter, type MoneyFormatter } from "@shared/money";

/**
 * Returns a money formatter bound to the signed-in user's Stripe
 * Connect default currency (cached in users.stripe_connect_default_currency).
 *
 * Used everywhere a money value is rendered to a driver outside of
 * the Payouts page (driver dashboard, ride detail, history, chat
 * receipts) so the symbol/decimals always match what Stripe will
 * actually pay them. Falls back to GBP for legacy / non-driver users
 * so the existing rider-side rendering doesn't change.
 */
export function useUserMoneyFormatter(): MoneyFormatter {
  const { user } = useAuth();
  const currency = user?.stripeConnectDefaultCurrency ?? 'gbp';
  return useMemo(() => makeMoneyFormatter(currency), [currency]);
}
