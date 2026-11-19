import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthUser, ProductRequest } from '../../src/shared/types.ts';
import {
  getProductsWithPool,
  getSettings,
  hydrateOrders,
  HttpError,
  runImmediateTransaction,
} from '../db.ts';
import { getWholesaleOrders } from './wholesaleApi.ts';

/**
 * Lists all student-submitted bulk item requests sorted by popularity (`upvotesCount DESC`).
 */
export function listProductRequests(
  db: DatabaseSync,
  viewerUserId?: string | null
): ProductRequest[] {
  const rows = db
    .prepare(`
      SELECT
        r.*,
        (r.base_upvotes + COUNT(v.user_id)) AS total_upvotes,
        MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS viewer_voted
      FROM product_requests r
      LEFT JOIN product_request_votes v ON v.request_id = r.id
      GROUP BY r.id
      ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, total_upvotes DESC, r.created_at DESC
    `)
    .all(viewerUserId ?? '') as Array<Record<string, unknown>>;

  return rows.map(mapProductRequestRow);
}

export function getProductRequestById(
  db: DatabaseSync,
  requestId: string,
  viewerUserId?: string | null
): ProductRequest | null {
  const row = db
    .prepare(`
      SELECT
        r.*,
        (r.base_upvotes + COUNT(v.user_id)) AS total_upvotes,
        MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS viewer_voted
      FROM product_requests r
      LEFT JOIN product_request_votes v ON v.request_id = r.id
      WHERE r.id = ?
      GROUP BY r.id
    `)
    .get(viewerUserId ?? '', requestId) as Record<string, unknown> | undefined;

  return row ? mapProductRequestRow(row) : null;
}

function mapProductRequestRow(r: Record<string, unknown>): ProductRequest {
  return {
    id: String(r.id),
    itemName: String(r.item_name),
    brandOrSize: String(r.brand_or_size),
    category: String(r.category),
    requestedByName: String(r.requested_by_name),
    upvotesCount: Number(r.total_upvotes),
    viewerHasVoted: Number(r.viewer_voted) === 1,
    status: String(r.status) === 'stocked' ? 'stocked' : 'open',
    createdAt: String(r.created_at),
  };
}

function sanitizeRequestText(raw: unknown, maxLength = 120): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Creates a new student bulk-item request and automatically casts the author's upvote. */
export function createProductRequest(
  db: DatabaseSync,
  user: AuthUser,
  input: { itemName?: string; brandOrSize?: string; category?: string }
): ProductRequest {
  const itemName = sanitizeRequestText(input.itemName, 120);
  const brandOrSize = sanitizeRequestText(input.brandOrSize, 120) || 'Wholesale bulk pack';
  const category = sanitizeRequestText(input.category, 60) || 'Cooking Staples';

  if (itemName.length < 2) {
    throw new HttpError(400, 'Please enter an item name of at least 2 characters.');
  }

  const id = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const nowIso = new Date().toISOString();

  runImmediateTransaction(db, () => {
    db.prepare(`
      INSERT INTO product_requests (
        id, item_name, brand_or_size, category, requested_by_user_id,
        requested_by_name, base_upvotes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?)
    `).run(id, itemName, brandOrSize, category, user.id, user.name, nowIso);

    db.prepare(
      'INSERT INTO product_request_votes (request_id, user_id, created_at) VALUES (?, ?, ?)'
    ).run(id, user.id, nowIso);
  });

  const created = getProductRequestById(db, id, user.id);
  if (!created) throw new HttpError(500, 'Failed to load created request.');
  return created;
}

/** Toggles a student's upvote on a requested item (`+1` or `-1`). */
export function toggleProductRequestVote(
  db: DatabaseSync,
  requestId: string,
  user: AuthUser
): ProductRequest {
  runImmediateTransaction(db, () => {
    const exists = db
      .prepare('SELECT id FROM product_requests WHERE id = ?')
      .get(requestId) as { id: string } | undefined;
    if (!exists) {
      throw new HttpError(404, 'Requested item not found.');
    }

    const existingVote = db
      .prepare('SELECT 1 FROM product_request_votes WHERE request_id = ? AND user_id = ?')
      .get(requestId, user.id);

    if (existingVote) {
      db.prepare('DELETE FROM product_request_votes WHERE request_id = ? AND user_id = ?').run(
        requestId,
        user.id
      );
    } else {
      db.prepare(
        'INSERT INTO product_request_votes (request_id, user_id, created_at) VALUES (?, ?, ?)'
      ).run(requestId, user.id, new Date().toISOString());
    }
  });

  const updated = getProductRequestById(db, requestId, user.id);
  if (!updated) throw new HttpError(404, 'Requested item not found.');
  return updated;
}

/** Allows the founder to mark a top-voted student request as `'stocked'` or `'open'`. */
export function updateProductRequestStatus(
  db: DatabaseSync,
  requestId: string,
  status: 'open' | 'stocked'
): ProductRequest {
  const safeStatus = status === 'stocked' ? 'stocked' : 'open';
  const res = db
    .prepare('UPDATE product_requests SET status = ? WHERE id = ?')
    .run(safeStatus, requestId);

  if (Number(res.changes) === 0) {
    throw new HttpError(404, 'Requested item not found.');
  }

  const updated = getProductRequestById(db, requestId, null);
  if (!updated) throw new HttpError(404, 'Requested item not found.');
  return updated;
}

/** Exports a complete JSON snapshot of the SQLite database for 1-click founder backups. */
export function buildDatabaseBackupPayload(db: DatabaseSync): Record<string, unknown> {
  const orderRows = db
    .prepare('SELECT * FROM orders ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;

  return {
    exportedAt: new Date().toISOString(),
    settings: getSettings(db),
    products: getProductsWithPool(db, true),
    orders: hydrateOrders(db, orderRows),
    wholesaleOrders: getWholesaleOrders(db),
    productRequests: listProductRequests(db, null),
  };
}
