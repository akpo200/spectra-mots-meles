import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { PlayerSession } from '../types.js';

const cookieName = 'spectra_session';

export function signSession(payload: PlayerSession, ttlSeconds: number): string {
  return jwt.sign(payload, secret(), { expiresIn: ttlSeconds });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 1000 * 60 * 60 * 2
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(cookieName, { path: '/' });
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[cookieName];
  if (!token) {
    res.status(401).json({ error: 'Accès refusé.' });
    return;
  }
  try {
    res.locals.session = jwt.verify(token, secret()) as PlayerSession;
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireSession(req, res, () => {
    if ((res.locals.session as PlayerSession).role !== 'admin') {
      res.status(403).json({ error: 'Accès refusé.' });
      return;
    }
    next();
  });
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'spectra-directrice';
  return password === adminPassword;
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 24) {
    return 'spectra-default-fallback-super-secret-key-2026-omega';
  }
  return value;
}
