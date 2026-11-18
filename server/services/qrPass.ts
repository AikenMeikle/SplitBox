import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Order, ScanLookupResult } from '../../src/shared/types.ts';
import { getOrderById, hydrateOrders, HttpError, runImmediateTransaction } from '../db.ts';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function getQrSecret(): string {
  return process.env.QR_HMAC_SECRET || 'divly-dev-hmac-secret-change-in-prod';
}

/**
 * Generates a collision-free human-readable pickup code like `UOB-7K4M9P`.
 * Checks the `orders` table to guarantee uniqueness.
 */
export function generateUniquePickupCode(db: DatabaseSync): string {
  const checkStmt = db.prepare('SELECT 1 FROM orders WHERE pickup_code = ?');
  for (let attempt = 0; attempt < 100; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    }
    const candidate = `UOB-${suffix}`;
    if (!checkStmt.get(candidate)) {
      return candidate;
    }
  }
  throw new HttpError(500, 'Unable to allocate unique pickup code.');
}

/**
 * Generates a collision-free 6-digit numeric PIN (`100000`–`999999`) so hub
 * volunteers can look up any student's parcel verbally if their phone dies.
 */
export function generateUniquePickupPin(db: DatabaseSync): string {
  const checkStmt = db.prepare('SELECT 1 FROM orders WHERE pickup_pin = ?');
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = String(crypto.randomInt(100000, 1000000));
    if (!checkStmt.get(candidate)) {
      return candidate;
    }
  }
  throw new HttpError(500, 'Unable to allocate unique pickup PIN.');
}

/**
 * Signs an unforgeable QR pickup token: `DV1.<orderId>.<nonce>.<hexSig>`
 * using HMAC-SHA256 so screenshots cannot be edited to point at another order.
 */
export function signQrToken(orderId: string, customNonce?: string): string {
  const nonce = customNonce || crypto.randomBytes(8).toString('hex');
  const payload = `DV1.${orderId}.${nonce}`;
  const hexSig = crypto.createHmac('sha256', getQrSecret()).update(payload).digest('hex');
  return `${payload}.${hexSig}`;
}

/**
 * Cryptographically verifies a `DV1.<orderId>.<nonce>.<hexSig>` QR string
 * in constant time (`crypto.timingSafeEqual`) to prevent timing attacks.
 */
export function verifyQrTokenSignature(token: string): {
  valid: boolean;
  orderId?: string;
  reason?: string;
} {
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4 || parts[0] !== 'DV1') {
    return { valid: false, reason: 'Malformed QR pass format (expected DV1 token).' };
  }

  const [prefix, orderId, nonce, providedHex] = parts;
  if (!orderId || !nonce || !/^[0-9a-f]{64}$/i.test(providedHex)) {
    return { valid: false, reason: 'Invalid QR signature encoding.' };
  }

  const payload = `${prefix}.${orderId}.${nonce}`;
  const expectedHex = crypto.createHmac('sha256', getQrSecret()).update(payload).digest('hex');

  const providedBuf = Buffer.from(providedHex.toLowerCase(), 'hex');
  const expectedBuf = Buffer.from(expectedHex.toLowerCase(), 'hex');

  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: 'QR signature verification failed (tampered or forged pass).' };
  }

  return { valid: true, orderId };
}

/**
 * Looks up and validates a student's order at the Saturday pickup hub.
 * Accepts:
 *  1. Signed `DV1...` QR token
 *  2. `UOB-XXXXXX` pickup code
 *  3. 6-digit `pickupPin`
 *  4. Student email address (`@student.bham.ac.uk`)
 */
export function verifyScanInput(db: DatabaseSync, rawInput: string): ScanLookupResult {
  const input = (rawInput || '').trim();
  if (!input) {
    return {
      valid: false,
      alreadyCollected: false,
      reason: 'Enter a QR token, UOB pickup code, 6-digit PIN, or student email.',
    };
  }

  let order: Order | null = null;

  if (input.startsWith('DV1.')) {
    const sigCheck = verifyQrTokenSignature(input);
    if (!sigCheck.valid || !sigCheck.orderId) {
      return {
        valid: false,
        alreadyCollected: false,
        reason: sigCheck.reason || 'Invalid QR signature.',
      };
    }
    const candidate = getOrderById(db, sigCheck.orderId);
    if (!candidate || candidate.qrToken !== input || candidate.status === 'pending_payment') {
      return {
        valid: false,
        alreadyCollected: false,
        reason: 'QR pass does not match an active paid order.',
      };
    }
    order = candidate;
  } else if (/^UOB-[A-Z0-9]{6}$/i.test(input)) {
    const row = db
      .prepare("SELECT * FROM orders WHERE UPPER(pickup_code) = UPPER(?) AND status != 'pending_payment'")
      .get(input) as Record<string, unknown> | undefined;
    order = row ? hydrateOrders(db, [row])[0] ?? null : null;
  } else if (/^\d{6}$/.test(input)) {
    const row = db
      .prepare("SELECT * FROM orders WHERE pickup_pin = ? AND status != 'pending_payment'")
      .get(input) as Record<string, unknown> | undefined;
    order = row ? hydrateOrders(db, [row])[0] ?? null : null;
  } else if (input.includes('@')) {
    const rows = db
      .prepare(`
        SELECT * FROM orders
        WHERE LOWER(user_email) = LOWER(?) AND status != 'pending_payment'
        ORDER BY CASE WHEN status IN ('settled', 'paid_pooling') THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1
      `)
      .all(input) as Array<Record<string, unknown>>;
    order = rows.length > 0 ? hydrateOrders(db, rows)[0] ?? null : null;
  } else {
    const row = db
      .prepare("SELECT * FROM orders WHERE id = ? AND status != 'pending_payment'")
      .get(input) as Record<string, unknown> | undefined;
    order = row ? hydrateOrders(db, [row])[0] ?? null : null;
  }

  if (!order) {
    return {
      valid: false,
      alreadyCollected: false,
      reason: 'No matching paid student order found.',
    };
  }

  if (order.status === 'collected' || order.collectedAt !== null) {
    return {
      valid: false,
      alreadyCollected: true,
      reason: `Order was already collected at ${order.collectedAt}.`,
      order,
    };
  }

  if (order.status === 'refunded') {
    return {
      valid: false,
      alreadyCollected: false,
      reason: 'This order was 100% auto-refunded because its pool did not fill.',
      order,
    };
  }

  const releasableItems = order.allocations.filter(
    (a) => a.status === 'fulfilled' || a.status === 'locked_box'
  );
  if (releasableItems.length === 0) {
    return {
      valid: false,
      alreadyCollected: false,
      reason: 'This order has no locked or fulfilled cases ready for pickup yet.',
      order,
    };
  }

  return {
    valid: true,
    alreadyCollected: false,
    order,
  };
}

/**
 * Atomically marks a verified order as `collected`, blocking double-collection
 * even if two volunteers tap "Mark Collected" at the exact same millisecond.
 */
export function collectOrder(db: DatabaseSync, orderId: string): Order {
  return runImmediateTransaction(db, () => {
    const existing = getOrderById(db, orderId);
    if (!existing) {
      throw new HttpError(404, 'Order not found.');
    }
    if (existing.status === 'collected' || existing.collectedAt !== null) {
      throw new HttpError(409, 'Order has already been collected.');
    }
    if (existing.status === 'refunded' || existing.status === 'pending_payment') {
      throw new HttpError(400, `Cannot collect order with status "${existing.status}".`);
    }

    const nowIso = new Date().toISOString();
    const updateRes = db
      .prepare('UPDATE orders SET status = ?, collected_at = ? WHERE id = ? AND collected_at IS NULL')
      .run('collected', nowIso, orderId);

    if (Number(updateRes.changes) !== 1) {
      throw new HttpError(409, 'Order has already been collected.');
    }

    const updated = getOrderById(db, orderId);
    if (!updated) {
      throw new HttpError(500, 'Failed to reload collected order.');
    }
    return updated;
  });
}
