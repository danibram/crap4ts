export interface Order { items: number; total: number; country: string; }

export function chargeOrder(order: Order): { ok: boolean; reason?: string } {
  if (order.items < 1) return { ok: false, reason: 'empty' };
  if (order.total < 0) return { ok: false, reason: 'negative' };
  if (order.country === 'US' && order.total > 10000) return { ok: false, reason: 'us-limit' };
  if (order.country === 'EU' && order.total > 8000) return { ok: false, reason: 'eu-limit' };
  return { ok: true };
}
