/**
 * Sticky top grocery navigation bar for Divly.
 *
 * Includes:
 * - Divly brand lockup & active University of Birmingham pickup hub pill
 * - Real-time ticking countdown timer to `settings.cutoffAtIso`
 * - Navigation tabs (`Shop Bulk Pools`, `My Orders & Pass`, `Admin`)
 * - Optional 1-click Dev Login bar (shown ONLY when backend reports `devMode === true`)
 * - Student/Admin account pill & live Trolley button with item count and subtotal
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingBasket,
  Store,
  User,
  Zap,
} from 'lucide-react';
import { BRAND_NAME } from '../config/brand';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';
import { formatPence, type AuthUser } from '../shared/types';

/** Format milliseconds remaining until cutoff into a compact live countdown string. */
function formatCountdown(cutoffAtIso: string | undefined, nowMs: number): string {
  if (!cutoffAtIso) return 'Loading cutoff…';
  const targetMs = Date.parse(cutoffAtIso);
  if (Number.isNaN(targetMs)) return 'Weekly cutoff';

  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  if (diffSec <= 0) return 'Cutoff reached';

  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
  }
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function Navbar() {
  const {
    settings,
    products,
    user,
    orders,
    devMode,
    activeTab,
    setActiveTab,
    setIsBasketOpen,
    setIsAuthModalOpen,
    basket,
    basketCount,
    loginWithToken,
    logout,
  } = useApp();

  // Live ticking clock updated once per second for the drop cutoff timer
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [devBusy, setDevBusy] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Compute basket subtotal in integer pence from current product share prices
  const basketSubtotalPence = useMemo(() => {
    let sum = 0;
    for (const [productId, qty] of Object.entries(basket)) {
      if (qty <= 0) continue;
      const item = products.find((p) => p.id === productId);
      if (item) {
        sum += item.sharePricePence * qty;
      }
    }
    return sum;
  }, [basket, products]);

  const isClosed = settings?.dropStatus === 'closed';
  const countdownText = isClosed
    ? 'Drop Closed · Settled'
    : formatCountdown(settings?.cutoffAtIso, nowMs);

  async function handleQuickDevLogin(role: 'student' | 'admin', persona?: string) {
    const key = `${role}:${persona ?? 'default'}`;
    setDevBusy(key);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ role, persona }),
      });
      loginWithToken(res.token, res.user);
      if (role === 'admin') {
        setActiveTab('admin');
      }
    } catch (err) {
      console.error('Dev login failed:', err);
    } finally {
      setDevBusy(null);
    }
  }

  function openAuthWithMode(mode: 'student' | 'admin') {
    window.dispatchEvent(new CustomEvent('divly:auth-tab', { detail: mode }));
    setIsAuthModalOpen(true);
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
      {/* Subtle 1-Click Test Login strip — strictly rendered ONLY when devMode === true */}
      {devMode && (
        <div className="bg-emerald-950 text-emerald-50 text-xs border-b border-emerald-900">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-200">
              <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Local Dev Mode — 1-Click Test Login:</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={devBusy !== null}
                onClick={() => void handleQuickDevLogin('student', 'Alex (Vale)')}
                className="px-2.5 py-0.5 rounded-full bg-emerald-800/80 hover:bg-emerald-700 text-white font-semibold cursor-pointer transition-colors disabled:opacity-50"
              >
                {devBusy === 'student:Alex (Vale)' ? 'Signing in…' : 'Student 1'}
              </button>
              <button
                type="button"
                disabled={devBusy !== null}
                onClick={() => void handleQuickDevLogin('student', 'Priya (Selly Oak)')}
                className="px-2.5 py-0.5 rounded-full bg-emerald-800/80 hover:bg-emerald-700 text-white font-semibold cursor-pointer transition-colors disabled:opacity-50"
              >
                {devBusy === 'student:Priya (Selly Oak)' ? 'Signing in…' : 'Student 2'}
              </button>
              <button
                type="button"
                disabled={devBusy !== null}
                onClick={() => void handleQuickDevLogin('admin')}
                className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/30 text-amber-200 font-semibold cursor-pointer transition-colors disabled:opacity-50"
              >
                {devBusy === 'admin:default' ? 'Signing in…' : 'Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Header Row */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Logo + Hub & Live Cutoff Pills */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <button
            type="button"
            onClick={() => setActiveTab('shop')}
            className="inline-flex items-center gap-2.5 shrink-0 cursor-pointer text-left focus:outline-none"
          >
            <img
              src="/icon.svg"
              alt={BRAND_NAME}
              width={36}
              height={36}
              className="w-9 h-9 rounded-xl shrink-0"
            />
            <span className="text-xl sm:text-2xl font-extrabold tracking-wide text-gray-900">
              {BRAND_NAME === 'Divly' ? (
                <>
                  Div<span className="text-emerald-600">ly</span>
                </>
              ) : (
                BRAND_NAME
              )}
            </span>
          </button>

          {settings && (
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="badge-slate" title={settings.hubAddress}>
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{settings.hubShortLabel || settings.hubName}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">{settings.pickupWindow}</span>
              </span>
              <span className={isClosed ? 'badge-amber' : 'badge-green'}>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>{isClosed ? countdownText : `Closes in ${countdownText}`}</span>
              </span>
            </div>
          )}
        </div>

        {/* Right: User Auth Controls + Trolley Button */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs sm:text-sm">
              <User className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="font-semibold text-gray-800 max-w-[92px] sm:max-w-[150px] truncate">
                {user.name || user.email.split('@')[0]}
              </span>
              {user.role === 'admin' && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  Admin
                </span>
              )}
              <button
                type="button"
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
                className="p-1 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-200/70 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openAuthWithMode('student')}
                className="btn-secondary !py-1.5 !px-3 !text-xs sm:!text-sm"
              >
                <User className="w-4 h-4 text-gray-500" />
                <span>Sign in</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthWithMode('admin')}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 cursor-pointer transition-colors"
                title="Founder / Admin hub login"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </div>
          )}

          {/* Trolley Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsBasketOpen(true)}
            className="btn-primary !py-1.5 !px-3 sm:!px-3.5 tabular-nums"
            aria-label="Open trolley"
          >
            <ShoppingBasket className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Trolley</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-800/70 text-white text-xs font-bold">
              <span>{basketCount}</span>
              {basketSubtotalPence > 0 && (
                <>
                  <span className="opacity-60">·</span>
                  <span>{formatPence(basketSubtotalPence)}</span>
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Sub-Header Bar: Navigation Tabs + Mobile Live Hub/Timer Info */}
      <div className="border-t border-gray-100 bg-gray-50/70">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1.5" aria-label="Main navigation">
            <button
              type="button"
              onClick={() => setActiveTab('shop')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'shop'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <Store className="w-4 h-4 shrink-0" />
              <span>Shop Bulk Pools</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'orders'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              <Package className="w-4 h-4 shrink-0" />
              <span>My Orders &amp; Pass</span>
              {orders.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold tabular-nums ${
                    activeTab === 'orders'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {orders.length}
                </span>
              )}
            </button>

            {user?.role === 'admin' ? (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  activeTab === 'admin'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Admin Ops</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthWithMode('admin')}
                className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Admin</span>
              </button>
            )}
          </nav>

          {/* Compact Hub & Live Timer visible on mobile/tablet below lg */}
          {settings && (
            <div className="flex lg:hidden items-center gap-2 py-1 text-[11px] sm:text-xs text-gray-600 tabular-nums">
              <span className="inline-flex items-center gap-1 font-medium text-gray-700 truncate max-w-[165px] sm:max-w-none">
                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">{settings.hubShortLabel || settings.hubName}</span>
              </span>
              <span className="text-gray-300">·</span>
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  isClosed ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                <Clock className="w-3 h-3 shrink-0" />
                <span>{countdownText}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
