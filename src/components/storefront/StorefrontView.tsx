import React from 'react';
import {
  Search,
  X,
  MapPin,
  Clock,
  ArrowRight,
  PackageOpen,
  CheckCircle2,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import { useDrop } from '../../store/DropContext';
import { PRODUCT_CATEGORIES } from '../../data/catalog';
import type { PoolFilter, ProductCategory } from '../../types';
import { SplitCard } from './SplitCard';

export const StorefrontView: React.FC = () => {
  const {
    catalog,
    selectedHub,
    dropStatus,
    activeView: _activeView,
    setActiveView,
    selectedCategory,
    setSelectedCategory,
    poolFilter,
    setPoolFilter,
    searchQuery,
    setSearchQuery,
    lastDemoBanner,
    dismissDemoBanner,
    getFilteredProductSnapshots,
    totalUserEscrowSlices,
  } = useDrop();

  const isClosed = dropStatus === 'closed';
  const filteredSnapshots = getFilteredProductSnapshots();

  const statusTabs: Array<{ id: PoolFilter; label: string; countSuffix?: string }> = [
    { id: 'all', label: 'All Pools' },
    { id: 'closing-soon', label: 'Almost Full (1–2 Left)' },
    {
      id: 'locked-by-me',
      label: 'My Locked Slices',
      countSuffix: totalUserEscrowSlices > 0 ? ` (${totalUserEscrowSlices})` : '',
    },
  ];

  const handleResetFilters = () => {
    setSelectedCategory('All');
    setPoolFilter('all');
    setSearchQuery('');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--sb-bg-canvas)]">
      {/* Optional Toast / Feedback Banner from simulation or checkout */}
      {lastDemoBanner && (
        <aside
          aria-label="Simulation Notification"
          className="bg-[var(--sb-bg-mint-tint)] border-b-2 border-[var(--sb-ink-primary)] py-2.5 px-4"
        >
          <div className="sb-container flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-[var(--sb-ink-primary)]">
            <div className="flex items-center gap-2">
              <span className="sb-badge sb-badge--mint !text-[10px] shrink-0">DEMO UPDATE</span>
              <span className="sb-mono">{lastDemoBanner}</span>
            </div>
            <button
              type="button"
              onClick={dismissDemoBanner}
              className="p-1 hover:bg-white rounded border border-[var(--sb-ink-primary)] cursor-pointer"
              aria-label="Dismiss message"
            >
              <X className="w-3.5 h-3.5 text-[var(--sb-ink-primary)]" />
            </button>
          </div>
        </aside>
      )}

      {/* Hero Banner with Exposed Crate Grid Texture */}
      <section className="sb-crate-grid-bg border-b-2 border-[var(--sb-ink-primary)] py-8 sm:py-12">
        <div className="sb-container">
          <div className="flex flex-col gap-5 max-w-4xl">
            {/* Campus Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="sb-badge sb-badge--mint">
                📍 UNIVERSITY OF BIRMINGHAM · CAMPUS DROP #24
              </span>
              <span className="sb-badge sb-badge--cobalt">
                {selectedHub.shortLabel}
              </span>
              {isClosed ? (
                <span className="sb-badge sb-badge--ink">⛔ DROP CUTOFF RESOLVED</span>
              ) : (
                <span className="sb-badge sb-badge--warning">⏱ DROP CLOSES WED 23:59</span>
              )}
            </div>

            {/* Main Headline & Subtitle */}
            <div className="space-y-3">
              <h1 className="sb-h1">
                Wholesale groceries, split by the slice — zero group-chat hassle.
              </h1>
              <p className="text-base sm:text-lg text-[var(--sb-ink-secondary)] leading-relaxed max-w-2xl">
                Order sealed sub-units of bulk cases at wholesale-beating GBP (£) prices.
                Pool anonymously with students collecting at your campus hub.
                £0.00 service fees, 100% upfront escrow hold, and automatic refunds if a case doesn't fill.
              </p>
            </div>

            {/* Prominent Settled Banner when Cutoff is Closed */}
            {isClosed ? (
              <div className="bg-[var(--sb-bg-surface)] border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-box)] shadow-[4px_4px_0px_var(--sb-ink-primary)] p-5 mt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="sb-badge sb-badge--ink">SETTLED</span>
                    <h2 className="font-['Space_Grotesk'] text-lg font-bold text-[var(--sb-ink-primary)]">
                      Drop Closed — Collection Ready
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--sb-ink-secondary)] max-w-xl">
                    Drop cutoff has resolved. All 100% completed wholesale cases are ordered for Saturday pickup at{' '}
                    <strong className="text-[var(--sb-ink-primary)]">{selectedHub.name}</strong>.
                    Any unfilled overflow slices have been automatically refunded to escrow balances.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('orders')}
                  className="sb-btn sb-btn--cobalt shrink-0 cursor-pointer !py-3 !px-5"
                >
                  <span>My Orders & Pickup Pass</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            ) : (
              /* Active Campus Hub Summary Card */
              <div className="bg-white border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-box)] shadow-[3px_3px_0px_var(--sb-ink-primary)] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[var(--sb-cobalt-600)] shrink-0" />
                    <span className="font-['Space_Grotesk'] font-bold text-sm sm:text-base text-[var(--sb-ink-primary)]">
                      {selectedHub.name}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--sb-ink-secondary)]">
                    {selectedHub.addressNote} · <span className="font-medium">{selectedHub.walkingNote}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--sb-border-subtle)]">
                  <div className="flex items-center gap-1.5 bg-[var(--sb-bg-mint-tint)] px-3 py-1.5 rounded-[var(--sb-radius-pill)] border border-[var(--sb-ink-primary)]">
                    <Clock className="w-3.5 h-3.5 text-[var(--sb-ink-primary)]" />
                    <span className="sb-mono text-xs font-bold text-[var(--sb-ink-primary)]">
                      Pickup: {selectedHub.pickupWindow}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* SplitBox Trust Guarantees */}
            <div className="flex items-center gap-4 flex-wrap pt-1 text-xs font-medium text-[var(--sb-ink-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-[var(--sb-mint-700)]" />
                <span>£0.00 Delivery & Service Fees</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--sb-cobalt-600)]" />
                <span>Upfront Escrow · Auto-Refund if Unfilled</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--sb-mint-700)]" />
                <span>Sealed Wholesale Sub-Units Only</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Catalog & Filter Control Center */}
      <main className="sb-container py-8 flex-1">
        <div className="flex flex-col gap-6">
          {/* Controls: Pool Status Tabs, Search, and Category Pills */}
          <div className="flex flex-col gap-4">
            {/* Row 1: Status Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Pool Status Filter Tabs */}
              <div className="flex items-center border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] bg-white p-1 shadow-[2px_2px_0px_var(--sb-ink-primary)] overflow-x-auto">
                {statusTabs.map((tab) => {
                  const isActive = poolFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPoolFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-[var(--sb-radius-pill)] font-['Space_Grotesk'] text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-[var(--sb-ink-primary)] text-white shadow-sm'
                          : 'text-[var(--sb-ink-primary)] hover:bg-[var(--sb-bg-mint-tint)]'
                      }`}
                    >
                      {tab.label}
                      {tab.countSuffix}
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[240px] sm:w-72">
                <Search className="w-4 h-4 text-[var(--sb-ink-secondary)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search oat milk, pasta, tea..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] shadow-[2px_2px_0px_var(--sb-ink-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--sb-cobalt-600)]"
                  aria-label="Search catalog items"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--sb-ink-secondary)] hover:text-[var(--sb-ink-primary)] cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Category Filter Pills & Item Counter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-[var(--sb-border-subtle)]">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className={`sb-badge text-xs !py-1 !px-2.5 cursor-pointer transition-colors ${
                    selectedCategory === 'All'
                      ? 'sb-badge--ink'
                      : 'bg-white hover:bg-[var(--sb-bg-mint-tint)] text-[var(--sb-ink-primary)]'
                  }`}
                >
                  All Categories
                </button>
                {PRODUCT_CATEGORIES.map((cat: ProductCategory) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`sb-badge text-xs !py-1 !px-2.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'sb-badge--cobalt-solid'
                          : 'bg-white hover:bg-[var(--sb-bg-cobalt-tint)] text-[var(--sb-ink-primary)]'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* Pool Counter */}
              <div className="sb-mono text-xs text-[var(--sb-ink-secondary)] shrink-0 self-end sm:self-auto font-medium">
                Showing{' '}
                <strong className="text-[var(--sb-ink-primary)]">
                  {filteredSnapshots.length}
                </strong>{' '}
                of {catalog.length} wholesale pools
              </div>
            </div>
          </div>

          {/* Catalog Grid (Single column at 375px via .sb-catalog-grid) */}
          {filteredSnapshots.length > 0 ? (
            <div className="sb-catalog-grid">
              {filteredSnapshots.map((snapshot) => (
                <SplitCard key={snapshot.item.id} snapshot={snapshot} />
              ))}
            </div>
          ) : (
            /* Tactile Crate Empty State */
            <div className="bg-white border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-box)] shadow-[3px_3px_0px_var(--sb-ink-primary)] p-12 text-center max-w-lg mx-auto my-8 space-y-4">
              <div className="w-16 h-16 bg-[var(--sb-bg-mint-tint)] border-2 border-[var(--sb-ink-primary)] rounded-full flex items-center justify-center mx-auto shadow-[2px_2px_0px_var(--sb-ink-primary)]">
                <PackageOpen className="w-8 h-8 text-[var(--sb-ink-primary)]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-['Space_Grotesk'] text-xl font-bold text-[var(--sb-ink-primary)]">
                  No wholesale pools match your filters
                </h3>
                <p className="text-xs sm:text-sm text-[var(--sb-ink-secondary)]">
                  Try clearing your search query or switching the category to browse other campus pools.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="sb-btn sb-btn--primary !py-2 !px-4 text-xs font-bold cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
