export function legacyBilling(plan: string, seats: number, region: string): number {
  let base = 0;
  if (plan === 'free') return 0;
  if (plan === 'basic') base = 9;
  else if (plan === 'pro') base = 29;
  else if (plan === 'enterprise') base = 99;
  if (seats > 5 && plan !== 'enterprise') base *= 1.5;
  if (region === 'eu' && seats > 10) base *= 1.2;
  if (region === 'apac' || region === 'latam') base *= 0.95;
  if (plan === 'enterprise' && seats > 100) base *= 0.8;
  return base * seats;
}
