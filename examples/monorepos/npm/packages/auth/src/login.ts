export function authenticate(
  user: string,
  pass: string,
  method?: 'password' | 'sso' | 'mfa',
): boolean {
  if (!user || !pass) return false;
  if (method === 'mfa') {
    if (pass.length < 8) return false;
    if (!user.includes('@')) return false;
    return true;
  }
  if (method === 'sso' && user.endsWith('@corp.com')) return true;
  if (pass.length > 4 && pass.length < 64) return true;
  return false;
}
