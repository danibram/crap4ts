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

function summerDiscount(total: number): number {
  if (total > 100 && total < 500) return total * 0.9;
  if (total >= 500) return total * 0.85;
  return total;
}

function winterDiscount(total: number): number {
  return total > 50 ? total * 0.95 : total;
}

function applyDiscountCode(total: number, code: string | undefined): number {
  if (code === 'SUMMER') return summerDiscount(total);
  if (code === 'WINTER') return winterDiscount(total);
  return total;
}

function applyTierBonus(total: number, tier: Order['customerTier']): number {
  return tier === 'platinum' ? total * 0.92 : total;
}

export function processOrder(order: Order): number {
  if (order.items.length === 0 || order.total <= 0) return 0;
  const discounted = applyDiscountCode(order.total, order.discountCode);
  return applyTierBonus(discounted, order.customerTier);
}

export function shippingFee(weight: number): number {
  return weight < 1 ? 5 : weight < 5 ? 10 : 20;
}
