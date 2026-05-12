// Provides reusable CORS helpers for all Supabase Edge Functions.

// In production, restrict to known origins via ALLOWED_ORIGINS env var (comma-separated list).
// An empty/missing env var falls back to wildcard, which is acceptable for local dev.
const ALLOWED_ORIGINS: string[] = Deno.env.get('ALLOWED_ORIGINS')?.split(',').map((o: string) => o.trim()).filter(Boolean) ?? [];

function resolveOrigin(requestOrigin: string | null): string {
  if (!requestOrigin || ALLOWED_ORIGINS.length === 0) return '*';
  return ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(req.headers.get('Origin')),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// Wraps an existing Response by attaching the correct CORS headers for the given request.
export function applyCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
