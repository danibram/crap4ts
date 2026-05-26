export interface CartItem { sku: string; qty: number; price: number; }

export function applyPromo(items: CartItem[], code?: string): number {
  let total = 0;
  for (const it of items) {
    if (it.qty > 0 && it.price > 0) total += it.qty * it.price;
  }
  if (code === 'SUMMER' && total > 50) return total * 0.9;
  if (code === 'WINTER' && total > 30) return total * 0.95;
  if (code === 'CLEARANCE') {
    if (total > 100) return total * 0.7;
    if (total > 50) return total * 0.85;
    return total * 0.95;
  }
  return total;
}
