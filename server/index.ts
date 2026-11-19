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

export function createApp(db: DatabaseSync): express.Express {
  const app = express();
  const sseHub = new SseHub();

  app.use(cors());

  // 1. Raw body Stripe webhook MUST be mounted before `express.json()`.
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
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
        confirmOrderPayment(db, orderId, { stripePaymentIntentId: paymentIntentId });
        sseHub.broadcast('pool_updated');
      }
    }
    res.json({ received: true });
  });

  app.use(express.json({ limit: '256kb' }));

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

  app.post('/api/auth/request-otp', async (req, res) => {
    const { email, name } = (req.body ?? {}) as { email?: string; name?: string };
    res.json(await requestOtp(db, String(email ?? ''), name));
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const { email, code, name, referralCode } = (req.body ?? {}) as Record<
      string,
      string | undefined
    >;
    res.json(verifyOtp(db, String(email ?? ''), String(code ?? ''), name, referralCode));
  });

  app.post('/api/auth/admin-login', (req, res) => {
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
      const baseUrl =
        process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
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
    if (!pendingOrderId) throw new HttpError(400, 'Missing pendingOrderId.');

    const existing = db
      .prepare('SELECT payment_mode FROM orders WHERE id = ?')
      .get(pendingOrderId) as { payment_mode: string } | undefined;
    if (!existing) throw new HttpError(404, 'Pending order not found.');
    if (existing.payment_mode === 'stripe_live') {
      throw new HttpError(403, 'Live Stripe orders must be confirmed via Stripe Checkout.');
    }

    const order = confirmOrderPayment(db, pendingOrderId, {
      expectedUserId: user.role === 'admin' ? undefined : user.id,
    });
    sseHub.broadcast('pool_updated');
    res.json({ order });
  });

  app.get('/api/checkout/verify-session', async (req, res) => {
    const sessionId = String(req.query.session_id ?? '').trim();
    if (!sessionId) throw new HttpError(400, 'Missing session_id query parameter.');

    if (isStripeConfigured()) {
      const verified = await retrieveStripeCheckoutSession(sessionId);
      if (!verified.paid || !verified.orderId) {
        throw new HttpError(400, 'Stripe Checkout session has not been paid yet.');
      }
      const order = confirmOrderPayment(db, verified.orderId, {
        stripePaymentIntentId: verified.paymentIntentId,
      });
      sseHub.broadcast('pool_updated');
      res.json({ order });
      return;
    }

    const row = db
      .prepare('SELECT id FROM orders WHERE stripe_session_id = ?')
      .get(sessionId) as { id: string } | undefined;
    const order = row ? getOrderById(db, row.id) : null;
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
      p.hubName?.trim() || c.hubName,
      p.hubShortLabel?.trim() || c.hubShortLabel,
      p.hubAddress?.trim() || c.hubAddress,
      p.pickupWindow?.trim() || c.pickupWindow,
      p.cutoffAtIso?.trim() || c.cutoffAtIso,
      p.dropStatus === 'open' || p.dropStatus === 'closed' ? p.dropStatus : c.dropStatus,
      p.freeDeliveryThresholdPence !== undefined
        ? Math.max(0, Math.round(Number(p.freeDeliveryThresholdPence)))
        : c.freeDeliveryThresholdPence,
      p.smallOrderFeePence !== undefined
        ? Math.max(0, Math.round(Number(p.smallOrderFeePence)))
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
    const name = String(b.name ?? '').trim();
    const brand = String(b.brand ?? '').trim();
    if (!name || !brand) throw new HttpError(400, 'Product name and brand are required.');

    const caseSize = Math.max(1, Math.round(Number(b.caseSize ?? 4)));
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
      String(b.category ?? 'Cooking Staples').trim(),
      String(b.imageEmoji || '🛒'),
      String(b.unitDescription || '1 bulk unit'),
      String(b.caseDescription || `${caseSize} units per wholesale case`),
      caseSize,
      Math.max(0, Math.round(Number(b.sharePricePence ?? 0))),
      Math.max(0, Math.round(Number(b.aldiPricePence ?? 0))),
      String(b.aldiUnitLabel || 'Supermarket equiv.'),
      Math.max(0, Math.round(Number(b.wholesaleCaseCostPence ?? 0))),
      String(b.eanBarcode ?? '').trim(),
      String(b.supplierSku ?? '').trim(),
      String(b.supplierName ?? 'Qogita / Booker UK').trim(),
      Math.max(1, Math.round(Number(b.shelfLifeWeeks ?? 26))),
      Math.max(0, Math.round(Number(b.carryoverStockSlots ?? 0))),
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
      p.name !== undefined ? String(p.name).trim() : String(ex.name),
      p.brand !== undefined ? String(p.brand).trim() : String(ex.brand),
      p.category !== undefined ? String(p.category).trim() : String(ex.category),
      p.imageEmoji !== undefined ? String(p.imageEmoji) : String(ex.image_emoji),
      p.unitDescription !== undefined ? String(p.unitDescription).trim() : String(ex.unit_description),
      p.caseDescription !== undefined ? String(p.caseDescription).trim() : String(ex.case_description),
      p.caseSize !== undefined ? Math.max(1, Math.round(Number(p.caseSize))) : Number(ex.case_size),
      p.sharePricePence !== undefined ? Math.max(0, Math.round(Number(p.sharePricePence))) : Number(ex.share_price_pence),
      p.aldiPricePence !== undefined ? Math.max(0, Math.round(Number(p.aldiPricePence))) : Number(ex.aldi_price_pence),
      p.aldiUnitLabel !== undefined ? String(p.aldiUnitLabel).trim() : String(ex.aldi_unit_label),
      p.wholesaleCaseCostPence !== undefined
        ? Math.max(0, Math.round(Number(p.wholesaleCaseCostPence)))
        : Number(ex.wholesale_case_cost_pence),
      p.eanBarcode !== undefined ? String(p.eanBarcode).trim() : String(ex.ean_barcode || ''),
      p.supplierSku !== undefined ? String(p.supplierSku).trim() : String(ex.supplier_sku || ''),
      p.supplierName !== undefined ? String(p.supplierName).trim() : String(ex.supplier_name || 'Qogita / Booker UK'),
      p.shelfLifeWeeks !== undefined
        ? Math.max(1, Math.round(Number(p.shelfLifeWeeks)))
        : Number(ex.shelf_life_weeks || 26),
      p.carryoverStockSlots !== undefined
        ? Math.max(0, Math.round(Number(p.carryoverStockSlots)))
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

  app.post('/api/admin/scan/verify', (req, res) => {
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
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
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
  const port = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 3000 : 3001);
  const db = openDatabase();
  seedDatabase(db);
  createApp(db).listen(port, '0.0.0.0', () => {
    console.log(`[Divly] API & Hub Server listening on http://localhost:${port}`);
  });
}
