/**
 * Main campus grocery storefront view for Divly.
 *
 * Features:
 * - Compact 3-step student explainer hero + live campus drop banner
 * - Search bar, horizontal category filter pills, and sort selector
 * - Responsive 1/2/3/4-column supermarket grid of `ProductCard` tiles
 * - Sticky mobile bottom trolley summary bar (`< 768px`) for 1-tap checkout
 */

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  QrCode,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { BRAND_TAGLINE, CAMPUS_NAME } from '../config/brand';
import { useApp } from '../context/AppContext';
import { formatPence } from '../shared/types';
import { ProductCard } from './ProductCard';

type SortOption = 'biggest_saving' | 'almost_full' | 'lowest_price';

const CANONICAL_CATEGORIES = [
  'Rice & Noodles',
  'Drinks & Caffeine',
  'Protein & Snacks',
  'Toiletries & Laundry',
  'Cooking Staples',
];

export function StorefrontView() {
  const {
    settings,
    products,
    loading,
    basket,
    basketCount,
    setIsBasketOpen,
    setActiveTab,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('biggest_saving');

  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive !== false),
    [products]
  );

  // Combine canonical categories with any custom categories added in Admin Ops
  const categories = useMemo(() => {
    const dynamicSet = new Set<string>(CANONICAL_CATEGORIES);
    for (const item of activeProducts) {
      if (item.category) dynamicSet.add(item.category);
    }
    return ['All', ...Array.from(dynamicSet)];
  }, [activeProducts]);

  // Filter & sort products according to student search, category pill, and sort mode
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matches = activeProducts.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.unitDescription.toLowerCase().includes(q)
      );
    });

    return [...matches].sort((a, b) => {
      if (sortBy === 'lowest_price') {
        return a.sharePricePence - b.sharePricePence;
      }
      if (sortBy === 'almost_full') {
        // Prioritise open cases that already have students waiting (1–2 spots left first)
        const aOpen = a.openCaseClaimedSlots > 0 ? a.openCaseRemainingSlots : 999;
        const bOpen = b.openCaseClaimedSlots > 0 ? b.openCaseRemainingSlots : 999;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return b.lockedCasesCount - a.lockedCasesCount;
      }
      // Default: Biggest Saving vs Aldi
      if (b.savingsPercent !== a.savingsPercent) {
        return b.savingsPercent - a.savingsPercent;
      }
      return a.sharePricePence - b.sharePricePence;
    });
  }, [activeProducts, searchQuery, selectedCategory, sortBy]);

  // Live campus-wide locked case count & basket totals for the mobile sticky bar
  const totalLockedCases = useMemo(
    () => activeProducts.reduce((sum, p) => sum + p.lockedCasesCount, 0),
    [activeProducts]
  );

  const basketTotals = useMemo(() => {
    let subtotalPence = 0;
    let aldiTotalPence = 0;
    for (const [productId, qty] of Object.entries(basket)) {
      if (qty <= 0) continue;
      const item = products.find((p) => p.id === productId);
      if (item) {
        subtotalPence += item.sharePricePence * qty;
        aldiTotalPence += item.aldiPricePence * qty;
      }
    }
    return {
      subtotalPence,
      savedVsAldiPence: Math.max(0, aldiTotalPence - subtotalPence),
    };
  }, [basket, products]);

  const dropClosed = settings?.dropStatus === 'closed';
  const freeThresholdText = settings
    ? formatPence(settings.freeDeliveryThresholdPence)
    : '£8.00';

  return (
    <div className={`max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5 ${basketCount > 0 ? 'pb-24 md:pb-10' : 'pb-10'}`}>
      {/* Closed Drop Notice Banner */}
      {dropClosed && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <span className="font-bold">This week&apos;s bulk drop has closed &amp; settled!</span>{' '}
            Locked 100% cases are ready for Saturday pickup and unfilled slots have been automatically refunded.
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className="btn-secondary !py-1.5 !px-3 !text-xs shrink-0"
          >
            <span>View Pickup Pass &amp; Refunds</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Compact, Scannable 3-Step Grocery Hero */}
      <section className="card p-4 sm:p-6 bg-gradient-to-br from-white via-white to-emerald-50/50">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-green">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{CAMPUS_NAME} · Cycle #{settings?.dropCycleNumber ?? 1}</span>
              </span>
              {totalLockedCases > 0 && (
                <span className="badge-slate tabular-nums">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{totalLockedCases} full cases locked this week</span>
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
              {BRAND_TAGLINE}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600">
              Free campus hub collection on orders {freeThresholdText}+ at{' '}
              <span className="font-semibold text-gray-800">
                {settings?.hubName ?? 'UoB Campus Hub'}
              </span>{' '}
              ({settings?.pickupWindow ?? 'Sat 12:00–15:00'}).
            </p>
          </div>
        </div>

        {/* 3-Step Flow Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 text-xs sm:text-sm">
          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
              1
            </span>
            <div>
              <p className="font-bold text-gray-900 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chip in on bulk cases</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Claim student-sized shares anonymously with other UoB students — zero flat-chat chasing.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
              2
            </span>
            <div>
              <p className="font-bold text-gray-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Beat Aldi shelf prices</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Wholesale cases unlock 15–35% lower unit prices than Aldi &amp; Selly Oak convenience stores.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
              3
            </span>
            <div>
              <p className="font-bold text-gray-900 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                <span>Collect at UoB Hub or auto-refund</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                100% filled boxes get a QR pickup pass. Any unfilled overflow slot is automatically refunded!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Toolbar: Search Input + Sort Dropdown + Category Pills */}
      <section className="space-y-3" aria-label="Catalog filters">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rice, ramen, Oatly, laundry, snacks…"
              aria-label="Search bulk grocery pools"
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="p-1 text-gray-400 hover:text-gray-700 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="divly-sort" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
              <span>Sort:</span>
            </label>
            <select
              id="divly-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="biggest_saving">Biggest Saving vs Aldi</option>
              <option value="almost_full">Almost Full (1–2 spots left)</option>
              <option value="lowest_price">Lowest Price</option>
            </select>
          </div>
        </div>

        {/* Horizontal Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            const count =
              cat === 'All'
                ? activeProducts.length
                : activeProducts.filter((p) => p.category === cat).length;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[11px] tabular-nums ${
                    active ? 'text-emerald-100' : 'text-gray-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="card p-4 h-72 animate-pulse bg-white space-y-3">
              <div className="flex justify-between">
                <div className="w-12 h-12 rounded-xl bg-gray-100" />
                <div className="w-24 h-6 rounded-full bg-gray-100" />
              </div>
              <div className="w-3/4 h-4 rounded bg-gray-100" />
              <div className="w-1/2 h-3 rounded bg-gray-100" />
              <div className="pt-8 space-y-2">
                <div className="w-full h-10 rounded-xl bg-gray-100" />
                <div className="w-full h-10 rounded-xl bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="card p-10 text-center space-y-3">
          <p className="text-base font-bold text-gray-800">No bulk pools match your filter</p>
          <p className="text-sm text-gray-500">
            Try clearing your search or switching back to all categories.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
            className="btn-secondary"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <section
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5"
          aria-label="Bulk grocery products"
        >
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} dropClosed={dropClosed} />
          ))}
        </section>
      )}

      {/* Sticky Mobile Bottom Trolley Bar (visible at 375px / < 768px whenever items are in trolley) */}
      {basketCount > 0 && (
        <div
          className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-gray-200 px-3 py-2.5 shadow-lg"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => setIsBasketOpen(true)}
            className="btn-primary w-full justify-between !py-3 !px-4"
          >
            <span className="inline-flex items-center gap-2 text-left">
              <ShoppingBasket className="w-4 h-4 shrink-0" />
              <span>
                <span className="font-bold">
                  {basketCount} {basketCount === 1 ? 'share' : 'shares'}
                </span>
                {basketTotals.savedVsAldiPence > 0 && (
                  <span className="ml-1.5 text-xs text-emerald-100 font-medium">
                    (Save {formatPence(basketTotals.savedVsAldiPence)} vs Aldi)
                  </span>
                )}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 font-extrabold tabular-nums">
              <span>{formatPence(basketTotals.subtotalPence)}</span>
              <ArrowRight className="w-4 h-4" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
