import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthUser, Order } from '../../src/shared/types.ts';
import {
  getOrderById,
  getProductWithPoolById,
  getSettings,
  HttpError,
  runImmediateTransaction,
} from '../db.ts';
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
  creditAppliedPence: number;
  totalPaidPence: number;
  closerDiscountTotalPence: number;
  paymentMode: 'stripe_live' | 'test_simulated';
  lineItems: ValidatedLineItem[];
}

/**
 * Validates basket items, applies Almost-Full Closer Discounts + fee waivers,
 * applies available `users.credit_balance_pence` wallet credit, and inserts a
 * `pending_payment` order row.
 */
export function createPendingOrder(
  db: DatabaseSync,
  user: AuthUser,
  rawItems: Array<{ productId: string; quantity: number }>,
  preferredPaymentMode: 'stripe_live' | 'test_simulated'
): PendingCheckoutData {
  const settings = getSettings(db);
  if (settings.dropStatus !== 'open') {
    throw new HttpError(400, 'This weekly drop is closed. Check back when the next drop opens!');
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(400, 'Your basket is empty.');
  }

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

  const lineItems: ValidatedLineItem[] = [];
  let subtotalPence = 0;
  let totalAldiComparisonPence = 0;
  let closerDiscountTotalPence = 0;
  let anyWaivesSmallOrderFee = false;

  for (const [productId, quantity] of mergedQty.entries()) {
    const p = getProductWithPoolById(db, productId);
    if (!p || !p.isActive) {
      throw new HttpError(400, `Product "${productId}" is no longer available.`);
    }

    const chargedSharePence = p.effectiveSharePricePence;
    subtotalPence += chargedSharePence * quantity;
    totalAldiComparisonPence += p.aldiPricePence * quantity;
    closerDiscountTotalPence += p.closerDiscountPence * quantity;
    if (p.waivesSmallOrderFee) {
      anyWaivesSmallOrderFee = true;
    }

    lineItems.push({
      productId,
      productName: `${p.brand} ${p.name}`,
      unitDescription: p.unitDescription,
      sharePricePence: chargedSharePence,
      aldiPricePence: p.aldiPricePence,
      quantity,
    });
  }

  const feePence =
    anyWaivesSmallOrderFee || subtotalPence >= settings.freeDeliveryThresholdPence
      ? 0
      : settings.smallOrderFeePence;
  const grossOrderPence = subtotalPence + feePence;

  const orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const persistedItems = lineItems.map((li) => ({
    productId: li.productId,
    quantity: li.quantity,
    unitPricePence: li.sharePricePence,
  }));

  let creditAppliedPence = 0;
  let totalPaidPence = grossOrderPence;
  let finalPaymentMode: 'stripe_live' | 'test_simulated' = preferredPaymentMode;

  runImmediateTransaction(db, () => {
    const freshSettings = getSettings(db);
    if (freshSettings.dropStatus !== 'open') {
      throw new HttpError(400, 'This weekly drop has just closed.');
    }

    const userRow = db
      .prepare('SELECT credit_balance_pence FROM users WHERE id = ?')
      .get(user.id) as { credit_balance_pence: number } | undefined;
    const availableCredit = Math.max(0, Number(userRow?.credit_balance_pence || 0));

    creditAppliedPence = Math.min(availableCredit, grossOrderPence);
    totalPaidPence = grossOrderPence - creditAppliedPence;
    // £0.00 wallet-covered checkouts settle directly without Stripe redirect
    finalPaymentMode = totalPaidPence === 0 ? 'test_simulated' : preferredPaymentMode;

    const pickupCode = generateUniquePickupCode(db);
    const pickupPin = generateUniquePickupPin(db);
    const qrToken = signQrToken(orderId);
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO orders (
        id, drop_cycle_number, user_id, user_email, user_name, status,
        items_json, subtotal_pence, fee_pence, total_paid_pence,
        refunded_pence, net_charged_pence, total_aldi_comparison_pence,
        closer_discount_total_pence, credit_applied_pence, credit_restored_pence,
        pickup_code, pickup_pin, qr_token, payment_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      freshSettings.dropCycleNumber,
      user.id,
      user.email,
      user.name,
      JSON.stringify(persistedItems),
      subtotalPence,
      feePence,
      totalPaidPence,
      totalPaidPence,
      totalAldiComparisonPence,
      closerDiscountTotalPence,
      creditAppliedPence,
      pickupCode,
      pickupPin,
      qrToken,
      finalPaymentMode,
      nowIso
    );
  });

  return {
    orderId,
    subtotalPence,
    feePence,
    creditAppliedPence,
    totalPaidPence,
    closerDiscountTotalPence,
    paymentMode: finalPaymentMode,
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
 * Atomically confirms payment, deducts any applied wallet credit, allocates sequential
 * pool slots, and awards the £1.00 (`100p`) referrer bonus on a referred friend's first order!
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

    const userId = String(orderRow.user_id);
    const creditAppliedPence = Math.max(0, Number(orderRow.credit_applied_pence || 0));

    if (creditAppliedPence > 0) {
      const uRow = db
        .prepare('SELECT credit_balance_pence FROM users WHERE id = ?')
        .get(userId) as { credit_balance_pence: number } | undefined;
      if (!uRow || Number(uRow.credit_balance_pence) < creditAppliedPence) {
        throw new HttpError(409, 'Wallet credit was already spent on another order.');
      }
      db.prepare(
        'UPDATE users SET credit_balance_pence = credit_balance_pence - ? WHERE id = ?'
      ).run(creditAppliedPence, userId);
    }

    const items = JSON.parse(String(orderRow.items_json)) as Array<{
      productId: string;
      quantity: number;
      unitPricePence?: number;
    }>;

    const getProductStmt = db.prepare('SELECT * FROM products WHERE id = ?');
    const getNextPoolSlotStmt = db.prepare(`
      SELECT COALESCE(MAX(CASE WHEN box_number >= 1 THEN global_slot_index ELSE -1 END), -1) + 1 AS next_slot
      FROM pool_allocations
      WHERE drop_cycle_number = ? AND product_id = ?
    `);
    const getNextCarryoverIdxStmt = db.prepare(`
      SELECT COALESCE(MIN(CASE WHEN box_number = 0 THEN global_slot_index ELSE 0 END), 0) - 1 AS next_neg_slot
      FROM pool_allocations
      WHERE drop_cycle_number = ? AND product_id = ?
    `);
    const decrementCarryoverStmt = db.prepare(`
      UPDATE products SET carryover_stock_slots = carryover_stock_slots - 1 WHERE id = ?
    `);
    const insertAllocStmt = db.prepare(`
      INSERT INTO pool_allocations (
        id, drop_cycle_number, order_id, user_id, product_id,
        product_name, product_brand, unit_description, image_emoji,
        global_slot_index, box_number, slot_in_box, case_size,
        share_price_pence, aldi_price_pence, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const promoteBoxStmt = db.prepare(`
      UPDATE pool_allocations
      SET status = 'locked_box'
      WHERE drop_cycle_number = ? AND product_id = ? AND box_number = ?
    `);

    const nowIso = new Date().toISOString();

    for (const item of items) {
      const product = getProductStmt.get(item.productId) as Record<string, unknown> | undefined;
      if (!product) {
        throw new HttpError(400, `Product "${item.productId}" no longer exists.`);
      }

      const caseSize = Number(product.case_size);
      const paidSharePence =
        item.unitPricePence !== undefined
          ? Number(item.unitPricePence)
          : Number(product.share_price_pence);

      let availableCarryover = Math.max(0, Number(product.carryover_stock_slots || 0));
      const nextPoolRow = getNextPoolSlotStmt.get(dropCycleNumber, item.productId) as {
        next_slot: number;
      };
      let nextPoolSlot = Number(nextPoolRow.next_slot);

      const nextCarryRow = getNextCarryoverIdxStmt.get(dropCycleNumber, item.productId) as {
        next_neg_slot: number;
      };
      let nextCarryoverSlot = Number(nextCarryRow.next_neg_slot);

      for (let i = 0; i < item.quantity; i++) {
        const allocId = `alc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

        if (availableCarryover > 0) {
          availableCarryover--;
          decrementCarryoverStmt.run(item.productId);
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
            nextCarryoverSlot--,
            0,
            1,
            caseSize,
            paidSharePence,
            Number(product.aldi_price_pence),
            'locked_box',
            nowIso
          );
          continue;
        }

        const globalSlotIndex = nextPoolSlot++;
        const boxNumber = Math.floor(globalSlotIndex / caseSize) + 1;
        const slotInBox = (globalSlotIndex % caseSize) + 1;

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
          paidSharePence,
          Number(product.aldi_price_pence),
          'pooling',
          nowIso
        );

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

    // Award £1.00 (100p) credit to the referrer upon the referred friend's first confirmed order!
    const refState = db
      .prepare('SELECT referred_by_user_id, referral_rewarded FROM users WHERE id = ?')
      .get(userId) as { referred_by_user_id: string | null; referral_rewarded: number } | undefined;

    if (refState?.referred_by_user_id && Number(refState.referral_rewarded) === 0) {
      const markRes = db
        .prepare('UPDATE users SET referral_rewarded = 1 WHERE id = ? AND referral_rewarded = 0')
        .run(userId);
      if (Number(markRes.changes) === 1) {
        db.prepare(
          'UPDATE users SET credit_balance_pence = credit_balance_pence + 100 WHERE id = ?'
        ).run(String(refState.referred_by_user_id));
      }
    }

    const confirmed = getOrderById(db, orderId);
    if (!confirmed) throw new HttpError(500, 'Failed to load confirmed order.');
    return confirmed;
  });
}
