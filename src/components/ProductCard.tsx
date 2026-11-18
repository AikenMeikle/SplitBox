/**
 * Clean supermarket product card for Divly bulk pools.
 *
 * Displays:
 * - Emoji visual badge, category & bold green "Save X% vs Aldi" pill
 * - Brand, product title & exact student share description
 * - Prominent Divly bulk share price vs struck-through Aldi price
 * - Clean horizontal segmented slot bar ("3 of 4 students chipped in — 1 spot left!")
 * - Locked full-case count ("X cases locked ✅")
 * - Quick WhatsApp / copy-link button to invite hallmates to fill the case
 * - "+ Chip In" button or "- qty +" quantity stepper
 */

import { useState } from 'react';
import { Check, CheckCircle2, Minus, Plus, Share2 } from 'lucide-react';
import { BRAND_NAME } from '../config/brand';
import { useApp } from '../context/AppContext';
import { formatPence, type ProductWithPool } from '../shared/types';

interface ProductCardProps {
  product: ProductWithPool;
  dropClosed: boolean;
}

export function ProductCard({ product, dropClosed }: ProductCardProps) {
  const { basket, addToBasket } = useApp();
  const [copied, setCopied] = useState(false);

  const qtyInBasket = basket[product.id] ?? 0;
  const claimedInOpen = product.openCaseClaimedSlots;
  const remainingInOpen = product.openCaseRemainingSlots;
  const isAlmostFull = claimedInOpen > 0 && remainingInOpen <= 2;

  // Build friendly WhatsApp / clipboard invite message so hallmates can lock the box
  async function handleShareInvite() {
    const spotsNeeded = remainingInOpen;
    const url = window.location.origin;
    const text =
      spotsNeeded > 0 && claimedInOpen > 0
        ? `Only ${spotsNeeded} ${spotsNeeded === 1 ? 'spot' : 'spots'} left to lock ${product.brand} ${product.name} (${product.unitDescription}) at ${formatPence(product.sharePricePence)} vs Aldi ${formatPence(product.aldiPricePence)} on ${BRAND_NAME}! ${url}`
        : `Split a bulk case of ${product.brand} ${product.name} (${product.unitDescription}) for ${formatPence(product.sharePricePence)} (Save ${product.savingsPercent}% vs Aldi) on ${BRAND_NAME}: ${url}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: `${BRAND_NAME} Bulk Pool`, text, url });
        return;
      }
    } catch {
      // Fall back to clipboard or WhatsApp link if Web Share was dismissed
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <article className="card p-4 flex flex-col justify-between gap-3.5 hover:border-gray-300 transition-colors">
      {/* Top Section: Visual Tile, Savings Pill & Share Button */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl shrink-0 select-none"
              aria-hidden="true"
            >
              {product.imageEmoji || '📦'}
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">
                {product.brand}
              </span>
              <span className="block text-xs text-gray-400 truncate">{product.category}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {product.savingsPercent > 0 && (
              <span className="badge-green tabular-nums">
                Save {product.savingsPercent}% vs Aldi
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleShareInvite()}
              title="Copy WhatsApp / hallmate invite link"
              aria-label={`Invite hallmates to ${product.name}`}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50/50 cursor-pointer transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Product Name & Exact Share Portion */}
        <h3 className="text-base font-bold text-gray-900 leading-snug mb-1">
          {product.name}
        </h3>
        <p className="text-xs font-medium text-gray-600">
          Your share: <span className="text-gray-800 font-semibold">{product.unitDescription}</span>
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Split from {product.caseDescription} ({product.caseSize} shares/case)
        </p>
      </div>

      {/* Middle Section: Price Comparison vs Aldi + Horizontal Segmented Pool Bar */}
      <div className="space-y-3 pt-1">
        {/* Supermarket Shelf Price Tag */}
        <div className="flex items-baseline justify-between gap-2 pt-2.5 border-t border-gray-100">
          <div>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-xl font-extrabold text-gray-900">
                {formatPence(product.sharePricePence)}
              </span>
              <span className="text-xs font-medium text-gray-400 line-through">
                {formatPence(product.aldiPricePence)}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 truncate" title={product.aldiUnitLabel}>
              Aldi benchmark: {product.aldiUnitLabel}
            </p>
          </div>

          {product.lockedCasesCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-semibold shrink-0 tabular-nums">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>
                {product.lockedCasesCount}{' '}
                {product.lockedCasesCount === 1 ? 'case' : 'cases'} locked
              </span>
            </span>
          )}
        </div>

        {/* Clean Horizontal Segmented Slot Progress Bar */}
        <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-gray-800 tabular-nums">
              {claimedInOpen} of {product.caseSize} students chipped in
            </span>
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                isAlmostFull ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {claimedInOpen === 0
                ? `Case #${product.currentCaseNumber} open`
                : `${remainingInOpen} ${remainingInOpen === 1 ? 'spot' : 'spots'} left!`}
            </span>
          </div>

          {product.caseSize <= 12 ? (
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, product.caseSize)}, minmax(0, 1fr))` }}
              role="progressbar"
              aria-valuenow={claimedInOpen}
              aria-valuemin={0}
              aria-valuemax={product.caseSize}
              aria-label={`${claimedInOpen} of ${product.caseSize} slots claimed in Case ${product.currentCaseNumber}`}
            >
              {Array.from({ length: product.caseSize }).map((_, idx) => {
                const isPaidClaimed = idx < claimedInOpen;
                const isPreviewInBasket =
                  !isPaidClaimed && idx < claimedInOpen + qtyInBasket;
                return (
                  <span
                    key={idx}
                    className={`h-2 rounded-full transition-colors ${
                      isPaidClaimed
                        ? 'bg-emerald-600'
                        : isPreviewInBasket
                          ? 'bg-emerald-300'
                          : 'bg-gray-200'
                    }`}
                  />
                );
              })}
            </div>
          ) : (
            <div
              className="w-full h-2 rounded-full bg-gray-200 overflow-hidden"
              role="progressbar"
              aria-valuenow={claimedInOpen}
              aria-valuemin={0}
              aria-valuemax={product.caseSize}
            >
              <div
                className="h-full bg-emerald-600 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.round((claimedInOpen / product.caseSize) * 100))}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Bottom CTA: "+ Chip In" or "- qty +" Stepper */}
        {qtyInBasket === 0 ? (
          <button
            type="button"
            disabled={dropClosed}
            onClick={() => addToBasket(product.id, 1)}
            className="btn-primary w-full justify-between"
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>{dropClosed ? 'Drop Closed' : 'Chip In'}</span>
            </span>
            <span className="tabular-nums font-bold text-emerald-50">
              {formatPence(product.sharePricePence)}
            </span>
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2 p-1 rounded-xl bg-emerald-50 border border-emerald-200">
            <button
              type="button"
              onClick={() => addToBasket(product.id, -1)}
              aria-label={`Remove one ${product.name}`}
              className="w-9 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-700 cursor-pointer transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="text-center tabular-nums">
              <span className="text-sm font-bold text-emerald-900">
                {qtyInBasket} in trolley
              </span>
              <span className="block text-[11px] font-medium text-emerald-700">
                {formatPence(product.sharePricePence * qtyInBasket)} total
              </span>
            </div>
            <button
              type="button"
              disabled={dropClosed}
              onClick={() => addToBasket(product.id, 1)}
              aria-label={`Add another ${product.name}`}
              className="w-9 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center text-white cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
