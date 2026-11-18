import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthUser } from '../../src/shared/types.ts';
import { HttpError } from '../db.ts';

const ALLOWED_CAMPUS_DOMAINS = ['@student.bham.ac.uk', '@bham.ac.uk'];

export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_LOGIN === 'true';
}

function getOtpSecret(): string {
  return process.env.QR_HMAC_SECRET || 'divly-dev-hmac-secret-change-in-prod';
}

function getAdminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  const items = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(items);
}

function hashOtp(email: string, code: string): string {
  return crypto
    .createHmac('sha256', getOtpSecret())
    .update(`otp:${email.toLowerCase()}:${code}`)
    .digest('hex');
}

function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function deriveNameFromEmail(email: string): string {
  const prefix = email.split('@')[0] || 'Student';
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isAllowedCampusEmail(rawEmail: string): boolean {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return false;
  }
  if (getAdminEmailSet().has(email)) {
    return true;
  }
  return ALLOWED_CAMPUS_DOMAINS.some((domain) => email.endsWith(domain));
}

function upsertUser(
  db: DatabaseSync,
  email: string,
  preferredName: string | undefined,
  role: 'student' | 'admin'
): AuthUser {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(normalizedEmail) as Record<string, unknown> | undefined;

  if (existing) {
    const nextRole = role === 'admin' || existing.role === 'admin' ? 'admin' : 'student';
    const nextName = preferredName?.trim() || String(existing.name);
    if (nextRole !== existing.role || nextName !== existing.name) {
      db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(
        nextName,
        nextRole,
        String(existing.id)
      );
    }
    return {
      id: String(existing.id),
      email: normalizedEmail,
      name: nextName,
      role: nextRole,
    };
  }

  const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const finalName = preferredName?.trim() || deriveNameFromEmail(normalizedEmail);
  db.prepare(
    'INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, normalizedEmail, finalName, role, new Date().toISOString());

  return {
    id,
    email: normalizedEmail,
    name: finalName,
    role,
  };
}

function issueSession(db: DatabaseSync, userId: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, userId, expiresAt, new Date(now).toISOString());

  return rawToken;
}

/**
 * Generates a 6-digit OTP for a valid `@student.bham.ac.uk` / `@bham.ac.uk` address.
 * Sends via Resend API when `RESEND_API_KEY` is configured; returns `devOtpCode` in dev mode.
 */
export async function requestOtp(
  db: DatabaseSync,
  rawEmail: string,
  _rawName?: string
): Promise<{ ok: true; message: string; devOtpCode?: string }> {
  const email = (rawEmail || '').trim().toLowerCase();
  if (!isAllowedCampusEmail(email)) {
    throw new HttpError(
      400,
      'Please sign in with a valid @student.bham.ac.uk or @bham.ac.uk University of Birmingham email.'
    );
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashOtp(email, code);
  const now = Date.now();
  const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
  const id = `otp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  db.prepare(
    'INSERT INTO otp_codes (id, email, code_hash, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(id, email, codeHash, expiresAt, new Date(now).toISOString());

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Divly UoB <onboarding@resend.dev>',
          to: [email],
          subject: `${code} is your Divly UoB verification code`,
          html: `<p>Your Divly University of Birmingham sign-in code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
        }),
      });
    } catch (err) {
      console.error('[Divly Auth] Resend delivery error:', err);
    }
  }

  if (isDevMode()) {
    if (!process.env.DIVLY_QUIET_LOGS) {
      console.log(`[Divly Auth] 6-digit OTP for ${email}: ${code}`);
    }
    return {
      ok: true,
      message: 'Verification code generated (dev mode).',
      devOtpCode: code,
    };
  }

  return {
    ok: true,
    message: '6-digit code sent to your University of Birmingham inbox.',
  };
}

/** Verifies a 6-digit OTP in constant time and returns a 30-day session token. */
export function verifyOtp(
  db: DatabaseSync,
  rawEmail: string,
  rawCode: string,
  rawName?: string
): { token: string; user: AuthUser } {
  const email = (rawEmail || '').trim().toLowerCase();
  const code = (rawCode || '').trim();

  if (!email || !/^\d{6}$/.test(code)) {
    throw new HttpError(400, 'Enter your UoB email and 6-digit verification code.');
  }

  const row = db
    .prepare(
      'SELECT * FROM otp_codes WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    )
    .get(email) as Record<string, unknown> | undefined;

  if (!row) {
    throw new HttpError(401, 'No active verification code found for this email.');
  }

  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    throw new HttpError(401, 'Verification code has expired. Please request a new one.');
  }

  const expectedBuf = Buffer.from(String(row.code_hash), 'hex');
  const providedBuf = Buffer.from(hashOtp(email, code), 'hex');

  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    throw new HttpError(401, 'Incorrect 6-digit verification code.');
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(String(row.id));

  const role = getAdminEmailSet().has(email) ? 'admin' : 'student';
  const user = upsertUser(db, email, rawName, role);
  const token = issueSession(db, user.id);

  return { token, user };
}

/** Authenticates the drop founder/admin using `ADMIN_PIN` (default `uob-admin-2026`). */
export function adminLogin(
  db: DatabaseSync,
  rawPin: string,
  rawEmail?: string
): { token: string; user: AuthUser } {
  const expectedPin = process.env.ADMIN_PIN || 'uob-admin-2026';
  const providedDigest = crypto.createHash('sha256').update(String(rawPin || '')).digest();
  const expectedDigest = crypto.createHash('sha256').update(expectedPin).digest();

  if (!crypto.timingSafeEqual(providedDigest, expectedDigest)) {
    throw new HttpError(401, 'Invalid Admin PIN.');
  }

  const email = rawEmail?.trim().toLowerCase() || 'admin@bham.ac.uk';
  const user = upsertUser(db, email, 'UoB Drop Admin', 'admin');
  const token = issueSession(db, user.id);

  return { token, user };
}

/** 1-click developer/QA login enabled only when `isDevMode()` is true. */
export function devLogin(
  db: DatabaseSync,
  role: 'student' | 'admin',
  persona?: string
): { token: string; user: AuthUser } {
  if (!isDevMode()) {
    throw new HttpError(403, 'Developer login is disabled in production.');
  }

  if (role === 'admin') {
    const user = upsertUser(db, 'admin@bham.ac.uk', 'UoB Drop Admin', 'admin');
    return { token: issueSession(db, user.id), user };
  }

  const cleanSlug = (persona || 'maya.patel')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  const email = `${cleanSlug || 'maya.patel'}@student.bham.ac.uk`;
  const displayName = persona ? deriveNameFromEmail(email) : 'Maya Patel';
  const user = upsertUser(db, email, displayName, 'student');
  return { token: issueSession(db, user.id), user };
}

/** Resolves the authenticated `AuthUser` from an `Authorization: Bearer <token>` header. */
export function getUserFromAuthHeader(
  db: DatabaseSync,
  authHeader?: string
): AuthUser | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(`
      SELECT u.id, u.email, u.name, u.role, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash) as Record<string, unknown> | undefined;

  if (!row) return null;
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as 'student' | 'admin',
  };
}

export function logoutByAuthHeader(db: DatabaseSync, authHeader?: string): void {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;
  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(rawToken));
}
