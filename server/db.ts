import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  DropSettings,
  DropStatus,
  Order,
  OrderItemAllocation,
  OrderStatus,
  AllocationStatus,
  ProductWithPool,
} from '../src/shared/types.ts';

/**
 * Custom HTTP-friendly error so services can specify clean 400/401/403/404/409
 * status codes that Express converts directly into `{ error: message }` JSON.
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Opens the SQLite database using Node 22's built-in `node:sqlite` driver.
 * Enables WAL mode and a 5-second busy timeout so concurrent student checkouts
 * queue cleanly without throwing lock errors.
 */
export function openDatabase(customPath?: string): DatabaseSync {
  const sqlitePath = customPath || process.env.SQLITE_PATH || 'data/divly.sqlite';
  if (sqlitePath !== ':memory:') {
    const resolved = path.resolve(sqlitePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
  }

  const db = new DatabaseSync(sqlitePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);

  initSchema(db);
  return db;
}

/**
 * Creates all tables and uniqueness constraints if they do not exist yet.
 * Notice `UNIQUE(drop_cycle_number, product_id, global_slot_index)` on `pool_allocations`:
 * this guarantees at the database level that two students can NEVER be assigned the same slot.
 */
export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hub_name TEXT NOT NULL,
      hub_short_label TEXT NOT NULL,
      hub_address TEXT NOT NULL,
      pickup_window TEXT NOT NULL,
      cutoff_at_iso TEXT NOT NULL,
      drop_status TEXT NOT NULL CHECK (drop_status IN ('open', 'closed')),
      free_delivery_threshold_pence INTEGER NOT NULL DEFAULT 800,
      small_order_fee_pence INTEGER NOT NULL DEFAULT 50,
      drop_cycle_number INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      image_emoji TEXT NOT NULL,
      unit_description TEXT NOT NULL,
      case_description TEXT NOT NULL,
      case_size INTEGER NOT NULL CHECK (case_size >= 1),
      share_price_pence INTEGER NOT NULL CHECK (share_price_pence >= 0),
      aldi_price_pence INTEGER NOT NULL CHECK (aldi_price_pence >= 0),
      aldi_unit_label TEXT NOT NULL,
      wholesale_case_cost_pence INTEGER NOT NULL CHECK (wholesale_case_cost_pence >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      drop_cycle_number INTEGER NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      user_email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending_payment', 'paid_pooling', 'settled', 'refunded', 'collected')),
      items_json TEXT NOT NULL DEFAULT '[]',
      subtotal_pence INTEGER NOT NULL,
      fee_pence INTEGER NOT NULL,
      total_paid_pence INTEGER NOT NULL,
      refunded_pence INTEGER NOT NULL DEFAULT 0,
      net_charged_pence INTEGER NOT NULL,
      total_aldi_comparison_pence INTEGER NOT NULL,
      pickup_code TEXT NOT NULL UNIQUE,
      pickup_pin TEXT NOT NULL UNIQUE,
      qr_token TEXT NOT NULL,
      payment_mode TEXT NOT NULL CHECK (payment_mode IN ('stripe_live', 'test_simulated')),
      stripe_session_id TEXT,
      stripe_payment_intent_id TEXT,
      collected_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pool_allocations (
      id TEXT PRIMARY KEY,
      drop_cycle_number INTEGER NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      product_brand TEXT NOT NULL,
      unit_description TEXT NOT NULL,
      image_emoji TEXT NOT NULL,
      global_slot_index INTEGER NOT NULL,
      box_number INTEGER NOT NULL,
      slot_in_box INTEGER NOT NULL,
      case_size INTEGER NOT NULL,
      share_price_pence INTEGER NOT NULL,
      aldi_price_pence INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pooling', 'locked_box', 'fulfilled', 'auto_refunded')),
      created_at TEXT NOT NULL,
      UNIQUE(drop_cycle_number, product_id, global_slot_index)
    );

    CREATE INDEX IF NOT EXISTS idx_allocations_cycle_product_box
      ON pool_allocations(drop_cycle_number, product_id, box_number);
    CREATE INDEX IF NOT EXISTS idx_allocations_order
      ON pool_allocations(order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user
      ON orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_cycle
      ON orders(drop_cycle_number, created_at DESC);
  `);
}

/**
 * Runs a callback inside an immediate SQLite write transaction (`BEGIN IMMEDIATE`).
 * Retries briefly if another process holds a momentary write lock.
 */
export function runImmediateTransaction<T>(db: DatabaseSync, fn: () => T): T {
  const maxRetries = 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      db.exec('BEGIN IMMEDIATE');
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries && msg.includes('locked')) {
        continue;
      }
      throw err;
    }
  }

  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback errors if SQLite already rolled back.
    }
    throw err;
  }
}

/** Reads the single settings row into the shared `DropSettings` shape. */
export function getSettings(db: DatabaseSync): DropSettings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    throw new HttpError(500, 'Drop settings have not been seeded.');
  }
  return {
    hubName: String(row.hub_name),
    hubShortLabel: String(row.hub_short_label),
    hubAddress: String(row.hub_address),
    pickupWindow: String(row.pickup_window),
    cutoffAtIso: String(row.cutoff_at_iso),
    dropStatus: String(row.drop_status) as DropStatus,
    freeDeliveryThresholdPence: Number(row.free_delivery_threshold_pence),
    smallOrderFeePence: Number(row.small_order_fee_pence),
    dropCycleNumber: Number(row.drop_cycle_number),
  };
}

/**
 * Returns products enriched with live pool progress for the current `dropCycleNumber`.
 * By default returns only active non-deleted products for the student storefront;
 * pass `includeInactive = true` for the Admin catalog table.
 */
export function getProductsWithPool(db: DatabaseSync, includeInactive = false): ProductWithPool[] {
  const settings = getSettings(db);
  const whereClause = includeInactive
    ? 'WHERE p.deleted_at IS NULL'
    : 'WHERE p.deleted_at IS NULL AND p.is_active = 1';

  const rows = db.prepare(`
    SELECT
      p.*,
      COALESCE(SUM(CASE WHEN a.status IN ('pooling', 'locked_box', 'fulfilled') THEN 1 ELSE 0 END), 0) AS active_slots,
      COALESCE(SUM(CASE WHEN a.status IN ('locked_box', 'fulfilled') THEN 1 ELSE 0 END), 0) AS locked_slots,
      COALESCE(SUM(CASE WHEN a.status = 'pooling' THEN 1 ELSE 0 END), 0) AS pooling_slots
    FROM products p
    LEFT JOIN pool_allocations a
      ON a.product_id = p.id AND a.drop_cycle_number = ?
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.sort_order ASC, p.created_at ASC
  `).all(settings.dropCycleNumber) as Array<Record<string, unknown>>;

  return rows.map((row) => mapProductWithPoolRow(row));
}

export function getProductWithPoolById(db: DatabaseSync, productId: string): ProductWithPool | null {
  const settings = getSettings(db);
  const row = db.prepare(`
    SELECT
      p.*,
      COALESCE(SUM(CASE WHEN a.status IN ('pooling', 'locked_box', 'fulfilled') THEN 1 ELSE 0 END), 0) AS active_slots,
      COALESCE(SUM(CASE WHEN a.status IN ('locked_box', 'fulfilled') THEN 1 ELSE 0 END), 0) AS locked_slots,
      COALESCE(SUM(CASE WHEN a.status = 'pooling' THEN 1 ELSE 0 END), 0) AS pooling_slots
    FROM products p
    LEFT JOIN pool_allocations a
      ON a.product_id = p.id AND a.drop_cycle_number = ?
    WHERE p.id = ? AND p.deleted_at IS NULL
    GROUP BY p.id
  `).get(settings.dropCycleNumber, productId) as Record<string, unknown> | undefined;

  return row ? mapProductWithPoolRow(row) : null;
}

function mapProductWithPoolRow(row: Record<string, unknown>): ProductWithPool {
  const caseSize = Number(row.case_size);
  const sharePricePence = Number(row.share_price_pence);
  const aldiPricePence = Number(row.aldi_price_pence);
  const totalClaimedSlots = Number(row.active_slots);
  const lockedCasesCount = Math.floor(Number(row.locked_slots) / caseSize);
  const openCaseClaimedSlots = Number(row.pooling_slots);
  const openCaseRemainingSlots = Math.max(0, caseSize - openCaseClaimedSlots);
  const currentCaseNumber = lockedCasesCount + 1;
  const savingsPercent =
    aldiPricePence > 0
      ? Math.max(0, Math.round(((aldiPricePence - sharePricePence) / aldiPricePence) * 100))
      : 0;

  return {
    id: String(row.id),
    name: String(row.name),
    brand: String(row.brand),
    category: String(row.category),
    imageEmoji: String(row.image_emoji),
    unitDescription: String(row.unit_description),
    caseDescription: String(row.case_description),
    caseSize,
    sharePricePence,
    aldiPricePence,
    aldiUnitLabel: String(row.aldi_unit_label),
    wholesaleCaseCostPence: Number(row.wholesale_case_cost_pence),
    isActive: Number(row.is_active) === 1,
    totalClaimedSlots,
    lockedCasesCount,
    openCaseClaimedSlots,
    openCaseRemainingSlots,
    currentCaseNumber,
    savingsPercent,
  };
}

/** Loads one `Order` along with its ordered `OrderItemAllocation[]` rows. */
export function getOrderById(db: DatabaseSync, orderId: string): Order | null {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return hydrateOrders(db, [row])[0] ?? null;
}

/** Hydrates raw `orders` rows with their `pool_allocations` in a single batch query. */
export function hydrateOrders(db: DatabaseSync, orderRows: Array<Record<string, unknown>>): Order[] {
  if (orderRows.length === 0) return [];
  const placeholders = orderRows.map(() => '?').join(', ');
  const orderIds = orderRows.map((r) => String(r.id));

  const allocRows = db.prepare(`
    SELECT * FROM pool_allocations
    WHERE order_id IN (${placeholders})
    ORDER BY product_name ASC, global_slot_index ASC
  `).all(...orderIds) as Array<Record<string, unknown>>;

  const byOrder = new Map<string, OrderItemAllocation[]>();
  for (const a of allocRows) {
    const orderId = String(a.order_id);
    const list = byOrder.get(orderId) ?? [];
    list.push({
      id: String(a.id),
      productId: String(a.product_id),
      productName: String(a.product_name),
      productBrand: String(a.product_brand),
      unitDescription: String(a.unit_description),
      imageEmoji: String(a.image_emoji),
      globalSlotIndex: Number(a.global_slot_index),
      boxNumber: Number(a.box_number),
      slotInBox: Number(a.slot_in_box),
      caseSize: Number(a.case_size),
      sharePricePence: Number(a.share_price_pence),
      aldiPricePence: Number(a.aldi_price_pence),
      status: String(a.status) as AllocationStatus,
    });
    byOrder.set(orderId, list);
  }

  return orderRows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    userEmail: String(r.user_email),
    userName: String(r.user_name),
    status: String(r.status) as OrderStatus,
    subtotalPence: Number(r.subtotal_pence),
    feePence: Number(r.fee_pence),
    totalPaidPence: Number(r.total_paid_pence),
    refundedPence: Number(r.refunded_pence),
    netChargedPence: Number(r.net_charged_pence),
    totalAldiComparisonPence: Number(r.total_aldi_comparison_pence),
    pickupCode: String(r.pickup_code),
    pickupPin: String(r.pickup_pin),
    qrToken: String(r.qr_token),
    paymentMode: String(r.payment_mode) as 'stripe_live' | 'test_simulated',
    stripeSessionId: r.stripe_session_id ? String(r.stripe_session_id) : null,
    collectedAt: r.collected_at ? String(r.collected_at) : null,
    createdAt: String(r.created_at),
    allocations: byOrder.get(String(r.id)) ?? [],
  }));
}
