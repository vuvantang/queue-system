import { Request, Response, NextFunction } from 'express';

/**
 * Small in-memory sliding-window rate limiter (single process).
 * Each key keeps the timestamps of its recent hits; the map size is bounded
 * so a flood of distinct keys cannot grow memory without limit.
 */
export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** Keys to count this request under (e.g. ip, username). Empty/undefined keys are ignored. */
  keys: (req: Request) => (string | undefined)[];
  /** Vietnamese error message returned with 429 */
  message: string;
  /** Only count requests whose response status matches (default: count every request) */
  countWhen?: (statusCode: number) => boolean;
  /** Maximum number of tracked keys (default 10000) */
  maxKeys?: number;
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isInteger(v) && v > 0 ? v : fallback;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? 10000;

  function prune(key: string, now: number): number[] {
    const list = hits.get(key);
    if (!list) return [];
    const cutoff = now - opts.windowMs;
    let i = 0;
    while (i < list.length && list[i] <= cutoff) i++;
    if (i > 0) list.splice(0, i);
    if (list.length === 0) hits.delete(key);
    return list;
  }

  function record(key: string, now: number): void {
    let list = hits.get(key);
    if (!list) {
      if (hits.size >= maxKeys) {
        // Evict the oldest-inserted keys (Map preserves insertion order)
        const evict = Math.max(1, Math.floor(maxKeys / 10));
        let n = 0;
        for (const k of hits.keys()) {
          hits.delete(k);
          if (++n >= evict) break;
        }
      }
      list = [];
      hits.set(key, list);
    }
    list.push(now);
    // Never keep more than `max` timestamps per key
    if (list.length > opts.max) list.splice(0, list.length - opts.max);
  }

  // Periodic sweep of expired entries
  const timer = setInterval(() => {
    const now = Date.now();
    for (const key of [...hits.keys()]) prune(key, now);
  }, Math.min(opts.windowMs, 60_000));
  timer.unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const keys = opts.keys(req).filter((k): k is string => !!k);

    for (const key of keys) {
      const list = prune(key, now);
      if (list.length >= opts.max) {
        const retryAfter = Math.max(1, Math.ceil((list[0] + opts.windowMs - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({ error: opts.message });
        return;
      }
    }

    // Count the attempt up-front so parallel requests cannot all slip past the check;
    // with countWhen, un-count it once the response shows it should not be counted.
    for (const key of keys) record(key, now);
    if (opts.countWhen) {
      res.on('finish', () => {
        if (opts.countWhen!(res.statusCode)) return;
        for (const key of keys) {
          const list = hits.get(key);
          if (!list) continue;
          const idx = list.lastIndexOf(now);
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) hits.delete(key);
        }
      });
    }
    next();
  };
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function normUsername(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 && v.length <= 128 ? v.trim().toLowerCase() : undefined;
}

const AUTH_WINDOW_MS = envInt('AUTH_RATE_WINDOW_MS', 5 * 60 * 1000);
const AUTH_MAX_PER_USER = envInt('AUTH_RATE_MAX_PER_USER', 10);
const AUTH_MAX_PER_IP = envInt('AUTH_RATE_MAX_PER_IP', 20);
const AUTH_MESSAGE = 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.';
const isFailure = (status: number) => status >= 400 && status !== 429;

/** Failed login attempts: per IP and per username. */
export const loginIpLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS, max: AUTH_MAX_PER_IP, message: AUTH_MESSAGE, countWhen: isFailure,
  keys: req => [`ip:${clientIp(req)}`],
});
export const loginUserLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS, max: AUTH_MAX_PER_USER, message: AUTH_MESSAGE, countWhen: isFailure,
  keys: req => {
    const u = normUsername(req.body?.username);
    return [u ? `user:${u}` : undefined];
  },
});

/** Failed password changes: per IP and per authenticated user. */
export const changePasswordLimiter = createRateLimiter({
  windowMs: AUTH_WINDOW_MS, max: AUTH_MAX_PER_USER, message: AUTH_MESSAGE, countWhen: isFailure,
  keys: req => [`ip:${clientIp(req)}`, req.user ? `uid:${req.user.userId}` : undefined],
});

/** Public ticket creation (kiosk): per IP. Several kiosks behind one NAT share the budget. */
export const ticketCreateLimiter = createRateLimiter({
  windowMs: envInt('TICKET_RATE_WINDOW_MS', 60 * 1000),
  max: envInt('TICKET_RATE_MAX_PER_IP', 60),
  message: 'Lấy số quá nhanh. Vui lòng chờ một chút rồi thử lại.',
  keys: req => [`ip:${clientIp(req)}`],
});
