import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { JwtPayload, User } from '../types.js';
import db, { DATA_DIR } from '../db.js';

const MIN_SECRET_LENGTH = 32;
const SECRET_FILE = path.join(DATA_DIR, '.jwt-secret');

let jwtSecret: string | undefined;

/**
 * Resolve the JWT signing secret.
 * - JWT_SECRET env (must be >= 32 chars), or
 * - a random secret generated once and persisted at data/.jwt-secret (0600).
 * Throws with a clear message when the configuration is unusable.
 */
export function initJwtSecret(): string {
  if (jwtSecret) return jwtSecret;

  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv !== undefined && fromEnv !== '') {
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET quá ngắn (cần tối thiểu ${MIN_SECRET_LENGTH} ký tự). ` +
        `JWT_SECRET is too short (minimum ${MIN_SECRET_LENGTH} characters). ` +
        `Tạo bằng / generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
      );
    }
    jwtSecret = fromEnv;
    return jwtSecret;
  }

  try {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `File ${SECRET_FILE} không hợp lệ (quá ngắn) — xoá file để tạo lại. ` +
        `Invalid secret file ${SECRET_FILE} (too short) — delete it to regenerate.`
      );
    }
    try { fs.chmodSync(SECRET_FILE, 0o600); } catch { /* best effort */ }
    jwtSecret = existing;
    console.log(`🔐 JWT_SECRET chưa đặt — dùng secret tự sinh tại ${SECRET_FILE} (generated secret in use)`);
    return jwtSecret;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }

  const generated = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(SECRET_FILE, generated + '\n', { mode: 0o600, flag: 'wx' });
  } catch (err: any) {
    if (err?.code === 'EEXIST') {
      // Created concurrently: reuse it
      jwtSecret = undefined;
      return initJwtSecret();
    }
    throw new Error(
      `Không thể ghi ${SECRET_FILE}: ${err?.message}. Đặt biến môi trường JWT_SECRET. ` +
      `Cannot write ${SECRET_FILE}; set the JWT_SECRET environment variable instead.`
    );
  }
  jwtSecret = generated;
  console.log(`🔐 JWT_SECRET chưa đặt — đã sinh secret ngẫu nhiên và lưu tại ${SECRET_FILE} (generated secret in use)`);
  return jwtSecret;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, initJwtSecret(), { algorithm: 'HS256', expiresIn: '24h' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, initJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;
}

type AuthUserRow = Pick<User, 'id' | 'username' | 'role' | 'is_active' | 'must_change_password' | 'token_version'>;

function makeAuthenticate(allowMustChangePassword: boolean) {
  return function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token không hợp lệ' });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = verifyToken(authHeader.slice(7));
    } catch {
      res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
      return;
    }

    const userId = Number(payload?.userId);
    if (!Number.isInteger(userId) || typeof payload.tv !== 'number') {
      res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
      return;
    }

    const user = db.prepare(
      'SELECT id, username, role, is_active, must_change_password, token_version FROM users WHERE id = ?'
    ).get(userId) as AuthUserRow | undefined;

    if (!user || !user.is_active || user.token_version !== payload.tv) {
      res.status(401).json({ error: 'Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại' });
      return;
    }

    // Authority always comes from the database, never from the token claims
    req.user = { userId: user.id, username: user.username, role: user.role, tv: user.token_version };

    if (!allowMustChangePassword && user.must_change_password) {
      res.status(403).json({ error: 'MUST_CHANGE_PASSWORD' });
      return;
    }
    next();
  };
}

/** Standard authentication: valid, non-revoked token and password already changed. */
export const authenticate = makeAuthenticate(false);

/** Only for GET /api/auth/me and PUT /api/auth/change-password. */
export const authenticateAllowMustChange = makeAuthenticate(true);

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Cần quyền quản trị viên' });
    return;
  }
  next();
}
