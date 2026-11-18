import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthUser, Order } from '../../src/shared/types.ts';
import { getOrderById, getSettings, HttpError, runImmediateTransaction } from '../db.ts';
import { generateUniquePickupCode, generateUniquePickupPin, signQrToken } from './qrPass.ts';

export interface ValidatedLineItem {
  productId: string;
  productName: string;
  unitDescription: string;
  sharePricePence: number;
  aldiPricePence: number;
  quantity: number;
}

export interface PendingCheckoutData {
  orderId: string;
  subtotalPence: number;
  feePence: number;
  totalPaidPence: number;
  lineItems: ValidatedLineItem[];
}

/**
 * Validates basket items, computes integer GBP pence totals + small-order fee,
 * and inserts a `pending_payment` order row (without claiming pool slots until paid).
 */
export function createPendingOrder(
  db: DatabaseSync,
  user: AuthUser,
  rawItems: Array<{ productId: string; quantity: number }>,
  paymentMode: 'stripe_live' | 'test_simulated'
): PendingCheckoutData {
  const settings = getSettings(db);
  if (settings.dropStatus !== 'open') {
    throw new HttpError(400, 'This weekly drop is closed. Check back when the next drop opens!');
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(400, 'Your basket is empty.');
  }

  // Merge duplicate productIds and validate positive integer quantities.
  const mergedQty = new Map<string, number>();
  for (const item of rawItems) {
    if (!item || typeof item.productId !== 'string' || !item.productId.trim()) {
      throw new HttpError(400, 'Invalid product in basket.');
    }
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      throw new HttpError(400, 'Item quantity must be a whole number between 1 and 50.');
    }
    const next = (mergedQty.get(item.productId) ?? 0) + qty;
    if (next > 50) {
      throw new HttpError(400, 'Maximum 50 shares per item per order.');
    }
    mergedQty.set(item.productId, next);
  }

  const productStmt = db.prepare(
    'SELECT * FROM products WHERE id = ? AND is_active = 1 AND deleted_at IS NULL'
  );

  const lineItems: ValidatedLineItem[] = [];
  let subtotalPence = 0;
  let totalAldiComparisonPence = 0;

  for (const [productId, quantity] of mergedQty.entries()) {
    const p = productStmt.get(productId) as Record<string, unknown> | undefined;
    if (!p) {
      throw new HttpError(400, `Product "${productId}" is no longer available.`);
    }
    const sharePricePence = Number(p.share_price_pence);
    const aldiPricePence = Number(p.aldi_price_pence);
    subtotalPence += sharePricePence * quantity;
    totalAldiComparisonPence += aldiPricePence * quantity;
    lineItems.push({
      productId,
      productName: `${String(p.brand)} ${String(p.name)}`,
      unitDescription: String(p.unit_description),
      sharePricePence,
      aldiPricePence,
      quantity,
    });
  }

  const feePence =
    subtotalPence >= settings.freeDeliveryThresholdPence ? 0 : settings.smallOrderFeePence;
  const totalPaidPence = subtotalPence + feePence;

  const orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const normalizedItems = lineItems.map((li) => ({
    productId: li.productId,
    quantity: li.quantity,
  }));

  runImmediateTransaction(db, () => {
    const freshSettings = getSettings(db);
    if (freshSettings.dropStatus !== 'open') {
      throw new HttpError(400, 'This weekly drop has just closed.');
    }

    const pickupCode = generateUniquePickupCode(db);
    const pickupPin = generateUniquePickupPin(db);
    const qrToken = signQrToken(orderId);
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO orders (
        id, drop_cycle_number, user_id, user_email, user_name, status,
        items_json, subtotal_pence, fee_pence, total_paid_pence,
        refunded_pence, net_charged_pence, total_aldi_comparison_pence,
        pickup_code, pickup_pin, qr_token, payment_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      freshSettings.dropCycleNumber,
      user.id,
      user.email,
      user.name,
      JSON.stringify(normalizedItems),
      subtotalPence,
      feePence,
      totalPaidPence,
      totalPaidPence,
      totalAldiComparisonPence,
      pickupCode,
      pickupPin,
      qrToken,
      paymentMode,
      nowIso
    );
  });

  return {
    orderId,
    subtotalPence,
    feePence,
    totalPaidPence,
    lineItems,
  };
}

export function attachStripeSessionToOrder(
  db: DatabaseSync,
  orderId: string,
  stripeSessionId: string
): void {
  db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(stripeSessionId, orderId);
}

/**
 * Atomically confirms payment for an order and allocates sequential pool slots
 * (`global_slot_index = 0, 1, 2...`) inside a `BEGIN IMMEDIATE` write transaction.
 *
 * Whenever a wholesale box reaches `slot_in_box === caseSize`, ALL shares in that
 * box are immediately promoted from `'pooling'` to `'locked_box'`!
 */
export function confirmOrderPayment(
  db: DatabaseSync,
  orderId: string,
  options?: { stripePaymentIntentId?: string | null; expectedUserId?: string }
): Order {
  return runImmediateTransaction(db, () => {
    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      | Record<string, unknown>
      | undefined;

    if (!orderRow) {
      throw new HttpError(404, 'Pending order not found.');
    }

    if (options?.expectedUserId && String(orderRow.user_id) !== options.expectedUserId) {
      throw new HttpError(403, 'You are not authorised to confirm this order.');
    }

    // Idempotency: if Stripe webhook + browser redirect both fire, only allocate once!
    if (String(orderRow.status) !== 'pending_payment') {
      const existing = getOrderById(db, orderId);
      if (!existing) throw new HttpError(500, 'Failed to load confirmed order.');
      return existing;
    }

    const settings = getSettings(db);
    const dropCycleNumber = Number(orderRow.drop_cycle_number);
    if (settings.dropStatus !== 'open' || settings.dropCycleNumber !== dropCycleNumber) {
      throw new HttpError(409, 'This drop cycle is already closed and cannot accept new shares.');
    }

    const items = JSON.parse(String(orderRow.items_json)) as Array<{
      productId: string;
      quantity: number;
    }>;

    const getProductStmt = db.prepare('SELECT * FROM products WHERE id = ?');
    const getNextSlotStmt = db.prepare(`
      SELECT COALESCE(MAX(global_slot_index), -1) + 1 AS next_slot
      FROM pool_allocations
      WHERE drop_cycle_number = ? AND product_id = ?
    `);
    const insertAllocStmt = db.prepare(`
      INSERT INTO pool_allocations (
        id, drop_cycle_number, order_id, user_id, product_id,
        product_name, product_brand, unit_description, image_emoji,
        global_slot_index, box_number, slot_in_box, case_size,
        share_price_pence, aldi_price_pence, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pooling', ?)
    `);
    const promoteBoxStmt = db.prepare(`
      UPDATE pool_allocations
      SET status = 'locked_box'
      WHERE drop_cycle_number = ? AND product_id = ? AND box_number = ?
    `);

    const nowIso = new Date().toISOString();
    const userId = String(orderRow.user_id);

    for (const item of items) {
      const product = getProductStmt.get(item.productId) as Record<string, unknown> | undefined;
      if (!product) {
        throw new HttpError(400, `Product "${item.productId}" no longer exists.`);
      }

      const caseSize = Number(product.case_size);
      const nextSlotRow = getNextSlotStmt.get(dropCycleNumber, item.productId) as {
        next_slot: number;
      };
      const startSlot = Number(nextSlotRow.next_slot);

      for (let i = 0; i < item.quantity; i++) {
        const globalSlotIndex = startSlot + i;
        const boxNumber = Math.floor(globalSlotIndex / caseSize) + 1;
        const slotInBox = (globalSlotIndex % caseSize) + 1;
        const allocId = `alc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

        insertAllocStmt.run(
          allocId,
          dropCycleNumber,
          orderId,
          userId,
          item.productId,
          String(product.name),
          String(product.brand),
          String(product.unit_description),
          String(product.image_emoji),
          globalSlotIndex,
          boxNumber,
          slotInBox,
          caseSize,
          Number(product.share_price_pence),
          Number(product.aldi_price_pence),
          nowIso
        );

        // As soon as the final slot of a box is claimed, lock the entire wholesale box!
        if (slotInBox === caseSize) {
          promoteBoxStmt.run(dropCycleNumber, item.productId, boxNumber);
        }
      }
    }

    db.prepare(`
      UPDATE orders
      SET status = 'paid_pooling',
          stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id)
      WHERE id = ?
    `).run(options?.stripePaymentIntentId ?? null, orderId);

    const confirmed = getOrderById(db, orderId);
    if (!confirmed) {
      throw new HttpError(500, 'Failed to load confirmed order.');
    }
    return confirmed;
  });
}
