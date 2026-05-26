type Route = { path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE' };

export function matchRoute(
  req: { url: string; method: string },
  routes: Route[],
): Route | null {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    if (r.path === req.url) return r;
    if (r.path.endsWith('*') && req.url.startsWith(r.path.slice(0, -1))) {
      return r;
    }
    if (r.path.includes(':')) {
      const re = r.path.replace(/:[^/]+/g, '[^/]+');
      if (new RegExp(`^${re}$`).test(req.url)) return r;
    }
  }
  return null;
}
