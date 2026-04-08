import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload, User } from '../types.js';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bamso-secret-key-change-in-production';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token không hợp lệ' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Cần quyền quản trị viên' });
    return;
  }
  next();
}

export function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { next(); return; }
  const user = db.prepare('SELECT must_change_password FROM users WHERE id = ?').get(req.user.userId) as User | undefined;
  if (user?.must_change_password) {
    res.status(403).json({ error: 'MUST_CHANGE_PASSWORD' });
    return;
  }
  next();
}
