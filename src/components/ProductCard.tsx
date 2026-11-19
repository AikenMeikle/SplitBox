/**
 * Clean supermarket product card for Divly bulk pools.
 *
 * Displays:
 * - Emoji visual badge, category & bold green "Save X% vs Supermarkets" pill
 * - Closer Incentive pill ("⚡ CLOSER BONUS: -X% + FREE PICKUP") on almost-full boxes
 * - Instant hub carryover badge ("✓ Instant Stock Held at Hub") when rollover units exist
 * - Prominent effective bulk share price vs base share price & typical UK supermarket price
 * - Clean horizontal segmented slot bar ("Only X spot(s) left to lock Case #Y!")
 * - Viral WhatsApp / copy-link button (`?product=<id>&ref=<code>`) + quantity stepper
 */

import { useState } from 'react';
import { Check, CheckCircle2, Minus, PackageCheck, Plus, Share2, Zap } from 'lucide-react';
import { BRAND_NAME } from '../config/brand';
import { useApp } from '../context/AppContext';
import { formatPence, type ProductWithPool } from '../shared/types';

interface ProductCardProps {
  product: ProductWithPool;
  dropClosed: boolean;
  isHighlighted?: boolean;
}

export function ProductCard({ product, dropClosed, isHighlighted = false }: ProductCardProps) {
  const { user, basket, addToBasket } = useApp();
  const [copied, setCopied] = useState(false);

  const qtyInBasket = basket[product.id] ?? 0;
  const claimedInOpen = product.openCaseClaimedSlots;
  const remainingInOpen = product.openCaseRemainingSlots;
  const hasCloserBonus = Boolean(product.isAlmostFull && product.closerDiscountPence > 0);
  const displayPricePence = hasCloserBonus
    ? product.effectiveSharePricePence
    : product.sharePricePence;
  const carryoverSlots = product.carryoverStockSlots ?? 0;

  // Total % saved vs UK supermarkets including any active Closer Bonus
  const effectiveSavingsPercent =
    product.aldiPricePence > 0
      ? Math.max(
          product.savingsPercent,
          Math.round(((product.aldiPricePence - displayPricePence) / product.aldiPricePence) * 100)
        )
      : product.savingsPercent;

  const retailUnitLabel = product.aldiUnitLabel || 'Supermarket equiv.';

  // Build viral WhatsApp / clipboard invite link with `?product=<id>&ref=<code>`
  async function handleShareInvite() {
    const params = new URLSearchParams({ product: product.id });
    if (user?.referralCode) {
      params.set('ref', user.referralCode);
    }
    const shareUrl = `${window.location.origin}/?${params.toString()}`;

    const spotsLead =
      remainingInOpen > 0 && claimedInOpen > 0
        ? `${remainingInOpen} ${remainingInOpen === 1 ? 'spot' : 'spots'} left`
        : `${formatPence(displayPricePence)} per share (Save ${effectiveSavingsPercent}% vs Supermarkets)`;

    const text = user?.referralCode
      ? `Join my UoB bulk box on ${BRAND_NAME} (${product.brand} ${product.name}) — ${spotsLead} + get £0.50 off your first drop! ${shareUrl}`
      : `Join this UoB bulk box on ${BRAND_NAME} (${product.brand} ${product.name}, ${product.unitDescription}) — ${spotsLead}: ${shareUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: `${BRAND_NAME} UoB Bulk Box`, text, url: shareUrl });
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
    <article
      className={`card p-4 flex flex-col justify-between gap-3.5 transition-colors ${
        isHighlighted
          ? 'border-emerald-500 ring-2 ring-emerald-500/25 bg-emerald-50/20'
          : hasCloserBonus
            ? 'border-emerald-300 ring-1 ring-emerald-500/15 hover:border-emerald-400'
            : 'hover:border-gray-300'
      }`}
    >
      {/* Top Section: Visual Tile, Savings Pill, Closer Bonus & Share Button */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-2.5">
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
            {effectiveSavingsPercent > 0 && (
              <span className="badge-green tabular-nums">
                Save {effectiveSavingsPercent}% vs RRP
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleShareInvite()}
              title={
                user?.referralCode
                  ? 'Share pool link (+ Give £0.50, Get £1 credit)'
                  : 'Copy WhatsApp / hallmate invite link'
              }
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

        {/* Closer Bonus & Instant Hub Stock Badges */}
        {(hasCloserBonus || carryoverSlots > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {hasCloserBonus && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-extrabold tracking-tight tabular-nums">
                <Zap className="w-3 h-3 text-amber-600 shrink-0" />
                <span>⚡ CLOSER BONUS: -{product.closerDiscountPercent}% + FREE PICKUP</span>
              </span>
            )}
            {carryoverSlots > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                <PackageCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>✓ Instant Stock Held at Hub</span>
              </span>
            )}
          </div>
        )}

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

      {/* Middle Section: Price Comparison vs Supermarkets + Horizontal Segmented Pool Bar */}
      <div className="space-y-3 pt-1">
        {/* Supermarket Shelf Price Tag */}
        <div className="flex items-baseline justify-between gap-2 pt-2.5 border-t border-gray-100">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
              <span
                className={`text-xl font-extrabold ${
                  hasCloserBonus ? 'text-emerald-700' : 'text-gray-900'
                }`}
              >
                {formatPence(displayPricePence)}
              </span>
              {hasCloserBonus && (
                <span
                  className="text-xs font-semibold text-gray-500 line-through"
                  title="Standard Divly bulk share price"
                >
                  Base {formatPence(product.sharePricePence)}
                </span>
              )}
              <span
                className="text-xs font-medium text-gray-400 line-through"
                title="Typical UK supermarket comparison price"
              >
                Typical {formatPence(product.aldiPricePence)}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 truncate" title={retailUnitLabel}>
              Supermarket equiv: {retailUnitLabel}
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
        <div
          className={`p-2.5 rounded-xl border space-y-1.5 ${
            hasCloserBonus
              ? 'bg-emerald-50/60 border-emerald-200'
              : 'bg-gray-50 border-gray-100'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="font-semibold text-gray-800 tabular-nums">
              {claimedInOpen} of {product.caseSize} chipped in
            </span>
            <span
              className={`text-[11px] font-bold tabular-nums ${
                hasCloserBonus ? 'text-amber-800' : 'text-emerald-700'
              }`}
            >
              {claimedInOpen === 0
                ? `Case #${product.currentCaseNumber} open`
                : hasCloserBonus
                  ? `Only ${remainingInOpen} ${remainingInOpen === 1 ? 'spot' : 'spots'} left to lock Case #${product.currentCaseNumber}!`
                  : `${remainingInOpen} ${remainingInOpen === 1 ? 'spot' : 'spots'} left`}
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
                          : hasCloserBonus
                            ? 'bg-amber-200/80'
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
              <span>
                {dropClosed
                  ? 'Drop Closed'
                  : hasCloserBonus
                    ? 'Claim Closer Bonus'
                    : 'Chip In'}
              </span>
            </span>
            <span className="tabular-nums font-bold text-emerald-50">
              {formatPence(displayPricePence)}
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
                {formatPence(displayPricePence * qtyInBasket)} total
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
