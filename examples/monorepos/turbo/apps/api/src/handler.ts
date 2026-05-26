export async function handle(req: {
  method: string;
  body: unknown;
  headers: Record<string, string>;
}): Promise<number> {
  if (!req.headers['authorization']) return 401;
  if (req.method === 'POST' && !req.body) return 400;
  if (req.method === 'GET' && req.headers['content-type']) return 400;
  if (req.method === 'DELETE' && req.headers['x-confirm'] !== 'yes') return 412;
  return 200;
}
