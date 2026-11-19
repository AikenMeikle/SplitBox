import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, CreditCard, Gift, Lock, Minus, Plus,
  ShieldCheck, ShoppingBag, Sparkles, Trash2, X, Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, getAuthToken } from '../lib/api';
import {
  formatPence,
  type AuthUser,
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
  type Order,
  type ProductWithPool,
} from '../shared/types';

/** Live preview of sequential case allocation matching `server/services/poolAllocator.ts`. */
function getAllocationPreview(
  product: ProductWithPool,
  qty: number,
): { label: string; tone: 'locked' | 'mixed' | 'pooling' } {
  const caseSize = Math.max(1, product.caseSize);
  const existing = product.openCaseClaimedSlots;
  const firstCase = product.currentCaseNumber || product.lockedCasesCount + 1;
  const needed = caseSize - existing;

  if (qty < needed) {
    const afterFill = existing + qty;
    const prefix = existing === 0 ? `Opens Case #${firstCase}` : `Joins Case #${firstCase}`;
    return {
      label: `${prefix} (${afterFill}/${caseSize} filled · ${caseSize - afterFill} left, auto-refunded if unfilled)`,
      tone: 'pooling',
    };
  }

  const remainder = qty - needed;
  const extraFullCases = Math.floor(remainder / caseSize);
  const overflow = remainder % caseSize;
  const lastLockedCase = firstCase + extraFullCases;
  const caseRef = firstCase === lastLockedCase ? `Case #${firstCase}` : `Cases #${firstCase}–#${lastLockedCase}`;

  if (overflow === 0) return { label: `Locks ${caseRef} immediately ✅`, tone: 'locked' };

  const lockedQty = qty - overflow;
  return {
    label: `${lockedQty === 1 ? '1 locks' : `${lockedQty} lock`} ${caseRef} ✅ · ${overflow === 1 ? '1 opens' : `${overflow} open`} Case #${lastLockedCase + 1} (auto-refunded if unfilled)`,
    tone: 'mixed',
  };
}

/**
 * Slide-over right trolley drawer with Almost-Full Closer Bonus fee waivers,
 * automatic Divly referral wallet credits, 1-tap upsell, and Stripe checkout.
 */
export function BasketDrawer() {
  const {
    settings, products, user, isBasketOpen, setIsBasketOpen, setIsAuthModalOpen,
    setActiveTab, basket, addToBasket, setBasketQty, clearBasket,
    refreshState, refreshOrders, loginWithToken,
  } = useApp();

  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [confirmingMethod, setConfirmingMethod] = useState<string | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<CreateCheckoutResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isBasketOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmingMethod) setIsBasketOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isBasketOpen, confirmingMethod, setIsBasketOpen]);

  useEffect(() => {
    setPendingCheckout(null);
    setErrorMsg(null);
  }, [basket]);

  const basketLines = useMemo(
    () =>
      Object.entries(basket)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => {
          const product = products.find((p) => p.id === productId);
          return product ? { product, qty } : null;
        })
        .filter((line): line is { product: ProductWithPool; qty: number } => line !== null),
    [basket, products],
  );

  const hasAlmostFullItem = basketLines.some(({ product }) => Boolean(product.isAlmostFull));
  const feeWaivedByCloser = basketLines.some(({ product }) => Boolean(product.waivesSmallOrderFee));

  const topAlmostFullUpsell = useMemo(() => {
    if (basketLines.length === 0 || hasAlmostFullItem) return null;
    const candidates = products.filter((p) => p.isActive && p.isAlmostFull && !(basket[p.id] > 0));
    if (candidates.length === 0) return null;
    return [...candidates].sort(
      (a, b) => a.openCaseRemainingSlots - b.openCaseRemainingSlots || b.closerDiscountPercent - a.closerDiscountPercent,
    )[0];
  }, [basketLines.length, hasAlmostFullItem, products, basket]);

  if (!isBasketOpen) return null;

  const thresholdPence = settings?.freeDeliveryThresholdPence ?? 800;
  const smallOrderFeePence = settings?.smallOrderFeePence ?? 50;
  const dropClosed = settings?.dropStatus === 'closed';

  const subtotalPence = basketLines.reduce(
    (s, { product, qty }) => s + (product.effectiveSharePricePence ?? product.sharePricePence) * qty,
    0,
  );
  const closerBonusSavedPence = basketLines.reduce(
    (s, { product, qty }) =>
      s + Math.max(0, product.sharePricePence - (product.effectiveSharePricePence ?? product.sharePricePence)) * qty,
    0,
  );
  const maxCloserPercent = basketLines.reduce(
    (m, { product }) => (product.isAlmostFull ? Math.max(m, product.closerDiscountPercent || 0) : m),
    0,
  );
  const supermarketTotalPence = basketLines.reduce((s, { product, qty }) => s + product.aldiPricePence * qty, 0);
  const savedVsSupermarketsPence = Math.max(0, supermarketTotalPence - subtotalPence);
  const feePence =
    subtotalPence === 0 || subtotalPence >= thresholdPence || feeWaivedByCloser ? 0 : smallOrderFeePence;
  const grossOrderPence = subtotalPence + feePence;
  const walletBalancePence = Math.max(0, user?.creditBalancePence ?? 0);
  const creditAppliedPence = Math.min(walletBalancePence, grossOrderPence);
  const totalToPayPence = Math.max(0, grossOrderPence - creditAppliedPence);
  const remainingForFreeFeePence = feeWaivedByCloser ? 0 : Math.max(0, thresholdPence - subtotalPence);
  const progressPercent =
    feeWaivedByCloser || thresholdPence <= 0
      ? 100
      : Math.min(100, Math.round((subtotalPence / thresholdPence) * 100));

  async function handleStartCheckout() {
    if (basketLines.length === 0 || dropClosed) return;
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    setErrorMsg(null);
    setCreatingCheckout(true);
    try {
      const payload: CreateCheckoutRequest = {
        items: basketLines.map(({ product, qty }) => ({ productId: product.id, quantity: qty })),
      };
      const res = await apiFetch<CreateCheckoutResponse>('/api/checkout/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.mode === 'stripe_redirect' && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setPendingCheckout(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to start checkout.');
    } finally {
      setCreatingCheckout(false);
    }
  }

  async function handleConfirmTestPayment(methodLabel: string) {
    if (!pendingCheckout) return;
    setErrorMsg(null);
    setConfirmingMethod(methodLabel);
    try {
      await apiFetch<{ order: Order }>('/api/checkout/confirm-test', {
        method: 'POST',
        body: JSON.stringify({ pendingOrderId: pendingCheckout.pendingOrderId }),
      });
      clearBasket();
      const token = getAuthToken();
      if (token) {
        const me = await apiFetch<{ user: AuthUser | null }>('/api/auth/me').catch(() => ({ user: null }));
        if (me.user) loginWithToken(token, me.user);
      }
      await Promise.all([refreshState(), refreshOrders()]);
      setPendingCheckout(null);
      setIsBasketOpen(false);
      setActiveTab('orders');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Payment confirmation failed.');
    } finally {
      setConfirmingMethod(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => !confirmingMethod && setIsBasketOpen(false)} aria-hidden="true" />

      <div role="dialog" aria-modal="true" aria-labelledby="basket-drawer-title" className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h2 id="basket-drawer-title" className="text-base font-semibold text-slate-900">
                {pendingCheckout ? 'Complete Checkout' : 'Your Bulk Trolley'}
              </h2>
              <p className="text-xs text-slate-500">
                {settings?.hubShortLabel || 'UoB Campus Hub'} · {settings?.pickupWindow || 'Sat Pickup'}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => !confirmingMethod && setIsBasketOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-gray-100 hover:text-slate-600" aria-label="Close trolley">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Free-Fee / Closer Bonus Progress Strip */}
        {basketLines.length > 0 && !pendingCheckout && (
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
            <div className="flex items-center justify-between text-xs font-medium mb-1.5">
              {feeWaivedByCloser && subtotalPence < thresholdPence ? (
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <Zap className="h-4 w-4 text-amber-500" /> £0.00 fee unlocked via Closer Bonus! ⚡
                </span>
              ) : remainingForFreeFeePence === 0 ? (
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Unlocked £0.00 campus hub pickup!
                </span>
              ) : (
                <span className="text-slate-700">
                  Add <strong className="text-emerald-700">{formatPence(remainingForFreeFeePence)}</strong> more for <strong className="text-emerald-700">£0.00 fee!</strong>
                </span>
              )}
              <span className="text-slate-500">{formatPence(subtotalPence)} / {formatPence(thresholdPence)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {errorMsg && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">{errorMsg}</div>
          )}

          {basketLines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center py-12">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-slate-400">
                <ShoppingBag className="h-7 w-7" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Your trolley is empty</h3>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Chip in on wholesale grocery cases with other UoB students at prices lower than UK supermarkets.
              </p>
              <button type="button" onClick={() => setIsBasketOpen(false)} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                Browse Bulk Pools
              </button>
            </div>
          ) : pendingCheckout ? (
            <div className="space-y-4">
              <button type="button" disabled={Boolean(confirmingMethod)} onClick={() => setPendingCheckout(null)} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to trolley
              </button>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                    {pendingCheckout.totalPaidPence === 0 ? 'Covered by Divly Wallet Credit' : 'Stripe Test Mode · No Real Charge'}
                  </span>
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Paying as {user?.email}</p>
                    <p className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{formatPence(pendingCheckout.totalPaidPence)}</p>
                  </div>
                  {savedVsSupermarketsPence > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                      Saving {formatPence(savedVsSupermarketsPence)} vs Supermarkets
                    </span>
                  )}
                </div>
                {(pendingCheckout.creditAppliedPence ?? creditAppliedPence) > 0 && (
                  <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                    🎁 Includes {formatPence(pendingCheckout.creditAppliedPence ?? creditAppliedPence)} Divly Wallet Credit applied!
                  </p>
                )}
              </div>

              {pendingCheckout.totalPaidPence === 0 ? (
                <button
                  type="button"
                  disabled={Boolean(confirmingMethod)}
                  onClick={() => handleConfirmTestPayment('wallet_credit')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Gift className="h-4 w-4" />
                  {confirmingMethod ? 'Confirming Wallet Credit Order…' : 'Confirm £0.00 Order with Wallet Credit'}
                </button>
              ) : (
                <>
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Express Test Wallets</p>
                    <button type="button" disabled={Boolean(confirmingMethod)} onClick={() => handleConfirmTestPayment('apple_pay')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                      {confirmingMethod === 'apple_pay' ? 'Authorising Apple Pay…' : ' Pay · Instant Test Checkout'}
                    </button>
                    <button type="button" disabled={Boolean(confirmingMethod)} onClick={() => handleConfirmTestPayment('google_pay')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-gray-50 disabled:opacity-60">
                      {confirmingMethod === 'google_pay' ? 'Authorising Google Pay…' : 'G Pay · Express Student Wallet'}
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-slate-700">
                        <CreditCard className="h-4 w-4 text-emerald-600" /> Test Visa Debit •••• 4242
                      </span>
                      <span className="text-slate-400">Exp 12/29 · CVC 424</span>
                    </div>
                    <button type="button" disabled={Boolean(confirmingMethod)} onClick={() => handleConfirmTestPayment('visa_4242')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                      <ShieldCheck className="h-4 w-4" />
                      {confirmingMethod === 'visa_4242' ? 'Confirming Slots…' : `Pay ${formatPence(pendingCheckout.totalPaidPence)} with Test Visa •••• 4242`}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {basketLines.map(({ product, qty }) => {
                const unitPrice = product.effectiveSharePricePence ?? product.sharePricePence;
                const hasCloser = Boolean(product.isAlmostFull && product.closerDiscountPence > 0);
                const preview = getAllocationPreview(product, qty);
                const badgeStyle =
                  preview.tone === 'locked'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : preview.tone === 'mixed'
                      ? 'bg-teal-50 text-teal-800 border-teal-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200';

                return (
                  <div key={product.id} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xl border border-gray-100">
                          {product.imageEmoji}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[11px] font-medium text-slate-500">{product.brand}</p>
                            {hasCloser && (
                              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                ⚡ -{product.closerDiscountPercent}% Closer
                              </span>
                            )}
                          </div>
                          <h4 className="truncate text-sm font-semibold text-slate-900">{product.name}</h4>
                          <p className="text-xs text-slate-500">{product.unitDescription} per share</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-900">{formatPence(unitPrice * qty)}</p>
                        <p className="text-[11px] text-slate-400 line-through">Supermarket {formatPence(product.aldiPricePence * qty)}</p>
                      </div>
                    </div>

                    <div className={`mt-2.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${badgeStyle}`}>{preview.label}</div>

                    <div className="mt-2.5 flex items-center justify-between">
                      <button type="button" onClick={() => setBasketQty(product.id, 0)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                      <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50">
                        <button type="button" onClick={() => addToBasket(product.id, -1)} className="p-1.5 text-slate-600 hover:text-slate-900" aria-label={`Decrease ${product.name}`}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[2rem] text-center text-xs font-semibold text-slate-900">{qty}</span>
                        <button type="button" onClick={() => addToBasket(product.id, 1)} className="p-1.5 text-slate-600 hover:text-slate-900" aria-label={`Increase ${product.name}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Smart 1-Tap Cold-Start Upsell Card */}
              {subtotalPence > 0 && subtotalPence < thresholdPence && !hasAlmostFullItem && topAlmostFullUpsell && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Skip the {formatPence(smallOrderFeePence)} fee + get Extra Closer Discount!</span>
                  </div>
                  <div className="flex items-center justify-between gap-2.5 rounded-lg border border-emerald-200 bg-white p-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{topAlmostFullUpsell.imageEmoji}</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900">{topAlmostFullUpsell.brand} · {topAlmostFullUpsell.name}</p>
                        <p className="text-[11px] text-emerald-700 font-medium">
                          {topAlmostFullUpsell.openCaseRemainingSlots} spot{topAlmostFullUpsell.openCaseRemainingSlots === 1 ? '' : 's'} left · {formatPence(topAlmostFullUpsell.effectiveSharePricePence)} (-{topAlmostFullUpsell.closerDiscountPercent}%)
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => addToBasket(topAlmostFullUpsell.id, 1)} className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700">
                      + Add &amp; Waive Fee
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Receipt Summary & Checkout Footer */}
        {basketLines.length > 0 && !pendingCheckout && (
          <div className="border-t border-gray-200 bg-gray-50/80 px-5 py-4 space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Basket Subtotal</span>
                <span className="font-medium text-slate-900">{formatPence(subtotalPence)}</span>
              </div>
              {hasAlmostFullItem && (
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>⚡ Closer Bonus (-{maxCloserPercent}%)</span>
                  <span>-{formatPence(closerBonusSavedPence)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Small-Order Hub Fee</span>
                <span className={feePence === 0 ? 'font-semibold text-emerald-700' : 'font-medium text-slate-900'}>
                  {feeWaivedByCloser && subtotalPence < thresholdPence ? '£0.00 — Waived by Closer Bonus! ⚡' : feePence === 0 ? '£0.00' : formatPence(feePence)}
                </span>
              </div>
              {creditAppliedPence > 0 && (
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span className="inline-flex items-center gap-1"><Gift className="h-3.5 w-3.5" /> Divly Wallet Credit</span>
                  <span>-{formatPence(creditAppliedPence)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-emerald-700">
                <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Saved vs Supermarkets</span>
                <span>{formatPence(savedVsSupermarketsPence)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-slate-900">
                <span>Total to Pay</span>
                <span>{formatPence(totalToPayPence)}</span>
              </div>
            </div>

            {dropClosed && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                This week&apos;s drop cutoff has closed. Check back when the next cycle opens!
              </p>
            )}

            <button
              type="button"
              disabled={creatingCheckout || dropClosed}
              onClick={handleStartCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {creatingCheckout
                ? 'Reserving Pool Slots…'
                : !user
                  ? `Sign In with UoB Email · ${formatPence(totalToPayPence)}`
                  : `Checkout & Lock Shares · ${formatPence(totalToPayPence)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
