import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthUser, ProductCategory } from '../src/shared/types.ts';
import { confirmOrderPayment, createPendingOrder } from './services/poolAllocator.ts';

interface SeedProductInput {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  imageEmoji: string;
  unitDescription: string;
  caseDescription: string;
  caseSize: number;
  sharePricePence: number;
  aldiPricePence: number;
  aldiUnitLabel: string;
  wholesaleCaseCostPence: number;
}

/**
 * 12 realistic wholesale bulk staples across all 5 student grocery categories.
 * Every single item beats Aldi's retail unit price by 24%–31% while preserving
 * healthy positive wholesale case margin (`caseSize * sharePrice > wholesaleCaseCost`).
 */
export const DEFAULT_PRODUCTS: SeedProductInput[] = [
  {
    id: 'prod-basmati-5kg',
    name: 'Pure Extra-Long Basmati Rice',
    brand: 'Tilda / Royal Umbrella',
    category: 'Rice & Noodles',
    imageEmoji: '🍚',
    unitDescription: '5kg restaurant-grade bag',
    caseDescription: '20kg wholesale sack (4 × 5kg inner bags)',
    caseSize: 4,
    sharePricePence: 645,
    aldiPricePence: 849,
    aldiUnitLabel: 'Aldi 5kg Basmati equiv.',
    wholesaleCaseCostPence: 2200,
  },
  {
    id: 'prod-shin-ramyun-5pk',
    name: 'Shin Ramyun Gourmet Spicy Noodle Soup',
    brand: 'Nongshim',
    category: 'Rice & Noodles',
    imageEmoji: '🍜',
    unitDescription: '5 × 120g gourmet packs',
    caseDescription: '20-pack trade outer (4 × 5-packs)',
    caseSize: 4,
    sharePricePence: 395,
    aldiPricePence: 575,
    aldiUnitLabel: '5 × Korean ramen packs',
    wholesaleCaseCostPence: 1360,
  },
  {
    id: 'prod-indomie-10pk',
    name: 'Mi Goreng Instant Stir-Fry Noodles',
    brand: 'Indomie',
    category: 'Rice & Noodles',
    imageEmoji: '🥢',
    unitDescription: '10 × 85g stir-fry packs',
    caseDescription: '40-pack wholesale carton (4 × 10-packs)',
    caseSize: 4,
    sharePricePence: 345,
    aldiPricePence: 490,
    aldiUnitLabel: '10 × instant noodle packs',
    wholesaleCaseCostPence: 1180,
  },
  {
    id: 'prod-monster-ultra-6pk',
    name: 'Ultra White Zero Sugar Energy',
    brand: 'Monster',
    category: 'Drinks & Caffeine',
    imageEmoji: '⚡',
    unitDescription: '6 × 500ml cans',
    caseDescription: '24 × 500ml trade tray (4 × 6-packs)',
    caseSize: 4,
    sharePricePence: 549,
    aldiPricePence: 749,
    aldiUnitLabel: '6 × 500ml branded cans',
    wholesaleCaseCostPence: 1920,
  },
  {
    id: 'prod-oatly-barista-3pk',
    name: 'Barista Edition Oat Drink',
    brand: 'Oatly',
    category: 'Drinks & Caffeine',
    imageEmoji: '🥛',
    unitDescription: '3 × 1L ambient cartons',
    caseDescription: '6 × 1L wholesale case (2 × 3L shares)',
    caseSize: 2,
    sharePricePence: 435,
    aldiPricePence: 585,
    aldiUnitLabel: '3 × 1L Barista Oat cartons',
    wholesaleCaseCostPence: 760,
  },
  {
    id: 'prod-trek-protein-4pk',
    name: 'Cocoa Oat Protein Flapjacks',
    brand: 'TREK',
    category: 'Protein & Snacks',
    imageEmoji: '🍫',
    unitDescription: '4 × 50g flapjacks (9g protein)',
    caseDescription: '16 × 50g trade box (4 × 4-packs)',
    caseSize: 4,
    sharePricePence: 295,
    aldiPricePence: 399,
    aldiUnitLabel: 'Aldi 4-pack protein flapjacks',
    wholesaleCaseCostPence: 1020,
  },
  {
    id: 'prod-grenade-oreo-3pk',
    name: 'High-Protein Oreo White Bars',
    brand: 'Grenade',
    category: 'Protein & Snacks',
    imageEmoji: '💪',
    unitDescription: '3 × 60g bars (21g protein)',
    caseDescription: '12 × 60g trade box (4 × 3-packs)',
    caseSize: 4,
    sharePricePence: 425,
    aldiPricePence: 599,
    aldiUnitLabel: '3 × 60g high-protein bars',
    wholesaleCaseCostPence: 1480,
  },
  {
    id: 'prod-nicky-toilet-9pk',
    name: 'Elite Quilted 3-Ply Toilet Tissue',
    brand: 'Nicky',
    category: 'Toiletries & Laundry',
    imageEmoji: '🧻',
    unitDescription: '9 luxury 3-ply rolls',
    caseDescription: '45-roll wholesale bale (5 × 9-roll packs)',
    caseSize: 5,
    sharePricePence: 275,
    aldiPricePence: 369,
    aldiUnitLabel: 'Aldi Saxon 9-roll 3-ply',
    wholesaleCaseCostPence: 1150,
  },
  {
    id: 'prod-fairy-pods-27pk',
    name: 'Non-Bio Platinum Washing Capsules',
    brand: 'Fairy',
    category: 'Toiletries & Laundry',
    imageEmoji: '🧺',
    unitDescription: '27-wash sealed tub',
    caseDescription: '4 × 27-wash trade outer (108 washes)',
    caseSize: 4,
    sharePricePence: 485,
    aldiPricePence: 649,
    aldiUnitLabel: '27-wash non-bio pods tub',
    wholesaleCaseCostPence: 1680,
  },
  {
    id: 'prod-finish-tabs-50pk',
    name: 'Ultimate All-In-1 Dishwasher Tablets',
    brand: 'Finish',
    category: 'Toiletries & Laundry',
    imageEmoji: '✨',
    unitDescription: '50 lemon sparkle tablets',
    caseDescription: '3 × 50-tab wholesale case (150 tabs)',
    caseSize: 3,
    sharePricePence: 525,
    aldiPricePence: 699,
    aldiUnitLabel: '50 all-in-1 dishwasher tabs',
    wholesaleCaseCostPence: 1380,
  },
  {
    id: 'prod-kikkoman-soy-500ml',
    name: 'Naturally Brewed Soy Sauce',
    brand: 'Kikkoman',
    category: 'Cooking Staples',
    imageEmoji: '🍶',
    unitDescription: '500ml chef bottle',
    caseDescription: '6 × 500ml catering case',
    caseSize: 6,
    sharePricePence: 285,
    aldiPricePence: 395,
    aldiUnitLabel: '500ml brewed soy sauce equiv.',
    wholesaleCaseCostPence: 1440,
  },
  {
    id: 'prod-mutti-tomatoes-4pk',
    name: 'Polpa Finely Chopped Italian Tomatoes',
    brand: 'Mutti',
    category: 'Cooking Staples',
    imageEmoji: '🍅',
    unitDescription: '4 × 400g Italian tins',
    caseDescription: '12 × 400g trade tray (3 × 4-packs)',
    caseSize: 3,
    sharePricePence: 299,
    aldiPricePence: 399,
    aldiUnitLabel: '4 × 400g Italian tomato tins',
    wholesaleCaseCostPence: 780,
  },
];

/**
 * Seeds default campus hub settings, the 12 Aldi-beating bulk products, and
 * (by default) 3 realistic student hallmate orders so pools show 3/4, 2/4, 5/6
 * and 1 locked case right out of the box.
 */
export function seedDatabase(
  db: DatabaseSync,
  options?: { includeDemoPools?: boolean }
): void {
  const includeDemoPools = options?.includeDemoPools ?? true;

  const settingsCount = Number(
    (db.prepare('SELECT COUNT(*) AS cnt FROM settings').get() as { cnt: number }).cnt
  );
  if (settingsCount === 0) {
    const cutoffAtIso = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO settings (
        id, hub_name, hub_short_label, hub_address, pickup_window,
        cutoff_at_iso, drop_status, free_delivery_threshold_pence,
        small_order_fee_pence, drop_cycle_number
      ) VALUES (1, ?, ?, ?, ?, ?, 'open', 800, 50, 1)
    `).run(
      'UoB · The Vale Shackleton Hub',
      'The Vale · Shackleton Hub',
      'Shackleton Forecourt, Edgbaston Park Rd, B15 3SZ',
      'Sat 12:00–15:00',
      cutoffAtIso
    );
  }

  const productCount = Number(
    (db.prepare('SELECT COUNT(*) AS cnt FROM products').get() as { cnt: number }).cnt
  );
  if (productCount === 0) {
    const nowIso = new Date().toISOString();
    const insertProd = db.prepare(`
      INSERT INTO products (
        id, name, brand, category, image_emoji, unit_description, case_description,
        case_size, share_price_pence, aldi_price_pence, aldi_unit_label,
        wholesale_case_cost_pence, is_active, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    DEFAULT_PRODUCTS.forEach((p, idx) => {
      insertProd.run(
        p.id,
        p.name,
        p.brand,
        p.category,
        p.imageEmoji,
        p.unitDescription,
        p.caseDescription,
        p.caseSize,
        p.sharePricePence,
        p.aldiPricePence,
        p.aldiUnitLabel,
        p.wholesaleCaseCostPence,
        idx,
        nowIso
      );
    });
  }

  if (!includeDemoPools) return;

  const orderCount = Number(
    (db.prepare('SELECT COUNT(*) AS cnt FROM orders').get() as { cnt: number }).cnt
  );
  if (orderCount === 0) {
    const demoStudents: Array<{
      email: string;
      name: string;
      items: Array<{ productId: string; quantity: number }>;
    }> = [
      {
        email: 'priya.sharma@student.bham.ac.uk',
        name: 'Priya Sharma',
        items: [
          { productId: 'prod-basmati-5kg', quantity: 2 },
          { productId: 'prod-shin-ramyun-5pk', quantity: 3 },
          { productId: 'prod-kikkoman-soy-500ml', quantity: 2 },
        ],
      },
      {
        email: 'tom.hughes@student.bham.ac.uk',
        name: 'Tom Hughes',
        items: [
          { productId: 'prod-basmati-5kg', quantity: 1 }, // -> Basmati now at 3/4!
          { productId: 'prod-shin-ramyun-5pk', quantity: 3 }, // -> Shin Ramyun locks Box #1 + 2/4 in Box #2!
          { productId: 'prod-monster-ultra-6pk', quantity: 2 }, // -> Monster at 2/4!
        ],
      },
      {
        email: 'zara.khan@student.bham.ac.uk',
        name: 'Zara Khan',
        items: [
          { productId: 'prod-kikkoman-soy-500ml', quantity: 3 }, // -> Kikkoman at 5/6 (1 spot left)!
        ],
      },
    ];

    const insertUser = db.prepare(
      'INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)'
    );

    for (const demo of demoStudents) {
      const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      insertUser.run(userId, demo.email, demo.name, 'student', new Date().toISOString());
      const user: AuthUser = {
        id: userId,
        email: demo.email,
        name: demo.name,
        role: 'student',
      };
      const pending = createPendingOrder(db, user, demo.items, 'test_simulated');
      confirmOrderPayment(db, pending.orderId);
    }
  }
}
