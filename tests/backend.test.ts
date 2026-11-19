import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openDatabase } from '../server/db.ts';
import { createApp } from '../server/index.ts';
import { seedDatabase } from '../server/seed.ts';
import { createPendingOrder } from '../server/services/poolAllocator.ts';
import { validateWholesaleWebhookUrl } from '../server/services/wholesaleApi.ts';
import type {
  AdminSummary,
  AuthUser,
  CreateCheckoutResponse,
  DropSettings,
  LiveSupplierProductResult,
  Order,
  ProductRequest,
  ProductWithPool,
  ScanLookupResult,
  WholesalePurchaseOrder,
} from '../src/shared/types.ts';

process.env.DIVLY_QUIET_LOGS = '1';

interface TestHarness {
  baseUrl: string;
  db: DatabaseSync;
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
    db,
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
): Promise<{ status: number; body: T; headers: Headers }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.token) {
    headers.Authorization = `Bearer ${init.token}`;
  }
  const res = await fetch(`${baseUrl}${route}`, { ...init, headers });
  const body = (await res.json()) as T;
  return { status: res.status, body, headers: res.headers };
}

async function loginStudent(
  baseUrl: string,
  persona: string,
  referralCode?: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await apiJson<{ token: string; user: AuthUser }>(baseUrl, '/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ role: 'student', persona, referralCode }),
  });
  assert.equal(res.status, 200);
  return res.body;
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
    const { token: tokenA } = await loginStudent(h.baseUrl, 'alice.chen');
    const { token: tokenB } = await loginStudent(h.baseUrl, 'ben.davies');

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
    const logins = await Promise.all(
      Array.from({ length: 20 }, (_, i) => loginStudent(h.baseUrl, `student.${i + 1}`))
    );

    const orders = await Promise.all(
      logins.map(({ token }) =>
        checkoutAndConfirm(h.baseUrl, token, [{ productId: 'prod-basmati-5kg', quantity: 1 }])
      )
    );

    assert.equal(orders.length, 20);
    assert.equal(new Set(orders.map((o) => o.allocations[0].globalSlotIndex)).size, 20);
    assert.equal(new Set(orders.map((o) => o.pickupCode)).size, 20);
    assert.equal(new Set(orders.map((o) => o.pickupPin)).size, 20);
    assert.equal(new Set(orders.map((o) => o.qrToken)).size, 20);
  } finally {
    await h.cleanup();
  }
});

test('3. Weekly cutoff settles partial overflow refunds AND refunds 100% including fee when 0 items fill', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const { token: tokenPartial } = await loginStudent(h.baseUrl, 'student.partial');
    const { token: tokenUnlucky } = await loginStudent(h.baseUrl, 'student.unlucky');
    const adminToken = await loginAdmin(h.baseUrl);

    await apiJson(h.baseUrl, '/api/admin/settings', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ freeDeliveryThresholdPence: 1500, smallOrderFeePence: 50 }),
    });

    const orderPartial = await checkoutAndConfirm(h.baseUrl, tokenPartial, [
      { productId: 'prod-oatly-barista-3pk', quantity: 3 },
    ]);
    assert.equal(orderPartial.totalPaidPence, 1355);

    const orderUnlucky = await checkoutAndConfirm(h.baseUrl, tokenUnlucky, [
      { productId: 'prod-mutti-tomatoes-4pk', quantity: 1 },
    ]);
    assert.equal(orderUnlucky.totalPaidPence, 349);

    const cutoffRes = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
    });

    const partialAfter = cutoffRes.body.orders.find((o) => o.id === orderPartial.id)!;
    assert.equal(partialAfter.status, 'settled');
    assert.equal(partialAfter.refundedPence, 435);
    assert.equal(partialAfter.netChargedPence, 920);
    assert.equal(
      partialAfter.totalPaidPence,
      partialAfter.netChargedPence + partialAfter.refundedPence
    );

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
    assert.ok(otpReq.body.devOtpCode);

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

    const collect1 = await apiJson<{ order: Order }>(h.baseUrl, '/api/admin/scan/collect', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ orderId: order.id }),
    });
    assert.equal(collect1.status, 200);

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

test('5. Admin product CRUD, zero public "aldi" strings in GET /api/state, and new-drop cycle reset', async () => {
  const h = await startTestServer({ includeDemoPools: true });
  try {
    const adminToken = await loginAdmin(h.baseUrl);

    const initialState = await apiJson<{ settings: DropSettings; products: ProductWithPool[] }>(
      h.baseUrl,
      '/api/state'
    );
    assert.equal(initialState.body.products.length, 12);
    for (const p of initialState.body.products) {
      assert.ok(p.sharePricePence < p.aldiPricePence);
      const visibleStrings = [
        p.name,
        p.brand,
        p.category,
        p.unitDescription,
        p.caseDescription,
        p.aldiUnitLabel,
        p.supplierName || '',
      ];
      for (const val of visibleStrings) {
        assert.equal(
          val.toLowerCase().includes('aldi'),
          false,
          `Found prohibited public "Aldi" string in product ${p.id}: "${val}"`
        );
      }
    }

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
          wholesaleCaseCostPence: 1980,
          eanBarcode: '7613035974685',
          shelfLifeWeeks: 52,
          isActive: true,
        }),
      }
    );
    assert.equal(createdRes.status, 201);
    assert.equal(
      createdRes.body.product.aldiUnitLabel.toLowerCase().includes('aldi'),
      false
    );
    const newProdId = createdRes.body.product.id;

    const deleteRes = await apiJson<{ ok: boolean }>(
      h.baseUrl,
      `/api/admin/products/${newProdId}`,
      { method: 'DELETE', token: adminToken }
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
    assert.equal(newDropRes.body.settings.dropCycleNumber, 2);
    assert.ok(newDropRes.body.products.every((p) => p.totalClaimedSlots === 0));
  } finally {
    await h.cleanup();
  }
});

test('6. Herd / Almost-Full Closer Bonus grants 6%-10% discount, clamps positive margin, and waives fee', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const { token: token1 } = await loginStudent(h.baseUrl, 'opener');
    const { token: token2 } = await loginStudent(h.baseUrl, 'closer');

    await checkoutAndConfirm(h.baseUrl, token1, [
      { productId: 'prod-trek-protein-4pk', quantity: 3 },
    ]);

    const state = await apiJson<{ products: ProductWithPool[] }>(h.baseUrl, '/api/state');
    const trek = state.body.products.find((p) => p.id === 'prod-trek-protein-4pk')!;
    assert.equal(trek.isAlmostFull, true);
    assert.equal(trek.waivesSmallOrderFee, true);
    assert.equal(trek.closerDiscountPercent, 10);
    assert.equal(trek.effectiveSharePricePence, 266);

    const closerOrder = await checkoutAndConfirm(h.baseUrl, token2, [
      { productId: 'prod-trek-protein-4pk', quantity: 1 },
    ]);
    assert.equal(closerOrder.feePence, 0);
    assert.equal(closerOrder.totalPaidPence, 266);
    assert.equal(closerOrder.closerDiscountTotalPence, 29);
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

    const basmatiPred = summaryBefore.body.buyAheadPredictions.find(
      (p) => p.productId === 'prod-basmati-5kg'
    )!;
    assert.equal(basmatiPred.decision, 'SAFE_BUY_AHEAD');

    const bagelsPred = summaryBefore.body.buyAheadPredictions.find(
      (p) => p.productId === 'prod-fresh-protein-bagels'
    )!;
    assert.equal(bagelsPred.decision, 'AUTO_REFUND');

    await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ buyAheadProductIds: ['prod-basmati-5kg'] }),
    });

    const nextDrop = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/new-drop', {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(
      nextDrop.body.products.find((p) => p.id === 'prod-basmati-5kg')!.carryoverStockSlots,
      1
    );

    const { token: studentC } = await loginStudent(h.baseUrl, 'carryover.buyer');
    const carryOrder = await checkoutAndConfirm(h.baseUrl, studentC, [
      { productId: 'prod-basmati-5kg', quantity: 1 },
    ]);
    assert.equal(carryOrder.allocations[0].status, 'locked_box');
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
    assert.ok(poRes.body.order.totalCasesCount >= 2);
  } finally {
    await h.cleanup();
  }
});

test('9. Viral Referral signup (+50p friend credit), first checkout (+100p referrer credit), and credit conservation at cutoff', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const adminToken = await loginAdmin(h.baseUrl);

    // Referrer signs in and gets a `UOB-XXXXXX` referral code with 0p initial credit
    const referrerLogin = await loginStudent(h.baseUrl, 'referrer.hallmate');
    assert.ok(referrerLogin.user.referralCode?.startsWith('UOB-'));
    assert.equal(referrerLogin.user.creditBalancePence, 0);

    // Friend signs in with referrer's code -> receives instant 50p (£0.50) welcome credit!
    const friendLogin = await loginStudent(
      h.baseUrl,
      'friend.fresher',
      referrerLogin.user.referralCode
    );
    assert.equal(friendLogin.user.creditBalancePence, 50);

    // Friend places first order (1 × Mutti 299p + 50p fee = 349p gross -> 50p credit applied = 299p paid!)
    const friendOrder = await checkoutAndConfirm(h.baseUrl, friendLogin.token, [
      { productId: 'prod-mutti-tomatoes-4pk', quantity: 1 },
    ]);
    assert.equal(friendOrder.creditAppliedPence, 50);
    assert.equal(friendOrder.totalPaidPence, 299);

    // Friend's wallet credit is now 0p, AND Referrer now has +100p (£1.00) credit!
    const friendMe = await apiJson<{ user: AuthUser }>(h.baseUrl, '/api/auth/me', {
      token: friendLogin.token,
    });
    assert.equal(friendMe.body.user.creditBalancePence, 0);

    const referrerMe = await apiJson<{ user: AuthUser }>(h.baseUrl, '/api/auth/me', {
      token: referrerLogin.token,
    });
    assert.equal(referrerMe.body.user.creditBalancePence, 100);

    // Referrer buys full 2-share case of Oatly (870p >= 800p -> 0p fee, -100p credit = 770p paid!)
    const referrerOrder = await checkoutAndConfirm(h.baseUrl, referrerLogin.token, [
      { productId: 'prod-oatly-barista-3pk', quantity: 2 },
    ]);
    assert.equal(referrerOrder.creditAppliedPence, 100);
    assert.equal(referrerOrder.totalPaidPence, 770);

    // Trigger cutoff -> Friend's unfilled Mutti order refunds 299p cash AND restores 50p wallet credit!
    await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
    });
    const friendAfterCutoff = await apiJson<{ user: AuthUser }>(h.baseUrl, '/api/auth/me', {
      token: friendLogin.token,
    });
    assert.equal(friendAfterCutoff.body.user.creditBalancePence, 50);
  } finally {
    await h.cleanup();
  }
});

test('10. Student Bulk Item Request Board voting & 1-click Admin JSON Backup', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const { token: studentToken } = await loginStudent(h.baseUrl, 'voter.one');
    const adminToken = await loginAdmin(h.baseUrl);

    // Initial seeded requests exist
    const listRes = await apiJson<{ requests: ProductRequest[] }>(h.baseUrl, '/api/requests');
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.requests.length >= 4);

    // Student submits a new bulk request (auto-upvoted to 1)
    const createReq = await apiJson<{ request: ProductRequest }>(h.baseUrl, '/api/requests', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({
        itemName: 'PG Tips 1,100 Catering Tea Bags',
        brandOrSize: 'Sack split into 4 × 275 bags',
        category: 'Drinks & Caffeine',
      }),
    });
    assert.equal(createReq.status, 201);
    assert.equal(createReq.body.request.upvotesCount, 1);
    assert.equal(createReq.body.request.viewerHasVoted, true);

    // Toggling vote removes vote (0), toggling again re-adds vote (1)
    const unvote = await apiJson<{ request: ProductRequest }>(
      h.baseUrl,
      `/api/requests/${createReq.body.request.id}/vote`,
      { method: 'POST', token: studentToken }
    );
    assert.equal(unvote.body.request.upvotesCount, 0);
    assert.equal(unvote.body.request.viewerHasVoted, false);

    const revote = await apiJson<{ request: ProductRequest }>(
      h.baseUrl,
      `/api/requests/${createReq.body.request.id}/vote`,
      { method: 'POST', token: studentToken }
    );
    assert.equal(revote.body.request.upvotesCount, 1);
    assert.equal(revote.body.request.viewerHasVoted, true);

    // Admin marks request as `stocked`
    const stocked = await apiJson<{ request: ProductRequest }>(
      h.baseUrl,
      `/api/admin/requests/${createReq.body.request.id}`,
      {
        method: 'PUT',
        token: adminToken,
        body: JSON.stringify({ status: 'stocked' }),
      }
    );
    assert.equal(stocked.status, 200);
    assert.equal(stocked.body.request.status, 'stocked');

    // Admin downloads full JSON database backup
    const backup = await apiJson<{ exportedAt: string; products: unknown[]; productRequests: unknown[] }>(
      h.baseUrl,
      '/api/admin/backup',
      { token: adminToken }
    );
    assert.equal(backup.status, 200);
    assert.ok(backup.headers.get('content-disposition')?.includes('attachment'));
    assert.ok(Array.isArray(backup.body.products));
    assert.ok(Array.isArray(backup.body.productRequests));
  } finally {
    await h.cleanup();
  }
});

test('11. Security: IDOR block on confirm-test, confirm-test/webhook idempotency, and stripe_live bypass block', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  const prevStripeSecret = process.env.STRIPE_SECRET_KEY;
  const prevWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const referrer = await loginStudent(h.baseUrl, 'sec.referrer');
    const alice = await loginStudent(h.baseUrl, 'sec.alice', referrer.user.referralCode);
    const attackerBob = await loginStudent(h.baseUrl, 'sec.bob');

    // Alice creates a pending order (uses 50p referral credit)
    const createRes = await apiJson<CreateCheckoutResponse>(h.baseUrl, '/api/checkout/create', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ items: [{ productId: 'prod-indomie-10pk', quantity: 2 }] }),
    });
    assert.equal(createRes.status, 200);
    const pendingOrderId = createRes.body.pendingOrderId;

    // (a) IDOR block: Attacker Bob cannot confirm or inspect Alice's pending order
    const idorAttempt = await apiJson<{ error: string }>(h.baseUrl, '/api/checkout/confirm-test', {
      method: 'POST',
      token: attackerBob.token,
      body: JSON.stringify({ pendingOrderId }),
    });
    assert.equal(idorAttempt.status, 403);

    // (b) Idempotency: Alice confirming the same order multiple times never double-allocates
    //     slots, never double-deducts credit, and never double-awards the £1.00 referrer bonus!
    const confirm1 = await apiJson<{ order: Order }>(h.baseUrl, '/api/checkout/confirm-test', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ pendingOrderId }),
    });
    const confirm2 = await apiJson<{ order: Order }>(h.baseUrl, '/api/checkout/confirm-test', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ pendingOrderId }),
    });
    assert.equal(confirm1.status, 200);
    assert.equal(confirm2.status, 200);
    assert.equal(confirm2.body.order.allocations.length, 2);

    // Even after confirmation, Bob still gets 403 trying to inspect Alice's order via confirm-test
    const idorAfter = await apiJson<{ error: string }>(h.baseUrl, '/api/checkout/confirm-test', {
      method: 'POST',
      token: attackerBob.token,
      body: JSON.stringify({ pendingOrderId }),
    });
    assert.equal(idorAfter.status, 403);

    const stateAfter = await apiJson<{ products: ProductWithPool[] }>(h.baseUrl, '/api/state');
    const indomie = stateAfter.body.products.find((p) => p.id === 'prod-indomie-10pk')!;
    assert.equal(indomie.totalClaimedSlots, 2);

    const refMe = await apiJson<{ user: AuthUser }>(h.baseUrl, '/api/auth/me', {
      token: referrer.token,
    });
    assert.equal(refMe.body.user.creditBalancePence, 100);

    // (c) stripe_live order CANNOT be bypassed via /api/checkout/confirm-test
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_live_guard';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_idempotency_secret';

    const livePending = createPendingOrder(
      h.db,
      alice.user,
      [{ productId: 'prod-basmati-5kg', quantity: 1 }],
      'stripe_live'
    );
    assert.equal(livePending.paymentMode, 'stripe_live');

    const bypassAttempt = await apiJson<{ error: string }>(
      h.baseUrl,
      '/api/checkout/confirm-test',
      {
        method: 'POST',
        token: alice.token,
        body: JSON.stringify({ pendingOrderId: livePending.orderId }),
      }
    );
    assert.equal(bypassAttempt.status, 403);

    // Replaying a signed Stripe webhook twice confirms once and stays 100% idempotent
    const webhookBody = JSON.stringify({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: livePending.orderId,
          metadata: { order_id: livePending.orderId },
          payment_intent: 'pi_test_123',
        },
      },
    });
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${ts}.${webhookBody}`)
      .digest('hex');

    for (let replay = 0; replay < 2; replay++) {
      const whRes = await fetch(`${h.baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': `t=${ts},v1=${sig}`,
        },
        body: webhookBody,
      });
      assert.equal(whRes.status, 200);
    }

    const finalState = await apiJson<{ products: ProductWithPool[] }>(h.baseUrl, '/api/state');
    const basmati = finalState.body.products.find((p) => p.id === 'prod-basmati-5kg')!;
    assert.equal(basmati.totalClaimedSlots, 1);
  } finally {
    if (prevStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prevStripeSecret;
    if (prevWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prevWebhookSecret;
    await h.cleanup();
  }
});

test('12. Security: HTTP headers, CSP, CORS, production auth guards, and ADMIN_PIN rate limiting (429)', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAdminPin = process.env.ADMIN_PIN;
  const prevAllowDev = process.env.ALLOW_DEV_LOGIN;
  const prevPublicUrl = process.env.PUBLIC_BASE_URL;
  try {
    // (d) Security headers present on responses
    const stateRes = await apiJson<{ settings: DropSettings }>(h.baseUrl, '/api/state');
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(stateRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(stateRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(
      stateRes.headers.get('permissions-policy'),
      'camera=(self), microphone=(), geolocation=()'
    );
    assert.equal(stateRes.headers.get('x-powered-by'), null);

    // Production mode guards: CSP header, CORS origin lock, dev-login/devOtpCode block, weak ADMIN_PIN 503
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEV_LOGIN;
    process.env.PUBLIC_BASE_URL = 'https://divly.co.uk';
    process.env.ADMIN_PIN = 'uob-admin-2026';

    const prodState = await fetch(`${h.baseUrl}/api/state`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    assert.ok(prodState.headers.get('content-security-policy')?.includes("default-src 'self'"));
    assert.equal(prodState.headers.get('access-control-allow-origin'), null);

    const allowedCors = await fetch(`${h.baseUrl}/api/state`, {
      headers: { Origin: 'https://divly.co.uk' },
    });
    assert.equal(allowedCors.headers.get('access-control-allow-origin'), 'https://divly.co.uk');

    const blockedDevLogin = await apiJson<{ error: string }>(h.baseUrl, '/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ role: 'student' }),
    });
    assert.equal(blockedDevLogin.status, 403);

    const prodOtp = await apiJson<{ ok: boolean; devOtpCode?: string }>(
      h.baseUrl,
      '/api/auth/request-otp',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'sec.check@student.bham.ac.uk' }),
      }
    );
    assert.equal(prodOtp.status, 200);
    assert.equal(prodOtp.body.devOtpCode, undefined);

    const weakPinProd = await apiJson<{ error: string }>(h.baseUrl, '/api/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ pin: 'uob-admin-2026' }),
    });
    assert.equal(weakPinProd.status, 503);

    // Restore strong PIN and test (e) rate limiting returning 429 on repeated wrong ADMIN_PIN attempts
    process.env.ADMIN_PIN = 'Strong-Campus-Pin-9942!';
    let statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      const badPin = await apiJson<{ error: string }>(h.baseUrl, '/api/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ pin: `wrong-pin-${attempt}` }),
      });
      statuses.push(badPin.status);
    }
    // Note: weakPinProd above consumed 1 attempt out of 10 on `/api/auth/admin-login`
    assert.ok(statuses.includes(401));
    assert.equal(statuses[statuses.length - 1], 429);
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevAdminPin === undefined) delete process.env.ADMIN_PIN;
    else process.env.ADMIN_PIN = prevAdminPin;
    if (prevAllowDev === undefined) delete process.env.ALLOW_DEV_LOGIN;
    else process.env.ALLOW_DEV_LOGIN = prevAllowDev;
    if (prevPublicUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prevPublicUrl;
    await h.cleanup();
  }
});

test('13. Security: Checkout payload bounds (negative/NaN/fractional/duplicate >24), 64kb body cap & SSRF block', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    const { token: studentToken } = await loginStudent(h.baseUrl, 'bounds.tester');
    const adminToken = await loginAdmin(h.baseUrl);

    // (f) Invalid checkout payloads must all be rejected with 400
    const badPayloads: unknown[] = [
      { items: [] },
      { items: [{ productId: 'prod-basmati-5kg', quantity: 0 }] },
      { items: [{ productId: 'prod-basmati-5kg', quantity: -3 }] },
      { items: [{ productId: 'prod-basmati-5kg', quantity: 1.5 }] },
      { items: [{ productId: 'prod-basmati-5kg', quantity: null }] },
      { items: [{ productId: 'prod-basmati-5kg', quantity: '2' }] },
      { items: [{ productId: 'prod-basmati-5kg', quantity: 25 }] },
      // Duplicate productId bypass attempt: 15 + 10 = 25 > 24 max per item!
      {
        items: [
          { productId: 'prod-basmati-5kg', quantity: 15 },
          { productId: 'prod-basmati-5kg', quantity: 10 },
        ],
      },
    ];

    for (const payload of badPayloads) {
      const res = await apiJson<{ error: string }>(h.baseUrl, '/api/checkout/create', {
        method: 'POST',
        token: studentToken,
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 400);
    }

    // Valid duplicate productId within <= 24 cap merges cleanly (2 + 2 = 4 shares)
    const mergedOrder = await checkoutAndConfirm(h.baseUrl, studentToken, [
      { productId: 'prod-basmati-5kg', quantity: 2 },
      { productId: 'prod-basmati-5kg', quantity: 2 },
    ]);
    assert.equal(mergedOrder.allocations.length, 4);

    // Inactive product must be rejected at checkout
    await apiJson(h.baseUrl, '/api/admin/products/prod-mutti-tomatoes-4pk', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ isActive: false }),
    });
    const inactiveRes = await apiJson<{ error: string }>(h.baseUrl, '/api/checkout/create', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({ items: [{ productId: 'prod-mutti-tomatoes-4pk', quantity: 1 }] }),
    });
    assert.equal(inactiveRes.status, 400);

    // Request board strips control characters and clamps strings to <= 120 chars
    const longDirtyName = `  Shin\u0000\u0007\nRamyun ${'X'.repeat(160)}  `;
    const reqCreated = await apiJson<{ request: ProductRequest }>(h.baseUrl, '/api/requests', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({
        itemName: longDirtyName,
        brandOrSize: `Bulk\u001FPack ${'Y'.repeat(150)}`,
        category: 'Rice & Noodles',
      }),
    });
    assert.equal(reqCreated.status, 201);
    assert.ok(reqCreated.body.request.itemName.length <= 120);
    assert.equal(/[\u0000-\u001F\u007F]/.test(reqCreated.body.request.itemName), false);
    assert.ok(reqCreated.body.request.brandOrSize.length <= 120);

    // Oversized JSON payload (>64kb) is rejected with 413 Payload Too Large
    const hugeRes = await fetch(`${h.baseUrl}/api/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ itemName: 'A'.repeat(80_000) }),
    });
    assert.equal(hugeRes.status, 413);

    // SSRF guard blocks AWS/cloud metadata IPs in all modes and http/loopback in production
    assert.throws(() => validateWholesaleWebhookUrl('http://169.254.169.254/latest/meta-data/'));
    process.env.NODE_ENV = 'production';
    assert.throws(() => validateWholesaleWebhookUrl('http://supplier.example.com/edi'));
    assert.throws(() => validateWholesaleWebhookUrl('https://127.0.0.1:8080/internal'));
    assert.equal(
      validateWholesaleWebhookUrl('https://edi.qogita.com/webhooks/orders'),
      'https://edi.qogita.com/webhooks/orders'
    );
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    await h.cleanup();
  }
});

test('14. Multi-quantity Closer Bonus spillover cap & wallet-credit-first partial refund protection', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    const adminToken = await loginAdmin(h.baseUrl);
    const opener = await loginStudent(h.baseUrl, 'box.opener');
    const spilloverBuyer = await loginStudent(h.baseUrl, 'box.spillover');

    // Opener claims 3/4 slots of TREK Protein (base 295p -> 1 slot left triggers 10% Closer = 266p)
    await checkoutAndConfirm(h.baseUrl, opener.token, [
      { productId: 'prod-trek-protein-4pk', quantity: 3 },
    ]);

    // Spillover buyer orders 3 shares: 1 share closes Case #1 at 266p, 2 spillover shares pay full 295p!
    const spillOrder = await checkoutAndConfirm(h.baseUrl, spilloverBuyer.token, [
      { productId: 'prod-trek-protein-4pk', quantity: 3 },
    ]);
    assert.equal(spillOrder.subtotalPence, 266 + 295 * 2);
    assert.equal(spillOrder.closerDiscountTotalPence, 29);

    // Referral wallet credit partial-refund anti-cashout check:
    const refHost = await loginStudent(h.baseUrl, 'credit.host');
    const refFriend = await loginStudent(h.baseUrl, 'credit.friend', refHost.user.referralCode);
    assert.equal(refFriend.user.creditBalancePence, 50);

    // Friend buys full 2-share Oatly case (870p, locks immediately) + 1 Mutti share (299p, stays pooling)
    // Gross = 1169p (>= 800p -> 0p fee), minus 50p credit = 1119p cash paid
    const mixedOrder = await checkoutAndConfirm(h.baseUrl, refFriend.token, [
      { productId: 'prod-oatly-barista-3pk', quantity: 2 },
      { productId: 'prod-mutti-tomatoes-4pk', quantity: 1 },
    ]);
    assert.equal(mixedOrder.totalPaidPence, 1119);
    assert.equal(mixedOrder.creditAppliedPence, 50);

    // At cutoff, Mutti (299p) auto-refunds: 50p promotional credit is restored to wallet FIRST,
    // and only the remaining 249p is refunded as cash (so 50p promo credit cannot be cashed out!)
    await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
    });
    const friendOrdersAfter = await apiJson<{ orders: Order[] }>(h.baseUrl, '/api/orders/mine', {
      token: refFriend.token,
    });
    const settledMixed = friendOrdersAfter.body.orders[0];
    assert.equal(settledMixed.status, 'settled');
    assert.equal(settledMixed.creditRestoredPence, 50);
    assert.equal(settledMixed.refundedPence, 249);
    assert.equal(settledMixed.netChargedPence, 870);

    const friendWalletAfter = await apiJson<{ user: AuthUser }>(h.baseUrl, '/api/auth/me', {
      token: refFriend.token,
    });
    assert.equal(friendWalletAfter.body.user.creditBalancePence, 50);
  } finally {
    await h.cleanup();
  }
});
