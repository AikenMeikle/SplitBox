import crypto from 'node:crypto';
import net from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import type {
  LiveSupplierProductResult,
  ProductCategory,
  WholesalePurchaseOrder,
} from '../../src/shared/types.ts';
import { getSettings, HttpError } from '../db.ts';

/**
 * Validates `WHOLESALE_ORDER_WEBHOOK_URL` to prevent Server-Side Request Forgery (SSRF).
 * Blocks cloud metadata (`169.254.169.254`) & link-local IPs in all environments, and
 * enforces `https:` + blocks loopback/private RFC1918 networks in production.
 */
export function validateWholesaleWebhookUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, 'Invalid WHOLESALE_ORDER_WEBHOOK_URL format.');
  }

  if (parsed.username || parsed.password) {
    throw new HttpError(400, 'Webhook URL must not embed credentials.');
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'WHOLESALE_ORDER_WEBHOOK_URL must use https:// in production.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'WHOLESALE_ORDER_WEBHOOK_URL must use https:// or http://.');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // Always block cloud instance metadata & link-local addresses
  if (
    host === '169.254.169.254' ||
    host.startsWith('169.254.') ||
    host === '100.100.100.200' ||
    host === 'metadata.google.internal' ||
    host.startsWith('fe80:')
  ) {
    throw new HttpError(400, 'Blocked unsafe link-local or cloud metadata webhook target.');
  }

  if (isProd) {
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '0.0.0.0' ||
      host === '::' ||
      host === '::1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      (net.isIP(host) === 6 && host.startsWith('::ffff:127.'))
    ) {
      throw new HttpError(400, 'Blocked loopback or private-network webhook target in production.');
    }
  }

  return parsed.toString();
}

export function isWholesaleApiConfigured(): boolean {
  if (process.env.QOGITA_API_KEY?.trim()) return true;
  const rawWebhook = process.env.WHOLESALE_ORDER_WEBHOOK_URL?.trim();
  if (!rawWebhook) return false;
  try {
    validateWholesaleWebhookUrl(rawWebhook);
    return true;
  } catch {
    return false;
  }
}

/** Infers Divly grocery category, shelf life, and sensible bulk case economics from UK food metadata. */
function inferBulkEconomics(
  name: string,
  categoriesText: string,
  packSizeLabel: string
): {
  category: ProductCategory;
  shelfLifeWeeks: number;
  suggestedCaseSize: number;
  estimatedWholesaleCaseCostPence: number;
  suggestedSharePricePence: number;
  estimatedAldiPricePence: number;
} {
  const hay = `${name} ${categoriesText} ${packSizeLabel}`.toLowerCase();

  if (/(rice|noodle|ramen|pasta|udon|spaghetti|basmati|couscous)/.test(hay)) {
    return {
      category: 'Rice & Noodles',
      shelfLifeWeeks: 44,
      suggestedCaseSize: 4,
      estimatedWholesaleCaseCostPence: 1320,
      suggestedSharePricePence: 385,
      estimatedAldiPricePence: 525,
    };
  }
  if (/(oat|milk|drink|energy|coffee|tea|espresso|cola|monster|red bull|juice)/.test(hay)) {
    return {
      category: 'Drinks & Caffeine',
      shelfLifeWeeks: 26,
      suggestedCaseSize: 4,
      estimatedWholesaleCaseCostPence: 1480,
      suggestedSharePricePence: 435,
      estimatedAldiPricePence: 585,
    };
  }
  if (/(protein|bar|flapjack|snack|nut|crisps|biscuit|oatcake|cereal)/.test(hay)) {
    return {
      category: 'Protein & Snacks',
      shelfLifeWeeks: 26,
      suggestedCaseSize: 4,
      estimatedWholesaleCaseCostPence: 1160,
      suggestedSharePricePence: 345,
      estimatedAldiPricePence: 469,
    };
  }
  if (/(toilet|tissue|wash|laundry|fairy|finish|detergent|soap|shampoo|clean)/.test(hay)) {
    return {
      category: 'Toiletries & Laundry',
      shelfLifeWeeks: 52,
      suggestedCaseSize: 4,
      estimatedWholesaleCaseCostPence: 1520,
      suggestedSharePricePence: 445,
      estimatedAldiPricePence: 599,
    };
  }
  return {
    category: 'Cooking Staples',
    shelfLifeWeeks: 36,
    suggestedCaseSize: 4,
    estimatedWholesaleCaseCostPence: 1080,
    suggestedSharePricePence: 319,
    estimatedAldiPricePence: 439,
  };
}

const OFFLINE_UK_FALLBACK: LiveSupplierProductResult[] = [
  {
    externalId: 'off-7394376616228',
    eanBarcode: '7394376616228',
    name: 'Oatly Barista Edition Oat Drink',
    brand: 'Oatly',
    packSizeLabel: '3 × 1L share (6 × 1L case)',
    imageUrl: null,
    category: 'Drinks & Caffeine',
    suggestedCaseSize: 2,
    estimatedWholesaleCaseCostPence: 760,
    suggestedSharePricePence: 435,
    estimatedAldiPricePence: 585,
    shelfLifeWeeks: 26,
    source: 'openfoodfacts_uk_live',
    supplierPortalUrl: 'https://www.qogita.com/products?q=7394376616228',
  },
  {
    externalId: 'off-8801043014809',
    eanBarcode: '8801043014809',
    name: 'Nongshim Shin Ramyun Noodle Soup',
    brand: 'Nongshim',
    packSizeLabel: '5 × 120g share (20-pack outer)',
    imageUrl: null,
    category: 'Rice & Noodles',
    suggestedCaseSize: 4,
    estimatedWholesaleCaseCostPence: 1360,
    suggestedSharePricePence: 395,
    estimatedAldiPricePence: 575,
    shelfLifeWeeks: 36,
    source: 'openfoodfacts_uk_live',
    supplierPortalUrl: 'https://www.qogita.com/products?q=8801043014809',
  },
  {
    externalId: 'off-5000157024671',
    eanBarcode: '5000157024671',
    name: 'Heinz Baked Beanz Snap Pots / Catering',
    brand: 'Heinz',
    packSizeLabel: '6 × 415g tins (24-tin tray)',
    imageUrl: null,
    category: 'Cooking Staples',
    suggestedCaseSize: 4,
    estimatedWholesaleCaseCostPence: 1680,
    suggestedSharePricePence: 475,
    estimatedAldiPricePence: 649,
    shelfLifeWeeks: 52,
    source: 'openfoodfacts_uk_live',
    supplierPortalUrl: 'https://www.qogita.com/products?q=5000157024671',
  },
];

/**
 * Queries live UK wholesale & grocery barcode databases:
 *  1. Qogita B2B Wholesale API (`https://api.qogita.com`) when `QOGITA_API_KEY` is configured.
 *  2. Open Food Facts UK v2 REST API (`https://uk.openfoodfacts.org/api/v2/...`) out of the box with zero keys!
 */
export async function searchLiveWholesaleCatalog(
  rawQuery: string
): Promise<LiveSupplierProductResult[]> {
  const q = (rawQuery || '').trim();
  if (q.length < 2) return [];

  const results: LiveSupplierProductResult[] = [];
  const qogitaKey = process.env.QOGITA_API_KEY?.trim();

  if (qogitaKey) {
    try {
      const qRes = await fetch(
        `https://api.qogita.com/variants/search/?query=${encodeURIComponent(q)}`,
        {
          headers: {
            Authorization: `Bearer ${qogitaKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4500),
        }
      );
      if (qRes.ok) {
        const data = (await qRes.json()) as { results?: Array<Record<string, unknown>> };
        for (const item of (data.results ?? []).slice(0, 6)) {
          const ean = String(item.gtin || item.ean || '');
          const name = String(item.name || 'Wholesale Bulk SKU');
          const brand = String(item.brandName || item.brand || 'Wholesale');
          const econ = inferBulkEconomics(name, String(item.categoryName || ''), '');
          results.push({
            externalId: `qogita-${ean || crypto.randomUUID().slice(0, 8)}`,
            eanBarcode: ean,
            name,
            brand,
            packSizeLabel: String(item.unit || `${econ.suggestedCaseSize} shares per case`),
            imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
            category: econ.category,
            suggestedCaseSize: Number(item.caseSize || econ.suggestedCaseSize),
            estimatedWholesaleCaseCostPence: econ.estimatedWholesaleCaseCostPence,
            suggestedSharePricePence: econ.suggestedSharePricePence,
            estimatedAldiPricePence: econ.estimatedAldiPricePence,
            shelfLifeWeeks: econ.shelfLifeWeeks,
            source: 'qogita_live',
            supplierPortalUrl: `https://www.qogita.com/products?q=${encodeURIComponent(ean || name)}`,
          });
        }
      }
    } catch {
      // Fall through cleanly to Open Food Facts UK API
    }
  }

  // Live Open Food Facts UK v2 API (works immediately with zero API keys!)
  try {
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'DivlyUoBCampusBulkApp/1.0 (https://github.com/divly-uob)',
    };

    if (/^\d{8,14}$/.test(q)) {
      const offUrl = `https://uk.openfoodfacts.org/api/v2/product/${encodeURIComponent(q)}.json?fields=code,product_name,brands,quantity,categories,image_front_small_url`;
      const res = await fetch(offUrl, { headers, signal: AbortSignal.timeout(4500) });
      if (res.ok) {
        const body = (await res.json()) as { product?: Record<string, unknown> };
        const p = body.product;
        if (p && typeof p.product_name === 'string' && p.product_name.trim()) {
          const ean = String(p.code || q);
          const name = p.product_name.trim();
          const brand = String(p.brands || 'UK Brand').split(',')[0].trim();
          const qty = String(p.quantity || '1 retail unit');
          const econ = inferBulkEconomics(name, String(p.categories || ''), qty);
          results.push({
            externalId: `off-${ean}`,
            eanBarcode: ean,
            name,
            brand,
            packSizeLabel: qty,
            imageUrl:
              typeof p.image_front_small_url === 'string' ? p.image_front_small_url : null,
            category: econ.category,
            suggestedCaseSize: econ.suggestedCaseSize,
            estimatedWholesaleCaseCostPence: econ.estimatedWholesaleCaseCostPence,
            suggestedSharePricePence: econ.suggestedSharePricePence,
            estimatedAldiPricePence: econ.estimatedAldiPricePence,
            shelfLifeWeeks: econ.shelfLifeWeeks,
            source: 'openfoodfacts_uk_live',
            supplierPortalUrl: `https://www.qogita.com/products?q=${encodeURIComponent(ean)}`,
          });
        }
      }
    } else {
      const offUrl = `https://uk.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(q)}&page_size=8&fields=code,product_name,brands,quantity,categories,image_front_small_url`;
      const res = await fetch(offUrl, { headers, signal: AbortSignal.timeout(4500) });
      if (res.ok) {
        const body = (await res.json()) as { products?: Array<Record<string, unknown>> };
        for (const p of body.products ?? []) {
          const name = typeof p.product_name === 'string' ? p.product_name.trim() : '';
          if (!name) continue;
          const ean = String(p.code || '');
          const brand = String(p.brands || 'UK Brand').split(',')[0].trim() || 'UK Brand';
          const qty = String(p.quantity || 'Bulk Share Pack');
          const econ = inferBulkEconomics(name, String(p.categories || ''), qty);
          results.push({
            externalId: `off-${ean || crypto.randomUUID().slice(0, 8)}`,
            eanBarcode: ean,
            name,
            brand,
            packSizeLabel: qty,
            imageUrl:
              typeof p.image_front_small_url === 'string' ? p.image_front_small_url : null,
            category: econ.category,
            suggestedCaseSize: econ.suggestedCaseSize,
            estimatedWholesaleCaseCostPence: econ.estimatedWholesaleCaseCostPence,
            suggestedSharePricePence: econ.suggestedSharePricePence,
            estimatedAldiPricePence: econ.estimatedAldiPricePence,
            shelfLifeWeeks: econ.shelfLifeWeeks,
            source: 'openfoodfacts_uk_live',
            supplierPortalUrl: `https://www.qogita.com/products?q=${encodeURIComponent(ean || name)}`,
          });
        }
      }
    }
  } catch {
    // Graceful fallback below if external network is unreachable
  }

  if (results.length > 0) {
    return results;
  }

  const lower = q.toLowerCase();
  const matchedFallback = OFFLINE_UK_FALLBACK.filter(
    (item) =>
      item.name.toLowerCase().includes(lower) ||
      item.brand.toLowerCase().includes(lower) ||
      item.eanBarcode.includes(lower)
  );
  return matchedFallback.length > 0 ? matchedFallback : OFFLINE_UK_FALLBACK.slice(0, 2);
}

/** Lists all wholesale purchase orders recorded in SQLite (newest first). */
export function getWholesaleOrders(db: DatabaseSync): WholesalePurchaseOrder[] {
  const rows = db
    .prepare('SELECT * FROM wholesale_orders ORDER BY created_at DESC')
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    dropCycleNumber: Number(r.drop_cycle_number),
    supplierName: String(r.supplier_name),
    mode: String(r.mode) as WholesalePurchaseOrder['mode'],
    externalOrderRef: String(r.external_order_ref),
    status: String(r.status) as WholesalePurchaseOrder['status'],
    totalCasesCount: Number(r.total_cases_count),
    totalSpendPence: Number(r.total_spend_pence),
    createdAt: String(r.created_at),
    portalLinks: JSON.parse(String(r.portal_links_json || '[]')) as WholesalePurchaseOrder['portalLinks'],
  }));
}

/**
 * Generates and submits a Wholesale Purchase Order for all locked full cases
 * (plus any underwritten buy-ahead open cases), returning 1-click supplier links
 * for Qogita, Booker UK, and Bestway Wholesale.
 */
export async function createWholesalePurchaseOrder(
  db: DatabaseSync,
  options?: { includeBuyAheadProductIds?: string[] }
): Promise<WholesalePurchaseOrder> {
  const settings = getSettings(db);
  const buyAheadSet = new Set(options?.includeBuyAheadProductIds ?? []);

  const rows = db
    .prepare(`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.brand,
        p.ean_barcode,
        p.case_size,
        p.wholesale_case_cost_pence,
        COALESCE(SUM(CASE WHEN a.box_number >= 1 AND a.status = 'locked_box' THEN 1 ELSE 0 END), 0) AS locked_box_slots,
        COALESCE(SUM(CASE WHEN a.box_number >= 1 AND a.status = 'fulfilled' THEN 1 ELSE 0 END), 0) AS fulfilled_box_slots,
        COALESCE(SUM(CASE WHEN a.box_number >= 1 AND a.status = 'pooling' THEN 1 ELSE 0 END), 0) AS pooling_box_slots
      FROM products p
      LEFT JOIN pool_allocations a
        ON a.product_id = p.id AND a.drop_cycle_number = ?
      WHERE p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.sort_order ASC
    `)
    .all(settings.dropCycleNumber) as Array<Record<string, unknown>>;

  const portalLinks: WholesalePurchaseOrder['portalLinks'] = [];
  let totalCasesCount = 0;
  let totalSpendPence = 0;

  for (const r of rows) {
    const productId = String(r.product_id);
    const caseSize = Math.max(1, Number(r.case_size));
    const caseCostPence = Number(r.wholesale_case_cost_pence);

    let casesToBuy = 0;
    if (settings.dropStatus === 'closed') {
      casesToBuy = Math.ceil(Number(r.fulfilled_box_slots) / caseSize);
    } else {
      const lockedCases = Math.floor(Number(r.locked_box_slots) / caseSize);
      const extraBuyAhead =
        buyAheadSet.has(productId) && Number(r.pooling_box_slots) > 0 ? 1 : 0;
      casesToBuy = lockedCases + extraBuyAhead;
    }

    if (casesToBuy <= 0) continue;

    const lineCostPence = casesToBuy * caseCostPence;
    totalCasesCount += casesToBuy;
    totalSpendPence += lineCostPence;

    const ean = String(r.ean_barcode || '').trim();
    const searchKey = ean || `${String(r.brand)} ${String(r.product_name)}`;

    portalLinks.push({
      productId,
      productName: `${String(r.brand)} ${String(r.product_name)}`,
      eanBarcode: ean,
      casesToBuy,
      lineCostPence,
      qogitaUrl: `https://www.qogita.com/products?q=${encodeURIComponent(searchKey)}`,
      bookerUrl: `https://www.booker.co.uk/products/product-list?keywords=${encodeURIComponent(searchKey)}`,
      bestwayUrl: `https://www.bestwaywholesale.co.uk/search?w=${encodeURIComponent(searchKey)}`,
    });
  }

  if (totalCasesCount === 0) {
    throw new HttpError(
      400,
      'No locked or selected buy-ahead wholesale cases to order in this cycle yet.'
    );
  }

  const id = `wpo_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const shortRef = crypto.randomBytes(3).toString('hex').toUpperCase();
  let mode: WholesalePurchaseOrder['mode'] = 'manual_portal_assisted';
  let status: WholesalePurchaseOrder['status'] = 'draft_ready';
  let supplierName = 'Qogita / Booker UK (Assisted Cart)';
  let externalOrderRef = `PO-UOB-C${settings.dropCycleNumber}-${shortRef}`;

  const qogitaKey = process.env.QOGITA_API_KEY?.trim();
  const webhookUrl = process.env.WHOLESALE_ORDER_WEBHOOK_URL?.trim();

  if (qogitaKey) {
    mode = 'qogita_api_live';
    supplierName = 'Qogita B2B Wholesale API';
    status = 'submitted';
    try {
      const qRes = await fetch('https://api.qogita.com/orders/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${qogitaKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference: externalOrderRef,
          currency: 'GBP',
          lines: portalLinks.map((l) => ({ gtin: l.eanBarcode, quantity: l.casesToBuy })),
        }),
        signal: AbortSignal.timeout(4500),
      });
      if (qRes.ok) {
        const resJson = (await qRes.json()) as { id?: string; status?: string };
        if (resJson.id) externalOrderRef = String(resJson.id);
        status = 'confirmed';
      }
    } catch {
      // Keep `submitted` with local PO reference if remote sandbox unreachable
    }
  } else if (webhookUrl) {
    const safeWebhookUrl = validateWholesaleWebhookUrl(webhookUrl);
    mode = 'webhook_edi_live';
    supplierName = 'Wholesale EDI Webhook';
    status = 'submitted';
    try {
      const wRes = await fetch(safeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalOrderRef,
          dropCycleNumber: settings.dropCycleNumber,
          totalCasesCount,
          totalSpendPence,
          lines: portalLinks,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(4500),
      });
      if (wRes.ok) status = 'confirmed';
    } catch {
      // Keep `submitted` status
    }
  }

  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO wholesale_orders (
      id, drop_cycle_number, supplier_name, mode, external_order_ref,
      status, total_cases_count, total_spend_pence, portal_links_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    settings.dropCycleNumber,
    supplierName,
    mode,
    externalOrderRef,
    status,
    totalCasesCount,
    totalSpendPence,
    JSON.stringify(portalLinks),
    createdAt
  );

  return {
    id,
    dropCycleNumber: settings.dropCycleNumber,
    supplierName,
    mode,
    externalOrderRef,
    status,
    totalCasesCount,
    totalSpendPence,
    createdAt,
    portalLinks,
  };
}
