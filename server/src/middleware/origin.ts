import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';

const DEFAULT_ORIGINS = [
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
  'http://localhost:1421',
  'http://localhost:5173',
];

const allowedOrigins = new Set<string>([
  ...DEFAULT_ORIGINS,
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
]);

/**
 * Origin policy shared by HTTP and Socket.IO:
 * - no Origin header (native apps, curl, same-origin GET) => allowed
 * - same origin as the Host the request was sent to => allowed
 * - explicit allowlist (Tauri apps, dev servers, ALLOWED_ORIGINS env) => allowed
 */
export function isOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (!host) return false;
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host === host;
  } catch {
    return false;
  }
}

/** CORS headers only for allowed origins (no Access-Control-Allow-Origin otherwise). */
export const corsMiddleware = cors((req, cb) => {
  const allowed = isOriginAllowed(req.headers.origin, req.headers.host);
  cb(null, { origin: allowed, maxAge: 600 });
});

/** Reject state-changing requests sent by a browser page from a foreign origin. */
export function rejectForeignOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') { next(); return; }
  if (isOriginAllowed(req.headers.origin, req.headers.host)) { next(); return; }
  res.status(403).json({ error: 'Nguồn truy cập không được phép' });
}
