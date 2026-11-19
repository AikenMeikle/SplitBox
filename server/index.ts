import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import type {
  AuthUser,
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  DropSettings,
  Product,
} from '../src/shared/types.ts';
import {
  getOrderById,
  getProductsWithPool,
  getProductWithPoolById,
  getSettings,
  hydrateOrders,
  HttpError,
  openDatabase,
} from './db.ts';
import { seedDatabase } from './seed.ts';
import {
  adminLogin,
  devLogin,
  getUserFromAuthHeader,
  isDevMode,
  logoutByAuthHeader,
  requestOtp,
  verifyOtp,
  warnIfInsecureProductionSecrets,
} from './services/auth.ts';
import {
  attachStripeSessionToOrder,
  confirmOrderPayment,
  createPendingOrder,
} from './services/poolAllocator.ts';
import {
  buildDatabaseBackupPayload,
  createProductRequest,
  listProductRequests,
  toggleProductRequestVote,
  updateProductRequestStatus,
} from './services/productRequests.ts';
import { collectOrder, verifyScanInput } from './services/qrPass.ts';
import { createRateLimiterStore } from './services/rateLimit.ts';
import { SseHub } from './services/realtime.ts';
import { getAdminSummary, runWeeklyCutoff, startNewDropCycle } from './services/settlement.ts';
import {
  createStripeCheckoutSession,
  isStripeConfigured,
  retrieveStripeCheckoutSession,
  verifyStripeWebhookEvent,
} from './services/stripeService.ts';
import {
  createWholesalePurchaseOrder,
  searchLiveWholesaleCatalog,
} from './services/wholesaleApi.ts';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
].join('; ');

function parseConfiguredOrigin(): string | null {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }
  } catch {
    // Ignore malformed PUBLIC_BASE_URL and fall back to strict same-origin
  }
  return null;
}

function resolveCheckoutBaseUrl(req: Request): string {
  const configuredOrigin = parseConfiguredOrigin();
  if (configuredOrigin) return configuredOrigin;

  const rawHost = String(req.get('host') ?? '').trim();
  if (!/^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost)) {
    throw new HttpError(400, 'Invalid Host header for checkout redirect.');
  }
  const proto = req.protocol === 'https' ? 'https' : 'http';
  return `${proto}://${rawHost}`;
}

function safeInt(val: unknown, fallback: number, min: number, max = 10_000_000): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function cleanText(val: unknown, maxLen = 160): string {
  return String(val ?? '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function createApp(db: DatabaseSync): express.Express {
  const app = express();
  const sseHub = new SseHub();
  const rateLimit = createRateLimiterStore();

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // Global HTTP security headers (allows same-origin camera for Admin QR scanner)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Content-Security-Policy', PRODUCTION_CSP);
    }
    next();
  });

  // Restrict CORS in production to PUBLIC_BASE_URL when set (permissive only in dev)
  app.use(
    cors({
      origin(requestOrigin, callback) {
        if (process.env.NODE_ENV !== 'production') {
          callback(null, true);
          return;
        }
        if (!requestOrigin) {
          callback(null, true);
          return;
        }
        const allowedOrigin = parseConfiguredOrigin();
        callback(null, Boolean(allowedOrigin && requestOrigin === allowedOrigin));
      },
    })
  );

  // 1. Raw body Stripe webhook MUST be mounted before `express.json()`.
  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json', limit: '256kb' }),
    (req, res) => {
      const sigHeader = req.headers['stripe-signature'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));

      const event = verifyStripeWebhookEvent(rawBuf, sig);
      if (event.type === 'checkout.session.completed') {
        const obj = (event.data as { object?: Record<string, unknown> } | undefined)?.object;
        const meta = (obj?.metadata as Record<string, unknown> | undefined) ?? {};
        const orderId =
          (typeof meta.order_id === 'string' && meta.order_id) ||
          (typeof obj?.client_reference_id === 'string' ? obj.client_reference_id : null);
        const paymentIntentId = typeof obj?.payment_intent === 'string' ? obj.payment_intent : null;

        if (orderId) {
          confirmOrderPayment(db, orderId, {
            stripePaymentIntentId: paymentIntentId,
            allowLiveStripe: true,
          });
          sseHub.broadcast('pool_updated');
        }
      }
      res.json({ received: true });
    }
  );

  app.use(express.json({ limit: '64kb' }));

  const limitRequestOtp = rateLimit({
    scope: 'auth-request-otp',
    maxRequests: 8,
    windowMs: 10 * 60_000,
    message: 'Too many verification code requests. Please wait a few minutes and try again.',
  });
  const limitVerifyOtp = rateLimit({
    scope: 'auth-verify-otp',
    maxRequests: 10,
    windowMs: 10 * 60_000,
    message: 'Too many OTP verification attempts. Please wait 10 minutes and try again.',
  });
  const limitAdminLogin = rateLimit({
    scope: 'auth-admin-login',
    maxRequests: 10,
    windowMs: 10 * 60_000,
    message: 'Too many Admin PIN attempts. Please wait 10 minutes before retrying.',
  });
  const limitRequestsBoard = rateLimit({
    scope: 'student-requests',
    maxRequests: 30,
    windowMs: 60_000,
    message: 'Rate limit reached for item requests. Please wait a minute.',
  });
  const limitScanVerify = rateLimit({
    scope: 'admin-scan-verify',
    maxRequests: 30,
    windowMs: 60_000,
    message: 'Too many QR/PIN scan lookups per minute. Slow down briefly.',
  });

  function requireUser(req: Request): AuthUser {
    const user = getUserFromAuthHeader(db, req.headers.authorization);
    if (!user) throw new HttpError(401, 'Please sign in to continue.');
    return user;
  }

  function requireAdmin(req: Request): AuthUser {
    const user = requireUser(req);
    if (user.role !== 'admin') throw new HttpError(403, 'Admin privileges required.');
    return user;
  }

  // --- Storefront State, Item Request Board & Real-Time SSE ---

  app.get('/api/state', (_req, res) => {
    res.json({
      settings: getSettings(db),
      products: getProductsWithPool(db, false),
      stripeConfigured: isStripeConfigured(),
      devMode: isDevMode(),
    });
  });

  app.get('/api/events', (req, res) => sseHub.subscribe(req, res));

  app.use('/api/requests', limitRequestsBoard);

  app.get('/api/requests', (req, res) => {
    const viewer = getUserFromAuthHeader(db, req.headers.authorization);
    res.json({ requests: listProductRequests(db, viewer?.id) });
  });

  app.post('/api/requests', (req, res) => {
    const user = requireUser(req);
    const created = createProductRequest(
      db,
      user,
      (req.body ?? {}) as { itemName?: string; brandOrSize?: string; category?: string }
    );
    sseHub.broadcast('requests_updated');
    res.status(201).json({ request: created });
  });

  app.post('/api/requests/:id/vote', (req, res) => {
    const user = requireUser(req);
    const updated = toggleProductRequestVote(db, String(req.params.id), user);
    sseHub.broadcast('requests_updated');
    res.json({ request: updated });
  });

  // --- Student OTP, Viral Referral & Admin Authentication ---

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: getUserFromAuthHeader(db, req.headers.authorization) });
  });

  app.post('/api/auth/request-otp', limitRequestOtp, async (req, res) => {
    const { email, name } = (req.body ?? {}) as { email?: string; name?: string };
    res.json(await requestOtp(db, String(email ?? ''), name));
  });

  app.post('/api/auth/verify-otp', limitVerifyOtp, (req, res) => {
    const { email, code, name, referralCode } = (req.body ?? {}) as Record<
      string,
      string | undefined
    >;
    res.json(verifyOtp(db, String(email ?? ''), String(code ?? ''), name, referralCode));
  });

  app.post('/api/auth/admin-login', limitAdminLogin, (req, res) => {
    const { pin, email } = (req.body ?? {}) as { pin?: string; email?: string };
    res.json(adminLogin(db, String(pin ?? ''), email));
  });

  app.post('/api/auth/dev-login', (req, res) => {
    const { role, persona, referralCode } = (req.body ?? {}) as {
      role?: 'student' | 'admin';
      persona?: string;
      referralCode?: string;
    };
    res.json(devLogin(db, role === 'admin' ? 'admin' : 'student', persona, referralCode));
  });

  app.post('/api/auth/logout', (req, res) => {
    logoutByAuthHeader(db, req.headers.authorization);
    res.json({ ok: true });
  });

  // --- Student Orders & Checkout ---

  app.get('/api/orders/mine', (req, res) => {
    const user = requireUser(req);
    const rows = db
      .prepare("SELECT * FROM orders WHERE user_id = ? AND status != 'pending_payment' ORDER BY created_at DESC")
      .all(user.id) as Array<Record<string, unknown>>;
    res.json({ orders: hydrateOrders(db, rows) });
  });

  app.post('/api/checkout/create', async (req, res) => {
    const user = requireUser(req);
    const body = (req.body ?? {}) as CreateCheckoutRequest;
    const stripeActive = isStripeConfigured();
    const pending = createPendingOrder(
      db,
      user,
      body.items ?? [],
      stripeActive ? 'stripe_live' : 'test_simulated'
    );

    if (pending.paymentMode === 'stripe_live') {
      const baseUrl = resolveCheckoutBaseUrl(req);
      const stripeLineItems =
        pending.creditAppliedPence > 0
          ? [
              {
                productId: 'divly-net-basket',
                productName: 'Divly Campus Bulk Shares (after Wallet Credit)',
                unitDescription: `Includes £${(pending.creditAppliedPence / 100).toFixed(2)} wallet credit`,
                sharePricePence: pending.totalPaidPence,
                aldiPricePence: pending.totalPaidPence,
                quantity: 1,
              },
            ]
          : pending.lineItems;

      const session = await createStripeCheckoutSession({
        orderId: pending.orderId,
        userEmail: user.email,
        lineItems: stripeLineItems,
        feePence: pending.creditAppliedPence > 0 ? 0 : pending.feePence,
        baseUrl,
      });
      attachStripeSessionToOrder(db, pending.orderId, session.sessionId);
      const response: CreateCheckoutResponse = {
        mode: 'stripe_redirect',
        checkoutUrl: session.url,
        pendingOrderId: pending.orderId,
        totalPaidPence: pending.totalPaidPence,
        subtotalPence: pending.subtotalPence,
        feePence: pending.feePence,
        creditAppliedPence: pending.creditAppliedPence,
      };
      res.json(response);
      return;
    }

    const response: CreateCheckoutResponse = {
      mode: 'test_modal',
      pendingOrderId: pending.orderId,
      totalPaidPence: pending.totalPaidPence,
      subtotalPence: pending.subtotalPence,
      feePence: pending.feePence,
      creditAppliedPence: pending.creditAppliedPence,
    };
    res.json(response);
  });

  app.post('/api/checkout/confirm-test', (req, res) => {
    const user = requireUser(req);
    const { pendingOrderId } = (req.body ?? {}) as { pendingOrderId?: string };
    const cleanOrderId = typeof pendingOrderId === 'string' ? pendingOrderId.trim() : '';
    if (!cleanOrderId) throw new HttpError(400, 'Missing pendingOrderId.');

    const order = confirmOrderPayment(db, cleanOrderId, {
      expectedUserId: user.id,
      allowLiveStripe: false,
    });
    sseHub.broadcast('pool_updated');
    res.json({ order });
  });

  app.get('/api/checkout/verify-session', async (req, res) => {
    const user = requireUser(req);
    const sessionId = String(req.query.session_id ?? '').trim();
    if (!sessionId) throw new HttpError(400, 'Missing session_id query parameter.');

    if (isStripeConfigured()) {
      const verified = await retrieveStripeCheckoutSession(sessionId);
      if (!verified.paid || !verified.orderId) {
        throw new HttpError(400, 'Stripe Checkout session has not been paid yet.');
      }
      const orderRow = db
        .prepare('SELECT user_id, stripe_session_id FROM orders WHERE id = ?')
        .get(verified.orderId) as { user_id: string; stripe_session_id: string | null } | undefined;
      if (!orderRow || orderRow.stripe_session_id !== sessionId) {
        throw new HttpError(404, 'Matching checkout order not found.');
      }
      const order = confirmOrderPayment(db, verified.orderId, {
        stripePaymentIntentId: verified.paymentIntentId,
        expectedUserId: user.role === 'admin' ? undefined : user.id,
        allowLiveStripe: true,
      });
      sseHub.broadcast('pool_updated');
      res.json({ order });
      return;
    }

    const row = db
      .prepare('SELECT id, user_id FROM orders WHERE stripe_session_id = ?')
      .get(sessionId) as { id: string; user_id: string } | undefined;
    if (!row) throw new HttpError(404, 'Checkout session not found.');
    if (user.role !== 'admin' && String(row.user_id) !== user.id) {
      throw new HttpError(403, 'You are not authorised to view this order.');
    }
    const order = getOrderById(db, row.id);
    if (!order) throw new HttpError(404, 'Checkout session not found.');
    res.json({ order });
  });

  // --- Admin Dashboard, Buy-Ahead Cutoff, Live Wholesale API, Backup & Scanner ---

  app.get('/api/admin/summary', (req, res) => {
    requireAdmin(req);
    res.json(getAdminSummary(db));
  });

  app.get('/api/admin/backup', (req, res) => {
    requireAdmin(req);
    const dateStamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="divly-backup-${dateStamp}.json"`
    );
    res.send(JSON.stringify(buildDatabaseBackupPayload(db), null, 2));
  });

  app.put('/api/admin/requests/:id', (req, res) => {
    requireAdmin(req);
    const { status } = (req.body ?? {}) as { status?: 'open' | 'stocked' };
    const updated = updateProductRequestStatus(
      db,
      String(req.params.id),
      status === 'stocked' ? 'stocked' : 'open'
    );
    sseHub.broadcast('requests_updated');
    res.json({ request: updated });
  });

  app.put('/api/admin/settings', (req, res) => {
    requireAdmin(req);
    const p = (req.body ?? {}) as Partial<DropSettings>;
    const c = getSettings(db);
    db.prepare(`
      UPDATE settings
      SET hub_name = ?, hub_short_label = ?, hub_address = ?, pickup_window = ?,
          cutoff_at_iso = ?, drop_status = ?, free_delivery_threshold_pence = ?, small_order_fee_pence = ?
      WHERE id = 1
    `).run(
      cleanText(p.hubName, 120) || c.hubName,
      cleanText(p.hubShortLabel, 80) || c.hubShortLabel,
      cleanText(p.hubAddress, 200) || c.hubAddress,
      cleanText(p.pickupWindow, 80) || c.pickupWindow,
      cleanText(p.cutoffAtIso, 60) || c.cutoffAtIso,
      p.dropStatus === 'open' || p.dropStatus === 'closed' ? p.dropStatus : c.dropStatus,
      p.freeDeliveryThresholdPence !== undefined
        ? safeInt(p.freeDeliveryThresholdPence, c.freeDeliveryThresholdPence, 0, 100_000)
        : c.freeDeliveryThresholdPence,
      p.smallOrderFeePence !== undefined
        ? safeInt(p.smallOrderFeePence, c.smallOrderFeePence, 0, 10_000)
        : c.smallOrderFeePence
    );
    sseHub.broadcast('drop_updated');
    res.json({ settings: getSettings(db) });
  });

  app.post('/api/admin/cutoff', async (req, res) => {
    requireAdmin(req);
    const { buyAheadProductIds } = (req.body ?? {}) as { buyAheadProductIds?: string[] };
    const summary = await runWeeklyCutoff(db, {
      buyAheadProductIds: Array.isArray(buyAheadProductIds) ? buyAheadProductIds : [],
    });
    sseHub.broadcast('drop_updated');
    sseHub.broadcast('pool_updated');
    res.json(summary);
  });

  app.post('/api/admin/new-drop', async (req, res) => {
    requireAdmin(req);
    const summary = await startNewDropCycle(db);
    sseHub.broadcast('drop_updated');
    sseHub.broadcast('pool_updated');
    res.json(summary);
  });

  app.get('/api/admin/wholesale/search', async (req, res) => {
    requireAdmin(req);
    const results = await searchLiveWholesaleCatalog(String(req.query.q ?? ''));
    res.json({ results });
  });

  app.post('/api/admin/wholesale/order', async (req, res) => {
    requireAdmin(req);
    const { includeBuyAheadProductIds } = (req.body ?? {}) as {
      includeBuyAheadProductIds?: string[];
    };
    const po = await createWholesalePurchaseOrder(db, {
      includeBuyAheadProductIds: Array.isArray(includeBuyAheadProductIds)
        ? includeBuyAheadProductIds
        : [],
    });
    const summary = getAdminSummary(db);
    res.json({ ...po, order: po, wholesaleOrder: po, ...summary });
  });

  app.post('/api/admin/products', (req, res) => {
    requireAdmin(req);
    const b = (req.body ?? {}) as Partial<Omit<Product, 'id'>>;
    const name = cleanText(b.name, 140);
    const brand = cleanText(b.brand, 100);
    if (!name || !brand) throw new HttpError(400, 'Product name and brand are required.');

    const caseSize = safeInt(b.caseSize ?? 4, 4, 1, 500);
    const id = `prod_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const sortRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort FROM products')
      .get() as { next_sort: number };

    db.prepare(`
      INSERT INTO products (
        id, name, brand, category, image_emoji, unit_description, case_description,
        case_size, share_price_pence, aldi_price_pence, aldi_unit_label,
        wholesale_case_cost_pence, ean_barcode, supplier_sku, supplier_name,
        shelf_life_weeks, carryover_stock_slots, is_active, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      brand,
      cleanText(b.category, 60) || 'Cooking Staples',
      cleanText(b.imageEmoji, 16) || '🛒',
      cleanText(b.unitDescription, 140) || '1 bulk unit',
      cleanText(b.caseDescription, 160) || `${caseSize} units per wholesale case`,
      caseSize,
      safeInt(b.sharePricePence ?? 0, 0, 0),
      safeInt(b.aldiPricePence ?? 0, 0, 0),
      cleanText(b.aldiUnitLabel, 120) || 'Supermarket equiv.',
      safeInt(b.wholesaleCaseCostPence ?? 0, 0, 0),
      cleanText(b.eanBarcode, 32),
      cleanText(b.supplierSku, 64),
      cleanText(b.supplierName, 80) || 'Qogita / Booker UK',
      safeInt(b.shelfLifeWeeks ?? 26, 26, 1, 260),
      safeInt(b.carryoverStockSlots ?? 0, 0, 0, 5_000),
      b.isActive === false ? 0 : 1,
      Number(sortRow.next_sort),
      new Date().toISOString()
    );

    sseHub.broadcast('products_updated');
    res.status(201).json({ product: getProductWithPoolById(db, id) });
  });

  app.put('/api/admin/products/:id', (req, res) => {
    requireAdmin(req);
    const id = String(req.params.id);
    const ex = db
      .prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Record<string, unknown> | undefined;
    if (!ex) throw new HttpError(404, 'Product not found.');

    const p = (req.body ?? {}) as Partial<Product>;
    db.prepare(`
      UPDATE products
      SET name = ?, brand = ?, category = ?, image_emoji = ?, unit_description = ?, case_description = ?,
          case_size = ?, share_price_pence = ?, aldi_price_pence = ?, aldi_unit_label = ?,
          wholesale_case_cost_pence = ?, ean_barcode = ?, supplier_sku = ?, supplier_name = ?,
          shelf_life_weeks = ?, carryover_stock_slots = ?, is_active = ?
      WHERE id = ?
    `).run(
      p.name !== undefined ? cleanText(p.name, 140) || String(ex.name) : String(ex.name),
      p.brand !== undefined ? cleanText(p.brand, 100) || String(ex.brand) : String(ex.brand),
      p.category !== undefined ? cleanText(p.category, 60) || String(ex.category) : String(ex.category),
      p.imageEmoji !== undefined ? cleanText(p.imageEmoji, 16) || String(ex.image_emoji) : String(ex.image_emoji),
      p.unitDescription !== undefined ? cleanText(p.unitDescription, 140) : String(ex.unit_description),
      p.caseDescription !== undefined ? cleanText(p.caseDescription, 160) : String(ex.case_description),
      p.caseSize !== undefined ? safeInt(p.caseSize, Number(ex.case_size), 1, 500) : Number(ex.case_size),
      p.sharePricePence !== undefined ? safeInt(p.sharePricePence, Number(ex.share_price_pence), 0) : Number(ex.share_price_pence),
      p.aldiPricePence !== undefined ? safeInt(p.aldiPricePence, Number(ex.aldi_price_pence), 0) : Number(ex.aldi_price_pence),
      p.aldiUnitLabel !== undefined ? cleanText(p.aldiUnitLabel, 120) : String(ex.aldi_unit_label),
      p.wholesaleCaseCostPence !== undefined
        ? safeInt(p.wholesaleCaseCostPence, Number(ex.wholesale_case_cost_pence), 0)
        : Number(ex.wholesale_case_cost_pence),
      p.eanBarcode !== undefined ? cleanText(p.eanBarcode, 32) : String(ex.ean_barcode || ''),
      p.supplierSku !== undefined ? cleanText(p.supplierSku, 64) : String(ex.supplier_sku || ''),
      p.supplierName !== undefined ? cleanText(p.supplierName, 80) : String(ex.supplier_name || 'Qogita / Booker UK'),
      p.shelfLifeWeeks !== undefined
        ? safeInt(p.shelfLifeWeeks, Number(ex.shelf_life_weeks || 26), 1, 260)
        : Number(ex.shelf_life_weeks || 26),
      p.carryoverStockSlots !== undefined
        ? safeInt(p.carryoverStockSlots, Number(ex.carryover_stock_slots || 0), 0, 5_000)
        : Number(ex.carryover_stock_slots || 0),
      p.isActive !== undefined ? (p.isActive ? 1 : 0) : Number(ex.is_active),
      id
    );

    sseHub.broadcast('products_updated');
    res.json({ product: getProductWithPoolById(db, id) });
  });

  app.delete('/api/admin/products/:id', (req, res) => {
    requireAdmin(req);
    const id = String(req.params.id);
    const ex = db
      .prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { id: string } | undefined;
    if (!ex) throw new HttpError(404, 'Product not found.');

    const refRow = db
      .prepare('SELECT COUNT(*) AS cnt FROM pool_allocations WHERE product_id = ?')
      .get(id) as { cnt: number };
    if (Number(refRow.cnt) === 0) {
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE products SET is_active = 0, deleted_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        id
      );
    }
    sseHub.broadcast('products_updated');
    res.json({ ok: true });
  });

  app.post('/api/admin/scan/verify', limitScanVerify, (req, res) => {
    requireAdmin(req);
    const { input } = (req.body ?? {}) as { input?: string };
    res.json(verifyScanInput(db, String(input ?? '')));
  });

  app.post('/api/admin/scan/collect', (req, res) => {
    requireAdmin(req);
    const { orderId } = (req.body ?? {}) as { orderId?: string };
    if (!orderId) throw new HttpError(400, 'Missing orderId.');
    const order = collectOrder(db, orderId);
    sseHub.broadcast('drop_updated');
    res.json({ order });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  const distDir = path.resolve(process.cwd(), 'dist');
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(indexHtmlPath);
        return;
      }
      next();
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const bodyParserStatus =
      typeof (err as { status?: unknown })?.status === 'number'
        ? Number((err as { status: number }).status)
        : undefined;
    const status =
      err instanceof HttpError
        ? err.status
        : bodyParserStatus && bodyParserStatus >= 400 && bodyParserStatus < 600
          ? bodyParserStatus
          : 500;
    const message =
      err instanceof HttpError
        ? err.message
        : status === 413
          ? 'Request payload exceeds 64kb limit.'
          : status === 400
            ? 'Malformed JSON request body.'
            : process.env.NODE_ENV === 'production'
              ? 'Unexpected server error.'
              : err instanceof Error
                ? err.message
                : 'Unexpected server error.';

    if (status >= 500 && !process.env.DIVLY_QUIET_LOGS) {
      console.error('[Divly Server Error]', err);
    }
    res.status(status).json({ error: message });
  });

  return app;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
  warnIfInsecureProductionSecrets();
  const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 3000 : 3001);
  const db = openDatabase();
  seedDatabase(db);
  createApp(db).listen(port, '0.0.0.0', () => {
    console.log(`[Divly] API & Hub Server listening on http://localhost:${port}`);
  });
}
