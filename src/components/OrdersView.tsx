import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check, Clock, Copy, Gift, KeyRound, MapPin, MessageCircle,
  PackageCheck, QrCode, RefreshCw, ShoppingBag, Sparkles, UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  formatPence,
  type AllocationStatus,
  type Order,
  type OrderStatus,
  type ProductWithPool,
} from '../shared/types';

function getOrderStatusMeta(status: OrderStatus): { label: string; className: string } {
  switch (status) {
    case 'paid_pooling':
      return { label: 'Pooling Live', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'settled':
      return { label: 'Settled & Ready for Pickup', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    case 'collected':
      return { label: 'Collected ✅', className: 'bg-slate-100 text-slate-700 border-slate-300' };
    case 'refunded':
      return { label: '100% Auto-Refunded', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    default:
      return { label: 'Pending Payment', className: 'bg-gray-100 text-slate-600 border-gray-200' };
  }
}

function getAllocationBadge(
  status: AllocationStatus,
  boxNumber: number,
  slotInBox: number,
  caseSize: number,
  liveProduct?: ProductWithPool,
): { label: string; className: string } {
  if (status === 'locked_box') return { label: 'Locked ✅', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status === 'fulfilled') return { label: 'Fulfilled ✅', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  if (status === 'auto_refunded') return { label: 'Auto-Refunded 💷', className: 'bg-amber-50 text-amber-800 border-amber-200' };

  let filled = slotInBox;
  if (liveProduct) {
    if (boxNumber <= liveProduct.lockedCasesCount) filled = caseSize;
    else if (boxNumber === liveProduct.currentCaseNumber) filled = Math.max(slotInBox, liveProduct.openCaseClaimedSlots);
  }
  return { label: `Pooling (${filled}/${caseSize})`, className: 'bg-sky-50 text-sky-700 border-sky-200' };
}

function getOrderSupermarketSavingsPence(order: Order): number {
  if (order.status === 'refunded') return 0;
  return order.allocations
    .filter((a) => a.status !== 'auto_refunded')
    .reduce((sum, a) => sum + Math.max(0, a.aldiPricePence - a.sharePricePence), 0);
}

/**
 * Student's live orders, viral flatmate referral card, case-slot statuses, and QR pickup passes.
 */
export function OrdersView() {
  const { user, orders, products, settings, setIsAuthModalOpen, setActiveTab, refreshOrders } = useApp();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) void refreshOrders();
  }, [user, refreshOrders]);

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      await refreshOrders();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCopyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      // Ignore clipboard failures in restricted browser environments
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <UserCheck className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Sign in to view your orders &amp; QR pickup pass</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
            Use your <span className="font-medium text-slate-800">@student.bham.ac.uk</span> email to track live wholesale case locks, wallet credits, and Saturday hub passes.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => setIsAuthModalOpen(true)} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              Sign In with UoB Email
            </button>
            <button type="button" onClick={() => setActiveTab('shop')} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-gray-50">
              Browse Bulk Pools
            </button>
          </div>
        </div>
      </div>
    );
  }

  const referralUrl = user.referralCode
    ? `${window.location.origin}/?ref=${encodeURIComponent(user.referralCode)}`
    : window.location.origin;
  const whatsappInviteText = `Hey! Join me on Divly to split wholesale groceries at UoB below supermarket prices — use my link for £0.50 off your first bulk share: ${referralUrl}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">My Bulk Shares &amp; Pickup Passes</h1>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-800">{user.email}</span> · Live case updates stream automatically.
          </p>
        </div>
        <button type="button" onClick={handleManualRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-gray-50 disabled:opacity-60">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Viral Campus Referral & Wallet Credit Card */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">🎁 Give Friends £0.50, Get £1.00 Credit</h2>
                <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  Wallet Balance: {formatPence(user.creditBalancePence ?? 0)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Share your code <code className="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-slate-900 border border-emerald-200">{user.referralCode || 'UOB-INVITE'}</code> in your hall WhatsApp — flatmates get £0.50 immediately and help lock your open boxes faster!
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopyText('referral', referralUrl)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-gray-50"
            >
              {copiedId === 'referral' ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Invite Link Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Invite Link</>}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappInviteText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp
            </a>
          </div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-slate-400">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">No bulk shares claimed yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Chip in on wholesale cases with other students. Locked cases are ready for Saturday pickup; unfilled slots auto-refund at cutoff.
          </p>
          <button type="button" onClick={() => setActiveTab('shop')} className="mt-5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
            Shop Bulk Pools
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => {
            const statusMeta = getOrderStatusMeta(order.status);
            const savedPence = getOrderSupermarketSavingsPence(order);
            const isRefundedOrder = order.status === 'refunded';
            const creditUsed = order.creditAppliedPence ?? 0;

            return (
              <article key={order.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/70 px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      Placed {new Date(order.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    {order.collectedAt && (
                      <span className="text-xs font-medium text-emerald-700">
                        · Collected {new Date(order.collectedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                  {savedPence > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <Sparkles className="h-3.5 w-3.5" /> Saved {formatPence(savedPence)} vs Supermarkets
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12">
                  {/* Left: Itemized Shares & Transparent Receipt */}
                  <div className="p-5 lg:col-span-7 lg:border-r lg:border-gray-200 flex flex-col justify-between space-y-5">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                        Allocated Case Slots ({order.allocations.length})
                      </h3>
                      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                        {order.allocations.map((alloc) => {
                          const liveProduct = products.find((p) => p.id === alloc.productId);
                          const badge = getAllocationBadge(alloc.status, alloc.boxNumber, alloc.slotInBox, alloc.caseSize, liveProduct);
                          const isRefundedItem = alloc.status === 'auto_refunded';

                          return (
                            <div key={alloc.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-lg border border-gray-100">
                                  {alloc.imageEmoji}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {alloc.productBrand} · {alloc.productName}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {alloc.unitDescription} · <span className="font-medium text-slate-700">Case #{alloc.boxNumber} · Slot {alloc.slotInBox}/{alloc.caseSize}</span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 ml-auto">
                                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                                  {badge.label}
                                </span>
                                <div className="text-right min-w-[3.75rem]">
                                  <p className={`text-sm font-bold ${isRefundedItem ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                    {formatPence(alloc.sharePricePence)}
                                  </p>
                                  <p className="text-[11px] text-slate-400">Supermarket {formatPence(alloc.aldiPricePence)}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Shares Subtotal ({formatPence(order.subtotalPence)}) + Hub Fee ({order.feePence === 0 ? '£0.00' : formatPence(order.feePence)})</span>
                        <span className="font-medium text-slate-900">{formatPence(order.subtotalPence + order.feePence)}</span>
                      </div>
                      {creditUsed > 0 && (
                        <div className="flex justify-between font-semibold text-emerald-700">
                          <span>🎁 Divly Wallet Credit Applied</span>
                          <span>-{formatPence(creditUsed)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>Paid</span>
                        <span className="font-medium text-slate-900">{formatPence(order.totalPaidPence)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Auto-Refunded</span>
                        <span className={order.refundedPence > 0 ? 'font-semibold text-amber-700' : 'text-slate-500'}>
                          {order.refundedPence > 0 ? `-${formatPence(order.refundedPence)}` : formatPence(0)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-slate-900">
                        <span>Net Charged</span>
                        <span>{formatPence(order.netChargedPence)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Scannable HMAC QR Pickup Pass */}
                  <div className="bg-gray-50/40 p-5 lg:col-span-5 flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
                        <QrCode className="h-4 w-4 text-emerald-600" /> Campus Hub Pickup Pass
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">HMAC-SHA256 Signed</span>
                    </div>

                    <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className={`rounded-lg border border-gray-100 bg-white p-2 ${isRefundedOrder ? 'opacity-40' : ''}`}>
                        <QRCodeSVG value={order.qrToken} size={148} level="M" />
                      </div>
                      <p className={`mt-2.5 text-center text-xs ${isRefundedOrder ? 'font-medium text-amber-800' : 'text-slate-500'}`}>
                        {isRefundedOrder
                          ? 'All slots were unfilled at cutoff and 100% refunded — no hub pickup needed.'
                          : 'Show this QR code or 6-digit PIN at the hub desk'}
                      </p>

                      <div className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Pass Code</p>
                          <p className="font-mono text-sm font-bold text-slate-900">{order.pickupCode}</p>
                        </div>
                        <div className="border-l border-gray-200 pl-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Backup PIN</p>
                          <p className="inline-flex items-center gap-1 font-mono text-sm font-bold text-emerald-700">
                            <KeyRound className="h-3.5 w-3.5" /> {order.pickupPin}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyText(order.id, order.pickupCode)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-100"
                        >
                          {copiedId === order.id ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-900">{settings?.hubName || 'UoB · The Vale Shackleton Hub'}</p>
                          <p className="text-slate-500">{settings?.hubAddress || 'Shackleton Forecourt, Edgbaston Park Rd, B15 3SZ'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1 text-slate-700 font-medium">
                        <Clock className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>Pickup Window: {settings?.pickupWindow || 'Sat 12:00–15:00'}</span>
                      </div>
                      {order.status === 'settled' && (
                        <div className="flex items-center gap-2 pt-1 text-emerald-700 font-semibold">
                          <PackageCheck className="h-4 w-4 shrink-0" />
                          <span>Ready for collection at the hub!</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
