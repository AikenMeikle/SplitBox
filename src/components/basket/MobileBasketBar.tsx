import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useDrop } from '../../store/DropContext';
import { formatGbp, calcSavingsPercent } from '../../data/catalog';

export interface MobileBasketBarProps {
  onOpenBasket?: () => void;
  className?: string;
}

export function MobileBasketBar({
  onOpenBasket,
  className = '',
}: MobileBasketBarProps): React.JSX.Element | null {
  const { isBasketOpen, setBasketOpen, totalBasketSlices, getBasketPreview, dropStatus } =
    useDrop();

  // If basket is empty or drawer is currently open, hide the mobile sticky bar
  if (totalBasketSlices === 0 || isBasketOpen) {
    return null;
  }

  const preview = getBasketPreview();
  const savingsPct = calcSavingsPercent(preview.subtotalGbp, preview.totalRetailGbp);

  const handleClick = () => {
    if (onOpenBasket) {
      onOpenBasket();
    } else {
      setBasketOpen(true);
    }
  };

  return (
    <aside
      aria-label="Floating Mobile Basket Bar"
      className={`fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-[#0B241C] shadow-[0_-4px_14px_rgba(11,36,28,0.15)] px-3 py-2.5 max-w-full overflow-hidden ${className}`}
      style={{ fontFamily: 'var(--sb-font-sans)' }}
    >
      <div className="flex items-center justify-between gap-2 max-w-[440px] mx-auto min-w-0">
        {/* Left: Slice count & Escrow Total with Savings Badge */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-xs font-bold text-[#0B241C] truncate"
              style={{ fontFamily: 'var(--sb-font-display)' }}
            >
              {preview.totalSlices} {preview.totalSlices === 1 ? 'Slice' : 'Slices'}
            </span>

            {preview.totalSavingsGbp > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono font-bold bg-[#10D48E] text-[#0B241C] border border-[#0B241C] leading-tight">
                Save {formatGbp(preview.totalSavingsGbp)}
                {savingsPct > 0 ? ` (${savingsPct}%)` : ''}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#4A665C]">
              Escrow Hold:
            </span>
            <span className="text-sm font-mono font-bold text-[#0B241C]">
              {formatGbp(preview.totalEscrowHoldGbp)}
            </span>
          </div>
        </div>

        {/* Right: Tactile High-Contrast Button */}
        <button
          type="button"
          onClick={handleClick}
          className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[8px] bg-[#FF6B1A] text-[#0B241C] border-2 border-[#0B241C] shadow-[2px_2px_0px_#0B241C] hover:bg-[#FF7E38] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#0B241C] font-bold text-xs whitespace-nowrap transition-all cursor-pointer"
          style={{ fontFamily: 'var(--sb-font-display)' }}
        >
          <ShoppingBag className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{dropStatus === 'closed' ? 'View Crate' : 'Review Crate'}</span>
          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>
    </aside>
  );
}
