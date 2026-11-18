import type { DatabaseSync } from 'node:sqlite';
import type { AdminSummary, WholesaleShoppingLine } from '../../src/shared/types.ts';
import {
  getProductsWithPool,
  getSettings,
  hydrateOrders,
  HttpError,
  runImmediateTransaction,
} from '../db.ts';
import { isStripeConfigured, issueStripeRefund } from './stripeService.ts';

interface PendingStripeRefund {
  orderId: string;
  paymentIntentId: string;
  deltaRefundPence: number;
}

/**
 * Settles a specific drop cycle inside a single SQLite transaction:
 *  - Every `locked_box` share becomes `fulfilled` (ready for Saturday hub pickup).
 *  - Every unfilled `pooling` share becomes `auto_refunded`.
 *  - Orders with 0 `fulfilled` shares get a 100% refund INCLUDING `feePence` (`status = 'refunded'`).
 *  - Orders with >= 1 `fulfilled` shares get exact `auto_refunded` shares refunded (`status = 'settled'`).
 *  - Strictly asserts `totalPaidPence === netChargedPence + refundedPence` on every order.
 */
function settleDropCycleInTx(db: DatabaseSync, cycleNumber: number): PendingStripeRefund[] {
  // Clean up any abandoned unpaid checkout sessions from this cycle.
  db.prepare(
    "DELETE FROM orders WHERE drop_cycle_number = ? AND status = 'pending_payment'"
  ).run(cycleNumber);

  // Promote 100% filled boxes -> fulfilled, and mark overflow slots -> auto_refunded.
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
  const updateOrderStmt = db.prepare(
    'UPDATE orders SET status = ?, refunded_pence = ?, net_charged_pence = ? WHERE id = ?'
  );

  const stripeRefunds: PendingStripeRefund[] = [];

  for (const row of orderRows) {
    const orderId = String(row.id);
    const totalPaidPence = Number(row.total_paid_pence);
    const prevRefundedPence = Number(row.refunded_pence);
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
    let nextStatus = currentStatus;

    if (fulfilledCount === 0) {
      // Zero items fulfilled -> refund 100% including any small-order fee!
      refundedPence = totalPaidPence;
      netChargedPence = 0;
      nextStatus = 'refunded';
    } else {
      // At least 1 item fulfilled -> refund exact unfilled overflow shares.
      refundedPence = autoRefundedSharesPence;
      netChargedPence = totalPaidPence - refundedPence;
      nextStatus = currentStatus === 'collected' ? 'collected' : 'settled';
    }

    if (totalPaidPence !== netChargedPence + refundedPence || netChargedPence < 0) {
      throw new HttpError(
        500,
        `Pence conservation check failed on order ${orderId}: paid=${totalPaidPence}, net=${netChargedPence}, refunded=${refundedPence}`
      );
    }

    updateOrderStmt.run(nextStatus, refundedPence, netChargedPence, orderId);

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

/** Closes the active weekly drop, settles all pools, and triggers any Stripe refunds. */
export async function runWeeklyCutoff(db: DatabaseSync): Promise<AdminSummary> {
  const stripeRefunds = runImmediateTransaction(db, () => {
    const settings = getSettings(db);
    db.prepare("UPDATE settings SET drop_status = 'closed' WHERE id = 1").run();
    return settleDropCycleInTx(db, settings.dropCycleNumber);
  });

  if (isStripeConfigured() && stripeRefunds.length > 0) {
    for (const r of stripeRefunds) {
      await issueStripeRefund(r.paymentIntentId, r.deltaRefundPence, r.orderId);
    }
  }

  return getAdminSummary(db);
}

/**
 * Starts a brand-new weekly drop cycle:
 *  - Settles any unsettled shares in the outgoing cycle so historical orders stay clean.
 *  - Increments `dropCycleNumber`, sets `dropStatus = 'open'`, and pushes cutoff +7 days.
 *  - Preserves all historical student orders & passes in SQLite.
 */
export async function startNewDropCycle(db: DatabaseSync): Promise<AdminSummary> {
  const stripeRefunds = runImmediateTransaction(db, () => {
    const settings = getSettings(db);
    const pendingRefunds = settleDropCycleInTx(db, settings.dropCycleNumber);

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

/**
 * Computes the complete `AdminSummary` for the founder dashboard:
 *  - Current drop settings & all non-deleted products
 *  - Exact wholesale shopping list (ONLY 100% locked/fulfilled cases to purchase)
 *  - All paid student orders (newest first) + cycle unit-economics KPIs
 */
export function getAdminSummary(db: DatabaseSync): AdminSummary {
  const settings = getSettings(db);
  const products = getProductsWithPool(db, true);

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
        COALESCE(SUM(CASE WHEN a.status IN ('locked_box', 'fulfilled') THEN 1 ELSE 0 END), 0) AS locked_slots,
        COALESCE(SUM(CASE WHEN a.status IN ('locked_box', 'fulfilled') THEN a.share_price_pence ELSE 0 END), 0) AS locked_revenue_pence,
        COALESCE(SUM(CASE WHEN a.status IN ('pooling', 'auto_refunded') THEN 1 ELSE 0 END), 0) AS overflow_slots
      FROM products p
      LEFT JOIN pool_allocations a
        ON a.product_id = p.id AND a.drop_cycle_number = ?
      WHERE p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY locked_slots DESC, p.sort_order ASC, p.created_at ASC
    `)
    .all(settings.dropCycleNumber) as Array<Record<string, unknown>>;

  const shoppingList: WholesaleShoppingLine[] = productAllocRows.map((row) => {
    const caseSize = Number(row.case_size);
    const lockedCasesCount = Math.floor(Number(row.locked_slots) / caseSize);
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

  // Retain small-order fees only on orders that have at least 1 locked/fulfilled share.
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
