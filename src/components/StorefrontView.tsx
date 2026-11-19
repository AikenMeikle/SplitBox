/**
 * Main campus grocery storefront view for Divly.
 *
 * Features:
 * - Compact 3-step student explainer hero + live campus drop banner
 * - Deep-linked pool spotlight when a student opens a shared `?product=<id>` invite link
 * - High-converting "🔥 Almost Full — Closer Bonus + Free Pickup" spotlight strip
 * - Search bar, horizontal category filter pills, and sort selector (defaulting to
 *   `'almost_full'` — "Recommended: Almost Full & Extra Savings")
 * - Responsive 1/2/3/4-column supermarket grid of `ProductCard` tiles
 * - Student "Suggest & Upvote Next Week's Drop" community request board
 * - Sticky mobile bottom trolley summary bar (`< 768px`) for 1-tap checkout
 */

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Flame,
  Pin,
  Plus,
  QrCode,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { BRAND_TAGLINE, CAMPUS_NAME } from '../config/brand';
import { useApp } from '../context/AppContext';
import { formatPence } from '../shared/types';
import { ProductCard } from './ProductCard';
import { RequestBoardSection } from './RequestBoardSection';

type SortOption = 'almost_full' | 'biggest_saving' | 'lowest_price';

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
    addToBasket,
    setIsBasketOpen,
    setActiveTab,
    highlightedProductId,
    clearHighlightedProduct,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('almost_full');

  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive !== false),
    [products]
  );

  const highlightedProduct = useMemo(
    () =>
      highlightedProductId
        ? activeProducts.find((p) => p.id === highlightedProductId) ?? null
        : null,
    [activeProducts, highlightedProductId]
  );

  // Top 4 almost-full pools ranked by fewest remaining spots first
  const almostFullProducts = useMemo(() => {
    return activeProducts
      .filter((p) => p.isAlmostFull && p.openCaseRemainingSlots > 0)
      .sort((a, b) => {
        if (a.openCaseRemainingSlots !== b.openCaseRemainingSlots) {
          return a.openCaseRemainingSlots - b.openCaseRemainingSlots;
        }
        if (b.closerDiscountPercent !== a.closerDiscountPercent) {
          return b.closerDiscountPercent - a.closerDiscountPercent;
        }
        return b.fillRatio - a.fillRatio;
      })
      .slice(0, 4);
  }, [activeProducts]);

  // Combine canonical categories with any custom categories added in Admin Ops
  const categories = useMemo(() => {
    const dynamicSet = new Set<string>(CANONICAL_CATEGORIES);
    for (const item of activeProducts) {
      if (item.category) dynamicSet.add(item.category);
    }
    return ['All', ...Array.from(dynamicSet)];
  }, [activeProducts]);

  // Filter & sort products, pinning any deep-linked `?product=<id>` pool first
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
      if (highlightedProductId) {
        if (a.id === highlightedProductId) return -1;
        if (b.id === highlightedProductId) return 1;
      }
      if (sortBy === 'lowest_price') {
        return a.effectiveSharePricePence - b.effectiveSharePricePence;
      }
      if (sortBy === 'almost_full') {
        if (a.isAlmostFull !== b.isAlmostFull) {
          return a.isAlmostFull ? -1 : 1;
        }
        const aOpen = a.openCaseClaimedSlots > 0 ? a.openCaseRemainingSlots : 999;
        const bOpen = b.openCaseClaimedSlots > 0 ? b.openCaseRemainingSlots : 999;
        if (aOpen !== bOpen) return aOpen - bOpen;
        if (b.fillRatio !== a.fillRatio) return b.fillRatio - a.fillRatio;
        return b.lockedCasesCount - a.lockedCasesCount;
      }
      // Biggest Supermarket Saving
      if (b.savingsPercent !== a.savingsPercent) {
        return b.savingsPercent - a.savingsPercent;
      }
      return a.effectiveSharePricePence - b.effectiveSharePricePence;
    });
  }, [activeProducts, highlightedProductId, searchQuery, selectedCategory, sortBy]);

  const totalLockedCases = useMemo(
    () => activeProducts.reduce((sum, p) => sum + p.lockedCasesCount, 0),
    [activeProducts]
  );

  const basketTotals = useMemo(() => {
    let subtotalPence = 0;
    let supermarketTotalPence = 0;
    let waivesFee = false;
    for (const [productId, qty] of Object.entries(basket)) {
      if (qty <= 0) continue;
      const item = products.find((p) => p.id === productId);
      if (item) {
        subtotalPence += item.effectiveSharePricePence * qty;
        supermarketTotalPence += item.aldiPricePence * qty;
        if (item.waivesSmallOrderFee) waivesFee = true;
      }
    }
    return {
      subtotalPence,
      savedVsRetailPence: Math.max(0, supermarketTotalPence - subtotalPence),
      waivesFee,
    };
  }, [basket, products]);

  const dropClosed = settings?.dropStatus === 'closed';
  const freeThresholdText = settings
    ? formatPence(settings.freeDeliveryThresholdPence)
    : '£8.00';

  return (
    <div
      className={`max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5 ${
        basketCount > 0 ? 'pb-24 md:pb-10' : 'pb-10'
      }`}
    >
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

      {/* Pinned Shared Pool Banner when arriving from `?product=<id>` */}
      {highlightedProduct && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm text-emerald-950">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Shared pool pinned below:{' '}
              <strong>
                {highlightedProduct.brand} {highlightedProduct.name}
              </strong>{' '}
              ({highlightedProduct.openCaseClaimedSlots} of {highlightedProduct.caseSize} chipped in)
            </span>
          </div>
          <button
            type="button"
            onClick={clearHighlightedProduct}
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer"
          >
            Dismiss pin
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
              Free campus hub collection on orders {freeThresholdText}+ (or any Almost-Full Closer item!) at{' '}
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
                Claim factory-sealed shares anonymously with other UoB students — zero flat-chat chasing.
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
                <span>Beat UK supermarket prices</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Wholesale cases unlock 15–35% lower unit prices than typical supermarkets, plus Closer Bonuses.
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

      {/* High-Converting "Almost Full" Closer Bonus Spotlight Strip */}
      {!dropClosed && almostFullProducts.length > 0 && (
        <section
          className="card p-4 sm:p-5 bg-gradient-to-r from-emerald-50/80 via-white to-amber-50/60 border-emerald-200 space-y-3.5"
          aria-label="Almost Full Closer Bonus Spotlight"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                <span>🔥 Almost Full — Lock a Box for Extra Closer Discount + Free Pickup</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-700 mt-0.5">
                Chip into a box that&apos;s 50%+ full to get an instant{' '}
                <span className="font-bold text-emerald-800">6%–10% Closer Bonus</span> AND{' '}
                <span className="font-bold text-emerald-800">£0.00 Free Hub Pickup</span> on your whole trolley!
              </p>
            </div>
            <span className="badge-amber self-start sm:self-center shrink-0">
              <Zap className="w-3.5 h-3.5" />
              <span>Waives £0.50 small-order fee</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {almostFullProducts.map((item) => {
              const qty = basket[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-white border border-emerald-200/80 shadow-2xs flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full tabular-nums">
                        Only {item.openCaseRemainingSlots}{' '}
                        {item.openCaseRemainingSlots === 1 ? 'spot' : 'spots'} left!
                      </span>
                      {item.closerDiscountPercent > 0 && (
                        <span className="text-[11px] font-bold text-emerald-700 tabular-nums">
                          -{item.closerDiscountPercent}% Closer
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-xl select-none" aria-hidden="true">
                        {item.imageEmoji || '📦'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate" title={item.name}>
                          {item.name}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">{item.unitDescription}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <div className="tabular-nums">
                      <span className="text-sm font-extrabold text-emerald-700">
                        {formatPence(item.effectiveSharePricePence)}
                      </span>
                      {item.closerDiscountPence > 0 && (
                        <span className="ml-1 text-[11px] text-gray-400 line-through">
                          {formatPence(item.sharePricePence)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => addToBasket(item.id, 1)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        qty > 0
                          ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {qty > 0 ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{qty} Added (+1)</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Lock Spot</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
            <label
              htmlFor="divly-sort"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
              <span>Sort:</span>
            </label>
            <select
              id="divly-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs sm:text-sm font-semibold text-gray-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="almost_full">Recommended: Almost Full &amp; Extra Savings</option>
              <option value="biggest_saving">Biggest Supermarket Saving</option>
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
            <ProductCard
              key={product.id}
              product={product}
              dropClosed={dropClosed}
              isHighlighted={product.id === highlightedProductId}
            />
          ))}
        </section>
      )}

      {/* Student Request & Upvote Community Board */}
      <RequestBoardSection />

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
                {basketTotals.savedVsRetailPence > 0 && (
                  <span className="ml-1.5 text-xs text-emerald-100 font-medium">
                    (Save {formatPence(basketTotals.savedVsRetailPence)}
                    {basketTotals.waivesFee ? ' · £0 Fee' : ''})
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
