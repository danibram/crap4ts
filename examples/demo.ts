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
  shipsTo?: 'domestic' | 'eu' | 'international';
  isGift?: boolean;
}

export function processOrder(order: Order): number {
  if (order.items.length > 0 && order.total > 0) {
    if (order.discountCode === 'SUMMER') {
      if (order.total > 100 && order.total < 500) return order.total * 0.9;
      if (order.total >= 500 && order.total < 1000) return order.total * 0.85;
      if (order.total >= 1000) return order.total * 0.8;
    } else if (order.discountCode === 'WINTER') {
      if (order.total > 50 && order.customerTier === 'gold') return order.total * 0.93;
      if (order.total > 50) return order.total * 0.95;
    } else if (order.discountCode === 'BLACKFRIDAY') {
      if (order.shipsTo === 'domestic') return order.total * 0.7;
      if (order.shipsTo === 'eu') return order.total * 0.75;
      return order.total * 0.8;
    }
    if (order.customerTier === 'platinum') {
      if (order.isGift) return order.total * 0.9;
      return order.total * 0.92;
    }
    if (order.customerTier === 'gold' && order.total > 200) return order.total * 0.95;
    return order.total;
  }
  return 0;
}

export function shippingFee(weight: number): number {
  return weight < 1 ? 5 : weight < 5 ? 10 : 20;
}
