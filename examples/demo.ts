/**
 * Demo fixture for crap4ts PR-bot screenshots.
 *
 * `processOrder` is intentionally tangled (no test coverage, nested
 * conditionals) so the README's example PRs can show what the bot does
 * when this function regresses, gets refactored, or is moved.
 *
 * Do not refactor in main — modify it only inside Demo - * PRs.
 */

export interface Order {
  items: string[];
  total: number;
  discountCode?: string;
  customerTier?: 'standard' | 'gold' | 'platinum';
}

export function processOrder(order: Order): number {
  if (order.items.length > 0 && order.total > 0) {
    if (order.discountCode === 'SUMMER') {
      if (order.total > 100 && order.total < 500) return order.total * 0.9;
      if (order.total >= 500) return order.total * 0.85;
    } else if (order.discountCode === 'WINTER') {
      if (order.total > 50) return order.total * 0.95;
    }
    if (order.customerTier === 'platinum') return order.total * 0.92;
    return order.total;
  }
  return 0;
}

export function shippingFee(weight: number): number {
  return weight < 1 ? 5 : weight < 5 ? 10 : 20;
}

export interface Subscription {
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  seats: number;
  region?: 'us' | 'eu' | 'apac' | 'latam';
  invoicingCycle?: 'monthly' | 'annual';
  trialEndsAt?: Date;
  legacyPricing?: boolean;
}

/**
 * Deliberately untested recurring-billing calculator that lights up SARIF.
 * Has enough nested branches that CRAP comfortably exceeds --fail-on 100.
 */
export function recurringBilling(sub: Subscription, now: Date): number {
  if (sub.plan === 'free') return 0;
  let base = 0;
  if (sub.plan === 'basic') base = 9;
  else if (sub.plan === 'pro') base = 29;
  else if (sub.plan === 'enterprise') base = 99;
  if (sub.seats < 1) return 0;
  if (sub.seats > 5 && sub.plan !== 'enterprise') base *= 1.5;
  if (sub.seats > 50 && sub.plan === 'enterprise') base *= 0.8;
  if (sub.trialEndsAt && sub.trialEndsAt > now) return 0;
  if (sub.region === 'eu' && sub.invoicingCycle === 'annual') {
    if (sub.legacyPricing) return base * sub.seats * 12 * 0.85;
    return base * sub.seats * 12 * 0.9;
  }
  if (sub.region === 'apac' || sub.region === 'latam') {
    if (sub.invoicingCycle === 'annual') return base * sub.seats * 12 * 0.95;
    return base * sub.seats * 1.05;
  }
  if (sub.region === 'us' && sub.legacyPricing) return base * sub.seats * 0.95;
  return base * sub.seats * (sub.invoicingCycle === 'annual' ? 12 * 0.92 : 1);
}
