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

export interface Invoice {
  lines: { sku: string; qty: number; price: number }[];
  country?: string;
  vatNumber?: string;
  paymentMethod?: 'card' | 'transfer' | 'cash' | 'crypto';
}

export function validateInvoice(invoice: Invoice): string[] {
  const errors: string[] = [];
  if (!invoice.lines || invoice.lines.length === 0) {
    errors.push('no lines');
    return errors;
  }
  for (const line of invoice.lines) {
    if (!line.sku || line.sku.length < 3) errors.push('bad sku');
    if (line.qty <= 0 || line.qty > 1000) errors.push('bad qty');
    if (line.price < 0) errors.push('negative price');
    if (line.price > 0 && line.price < 0.01) errors.push('rounding');
  }
  if (invoice.country === 'ES' || invoice.country === 'PT' || invoice.country === 'FR') {
    if (!invoice.vatNumber) errors.push('eu requires vat');
    else if (invoice.vatNumber.length < 9) errors.push('vat too short');
  } else if (invoice.country && invoice.paymentMethod === 'transfer') {
    if (!invoice.vatNumber) errors.push('intl transfer requires vat');
  }
  if (invoice.paymentMethod === 'crypto' && invoice.country !== 'CH') {
    errors.push('crypto not allowed outside CH');
  }
  return errors;
}
