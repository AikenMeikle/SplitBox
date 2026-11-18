import React from 'react';
import { useDrop } from '../../store/DropContext';
import {
  calcSavingsPercent,
  formatGbp,
  RETAIL_BENCHMARK_LABEL,
} from '../../data/catalog';
import type { ProductPoolSnapshot } from '../../types';
import { SliceMeter } from './SliceMeter';

export interface SplitCardProps {
  snapshot: ProductPoolSnapshot;
  className?: string;
}

export const SplitCard: React.FC<SplitCardProps> = ({ snapshot, className = '' }) => {
  const { dropStatus, selectedHub, addToBasket, updateBasketQty } = useDrop();
  const { item, activeBox, lockedFullBoxCount, userTotalLockedSlices, basketQuantity } =
    snapshot;

  const isClosed = dropStatus === 'closed';
  const savingsPct = calcSavingsPercent(item.slicePriceGbp, item.retailPriceGbp);
  const slicesRemaining = activeBox.slicesRemaining;

  // Lifecycle status text matching page-styles.md §6
  const getPoolStatusLabel = () => {
    if (slicesRemaining === 0) {
      return '★ BOX FILLED · LOCKED';
    }
    if (slicesRemaining === 1) {
      return `🔥 1 SLICE TO FILL BOX · ${activeBox.claimedCount}/${item.totalSlicesPerBox} CLAIMED`;
    }
    if (slicesRemaining === 2) {
      return `🔥 2 SLICES LEFT · ${activeBox.claimedCount}/${item.totalSlicesPerBox} CLAIMED`;
    }
    return `${activeBox.claimedCount}/${item.totalSlicesPerBox} CLAIMED · ${slicesRemaining} SLICES LEFT`;
  };

  return (
    <article className={`sb-card ${className}`}>
      {/* Header: Category + N-Slice Box Badge, Save X% Mint Badge, Locked Boxes Badge */}
      <header className="sb-card__header">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="sb-badge sb-badge--cobalt">
            {item.packBadge || `${item.category.toUpperCase()} · ${item.totalSlicesPerBox}-SLICE BOX`}
          </span>
          {lockedFullBoxCount >= 1 && (
            <span
              className="sb-badge sb-badge--mint"
              title={`${lockedFullBoxCount} full wholesale box(es) already locked for this campus drop.`}
            >
              ✓ {lockedFullBoxCount} {lockedFullBoxCount === 1 ? 'BOX' : 'BOXES'} LOCKED
            </span>
          )}
        </div>
        {savingsPct > 0 && (
          <span className="sb-badge sb-badge--mint shrink-0">
            SAVE {savingsPct}%
          </span>
        )}
      </header>

      {/* Body: Product title, sealed sub-unit breakdown, and SliceMeter */}
      <div className="sb-card__body">
        <div className="sb-card__info">
          <div className="sb-mono text-[11px] font-bold uppercase tracking-wider text-[var(--sb-ink-secondary)] mb-1">
            {item.brand}
          </div>
          <h3 className="sb-card__title">{item.name}</h3>
          <p className="sb-card__subtitle">{item.sliceUnitDescription}</p>
          <div className="mt-1.5 sb-mono text-[10px] text-[var(--sb-ink-secondary)]">
            Wholesale: {item.caseDescription}
          </div>
        </div>
        <div className="sb-card__meter shrink-0">
          <SliceMeter
            totalSlices={item.totalSlicesPerBox}
            claimedInOpenBox={activeBox.claimedCount}
            userSlicesInOpenBox={activeBox.userLockedSlices}
            basketPreviewSlices={activeBox.basketPreviewSlices}
            size={68}
          />
        </div>
      </div>

      {/* Perforated Wholesale Receipt */}
      <div className="sb-card__receipt">
        <div className="sb-receipt-row">
          <span className="sb-receipt-label">{RETAIL_BENCHMARK_LABEL}</span>
          <span className="sb-receipt-value sb-receipt-value--strike">
            {formatGbp(item.retailPriceGbp)}
          </span>
        </div>
        <div className="sb-receipt-row sb-receipt-row--highlight">
          <span className="sb-receipt-label">YOUR SPLITBOX SLICE</span>
          <span className="sb-receipt-price">
            {formatGbp(item.slicePriceGbp)}{' '}
            <small className="text-xs font-normal">/ slice</small>
          </span>
        </div>
        <div className="sb-receipt-row">
          <span className="sb-receipt-label">POOL STATUS</span>
          <span className="sb-receipt-status font-bold text-[var(--sb-ink-primary)]">
            {getPoolStatusLabel()}
          </span>
        </div>

        {/* User Escrow Slice Indicator */}
        {userTotalLockedSlices > 0 && (
          <div className="pt-1 mt-1 border-t border-dashed border-[var(--sb-border-subtle)] flex items-center justify-between text-[11px]">
            <span className="sb-mono font-bold text-[var(--sb-cobalt-600)]">
              ✓ SLICE LOCKED IN ESCROW
            </span>
            <span className="sb-mono font-bold text-[var(--sb-cobalt-600)]">
              {userTotalLockedSlices} slice{userTotalLockedSlices > 1 ? 's' : ''} owned
            </span>
          </div>
        )}
      </div>

      {/* Footer: Claim CTA + Escrow Note */}
      <footer className="sb-card__footer">
        {isClosed ? (
          <button
            type="button"
            disabled
            className="sb-btn sb-btn--secondary sb-btn--full opacity-60 cursor-not-allowed"
          >
            <span>Drop Closed</span>
            <span className="sb-btn__mono">Settled</span>
          </button>
        ) : basketQuantity === 0 ? (
          <button
            type="button"
            onClick={() => addToBasket(item.id, 1)}
            className="sb-btn sb-btn--primary sb-btn--full cursor-pointer"
            aria-label={`Claim 1 slice of ${item.name} for ${formatGbp(item.slicePriceGbp)}`}
          >
            <span>
              {slicesRemaining === 1
                ? 'Claim Final Slice & Fill Box'
                : 'Claim 1 Slice'}
            </span>
            <span className="sb-btn__mono">{formatGbp(item.slicePriceGbp)} →</span>
          </button>
        ) : (
          <div className="flex items-stretch gap-2 w-full">
            <div className="flex items-center border-2 border-[var(--sb-ink-primary)] rounded-[var(--sb-radius-control)] bg-white overflow-hidden shadow-[2px_2px_0px_var(--sb-ink-primary)]">
              <button
                type="button"
                onClick={() => updateBasketQty(item.id, basketQuantity - 1)}
                className="px-3 py-2 text-base font-bold hover:bg-[var(--sb-bg-mint-tint)] transition-colors cursor-pointer text-[var(--sb-ink-primary)]"
                aria-label={`Decrease ${item.name} basket quantity`}
              >
                −
              </button>
              <span className="px-2 py-2 sb-mono font-bold text-xs min-w-[75px] text-center bg-[var(--sb-bg-mint-tint)] text-[var(--sb-ink-primary)]">
                {basketQuantity} in basket
              </span>
              <button
                type="button"
                onClick={() => addToBasket(item.id, 1)}
                className="px-3 py-2 text-base font-bold hover:bg-[var(--sb-bg-mint-tint)] transition-colors cursor-pointer text-[var(--sb-ink-primary)]"
                aria-label={`Increase ${item.name} basket quantity`}
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => addToBasket(item.id, 1)}
              className="sb-btn sb-btn--primary flex-1 py-2 text-xs sm:text-sm justify-between cursor-pointer"
              aria-label={`Add another slice of ${item.name}`}
            >
              <span>+1 Slice</span>
              <span className="sb-btn__mono">{formatGbp(item.slicePriceGbp)}</span>
            </button>
          </div>
        )}

        <p className="sb-card__escrow-note">
          🔒 £0.00 fee Slice Lock escrow. Pickup {selectedHub.pickupWindow} @ {selectedHub.shortLabel}.
        </p>
      </footer>
    </article>
  );
};
