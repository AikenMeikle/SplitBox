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
  Order,
  ProductWithPool,
  ScanLookupResult,
} from '../src/shared/types.ts';

process.env.DIVLY_QUIET_LOGS = '1';

interface TestHarness {
  baseUrl: string;
  cleanup: () => Promise<void>;
}

/**
 * Spawns an isolated Express + SQLite WAL instance on an ephemeral OS port (`0`)
 * so every test runs real HTTP + real SQLite WAL concurrency without interference.
 */
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

    // Student A claims 3 shares of a 4-share case (`prod-indomie-10pk`, caseSize = 4)
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

    // Student B claims 2 shares -> Slot 3 locks ALL of Box #1, Slot 4 opens Box #2 as pooling!
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

    // Verify Student A's first 3 shares in Box #1 were atomically promoted to `locked_box`!
    const mineA = await apiJson<{ orders: Order[] }>(h.baseUrl, '/api/orders/mine', {
      token: tokenA,
    });
    assert.ok(mineA.body.orders[0].allocations.every((a) => a.status === 'locked_box'));

    // Verify public pool counters reflect 1 locked case + 1/4 open in Case #2
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

    // Fire all 20 checkouts concurrently on `prod-basmati-5kg` (caseSize = 4) -> exactly 5 locked boxes!
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

    assert.equal(slotIndices.size, 20, 'Every concurrent student must get a unique slot 0..19');
    assert.equal(Math.min(...slotIndices), 0);
    assert.equal(Math.max(...slotIndices), 19);
    assert.equal(pickupCodes.size, 20, 'Zero collisions on UOB-XXXXXX pickup codes');
    assert.equal(pickupPins.size, 20, 'Zero collisions on 6-digit pickup PINs');
    assert.equal(qrTokens.size, 20, 'Zero collisions on HMAC QR tokens');

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
    const tokenA = await loginStudent(h.baseUrl, 'student.alpha');
    const tokenB = await loginStudent(h.baseUrl, 'student.beta');
    const tokenUnlucky = await loginStudent(h.baseUrl, 'student.unlucky');
    const adminToken = await loginAdmin(h.baseUrl);

    // Student Alpha buys 3 × Trek Flapjacks (3 × 295p = 885p >= 800p threshold -> £0.00 fee)
    await checkoutAndConfirm(h.baseUrl, tokenA, [
      { productId: 'prod-trek-protein-4pk', quantity: 3 },
    ]);

    // Student Beta buys 2 × Trek Flapjacks (2 × 295p = 590p < 800p threshold -> +50p small-order fee = 640p paid!)
    // -> 1st share locks Box #1 (`fulfilled` at cutoff), 2nd share overflows into Box #2 (`auto_refunded` at cutoff)!
    const orderB = await checkoutAndConfirm(h.baseUrl, tokenB, [
      { productId: 'prod-trek-protein-4pk', quantity: 2 },
    ]);
    assert.equal(orderB.subtotalPence, 590);
    assert.equal(orderB.feePence, 50);
    assert.equal(orderB.totalPaidPence, 640);

    // Student Unlucky buys 1 × Mutti Tomatoes (299p + 50p fee = 349p paid) in a box of 3 that NEVER fills!
    const orderUnlucky = await checkoutAndConfirm(h.baseUrl, tokenUnlucky, [
      { productId: 'prod-mutti-tomatoes-4pk', quantity: 1 },
    ]);
    assert.equal(orderUnlucky.subtotalPence, 299);
    assert.equal(orderUnlucky.feePence, 50);
    assert.equal(orderUnlucky.totalPaidPence, 349);

    // Admin triggers weekly cutoff!
    const cutoffRes = await apiJson<AdminSummary>(h.baseUrl, '/api/admin/cutoff', {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(cutoffRes.status, 200);
    assert.equal(cutoffRes.body.settings.dropStatus, 'closed');

    // Check Student Beta: 1 fulfilled (295p) + 50p fee = 345p netCharged, 1 overflow auto-refunded = 295p refunded!
    const betaAfter = cutoffRes.body.orders.find((o) => o.id === orderB.id)!;
    assert.equal(betaAfter.status, 'settled');
    assert.equal(betaAfter.refundedPence, 295);
    assert.equal(betaAfter.netChargedPence, 345);
    assert.equal(betaAfter.totalPaidPence, betaAfter.netChargedPence + betaAfter.refundedPence);

    // Check Student Unlucky: 0 fulfilled -> 100% refunded INCLUDING the 50p small-order fee!
    const unluckyAfter = cutoffRes.body.orders.find((o) => o.id === orderUnlucky.id)!;
    assert.equal(unluckyAfter.status, 'refunded');
    assert.equal(unluckyAfter.refundedPence, 349);
    assert.equal(unluckyAfter.netChargedPence, 0);
    assert.equal(
      unluckyAfter.totalPaidPence,
      unluckyAfter.netChargedPence + unluckyAfter.refundedPence
    );

    // Check wholesale shopping list: ONLY 1 full case of Trek to purchase, 0 cases of Mutti!
    const trekLine = cutoffRes.body.shoppingList.find(
      (l) => l.productId === 'prod-trek-protein-4pk'
    )!;
    assert.equal(trekLine.lockedCasesCount, 1);
    assert.equal(trekLine.overflowSlotsCount, 1);
    const muttiLine = cutoffRes.body.shoppingList.find(
      (l) => l.productId === 'prod-mutti-tomatoes-4pk'
    )!;
    assert.equal(muttiLine.lockedCasesCount, 0);
    assert.equal(muttiLine.overflowSlotsCount, 1);
  } finally {
    await h.cleanup();
  }
});

test('4. Campus OTP gate, HMAC QR tamper rejection, PIN lookup, and atomic double-collection block', async () => {
  const h = await startTestServer({ includeDemoPools: false });
  try {
    // Reject non-UoB email (`@gmail.com`)
    const badOtp = await apiJson<{ error: string }>(h.baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email: 'intruder@gmail.com' }),
    });
    assert.equal(badOtp.status, 400);

    // Accept `@student.bham.ac.uk` OTP flow
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

    // Student buys a full case of Oatly Barista (`caseSize = 2`) so Box #1 locks immediately
    const order = await checkoutAndConfirm(h.baseUrl, studentToken, [
      { productId: 'prod-oatly-barista-3pk', quantity: 2 },
    ]);
    await apiJson(h.baseUrl, '/api/admin/cutoff', { method: 'POST', token: adminToken });

    // Tamper with the last character of the HMAC-SHA256 QR token -> must be rejected!
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
    assert.equal(tamperedCheck.body.alreadyCollected, false);

    // Valid QR token scan -> `valid: true`
    const validQrCheck = await apiJson<ScanLookupResult>(h.baseUrl, '/api/admin/scan/verify', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ input: order.qrToken }),
    });
    assert.equal(validQrCheck.body.valid, true);
    assert.equal(validQrCheck.body.order?.id, order.id);

    // Valid 6-digit PIN lookup -> `valid: true`
    const validPinCheck = await apiJson<ScanLookupResult>(h.baseUrl, '/api/admin/scan/verify', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ input: order.pickupPin }),
    });
    assert.equal(validPinCheck.body.valid, true);

    // Mark collected once -> 200 OK
    const collect1 = await apiJson<{ order: Order }>(h.baseUrl, '/api/admin/scan/collect', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ orderId: order.id }),
    });
    assert.equal(collect1.status, 200);
    assert.equal(collect1.body.order.status, 'collected');

    // Second collection attempt -> 409 Conflict blocked!
    const collect2 = await apiJson<{ error: string }>(h.baseUrl, '/api/admin/scan/collect', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ orderId: order.id }),
    });
    assert.equal(collect2.status, 409);

    // Re-scanning after collection -> `alreadyCollected: true`, `valid: false`
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

    // Verify seeded storefront has 12 Aldi-beating items and realistic live open pools (3/4, 2/4, 5/6)
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

    // Admin creates a new product
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
          isActive: true,
        }),
      }
    );
    assert.equal(createdRes.status, 201);
    const newProdId = createdRes.body.product.id;

    // Admin updates product price -> savingsPercent updates immediately
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

    // Admin deletes the newly added product
    const deleteRes = await apiJson<{ ok: boolean }>(
      h.baseUrl,
      `/api/admin/products/${newProdId}`,
      {
        method: 'DELETE',
        token: adminToken,
      }
    );
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.ok, true);

    // Admin settles Cycle #1 then starts New Weekly Drop (Cycle #2)
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

    // Active pool counters reset to 0 for Cycle #2 while historical Cycle #1 orders remain preserved!
    assert.ok(newDropRes.body.products.every((p) => p.totalClaimedSlots === 0));
    assert.equal(newDropRes.body.orders.length, 3);
    assert.ok(
      newDropRes.body.orders.every((o) => o.totalPaidPence === o.netChargedPence + o.refundedPence)
    );
  } finally {
    await h.cleanup();
  }
});
