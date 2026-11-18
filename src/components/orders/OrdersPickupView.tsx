import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  Package,
  PackageOpen,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import {
  calcSavingsPercent,
  formatGbp,
  fromPence,
  getCampusHubById,
  toPence,
} from '../../data/catalog';
import { useDrop } from '../../store/DropContext';
import type { UserOrderSliceDetail } from '../../types';
import { PickupPassCard } from './PickupPassCard';
import { SettlementReceipt } from './SettlementReceipt';

/**
 * Complete My Orders & Campus Pickup Pass View (brief.md §2.5 & §3.3).
 * Renders both Pre-Cutoff escrow pooling state and Post-Cutoff settlement pass & receipt.
 */
export function OrdersPickupView() {
  const {
    orders,
    pickupPass,
    dropStatus,
    selectedHub,
    setActiveView,
    getUserOrderSlices,
    triggerCutoff,
  } = useDrop();

  const [activeFilter, setActiveFilter] = useState<'all' | 'locked' | 'pooling'>('all');

  // Compute all user order slices
  const userSlices: UserOrderSliceDetail[] = useMemo(() => {
    return getUserOrderSlices();
  }, [getUserOrderSlices]);

  // Aggregate financial and lifecycle totals in pence
  const {
    initialEscrowHoldTotal,
    lockedSlices,
    overflowSlices,
    fulfilledSlices,
    refundedSlices,
    finalChargedTotal,
    totalRefundedTotal,
  } = useMemo(() => {
    let holdPence = 0;
    for (const order of orders) {
      holdPence += toPence(order.escrowHoldGbp);
    }

    const locked = userSlices.filter(
      (s) => s.status === 'locked_box' || s.status === 'fulfilled'
    );
    const overflow = userSlices.filter(
      (s) => s.status === 'pooling_overflow' || s.status === 'auto_refunded'
    );
    const fulfilled = userSlices.filter((s) => s.status === 'fulfilled');
    const refunded = userSlices.filter((s) => s.status === 'auto_refunded');

    let chargedPence = 0;
    for (const s of fulfilled) {
      chargedPence += toPence(s.slicePriceGbp);
    }

    let refundPence = 0;
    for (const s of refunded) {
      refundPence += toPence(s.slicePriceGbp);
    }

    return {
      initialEscrowHoldTotal: fromPence(holdPence),
      lockedSlices: locked,
      overflowSlices: overflow,
      fulfilledSlices: fulfilled,
      refundedSlices: refunded,
      finalChargedTotal: pickupPass ? pickupPass.finalChargedGbp : fromPence(chargedPence),
      totalRefundedTotal: pickupPass ? pickupPass.totalRefundedGbp : fromPence(refundPence),
    };
  }, [orders, userSlices, pickupPass]);

  // Filtered slices for pre-cutoff list
  const filteredSlices = useMemo(() => {
    if (activeFilter === 'locked') {
      return userSlices.filter(
        (s) => s.status === 'locked_box' || s.status === 'fulfilled'
      );
    }
    if (activeFilter === 'pooling') {
      return userSlices.filter(
        (s) => s.status === 'pooling_overflow' || s.status === 'auto_refunded'
      );
    }
    return userSlices;
  }, [userSlices, activeFilter]);

  // Handle empty state (zero orders placed yet)
  if (orders.length === 0) {
    return (
      <main className="sb-crate-grid-bg min-h-screen py-8 sm:py-12">
        <div className="sb-container max-w-2xl">
          {/* Back button */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setActiveView('storefront')}
              className="inline-flex items-center gap-2 text-sm font-bold text-[var(--sb-ink-primary)] hover:text-[var(--sb-cobalt-600)] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Campus Drop</span>
            </button>
          </div>

          {/* Empty State Crate Card */}
          <section className="sb-card sb-card--static border-2 border-[var(--sb-ink-primary)] p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-[var(--sb-bg-mint-tint)] border-2 border-[var(--sb-ink-primary)] mx-auto flex items-center justify-center shadow-[2px_2px_0px_#0B241C]">
              <PackageOpen className="w-8 h-8 text-[var(--sb-ink-primary)]" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <span className="sb-badge sb-badge--cobalt">
                ZERO ACTIVE ORDERS
              </span>
              <h2 className="sb-h2 text-2xl text-[var(--sb-ink-primary)]">
                No Slices Claimed in Active Drop
              </h2>
              <p className="text-sm text-[var(--sb-ink-secondary)] leading-relaxed">
                You haven&apos;t locked any student shares in the current University of Birmingham
                wholesale drop yet. Browse shelf-stable bulk cases and pool anonymously with campus
                strangers.
              </p>
            </div>

            {/* How Pooling Works Explainer Card */}
            <div className="bg-[var(--sb-bg-canvas)] border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] p-4 text-left space-y-3">
              <span className="text-xs uppercase font-mono font-bold tracking-wider text-[var(--sb-ink-primary)] block">
                How SplitBox Campus Pooling Works:
              </span>
              <ul className="text-xs text-[var(--sb-ink-secondary)] space-y-2 list-none p-0 m-0">
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-[var(--sb-mint-500)] text-[var(--sb-ink-primary)] font-bold font-mono text-[0.65rem] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    <strong>Claim single slices</strong> from factory wholesale multi-packs with{' '}
                    <strong>£0.00 fees</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-[var(--sb-mint-500)] text-[var(--sb-ink-primary)] font-bold font-mono text-[0.65rem] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Upfront payment hold in escrow. Slices in <strong>100% full boxes</strong> lock
                    immediately for Saturday collection.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-[var(--sb-mint-500)] text-[var(--sb-ink-primary)] font-bold font-mono text-[0.65rem] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Any partial overflow slices <strong>auto-refund 100%</strong> at Wednesday
                    cutoff while your guaranteed slices remain active!
                  </span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setActiveView('storefront')}
                className="sb-btn sb-btn--primary w-full sm:w-auto"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>Browse Wednesday Drop</span>
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const isPostCutoff = dropStatus === 'closed' && !!pickupPass;

  return (
    <main className="sb-crate-grid-bg min-h-screen py-6 sm:py-10">
      <div className="sb-container space-y-6 sm:space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b-2 border-[var(--sb-ink-primary)]">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setActiveView('storefront')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sb-ink-secondary)] hover:text-[var(--sb-cobalt-600)] transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Catalog</span>
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="sb-h2 text-2xl sm:text-3xl text-[var(--sb-ink-primary)] m-0">
                {isPostCutoff
                  ? 'Campus Pickup Pass & Settlement'
                  : 'My Orders & Escrow Pooling'}
              </h1>
              {isPostCutoff ? (
                <span className="sb-badge sb-badge--mint">
                  ★ CUTOFF SETTLED · READY FOR PICKUP
                </span>
              ) : (
                <span className="sb-badge sb-badge--cobalt">
                  ⏳ DROP IN PROGRESS · WEDNESDAY CUTOFF
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--sb-ink-secondary)] m-0">
              Campus Collection Hub:{' '}
              <strong className="text-[var(--sb-ink-primary)]">
                {selectedHub.name}
              </strong>{' '}
              ({selectedHub.pickupWindow})
            </p>
          </div>

          {/* Quick Cutoff Simulation Trigger (if still open) */}
          {!isPostCutoff && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerCutoff}
                className="sb-btn sb-btn--primary sb-btn--sm"
                title="Trigger simulated Wednesday cutoff to inspect the Pickup Pass & refund settlement receipt"
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>Simulate Cutoff Now</span>
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* POST-CUTOFF RESOLVED STATE: Pass Crate Card + Settlement Receipt          */}
        {/* ========================================================================= */}
        {isPostCutoff && pickupPass && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Pickup Pass Card (Offline SVG QR + PIN + Grace Notice) */}
              <div className="lg:col-span-7">
                <PickupPassCard
                  pass={pickupPass}
                  hub={selectedHub}
                  totalFulfilledCount={fulfilledSlices.length}
                />
              </div>

              {/* Final Settlement Receipt */}
              <div className="lg:col-span-5">
                <SettlementReceipt
                  initialEscrowHoldGbp={initialEscrowHoldTotal}
                  finalChargedGbp={finalChargedTotal}
                  totalRefundedGbp={totalRefundedTotal}
                  userSlices={userSlices}
                />
              </div>
            </div>

            {/* Settled Slices Breakdown */}
            <section className="space-y-4 pt-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="sb-h2 text-lg sm:text-xl text-[var(--sb-ink-primary)] m-0">
                    Settled Slices Breakdown ({userSlices.length} Total)
                  </h3>
                  <p className="text-xs text-[var(--sb-ink-secondary)] m-0">
                    Detailed fulfillment status for each claimed unit in your Birmingham orders.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="sb-badge sb-badge--mint">
                    {fulfilledSlices.length} Fulfilled
                  </span>
                  {refundedSlices.length > 0 && (
                    <span className="sb-badge sb-badge--danger">
                      {refundedSlices.length} Auto-Refunded
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userSlices.map((detail) => {
                  const isFulfilled = detail.status === 'fulfilled';
                  return (
                    <div
                      key={detail.slice.id}
                      className={`sb-card sb-card--static p-4 border-2 border-[var(--sb-ink-primary)] ${
                        isFulfilled
                          ? 'bg-[var(--sb-bg-surface)]'
                          : 'bg-rose-50/60 border-dashed'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 pb-2 border-b border-[var(--sb-border-subtle)]">
                        <div>
                          <span className="text-[0.68rem] uppercase font-bold text-[var(--sb-ink-secondary)] block">
                            {detail.item.brand}
                          </span>
                          <h4 className="font-bold text-sm sm:text-base text-[var(--sb-ink-primary)] m-0">
                            {detail.item.name}
                          </h4>
                          <span className="text-xs text-[var(--sb-ink-secondary)]">
                            {detail.item.sliceUnitDescription}
                          </span>
                        </div>
                        {isFulfilled ? (
                          <span className="sb-badge sb-badge--mint shrink-0 text-[0.68rem]">
                            ★ FULFILLED
                          </span>
                        ) : (
                          <span className="sb-badge sb-badge--danger shrink-0 text-[0.68rem]">
                            ↩ AUTO-REFUNDED
                          </span>
                        )}
                      </div>

                      <div className="pt-2.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--sb-ink-secondary)]">
                            Sequential Allocation:
                          </span>
                          <span className="sb-mono font-bold text-[var(--sb-ink-primary)]">
                            Box #{detail.slice.boxNumber} (Slot{' '}
                            {detail.slice.slotIndexInBox + 1}/
                            {detail.totalSlicesPerBox})
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[var(--sb-ink-secondary)]">
                            Cutoff Fill Outcome:
                          </span>
                          <span className="sb-mono font-bold text-[var(--sb-ink-primary)]">
                            {isFulfilled
                              ? `${detail.totalSlicesPerBox}/${detail.totalSlicesPerBox} Slices (100% Full)`
                              : `${detail.boxClaimedCount}/${detail.totalSlicesPerBox} Slices (<100% Unfilled)`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-dashed border-[var(--sb-border-subtle)]">
                          <span className="font-medium text-[var(--sb-ink-primary)]">
                            {isFulfilled ? 'Captured Total' : 'Refund Credited'}:
                          </span>
                          <span
                            className={`sb-mono font-bold ${
                              isFulfilled
                                ? 'text-[var(--sb-ink-primary)]'
                                : 'text-[var(--sb-danger-600)]'
                            }`}
                          >
                            {isFulfilled
                              ? formatGbp(detail.slicePriceGbp)
                              : `-${formatGbp(detail.slicePriceGbp)}`}
                          </span>
                        </div>

                        <p className="text-[0.7rem] text-[var(--sb-ink-secondary)] m-0 pt-0.5">
                          {isFulfilled
                            ? `Guaranteed and prepared for collection at ${selectedHub.shortLabel}.`
                            : 'Partial overflow box remained unfilled at cutoff; payment hold released.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PRE-CUTOFF ACTIVE POOLING STATE: Summary Cards + Live Slices Breakdown    */}
        {/* ========================================================================= */}
        {!isPostCutoff && (
          <div className="space-y-6">
            {/* 4 Summary Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Slices Claimed */}
              <div className="sb-card sb-card--static p-4 border-2 border-[var(--sb-ink-primary)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--sb-ink-secondary)]">
                    Total Slices Claimed
                  </span>
                  <Package className="w-5 h-5 text-[var(--sb-cobalt-600)]" />
                </div>
                <div className="sb-mono text-2xl sm:text-3xl font-extrabold text-[var(--sb-ink-primary)]">
                  {userSlices.length}{' '}
                  <span className="text-sm font-normal text-[var(--sb-ink-secondary)]">
                    Slices
                  </span>
                </div>
                <p className="text-xs text-[var(--sb-ink-secondary)] mt-1 m-0">
                  Across {orders.length} checkout order{orders.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Card 2: Locked 100% Boxes Guaranteed */}
              <div className="sb-card sb-card--static p-4 border-2 border-[var(--sb-ink-primary)] bg-[var(--sb-bg-mint-tint)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--sb-mint-700)]">
                    Locked 100% Guaranteed
                  </span>
                  <ShieldCheck className="w-5 h-5 text-[var(--sb-mint-700)]" />
                </div>
                <div className="sb-mono text-2xl sm:text-3xl font-extrabold text-[var(--sb-ink-primary)]">
                  {lockedSlices.length}{' '}
                  <span className="text-sm font-normal text-[var(--sb-mint-700)] font-bold">
                    Guaranteed
                  </span>
                </div>
                <p className="text-xs text-[var(--sb-ink-secondary)] mt-1 m-0">
                  ★ 100% filled boxes ready for Saturday pickup
                </p>
              </div>

              {/* Card 3: Overflow Slices Waiting for Strangers */}
              <div className="sb-card sb-card--static p-4 border-2 border-[var(--sb-ink-primary)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--sb-tangerine-600)]">
                    Overflow Waiting
                  </span>
                  <Clock className="w-5 h-5 text-[var(--sb-tangerine-500)]" />
                </div>
                <div className="sb-mono text-2xl sm:text-3xl font-extrabold text-[var(--sb-ink-primary)]">
                  {overflowSlices.length}{' '}
                  <span className="text-sm font-normal text-[var(--sb-ink-secondary)]">
                    Pooling
                  </span>
                </div>
                <p className="text-xs text-[var(--sb-ink-secondary)] mt-1 m-0">
                  ⏳ Protected by automatic cutoff refund
                </p>
              </div>

              {/* Card 4: Upfront Escrow Hold £ */}
              <div className="sb-card sb-card--static p-4 border-2 border-[var(--sb-ink-primary)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--sb-ink-secondary)]">
                    Upfront Escrow Hold
                  </span>
                  <Sparkles className="w-5 h-5 text-[var(--sb-ink-primary)]" />
                </div>
                <div className="sb-mono text-2xl sm:text-3xl font-extrabold text-[var(--sb-ink-primary)]">
                  {formatGbp(initialEscrowHoldTotal)}
                </div>
                <p className="text-xs text-[var(--sb-mint-700)] font-bold mt-1 m-0">
                  £0.00 platform &amp; delivery fees
                </p>
              </div>
            </div>

            {/* Informative Escrow Guarantee Alert Banner */}
            <div className="p-4 bg-[var(--sb-bg-cobalt-tint)] border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-box)] flex items-start gap-3 shadow-[2px_2px_0px_#0B241C]">
              <Info className="w-5 h-5 text-[var(--sb-cobalt-600)] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <strong className="text-[var(--sb-ink-primary)] font-bold block text-sm">
                  Wednesday Cutoff Guarantee &amp; Overflow Protection
                </strong>
                <p className="text-[var(--sb-ink-secondary)] m-0 leading-relaxed">
                  Your payment hold is safely kept in £0.00-fee escrow. Slices in cases that reach{' '}
                  <strong>100% capacity</strong> are permanently locked for Saturday pickup. Any
                  partial overflow slices still waiting for campus strangers at Wednesday cutoff
                  will be <strong>automatically refunded in full</strong>—leaving all your
                  guaranteed slices completely active.
                </p>
              </div>
            </div>

            {/* Per-Slice Breakdown Section */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="sb-h2 text-xl text-[var(--sb-ink-primary)] m-0">
                    Your Slices &amp; Sequential Box Allocation
                  </h2>
                  <p className="text-xs text-[var(--sb-ink-secondary)] m-0">
                    Allocated strictly first-come, first-served across wholesale cases.
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border-2 border-[var(--sb-ink-primary)] text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      activeFilter === 'all'
                        ? 'bg-[var(--sb-ink-primary)] text-white'
                        : 'text-[var(--sb-ink-primary)] hover:bg-black/5'
                    }`}
                  >
                    All ({userSlices.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('locked')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      activeFilter === 'locked'
                        ? 'bg-[var(--sb-mint-500)] text-[var(--sb-ink-primary)]'
                        : 'text-[var(--sb-ink-primary)] hover:bg-black/5'
                    }`}
                  >
                    Guaranteed ({lockedSlices.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('pooling')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      activeFilter === 'pooling'
                        ? 'bg-[var(--sb-tangerine-500)] text-[var(--sb-ink-primary)]'
                        : 'text-[var(--sb-ink-primary)] hover:bg-black/5'
                    }`}
                  >
                    Pooling ({overflowSlices.length})
                  </button>
                </div>
              </div>

              {/* Slices Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSlices.map((detail) => {
                  const isLocked = detail.status === 'locked_box';
                  const savingsPct = calcSavingsPercent(
                    detail.slicePriceGbp,
                    detail.retailPriceGbp
                  );
                  const slicesNeeded = Math.max(
                    0,
                    detail.totalSlicesPerBox - detail.boxClaimedCount
                  );
                  const hub = getCampusHubById(detail.hubId);

                  return (
                    <article
                      key={detail.slice.id}
                      className="sb-card sb-card--static p-4 sm:p-5 border-2 border-[var(--sb-ink-primary)] space-y-3"
                    >
                      {/* Top Header: Brand, Title, Lifecycle Badge */}
                      <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--sb-border-subtle)]">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[0.68rem] uppercase font-bold text-[var(--sb-ink-secondary)]">
                              {detail.item.brand}
                            </span>
                            <span className="text-[var(--sb-border-subtle)]">·</span>
                            <span className="text-[0.68rem] uppercase font-mono font-bold text-[var(--sb-cobalt-600)]">
                              {detail.item.category}
                            </span>
                          </div>
                          <h3 className="sb-h2 text-base sm:text-lg text-[var(--sb-ink-primary)] m-0">
                            {detail.item.name}
                          </h3>
                          <p className="text-xs text-[var(--sb-ink-secondary)] m-0 mt-0.5">
                            {detail.item.sliceUnitDescription}
                          </p>
                        </div>

                        {/* Lifecycle badge strictly per spec */}
                        {isLocked ? (
                          <span className="sb-badge sb-badge--mint shrink-0 text-[0.68rem]">
                            ★ BOX LOCKED · GUARANTEED
                          </span>
                        ) : (
                          <span className="sb-badge sb-badge--warning shrink-0 text-[0.68rem]">
                            ⏳ POOLING · AUTO-REFUND PROTECTED
                          </span>
                        )}
                      </div>

                      {/* Middle Body: Exact Case & Slot Index + Pool Progress */}
                      <div className="bg-[var(--sb-bg-canvas)] border border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--sb-ink-secondary)] font-medium">
                            Assigned Case &amp; Slot:
                          </span>
                          <span className="sb-mono font-extrabold text-[var(--sb-ink-primary)] text-sm bg-white px-2 py-0.5 rounded border border-[var(--sb-ink-primary)]">
                            Box #{detail.slice.boxNumber} · Slot{' '}
                            {detail.slice.slotIndexInBox + 1}/
                            {detail.totalSlicesPerBox}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[var(--sb-ink-secondary)]">
                            Case Pool Fill Progress:
                          </span>
                          <span className="sb-mono font-bold text-[var(--sb-ink-primary)]">
                            {detail.boxClaimedCount}/{detail.totalSlicesPerBox} Slices Claimed
                          </span>
                        </div>

                        <p className="text-[0.72rem] text-[var(--sb-ink-secondary)] m-0 pt-1 border-t border-dashed border-[var(--sb-border-subtle)] leading-relaxed">
                          {isLocked ? (
                            <span className="text-[var(--sb-mint-700)] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Case is 100% full. Guaranteed for Saturday collection at {hub.shortLabel}.
                            </span>
                          ) : (
                            <span>
                              Waiting for{' '}
                              <strong>
                                {slicesNeeded} stranger slice
                                {slicesNeeded !== 1 ? 's' : ''}
                              </strong>{' '}
                              before Wednesday cutoff. If unfilled, £
                              {detail.slicePriceGbp.toFixed(2)} will be auto-refunded to your card.
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Price & Savings Row */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div className="flex items-baseline gap-2">
                          <span className="sb-mono text-lg font-bold text-[var(--sb-ink-primary)]">
                            {formatGbp(detail.slicePriceGbp)}
                          </span>
                          <span className="sb-mono text-xs text-[var(--sb-ink-secondary)] line-through">
                            {formatGbp(detail.retailPriceGbp)}
                          </span>
                          {savingsPct > 0 && (
                            <span className="sb-badge sb-badge--tangerine text-[0.65rem] py-0 px-1.5">
                              SAVE {savingsPct}%
                            </span>
                          )}
                        </div>

                        <div className="text-right text-[0.7rem] text-[var(--sb-ink-secondary)]">
                          <span>Order: </span>
                          <span className="sb-mono font-bold text-[var(--sb-ink-primary)]">
                            #{detail.orderId}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
