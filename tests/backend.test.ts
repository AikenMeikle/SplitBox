import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../server/db.ts';
import { createApp } from '../server/index.ts';
import { seedDatabase } from '../server/seed.ts';
import type {
  AdminSummary,
  AuthUser,
  CreateCheckoutResponse,
  DropSettings,
  LiveSupplierProductResult,
  Order,
  ProductWithPool,
  ScanLookupResult,
  WholesalePurchaseOrder,
} from '../src/shared/types.ts';

process.env.DIVLY_QUIET_LOGS = '1';

interface TestHarness {
  baseUrl: string;
  cleanup: () => Promise<void>;
}

async function startTestServer(options?: { includeDemoPools?: boolean }): Promise<TestHarness> {
  const tmpSqlite = path.join(
    os.tmpdir(),
    `divly-test-${crypto.randomUUID().slice(0, 12)}.sqlite`
  );
  const db = openDatabase(tmpSqlite);
  seedDatabase(db, { includeDemoPools: options?.includeDemoPools ?? false });
  const app = createApp(db);

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind ephemeral test port');
  }

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    cleanup: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${tmpSqlite}${suffix}`, { force: true });
      }
    },
  };
}

async function apiJson<T>(
  baseUrl: string,
  route: string,
  init?: RequestInit & { token?: string }
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.token) {
    headers.Authorization = `Bearer ${init.token}`;
  }
  const res = await fetch(`${baseUrl}${route}`, { ...init, headers });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function loginStudent(baseUrl: string, persona: string): Promise<string> {
  const res = await apiJson<{ token: string; user: AuthUser }>(baseUrl, '/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ role: 'student', persona }),
  });
  assert.equal(res.status, 200);
  return res.body.token;
}

async function loginAdmin(baseUrl: string): Promise<string> {
  const res = await apiJson<{ token: string; user: AuthUser }>(baseUrl, '/api/auth/admin-login', {
    method: 'POST',
    body: JSON.stringify({ pin: 'uob-admin-2026' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'admin');
  return res.body.token;
}

async function checkoutAndConfirm(
  baseUrl: string,
  token: string,
  items: Array<{ productId: string; quantity: number }>
): Promise<Order> {
  const createRes = await apiJson<CreateCheckoutResponse>(baseUrl, '/api/checkout/create', {
    method: 'POST',
    token,
    body: JSON.stringify({ items }),
  });
  assert.equal(createRes.status, 200);
  assert.equal(createRes.body.mode, 'test_modal');

  const confirmRes = await apiJson<{ order: Order }>(baseUrl, '/api/checkout/confirm-test', {
    method: 'POST',
    token,
    body: JSON.stringify({ pendingOrderId: createRes.body.pendingOrderId }),
  });
  assert.equal(confirmRes.status, 200);
  return confirmRes.body.order;
}

test('1. Cross-box 3/4 + 2 sequential allocation locks Box #1 and overflows into Box #2', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const tokenA = await loginStudent(h.baseUrl, 'alice.chen');
    const tokenB = await loginStudent(h.baseUrl, 'ben.davies');

    const orderA = await checkoutAndConfirm(h.baseUrl, tokenA, [
      { productId: 'prod-indomie-10pk', quantity: 3 },
    ]);
    assert.equal(orderA.allocations.length, 3);
    assert.deepEqual(
      orderA.allocations.map((a) => [a.globalSlotIndex, a.boxNumber, a.slotInBox, a.status]),
      [
        [0, 1, 1, 'pooling'],
        [1, 1, 2, 'pooling'],
        [2, 1, 3, 'pooling'],
      ]
    );

    const orderB = await checkoutAndConfirm(h.baseUrl, tokenB, [
      { productId: 'prod-indomie-10pk', quantity: 2 },
    ]);
    assert.deepEqual(
      orderB.allocations.map((a) => [a.globalSlotIndex, a.boxNumber, a.slotInBox, a.status]),
      [
        [3, 1, 4, 'locked_box'],
        [4, 2, 1, 'pooling'],
      ]
    );

    const mineA = await apiJson<{ orders: Order[] }>(h.baseUrl, '/api/orders/mine', {
      token: tokenA,
    });
    assert.ok(mineA.body.orders[0].allocations.every((a) => a.status === 'locked_box'));

    const state = await apiJson<{ settings: DropSettings; products: ProductWithPool[] }>(
      h.baseUrl,
      '/api/state'
    );
    const indomie = state.body.products.find((p) => p.id === 'prod-indomie-10pk')!;
    assert.equal(indomie.totalClaimedSlots, 5);
    assert.equal(indomie.lockedCasesCount, 1);
    assert.equal(indomie.openCaseClaimedSlots, 1);
    assert.equal(indomie.openCaseRemainingSlots, 3);
    assert.equal(indomie.currentCaseNumber, 2);
  } finally {
    await h.cleanup();
  }
});

test('2. 20 concurrent student checkouts never collide on slots, pickup codes, or 6-digit PINs', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const tokens = await Promise.all(
      Array.from({ length: 20 }, (_, i) => loginStudent(h.baseUrl, `student.${i + 1}`))
    );

    const orders = await Promise.all(
      tokens.map((t) =>
        checkoutAndConfirm(h.baseUrl, t, [{ productId: 'prod-basmati-5kg', quantity: 1 }])
      )
    );

    assert.equal(orders.length, 20);

    const slotIndices = new Set(orders.map((o) => o.allocations[0].globalSlotIndex));
    const pickupCodes = new Set(orders.map((o) => o.pickupCode));
    const pickupPins = new Set(orders.map((o) => o.pickupPin));
    const qrTokens = new Set(orders.map((o) => o.qrToken));

    assert.equal(slotIndices.size, 20);
    assert.equal(Math.min(...slotIndices), 0);
    assert.equal(Math.max(...slotIndices), 19);
    assert.equal(pickupCodes.size, 20);
    assert.equal(pickupPins.size, 20);
    assert.equal(qrTokens.size, 20);

    const state = await apiJson<{ products: ProductWithPool[] }>(h.baseUrl, '/api/state');
    const basmati = state.body.products.find((p) => p.id === 'prod-basmati-5kg')!;
    assert.equal(basmati.lockedCasesCount, 5);
    assert.equal(basmati.openCaseClaimedSlots, 0);
  } finally {
    await h.cleanup();
  }
});

test('3. Weekly cutoff settles partial overflow refunds AND refunds 100% including fee when 0 items fill', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const tokenPartial = await loginStudent(h.baseUrl, 'student.partial');
    const tokenUnlucky = await loginStudent(h.baseUrl, 'student.unlucky');
    const adminToken = await loginAdmin(h.baseUrl);

    // Raise threshold to £15 so we test fee retention on partial fulfillment AND 100% fee refund on 0 fulfillment!
    await apiJson(h.baseUrl, '/api/admin/settings', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ freeDeliveryThresholdPence: 1500, smallOrderFeePence: 50 }),
    });

    // Student Partial buys 3 × Oatly (`caseSize = 2`, 435p each) on a 0/2 empty pool:
    // -> 2 shares lock Box #1 (fulfilled), 1 share overflows into Box #2 (auto_refunded)!
    const orderPartial = await checkoutAndConfirm(h.baseUrl, tokenPartial, [
      { productId: 'prod-oatly-barista-3pk', quantity: 3 },
    ]);
    assert.equal(orderPartial.subtotalPence, 1305);
    assert.equal(orderPartial.feePence, 50);
    assert.equal(orderPartial.totalPaidPence, 1355);

    // Student Unlucky buys 1 × Mutti Tomatoes (299p + 50p fee = 349p) in a 0/3 box that never fills
    const orderUnlucky = await checkoutAndConfirm(h.baseUrl, tokenUnlucky, [
      { productId: 'prod-mutti-tomatoes-4pk', quantity: 1 },
    ]);
    assert.equal(orderUnlucky.totalPaidPence, 349);

    const cutoffRes = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(cutoffRes.status, 200);

    // Partial order: 1 overflow share (435p) refunded; 2 fulfilled shares (870p) + 50p fee = 920p net charged
    const partialAfter = cutoffRes.body.orders.find((o) => o.id === orderPartial.id)!;
    assert.equal(partialAfter.status, 'settled');
    assert.equal(partialAfter.refundedPence, 435);
    assert.equal(partialAfter.netChargedPence, 920);
    assert.equal(
      partialAfter.totalPaidPence,
      partialAfter.netChargedPence + partialAfter.refundedPence
    );

    // Unlucky order: 0 fulfilled -> 100% refunded INCLUDING the 50p fee!
    const unluckyAfter = cutoffRes.body.orders.find((o) => o.id === orderUnlucky.id)!;
    assert.equal(unluckyAfter.status, 'refunded');
    assert.equal(unluckyAfter.refundedPence, 349);
    assert.equal(unluckyAfter.netChargedPence, 0);
  } finally {
    await h.cleanup();
  }
});

test('4. Campus OTP gate, HMAC QR tamper rejection, PIN lookup, and atomic double-collection block', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const badOtp = await apiJson<{ error: string }>(h.baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email: 'intruder@gmail.com' }),
    });
    assert.equal(badOtp.status, 400);

    const otpReq = await apiJson<{ ok: boolean; devOtpCode?: string }>(
      h.baseUrl,
      '/api/auth/request-otp',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'sam.taylor@student.bham.ac.uk', name: 'Sam Taylor' }),
      }
    );
    assert.equal(otpReq.status, 200);
    assert.ok(otpReq.body.devOtpCode && /^\d{6}$/.test(otpReq.body.devOtpCode));

    const otpVerify = await apiJson<{ token: string; user: AuthUser }>(
      h.baseUrl,
      '/api/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'sam.taylor@student.bham.ac.uk',
          code: otpReq.body.devOtpCode,
        }),
      }
    );
    assert.equal(otpVerify.status, 200);
    const studentToken = otpVerify.body.token;
    const adminToken = await loginAdmin(h.baseUrl);

    const order = await checkoutAndConfirm(h.baseUrl, studentToken, [
      { productId: 'prod-oatly-barista-3pk', quantity: 2 },
    ]);
    await apiJson(h.baseUrl, '/api/admin/cutoff', { method: 'POST', token: adminToken });

    const lastChar = order.qrToken.slice(-1);
    const tamperedQr = order.qrToken.slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
    const tamperedCheck = await apiJson<ScanLookupResult>(
      h.baseUrl,
      '/api/admin/scan/verify',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ input: tamperedQr }),
      }
    );
    assert.equal(tamperedCheck.body.valid, false);

    const validQrCheck = await apiJson<ScanLookupResult>(h.baseUrl, '/api/admin/scan/verify', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ input: order.qrToken }),
    });
    assert.equal(validQrCheck.body.valid, true);

    const collect1 = await apiJson<{ order: Order }>(h.baseUrl, '/api/admin/scan/collect', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ orderId: order.id }),
    });
    assert.equal(collect1.status, 200);
    assert.equal(collect1.body.order.status, 'collected');

    const collect2 = await apiJson<{ error: string }>(h.baseUrl, '/api/admin/scan/collect', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ orderId: order.id }),
    });
    assert.equal(collect2.status, 409);

    const rescan = await apiJson<ScanLookupResult>(h.baseUrl, '/api/admin/scan/verify', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ input: order.qrToken }),
    });
    assert.equal(rescan.body.alreadyCollected, true);
    assert.equal(rescan.body.valid, false);
  } finally {
    await h.cleanup();
  }
});

test('5. Admin product CRUD, demo seed pools, and new-drop cycle reset preserving history', async () => {
  const h = await startTestServer({ includeDemoPools: true });
  try {
    const adminToken = await loginAdmin(h.baseUrl);

    const initialState = await apiJson<{ settings: DropSettings; products: ProductWithPool[] }>(
      h.baseUrl,
      '/api/state'
    );
    assert.equal(initialState.body.products.length, 12);
    assert.ok(initialState.body.products.every((p) => p.sharePricePence < p.aldiPricePence));
    assert.equal(
      initialState.body.products.find((p) => p.id === 'prod-basmati-5kg')?.openCaseClaimedSlots,
      3
    );
    assert.equal(
      initialState.body.products.find((p) => p.id === 'prod-kikkoman-soy-500ml')
        ?.openCaseClaimedSlots,
      5
    );

    const createdRes = await apiJson<{ product: ProductWithPool }>(
      h.baseUrl,
      '/api/admin/products',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          name: 'Gold Roast Instant Coffee',
          brand: 'Nescafé',
          category: 'Drinks & Caffeine',
          imageEmoji: '☕',
          unitDescription: '200g glass jar',
          caseDescription: '6 × 200g wholesale case',
          caseSize: 6,
          sharePricePence: 395,
          aldiPricePence: 549,
          aldiUnitLabel: '200g Gold Roast jar',
          wholesaleCaseCostPence: 1980,
          eanBarcode: '7613035974685',
          shelfLifeWeeks: 52,
          isActive: true,
        }),
      }
    );
    assert.equal(createdRes.status, 201);
    assert.equal(createdRes.body.product.eanBarcode, '7613035974685');
    const newProdId = createdRes.body.product.id;

    const updatedRes = await apiJson<{ product: ProductWithPool }>(
      h.baseUrl,
      `/api/admin/products/${newProdId}`,
      {
        method: 'PUT',
        token: adminToken,
        body: JSON.stringify({ sharePricePence: 365 }),
      }
    );
    assert.equal(updatedRes.status, 200);
    assert.equal(updatedRes.body.product.sharePricePence, 365);

    const deleteRes = await apiJson<{ ok: boolean }>(
      h.baseUrl,
      `/api/admin/products/${newProdId}`,
      {
        method: 'DELETE',
        token: adminToken,
      }
    );
    assert.equal(deleteRes.status, 200);

    await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
    });
    const newDropRes = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/new-drop', {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(newDropRes.status, 200);
    assert.equal(newDropRes.body.settings.dropCycleNumber, 2);
    assert.equal(newDropRes.body.settings.dropStatus, 'open');
    assert.ok(newDropRes.body.products.every((p) => p.totalClaimedSlots === 0));
    assert.equal(newDropRes.body.orders.length, 3);
    assert.ok(
      newDropRes.body.orders.every((o) => o.totalPaidPence === o.netChargedPence + o.refundedPence)
    );
  } finally {
    await h.cleanup();
  }
});

test('6. Herd / Almost-Full Closer Bonus grants 6%-10% discount, clamps positive margin, and waives fee', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const token1 = await loginStudent(h.baseUrl, 'opener');
    const token2 = await loginStudent(h.baseUrl, 'closer');

    // Opener claims 3/4 of Trek Flapjacks (`sharePricePence = 295`, `wholesaleCaseCostPence = 1020`)
    await checkoutAndConfirm(h.baseUrl, token1, [
      { productId: 'prod-trek-protein-4pk', quantity: 3 },
    ]);

    const state = await apiJson<{ products: ProductWithPool[] }>(h.baseUrl, '/api/state');
    const trek = state.body.products.find((p) => p.id === 'prod-trek-protein-4pk')!;
    assert.equal(trek.isAlmostFull, true);
    assert.equal(trek.waivesSmallOrderFee, true);
    assert.equal(trek.closerDiscountPercent, 10);
    assert.equal(trek.effectiveSharePricePence, 266); // 295 * 0.9 = 266 >= floor(255 + 10 = 265)

    // Closer buys just 1 share (266p < 800p threshold) -> £0.00 fee waived AND pays 266p!
    const closerOrder = await checkoutAndConfirm(h.baseUrl, token2, [
      { productId: 'prod-trek-protein-4pk', quantity: 1 },
    ]);
    assert.equal(closerOrder.feePence, 0);
    assert.equal(closerOrder.totalPaidPence, 266);
    assert.equal(closerOrder.closerDiscountTotalPence, 29);
    assert.equal(closerOrder.allocations[0].status, 'locked_box');
  } finally {
    await h.cleanup();
  }
});

test('7. Bayesian Buy-Ahead Predictor distinguishes SAFE_BUY_AHEAD vs AUTO_REFUND and rolls carryover stock', async () => {
  const h = await startTestServer({ includeDemoPools: true });
  try {
    const adminToken = await loginAdmin(h.baseUrl);
    const summaryBefore = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/summary', {
      token: adminToken,
    });

    // Basmati (3/4 claimed, 52-week shelf life) -> SAFE_BUY_AHEAD
    const basmatiPred = summaryBefore.body.buyAheadPredictions.find(
      (p) => p.productId === 'prod-basmati-5kg'
    )!;
    assert.ok(basmatiPred);
    assert.equal(basmatiPred.decision, 'SAFE_BUY_AHEAD');
    assert.ok(basmatiPred.safetyScore >= 70);
    assert.ok(basmatiPred.sellThroughProbability >= 0.65);

    // Fresh Bakery Protein Bagels (1/4 claimed, 2-week shelf life) -> AUTO_REFUND
    const bagelsPred = summaryBefore.body.buyAheadPredictions.find(
      (p) => p.productId === 'prod-fresh-protein-bagels'
    )!;
    assert.ok(bagelsPred);
    assert.equal(bagelsPred.decision, 'AUTO_REFUND');
    assert.equal(bagelsPred.safeHorizonWeeks, 0);

    // Admin triggers cutoff underwriting `prod-basmati-5kg` (3/4 open -> fulfilled + 1 carryover bag!)
    const cutoffRes = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ buyAheadProductIds: ['prod-basmati-5kg'] }),
    });
    assert.equal(cutoffRes.status, 200);

    const basmatiLine = cutoffRes.body.shoppingList.find(
      (l) => l.productId === 'prod-basmati-5kg'
    )!;
    assert.equal(basmatiLine.lockedCasesCount, 1);
    assert.equal(basmatiLine.overflowSlotsCount, 0);

    // Start Cycle #2 -> Basmati carries 1 instant-stock unit held at hub, claimed immediately by next student!
    const nextDrop = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/new-drop', {
      method: 'POST',
      token: adminToken,
    });
    const basmatiNext = nextDrop.body.products.find((p) => p.id === 'prod-basmati-5kg')!;
    assert.equal(basmatiNext.carryoverStockSlots, 1);

    const studentC = await loginStudent(h.baseUrl, 'carryover.buyer');
    const carryOrder = await checkoutAndConfirm(h.baseUrl, studentC, [
      { productId: 'prod-basmati-5kg', quantity: 1 },
    ]);
    assert.equal(carryOrder.allocations[0].status, 'locked_box');

    const afterClaim = await apiJson<{ products: ProductWithPool[] }>(h.baseUrl, '/api/state');
    assert.equal(
      afterClaim.body.products.find((p) => p.id === 'prod-basmati-5kg')!.carryoverStockSlots,
      0
    );
  } finally {
    await h.cleanup();
  }
});

test('8. Wholesale UK product search API and Wholesale Purchase Order generation', async () => {
  const h = await startTestServer({ includeDemoPools: true });
  try {
    const adminToken = await loginAdmin(h.baseUrl);

    const searchRes = await apiJson<{ results: LiveSupplierProductResult[] }>(
      h.baseUrl,
      '/api/admin/wholesale/search?q=oatly',
      { token: adminToken }
    );
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.results.length > 0);
    assert.ok(searchRes.body.results[0].supplierPortalUrl.includes('qogita.com'));

    const poRes = await apiJson<{ order: WholesalePurchaseOrder }>(
      h.baseUrl,
      '/api/admin/wholesale/order',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ includeBuyAheadProductIds: ['prod-basmati-5kg'] }),
      }
    );
    assert.equal(poRes.status, 200);
    assert.ok(poRes.body.order.totalCasesCount >= 2); // 1 locked Shin Ramyun + 1 buy-ahead Basmati
    assert.ok(poRes.body.order.portalLinks.every((l) => l.qogitaUrl.startsWith('https://')));
    assert.ok(poRes.body.order.portalLinks.every((l) => l.bookerUrl.startsWith('https://')));
  } finally {
    await h.cleanup();
  }
});
