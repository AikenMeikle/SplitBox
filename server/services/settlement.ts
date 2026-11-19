import type { DatabaseSync } from 'node:sqlite';
import type { AdminSummary, WholesaleShoppingLine } from '../../src/shared/types.ts';
import {
  getProductsWithPool,
  getSettings,
  hydrateOrders,
  HttpError,
  runImmediateTransaction,
} from '../db.ts';
import { computeBuyAheadPredictions } from './buyAheadPredictor.ts';
import { listProductRequests } from './productRequests.ts';
import { isStripeConfigured, issueStripeRefund } from './stripeService.ts';
import { getWholesaleOrders, isWholesaleApiConfigured } from './wholesaleApi.ts';

interface PendingStripeRefund {
  orderId: string;
  paymentIntentId: string;
  deltaRefundPence: number;
}

/**
 * Settles a drop cycle atomically:
 *  - Underwrites any founder-selected `buyAheadProductIds` (`pooling -> fulfilled`, leftover -> `carryover_stock_slots`).
 *  - Promotes `locked_box -> fulfilled` and marks remaining `pooling -> auto_refunded`.
 *  - Refunds cash up to `totalPaidPence` AND restores any unspent `creditAppliedPence` back to `users.credit_balance_pence`!
 *  - Strictly preserves `totalPaidPence === netChargedPence + refundedPence`.
 */
function settleDropCycleInTx(
  db: DatabaseSync,
  cycleNumber: number,
  buyAheadProductIds: string[] = []
): PendingStripeRefund[] {
  db.prepare(
    "DELETE FROM orders WHERE drop_cycle_number = ? AND status = 'pending_payment'"
  ).run(cycleNumber);

  const uniqueBuyAheadIds = Array.from(new Set(buyAheadProductIds));
  for (const productId of uniqueBuyAheadIds) {
    const prod = db
      .prepare('SELECT id, case_size FROM products WHERE id = ? AND deleted_at IS NULL')
      .get(productId) as { id: string; case_size: number } | undefined;
    if (!prod) continue;

    const openRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM pool_allocations WHERE drop_cycle_number = ? AND product_id = ? AND status = 'pooling'"
      )
      .get(cycleNumber, productId) as { cnt: number };
    const openCount = Number(openRow.cnt);

    if (openCount > 0) {
      const unsoldSlots = Math.max(0, Number(prod.case_size) - openCount);
      db.prepare(
        "UPDATE pool_allocations SET status = 'fulfilled' WHERE drop_cycle_number = ? AND product_id = ? AND status = 'pooling'"
      ).run(cycleNumber, productId);
      if (unsoldSlots > 0) {
        db.prepare(
          'UPDATE products SET carryover_stock_slots = carryover_stock_slots + ? WHERE id = ?'
        ).run(unsoldSlots, productId);
      }
    }
  }

  db.prepare(
    "UPDATE pool_allocations SET status = 'fulfilled' WHERE drop_cycle_number = ? AND status = 'locked_box'"
  ).run(cycleNumber);
  db.prepare(
    "UPDATE pool_allocations SET status = 'auto_refunded' WHERE drop_cycle_number = ? AND status = 'pooling'"
  ).run(cycleNumber);

  const orderRows = db
    .prepare(
      "SELECT * FROM orders WHERE drop_cycle_number = ? AND status != 'pending_payment'"
    )
    .all(cycleNumber) as Array<Record<string, unknown>>;

  const allocStmt = db.prepare('SELECT * FROM pool_allocations WHERE order_id = ?');
  const updateOrderStmt = db.prepare(`
    UPDATE orders
    SET status = ?, refunded_pence = ?, net_charged_pence = ?, credit_restored_pence = ?
    WHERE id = ?
  `);
  const restoreCreditStmt = db.prepare(
    'UPDATE users SET credit_balance_pence = credit_balance_pence + ? WHERE id = ?'
  );

  const stripeRefunds: PendingStripeRefund[] = [];

  for (const row of orderRows) {
    const orderId = String(row.id);
    const userId = String(row.user_id);
    const totalPaidPence = Number(row.total_paid_pence);
    const creditAppliedPence = Number(row.credit_applied_pence || 0);
    const prevRefundedPence = Number(row.refunded_pence);
    const prevCreditRestoredPence = Number(row.credit_restored_pence || 0);
    const currentStatus = String(row.status);

    const allocs = allocStmt.all(orderId) as Array<Record<string, unknown>>;
    let fulfilledCount = 0;
    let autoRefundedSharesPence = 0;

    for (const a of allocs) {
      const st = String(a.status);
      if (st === 'fulfilled') {
        fulfilledCount++;
      } else if (st === 'auto_refunded') {
        autoRefundedSharesPence += Number(a.share_price_pence);
      }
    }

    let refundedPence = 0;
    let netChargedPence = 0;
    let creditRestoredPence = 0;
    let nextStatus = currentStatus;

    if (fulfilledCount === 0) {
      // Zero items fulfilled -> refund 100% cash paid AND restore 100% applied wallet credit!
      refundedPence = totalPaidPence;
      netChargedPence = 0;
      creditRestoredPence = creditAppliedPence;
      nextStatus = 'refunded';
    } else {
      // Refund cash up to `totalPaidPence`; restore any remaining auto-refund value to wallet credit!
      refundedPence = Math.min(totalPaidPence, autoRefundedSharesPence);
      netChargedPence = totalPaidPence - refundedPence;
      creditRestoredPence = Math.max(0, autoRefundedSharesPence - refundedPence);
      nextStatus = currentStatus === 'collected' ? 'collected' : 'settled';
    }

    if (totalPaidPence !== netChargedPence + refundedPence || netChargedPence < 0) {
      throw new HttpError(
        500,
        `Pence conservation check failed on order ${orderId}: paid=${totalPaidPence}, net=${netChargedPence}, refunded=${refundedPence}`
      );
    }

    const deltaCreditRestore = creditRestoredPence - prevCreditRestoredPence;
    if (deltaCreditRestore > 0) {
      restoreCreditStmt.run(deltaCreditRestore, userId);
    }

    updateOrderStmt.run(
      nextStatus,
      refundedPence,
      netChargedPence,
      creditRestoredPence,
      orderId
    );

    const deltaRefundPence = refundedPence - prevRefundedPence;
    if (
      deltaRefundPence > 0 &&
      String(row.payment_mode) === 'stripe_live' &&
      typeof row.stripe_payment_intent_id === 'string' &&
      row.stripe_payment_intent_id
    ) {
      stripeRefunds.push({
        orderId,
        paymentIntentId: row.stripe_payment_intent_id,
        deltaRefundPence,
      });
    }
  }

  return stripeRefunds;
}

export async function runWeeklyCutoff(
  db: DatabaseSync,
  options?: { buyAheadProductIds?: string[] }
): Promise<AdminSummary> {
  const stripeRefunds = runImmediateTransaction(db, () => {
    const settings = getSettings(db);
    db.prepare("UPDATE settings SET drop_status = 'closed' WHERE id = 1").run();
    return settleDropCycleInTx(db, settings.dropCycleNumber, options?.buyAheadProductIds ?? []);
  });

  if (isStripeConfigured() && stripeRefunds.length > 0) {
    for (const r of stripeRefunds) {
      await issueStripeRefund(r.paymentIntentId, r.deltaRefundPence, r.orderId);
    }
  }

  return getAdminSummary(db);
}

export async function startNewDropCycle(db: DatabaseSync): Promise<AdminSummary> {
  const stripeRefunds = runImmediateTransaction(db, () => {
    const settings = getSettings(db);
    const pendingRefunds = settleDropCycleInTx(db, settings.dropCycleNumber, []);

    const nextCycle = settings.dropCycleNumber + 1;
    const nextCutoffIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE settings
      SET drop_cycle_number = ?,
          drop_status = 'open',
          cutoff_at_iso = ?
      WHERE id = 1
    `).run(nextCycle, nextCutoffIso);

    return pendingRefunds;
  });

  if (isStripeConfigured() && stripeRefunds.length > 0) {
    for (const r of stripeRefunds) {
      await issueStripeRefund(r.paymentIntentId, r.deltaRefundPence, r.orderId);
    }
  }

  return getAdminSummary(db);
}

export function getAdminSummary(db: DatabaseSync): AdminSummary {
  const settings = getSettings(db);
  const products = getProductsWithPool(db, true);
  const buyAheadPredictions = computeBuyAheadPredictions(db);
  const wholesaleOrders = getWholesaleOrders(db);
  const wholesaleApiConfigured = isWholesaleApiConfigured();
  const productRequests = listProductRequests(db, null);

  const productAllocRows = db
    .prepare(`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.brand,
        p.case_description,
        p.case_size,
        p.share_price_pence,
        p.wholesale_case_cost_pence,
        COALESCE(SUM(CASE WHEN a.box_number >= 1 AND a.status IN ('locked_box', 'fulfilled') THEN 1 ELSE 0 END), 0) AS box_locked_slots,
        COALESCE(SUM(CASE WHEN a.status IN ('locked_box', 'fulfilled') THEN a.share_price_pence ELSE 0 END), 0) AS locked_revenue_pence,
        COALESCE(SUM(CASE WHEN a.box_number >= 1 AND a.status IN ('pooling', 'auto_refunded') THEN 1 ELSE 0 END), 0) AS overflow_slots
      FROM products p
      LEFT JOIN pool_allocations a
        ON a.product_id = p.id AND a.drop_cycle_number = ?
      WHERE p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY box_locked_slots DESC, p.sort_order ASC, p.created_at ASC
    `)
    .all(settings.dropCycleNumber) as Array<Record<string, unknown>>;

  const shoppingList: WholesaleShoppingLine[] = productAllocRows.map((row) => {
    const caseSize = Math.max(1, Number(row.case_size));
    const boxLockedSlots = Number(row.box_locked_slots);
    const lockedCasesCount =
      settings.dropStatus === 'closed'
        ? Math.ceil(boxLockedSlots / caseSize)
        : Math.floor(boxLockedSlots / caseSize);
    const overflowSlotsCount = Number(row.overflow_slots);
    const wholesaleCaseCostPence = Number(row.wholesale_case_cost_pence);
    const totalWholesaleCostPence = lockedCasesCount * wholesaleCaseCostPence;
    const studentCaseRevenuePence = caseSize * Number(row.share_price_pence);
    const totalRevenuePence = Number(row.locked_revenue_pence);
    const grossProfitPence = totalRevenuePence - totalWholesaleCostPence;

    return {
      productId: String(row.product_id),
      productName: String(row.product_name),
      brand: String(row.brand),
      caseDescription: String(row.case_description),
      caseSize,
      lockedCasesCount,
      overflowSlotsCount,
      wholesaleCaseCostPence,
      totalWholesaleCostPence,
      studentCaseRevenuePence,
      totalRevenuePence,
      grossProfitPence,
    };
  });

  const allOrderRows = db
    .prepare("SELECT * FROM orders WHERE status != 'pending_payment' ORDER BY created_at DESC")
    .all() as Array<Record<string, unknown>>;
  const orders = hydrateOrders(db, allOrderRows);

  const cycleOrderRows = allOrderRows.filter(
    (r) => Number(r.drop_cycle_number) === settings.dropCycleNumber
  );
  const paidStudentIds = new Set(cycleOrderRows.map((r) => String(r.user_id)));

  const cycleOrderIdsWithLocked = new Set<string>();
  const lockedOrderCheckRows = db
    .prepare(`
      SELECT DISTINCT order_id FROM pool_allocations
      WHERE drop_cycle_number = ? AND status IN ('locked_box', 'fulfilled')
    `)
    .all(settings.dropCycleNumber) as Array<{ order_id: string }>;
  for (const r of lockedOrderCheckRows) {
    cycleOrderIdsWithLocked.add(String(r.order_id));
  }

  let totalFeeRevenuePence = 0;
  for (const r of cycleOrderRows) {
    if (String(r.status) !== 'refunded' && cycleOrderIdsWithLocked.has(String(r.id))) {
      totalFeeRevenuePence += Number(r.fee_pence);
    }
  }

  const lockedCasesTotal = shoppingList.reduce((acc, l) => acc + l.lockedCasesCount, 0);
  const totalWholesaleSpendPence = shoppingList.reduce(
    (acc, l) => acc + l.totalWholesaleCostPence,
    0
  );
  const studentLockedShareRevenue = shoppingList.reduce(
    (acc, l) => acc + l.totalRevenuePence,
    0
  );
  const totalGrossRevenuePence = studentLockedShareRevenue + totalFeeRevenuePence;
  const estimatedGrossProfitPence = totalGrossRevenuePence - totalWholesaleSpendPence;

  return {
    settings,
    products,
    shoppingList,
    buyAheadPredictions,
    wholesaleOrders,
    wholesaleApiConfigured,
    productRequests,
    orders,
    totals: {
      totalOrdersCount: cycleOrderRows.length,
      paidStudentsCount: paidStudentIds.size,
      lockedCasesTotal,
      totalWholesaleSpendPence,
      totalGrossRevenuePence,
      totalFeeRevenuePence,
      estimatedGrossProfitPence,
    },
  };
}
