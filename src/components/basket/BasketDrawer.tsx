import React, { useEffect, useState } from 'react';
import {
  X,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useDrop } from '../../store/DropContext';
import {
  formatGbp,
  calcSavingsPercent,
  RETAIL_BENCHMARK_LABEL,
} from '../../data/catalog';
import type { OrderRecord } from '../../types';

export interface BasketDrawerProps {
  isOpen?: boolean;
  onClose?: () => void;
  onViewOrders?: () => void;
}

export function BasketDrawer({
  isOpen,
  onClose,
  onViewOrders,
}: BasketDrawerProps): React.JSX.Element | null {
  const {
    isBasketOpen,
    setBasketOpen,
    selectedHub,
    dropStatus,
    getBasketPreview,
    updateBasketQty,
    addToBasket,
    clearBasket,
    checkoutBasket,
    setActiveView,
  } = useDrop();

  // Internal state to hold freshly confirmed order for post-checkout confirmation state
  const [confirmedOrder, setConfirmedOrder] = useState<OrderRecord | null>(null);

  // Determine effective open state
  const effectiveIsOpen = isOpen !== undefined ? isOpen : isBasketOpen;

  // Handle escape key to close
  useEffect(() => {
    if (!effectiveIsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectiveIsOpen]);

  // Lock background scroll when drawer is open
  useEffect(() => {
    if (effectiveIsOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [effectiveIsOpen]);

  const handleClose = () => {
    setConfirmedOrder(null);
    if (onClose) {
      onClose();
    } else {
      setBasketOpen(false);
    }
  };

  const handleCheckout = () => {
    const order = checkoutBasket();
    if (order) {
      setConfirmedOrder(order);
      // Re-open/keep open so confirmation panel displays inside the drawer
      setBasketOpen(true);
    }
  };

  const handleNavigateToOrders = () => {
    setConfirmedOrder(null);
    if (onViewOrders) {
      onViewOrders();
    } else {
      setActiveView('orders');
    }
    if (onClose) {
      onClose();
    } else {
      setBasketOpen(false);
    }
  };

  const handleKeepBrowsing = () => {
    setConfirmedOrder(null);
    if (onClose) {
      onClose();
    } else {
      setBasketOpen(false);
    }
  };

  if (!effectiveIsOpen) {
    return null;
  }

  const preview = getBasketPreview();
  const savingsPct = calcSavingsPercent(preview.subtotalGbp, preview.totalRetailGbp);
  const isDropClosed = dropStatus === 'closed';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="SplitBox Basket Drawer"
    >
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-[#0B241C]/20 transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Tactile slide-over drawer surface */}
      <div
        className="relative z-10 w-full max-w-[460px] bg-white border-l-2 border-[#0B241C] shadow-[-6px_0px_0px_#0B241C] flex flex-col h-full overflow-hidden text-[#0B241C]"
        style={{ fontFamily: 'var(--sb-font-sans)' }}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b-2 border-[#0B241C] bg-[#F7FAF8] flex-shrink-0">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full bg-[#10D48E] border border-[#0B241C]" />
              <h2
                className="text-xl font-bold tracking-tight text-[#0B241C] truncate"
                style={{ fontFamily: 'var(--sb-font-display)' }}
              >
                SplitBox Crate
              </h2>
              {preview.totalSlices > 0 && !confirmedOrder && (
                <span className="sb-badge sb-badge--mint">
                  {preview.totalSlices} {preview.totalSlices === 1 ? 'SLICE' : 'SLICES'}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close basket drawer"
              className="w-9 h-9 flex items-center justify-center rounded-[8px] border-[1.5px] border-[#0B241C] bg-white text-[#0B241C] hover:bg-[#EDF7F2] active:translate-y-[1px] shadow-[2px_2px_0px_#0B241C] transition-all cursor-pointer"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Active UoB Campus Hub Pill & Pickup Window */}
          <div className="p-2.5 rounded-[10px] bg-white border-[1.5px] border-[#0B241C] shadow-[2px_2px_0px_#0B241C]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="sb-badge sb-badge--cobalt text-[10px] px-1.5 py-0">
                    {selectedHub.shortLabel}
                  </span>
                  <span className="text-[11px] font-bold text-[#1849D6] tracking-wide uppercase">
                    Campus Hub
                  </span>
                </div>
                <div className="text-xs font-bold text-[#0B241C] truncate">
                  {selectedHub.name}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[#087F53] bg-[#EDF7F2] px-2 py-0.5 rounded border border-[#087F53]/40">
                  <Clock className="w-3 h-3" />
                  {selectedHub.pickupWindow}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-[#4A665C] mt-1 truncate">
              {selectedHub.addressNote}
            </div>
          </div>
        </div>

        {/* Closed Drop Banner */}
        {isDropClosed && !confirmedOrder && (
          <div className="bg-[#FFE4E6] border-b-2 border-[#0B241C] px-4 py-2.5 text-xs font-mono font-bold text-[#E11D48] flex items-center gap-2">
            <span>⛔</span>
            <span>
              DROP CYCLE CLOSED · Cutoff passed. Collection active at {selectedHub.shortLabel}.
            </span>
          </div>
        )}

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {confirmedOrder ? (
            /* Post-Checkout Confirmation State */
            <div className="space-y-4 py-2 animate-in fade-in duration-200">
              <div className="p-4 rounded-[14px] bg-[#EDF7F2] border-2 border-[#0B241C] shadow-[3px_3px_0px_#0B241C] text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#10D48E] border-2 border-[#0B241C] text-[#0B241C] shadow-[2px_2px_0px_#0B241C] mb-1">
                  <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
                </div>
                <span className="sb-badge sb-badge--mint text-xs">
                  ✓ SLICES LOCKED IN ESCROW
                </span>
                <h3
                  className="text-xl font-bold tracking-tight text-[#0B241C]"
                  style={{ fontFamily: 'var(--sb-font-display)' }}
                >
                  Order Placed Successfully!
                </h3>
                <p className="text-xs font-mono text-[#0B241C] bg-white py-1 px-2 rounded border border-[#0B241C] inline-block font-bold">
                  Reference: #{confirmedOrder.id}
                </p>
                <p className="text-xs text-[#4A665C] leading-relaxed max-w-xs mx-auto">
                  Your shares are held in escrow for the University of Birmingham Saturday
                  pickup cycle. Zero delivery or service fees charged.
                </p>
              </div>

              {/* Confirmation Details Card */}
              <div className="sb-card__receipt">
                <div className="flex items-center justify-between pb-2 border-b border-dashed border-[#0B241C]/30 text-xs font-bold text-[#0B241C]">
                  <span>ESCROW HOLD CONFIRMED</span>
                  <span className="font-mono">{selectedHub.shortLabel}</span>
                </div>
                <div className="space-y-1.5 py-1 text-xs">
                  <div className="sb-receipt-row">
                    <span>Slices Locked</span>
                    <span className="font-bold text-[#0B241C]">
                      {confirmedOrder.sliceIds.length} Slices
                    </span>
                  </div>
                  <div className="sb-receipt-row">
                    <span>Upfront Escrow Amount</span>
                    <span className="font-bold text-[#0B241C]">
                      {formatGbp(confirmedOrder.escrowHoldGbp)}
                    </span>
                  </div>
                  <div className="sb-receipt-row">
                    <span>Campus Pickup Hub</span>
                    <span className="font-semibold text-[#0B241C]">
                      {selectedHub.name}
                    </span>
                  </div>
                  <div className="sb-receipt-row">
                    <span>Pickup Window</span>
                    <span className="font-bold text-[#087F53]">
                      {selectedHub.pickupWindow}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-dashed border-[#0B241C]/30 text-[11px] text-[#4A665C] leading-normal">
                  <strong>What happens next?</strong> At Wednesday 23:59 cutoff, all 100% full
                  wholesale cases lock for Saturday fulfillment. Any slices in partial
                  overflow cases are automatically refunded in full.
                </div>
              </div>

              {/* Confirmation Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleNavigateToOrders}
                  className="sb-btn sb-btn--cobalt sb-btn--full text-center justify-center font-bold"
                >
                  <span>View My Orders & Pickup Pass</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleKeepBrowsing}
                  className="sb-btn sb-btn--secondary sb-btn--full text-center justify-center"
                >
                  <span>Keep Browsing Campus Drops</span>
                </button>
              </div>
            </div>
          ) : preview.lines.length === 0 ? (
            /* Empty State */
            <div className="py-12 px-4 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#EDF7F2] border-2 border-[#0B241C] flex items-center justify-center shadow-[3px_3px_0px_#0B241C] text-[#0B241C]">
                <ShoppingBag className="w-8 h-8 stroke-[2]" />
              </div>
              <div className="space-y-1">
                <h3
                  className="text-lg font-bold text-[#0B241C]"
                  style={{ fontFamily: 'var(--sb-font-display)' }}
                >
                  Your SplitBox Crate is Empty
                </h3>
                <p className="text-xs text-[#4A665C] max-w-xs mx-auto leading-relaxed">
                  Choose sealed factory-packaged slices from wholesale multi-packs to split with
                  students at Birmingham campus hubs.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="sb-btn sb-btn--primary sb-btn--sm inline-flex items-center gap-2 mx-auto"
              >
                <span>Browse Available Pools</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Active Basket Line Items */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-[#CBE0D6]">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#4A665C]">
                  {preview.lines.length} {preview.lines.length === 1 ? 'Wholesale Item' : 'Wholesale Items'}
                </span>
                <button
                  type="button"
                  onClick={clearBasket}
                  disabled={isDropClosed}
                  className="text-xs font-mono text-[#E11D48] hover:underline disabled:opacity-50 cursor-pointer"
                >
                  Clear Crate
                </button>
              </div>

              {preview.lines.map((line) => {
                const item = line.item;
                const retailLineTotal = item.retailPriceGbp * line.quantity;

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-[12px] bg-[#FFFFFF] border-2 border-[#0B241C] shadow-[3px_3px_0px_#0B241C] space-y-3"
                  >
                    {/* Item Heading & Category Tag */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-mono uppercase font-bold text-[#4A665C] tracking-wide">
                            {item.brand}
                          </span>
                          <span className="text-[10px] text-[#CBE0D6]">•</span>
                          <span className="text-[10px] font-mono text-[#1849D6] font-semibold truncate">
                            {item.packBadge}
                          </span>
                        </div>
                        <h4
                          className="text-sm font-bold text-[#0B241C] leading-snug line-clamp-2"
                          style={{ fontFamily: 'var(--sb-font-display)' }}
                        >
                          {item.name}
                        </h4>
                        <p className="text-[11px] text-[#4A665C] mt-0.5 leading-tight">
                          {item.sliceUnitDescription}
                        </p>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => updateBasketQty(item.id, 0)}
                        disabled={isDropClosed}
                        title="Remove item"
                        className="text-[#4A665C] hover:text-[#E11D48] p-1 rounded hover:bg-[#FFE4E6] transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quantity Stepper & Price Line */}
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#CBE0D6]/60">
                      {/* Tactile Slice Stepper */}
                      <div className="flex items-center gap-1 bg-[#F7FAF8] p-1 rounded-[8px] border-[1.5px] border-[#0B241C]">
                        <button
                          type="button"
                          onClick={() => updateBasketQty(item.id, line.quantity - 1)}
                          disabled={isDropClosed}
                          aria-label={`Decrease ${item.name} slice quantity`}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] bg-white border border-[#0B241C] text-[#0B241C] hover:bg-[#EDF7F2] active:translate-y-[1px] disabled:opacity-40 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        <span className="w-16 text-center font-mono font-bold text-xs text-[#0B241C]">
                          {line.quantity} {line.quantity === 1 ? 'slice' : 'slices'}
                        </span>

                        <button
                          type="button"
                          onClick={() => addToBasket(item.id, 1)}
                          disabled={isDropClosed || line.quantity >= 24}
                          aria-label={`Increase ${item.name} slice quantity`}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] bg-white border border-[#0B241C] text-[#0B241C] hover:bg-[#EDF7F2] active:translate-y-[1px] disabled:opacity-40 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Pricing block */}
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-1.5">
                          <span className="text-xs font-mono text-[#4A665C] line-through">
                            {formatGbp(retailLineTotal)}
                          </span>
                          <span className="text-base font-mono font-bold text-[#0B241C]">
                            {formatGbp(line.lineTotalGbp)}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[#087F53] font-bold">
                          Save {formatGbp(line.lineSavingsGbp)} · ({formatGbp(item.slicePriceGbp)}/slice)
                        </div>
                      </div>
                    </div>

                    {/* Explicit Sequential Cross-Box Allocation Pills */}
                    <div className="pt-2 border-t border-dashed border-[#CBE0D6] space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-[#4A665C]">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#1849D6]" />
                          <span>Sequential Case Allocation</span>
                        </span>
                        <span>FCFS Boundary</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {line.allocations.map((alloc) => {
                          const isLock = alloc.locksThisBox;
                          return (
                            <span
                              key={alloc.sliceOffset}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-mono font-bold tracking-tight ${
                                isLock
                                  ? 'bg-[#10D48E] text-[#0B241C] border-[1.5px] border-[#0B241C] shadow-[1px_1px_0px_#0B241C]'
                                  : alloc.slotNumberOneBased === 1
                                  ? 'bg-[#EEF2FF] text-[#1849D6] border-[1.5px] border-[#1849D6] shadow-[1px_1px_0px_rgba(24,73,214,0.3)]'
                                  : 'bg-[#EEF2FF] text-[#1849D6] border-[1.5px] border-[#1849D6]/60 shadow-[1px_1px_0px_rgba(24,73,214,0.2)]'
                              }`}
                            >
                              {isLock ? (
                                <>
                                  <span>★</span>
                                  <span>
                                    Slice {alloc.sliceOffset} → Box #{alloc.boxNumber} (
                                    {alloc.slotNumberOneBased}/{alloc.totalSlicesPerBox} ★ Locks
                                    Box!)
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#1849D6]" />
                                  <span>
                                    Slice {alloc.sliceOffset} → Box #{alloc.boxNumber} (
                                    {alloc.slotNumberOneBased}/{alloc.totalSlicesPerBox}{' '}
                                    {alloc.slotNumberOneBased === 1 ? 'Opens Pool' : 'Pooling'})
                                  </span>
                                </>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Perforated Wholesale Escrow Summary Receipt */}
              <div className="sb-card__receipt">
                <div className="flex items-center justify-between pb-2 border-b border-dashed border-[#0B241C]/25">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#087F53]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0B241C]">
                      Wholesale Escrow Receipt
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white border border-[#0B241C] font-semibold text-[#0B241C]">
                    Direct Wholesale Price
                  </span>
                </div>

                <div className="space-y-1.5 py-1 text-xs">
                  <div className="sb-receipt-row">
                    <span>Retail Benchmark ({RETAIL_BENCHMARK_LABEL})</span>
                    <span className="sb-receipt-value--strike">
                      {formatGbp(preview.totalRetailGbp)}
                    </span>
                  </div>

                  <div className="sb-receipt-row">
                    <span>SplitBox Slice Subtotal</span>
                    <span className="font-semibold text-[#0B241C]">
                      {formatGbp(preview.subtotalGbp)}
                    </span>
                  </div>

                  <div className="sb-receipt-row">
                    <span>Campus Hub Delivery & Service Fee</span>
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#087F53]">
                      <span className="line-through text-xs text-[#4A665C]">£3.50</span>
                      <span className="bg-[#10D48E] text-[#0B241C] px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#0B241C]">
                        £0.00 FREE
                      </span>
                    </span>
                  </div>

                  <div className="sb-receipt-row sb-receipt-row--highlight">
                    <span className="text-[#0B241C]">Total Student Savings</span>
                    <span className="text-[#087F53] font-bold text-sm">
                      Save {formatGbp(preview.totalSavingsGbp)} ({savingsPct}%)
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-dashed border-[#0B241C]/25 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-[#0B241C] block">
                      Upfront Slice Lock Escrow Hold
                    </span>
                    <span className="text-[11px] text-[#4A665C]">
                      {preview.totalSlices} slice{preview.totalSlices === 1 ? '' : 's'} across{' '}
                      {preview.lines.length} item{preview.lines.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="sb-receipt-price text-xl text-[#0B241C]">
                      {formatGbp(preview.totalEscrowHoldGbp)}
                    </span>
                  </div>
                </div>

                {/* Immediate locks and pooling status summary */}
                {(preview.boxesLockedImmediatelyCount > 0 || preview.overflowSlicesCount > 0) && (
                  <div className="pt-2 flex flex-wrap gap-1.5 border-t border-dashed border-[#0B241C]/20">
                    {preview.boxesLockedImmediatelyCount > 0 && (
                      <span className="sb-badge sb-badge--mint text-[10px]">
                        ★ {preview.boxesLockedImmediatelyCount} Box
                        {preview.boxesLockedImmediatelyCount > 1 ? 'es' : ''} Locked Immediately
                      </span>
                    )}
                    {preview.overflowSlicesCount > 0 && (
                      <span className="sb-badge sb-badge--cobalt text-[10px]">
                        ⏳ {preview.overflowSlicesCount} Overflow Slice
                        {preview.overflowSlicesCount > 1 ? 's' : ''} Pooling
                      </span>
                    )}
                  </div>
                )}

                <p className="sb-card__escrow-note border-t border-dashed border-[#0B241C]/25 pt-2">
                  <strong>Escrow Rule:</strong> 100% boxes captured at Wednesday cutoff for Saturday
                  pickup. Any partial (&lt;100%) overflow slices auto-refunded automatically to your
                  payment method with £0.00 fee.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Sticky Footer with Checkout Action */}
        {!confirmedOrder && preview.totalSlices > 0 && (
          <div className="p-4 border-t-2 border-[#0B241C] bg-[#FFFFFF] flex-shrink-0 space-y-2">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isDropClosed || preview.totalSlices === 0}
              className="sb-btn sb-btn--primary sb-btn--full font-bold justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                <span>
                  Lock {preview.totalSlices} {preview.totalSlices === 1 ? 'Slice' : 'Slices'} in Escrow
                </span>
              </span>
              <span className="sb-btn__mono">
                {formatGbp(preview.totalEscrowHoldGbp)} →
              </span>
            </button>

            <div className="flex items-center justify-between text-[11px] text-[#4A665C] font-mono px-1">
              <span>Zero Risk Escrow Guarantee</span>
              <span className="text-[#087F53] font-bold">100% Auto-Refund on Partial Cases</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
