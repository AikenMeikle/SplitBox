/**
 * Global React state & real-time Server-Sent Events (SSE) synchronisation for Divly.
 *
 * What this file manages:
 * 1. Live drop settings & bulk pool counts (`GET /api/state`)
 * 2. Student / Admin authentication + wallet credits (`GET /api/auth/me`)
 * 3. Student's active & past orders (`GET /api/orders/mine`)
 * 4. Shopping basket persisted in `localStorage['divly_basket']`
 * 5. Referral code capture (`?ref=UOB-...` -> `localStorage['divly_ref_code']`)
 *    and deep-linked product pool highlight (`?product=<id>`)
 * 6. Live SSE stream (`/api/events`) for `pool_updated`, `drop_updated`,
 *    `products_updated`, and `requests_updated`
 * 7. Stripe Checkout return verification (`?checkout=success&session_id=...`)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser, DropSettings, Order, ProductWithPool } from '../shared/types';
import { apiFetch, getAuthToken, setAuthToken } from '../lib/api';

export type ActiveTab = 'shop' | 'orders' | 'admin';

const BASKET_STORAGE_KEY = 'divly_basket';
export const REFERRAL_STORAGE_KEY = 'divly_ref_code';

interface StateResponse {
  settings: DropSettings;
  products: ProductWithPool[];
  stripeConfigured: boolean;
  devMode: boolean;
}

/** Read any captured `?ref=UOB-...` referral code from localStorage. */
export function getStoredReferralCode(): string | null {
  try {
    const raw = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
    return raw ? raw.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

export interface AppContextValue {
  settings: DropSettings | null;
  products: ProductWithPool[];
  user: AuthUser | null;
  orders: Order[];
  loading: boolean;
  devMode: boolean;
  stripeConfigured: boolean;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isBasketOpen: boolean;
  setIsBasketOpen: (open: boolean) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  basket: Record<string, number>;
  basketCount: number;
  addToBasket: (productId: string, delta?: number) => void;
  setBasketQty: (productId: string, qty: number) => void;
  clearBasket: () => void;
  refreshState: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  loginWithToken: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  pendingReferralCode: string | null;
  highlightedProductId: string | null;
  clearHighlightedProduct: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Safely load saved basket quantities from localStorage. */
function loadSavedBasket(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(BASKET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const clean: Record<string, number> = {};
    for (const [productId, value] of Object.entries(parsed)) {
      const qty = typeof value === 'number' ? Math.floor(value) : 0;
      if (productId && qty > 0 && qty <= 24) {
        clean[productId] = qty;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DropSettings | null>(null);
  const [products, setProducts] = useState<ProductWithPool[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [devMode, setDevMode] = useState<boolean>(false);
  const [stripeConfigured, setStripeConfigured] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('shop');
  const [isBasketOpen, setIsBasketOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [basket, setBasket] = useState<Record<string, number>>(loadSavedBasket);
  const [pendingReferralCode, setPendingReferralCode] = useState<string | null>(
    getStoredReferralCode
  );
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  // Ref lets SSE listener check login state without re-opening the EventSource
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  // Persist basket changes to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(basket));
    } catch {
      // Ignore private-browsing storage errors
    }
  }, [basket]);

  const basketCount = useMemo(
    () => Object.values(basket).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0),
    [basket]
  );

  const setBasketQty = useCallback((productId: string, qty: number) => {
    const safeQty = Number.isFinite(qty) ? Math.min(24, Math.floor(qty)) : 0;
    setBasket((prev) => {
      if (safeQty <= 0) {
        if (!(productId in prev)) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: safeQty };
    });
  }, []);

  const addToBasket = useCallback((productId: string, delta = 1) => {
    setBasket((prev) => {
      const current = prev[productId] ?? 0;
      const nextQty = Math.min(24, Math.floor(current + delta));
      if (nextQty <= 0) {
        if (!(productId in prev)) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: nextQty };
    });
  }, []);

  const clearBasket = useCallback(() => {
    setBasket({});
  }, []);

  const clearHighlightedProduct = useCallback(() => {
    setHighlightedProductId(null);
  }, []);

  const refreshState = useCallback(async () => {
    let data: StateResponse;
    try {
      data = await apiFetch<StateResponse>('/api/state');
    } catch {
      // Retry once after a short pause in case local `tsx watch` is mid-reload
      await new Promise((resolve) => setTimeout(resolve, 350));
      data = await apiFetch<StateResponse>('/api/state');
    }
    setSettings(data.settings);
    setProducts(data.products);
    setStripeConfigured(Boolean(data.stripeConfigured));
    setDevMode(Boolean(data.devMode));
  }, []);

  const refreshOrders = useCallback(async () => {
    if (!getAuthToken()) {
      setOrders([]);
      return;
    }
    try {
      const [ordersRes, meRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>('/api/orders/mine'),
        apiFetch<{ user: AuthUser | null }>('/api/auth/me').catch(() => ({ user: null })),
      ]);
      setOrders(ordersRes.orders);
      if (meRes.user) {
        setUser(meRes.user);
      }
    } catch {
      setOrders([]);
    }
  }, []);

  const loginWithToken = useCallback((token: string, nextUser: AuthUser) => {
    setAuthToken(token);
    setUser(nextUser);
    setIsAuthModalOpen(false);
    if (nextUser.role !== 'admin') {
      setActiveTab((prev) => (prev === 'admin' ? 'shop' : prev));
    }
    void apiFetch<{ orders: Order[] }>('/api/orders/mine')
      .then((res) => setOrders(res.orders))
      .catch(() => setOrders([]));
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getAuthToken()) {
        await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Clear client session even if server session already expired
    } finally {
      setAuthToken(null);
      setUser(null);
      setOrders([]);
      setActiveTab((prev) => (prev === 'admin' ? 'shop' : prev));
    }
  }, []);

  // Reset user state automatically if any protected API call receives 401
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setOrders([]);
      setActiveTab((prev) => (prev === 'admin' ? 'shop' : prev));
    };
    window.addEventListener('divly:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('divly:unauthorized', handleUnauthorized);
  }, []);

  // Initial load + URL query params (`?ref=`, `?product=`, `?checkout=`)
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const params = new URLSearchParams(window.location.search);
        const refParam = params.get('ref')?.trim().toUpperCase();
        const productParam = params.get('product')?.trim();
        const checkoutStatus = params.get('checkout');
        const sessionId = params.get('session_id');

        if (refParam && /^[A-Z0-9-]{4,24}$/.test(refParam)) {
          try {
            window.localStorage.setItem(REFERRAL_STORAGE_KEY, refParam);
          } catch {
            // Ignore private-browsing storage errors
          }
          setPendingReferralCode(refParam);
        }

        if (productParam) {
          setHighlightedProductId(productParam);
          setActiveTab('shop');
        }

        await refreshState();

        if (getAuthToken()) {
          const me = await apiFetch<{ user: AuthUser | null }>('/api/auth/me').catch(() => ({
            user: null,
          }));
          if (!cancelled) {
            if (me.user) {
              setUser(me.user);
              await refreshOrders();
            } else {
              setAuthToken(null);
            }
          }
        }

        // Check if returning from a live Stripe Checkout redirect
        if (checkoutStatus === 'success' && sessionId) {
          window.history.replaceState({}, '', window.location.pathname);
          await apiFetch<{ order: Order }>(
            `/api/checkout/verify-session?session_id=${encodeURIComponent(sessionId)}`
          ).catch(() => null);
          if (!cancelled) {
            clearBasket();
            await Promise.all([refreshState(), refreshOrders()]);
            setActiveTab('orders');
          }
        } else if (checkoutStatus === 'cancelled') {
          window.history.replaceState({}, '', window.location.pathname);
          if (!cancelled) {
            setIsBasketOpen(true);
          }
        } else if (refParam || productParam) {
          // Clean share query parameters after capturing so refreshing stays clean
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (err) {
        console.error('Failed to bootstrap Divly state:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearBasket, refreshOrders, refreshState]);

  // Real-time Server-Sent Events subscription (`/api/events`)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    const eventSource = new EventSource('/api/events');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (
          payload.type === 'pool_updated' ||
          payload.type === 'drop_updated' ||
          payload.type === 'products_updated'
        ) {
          void refreshState();
          if (userRef.current || getAuthToken()) {
            void refreshOrders();
          }
        } else if (payload.type === 'requests_updated') {
          window.dispatchEvent(new CustomEvent('divly:requests-updated'));
        }
      } catch {
        // Ignore heartbeat or non-JSON SSE frames
      }
    };

    return () => {
      eventSource.close();
    };
  }, [refreshOrders, refreshState]);

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      products,
      user,
      orders,
      loading,
      devMode,
      stripeConfigured,
      activeTab,
      setActiveTab,
      isBasketOpen,
      setIsBasketOpen,
      isAuthModalOpen,
      setIsAuthModalOpen,
      basket,
      basketCount,
      addToBasket,
      setBasketQty,
      clearBasket,
      refreshState,
      refreshOrders,
      loginWithToken,
      logout,
      pendingReferralCode,
      highlightedProductId,
      clearHighlightedProduct,
    }),
    [
      settings,
      products,
      user,
      orders,
      loading,
      devMode,
      stripeConfigured,
      activeTab,
      isBasketOpen,
      isAuthModalOpen,
      basket,
      basketCount,
      addToBasket,
      setBasketQty,
      clearBasket,
      refreshState,
      refreshOrders,
      loginWithToken,
      logout,
      pendingReferralCode,
      highlightedProductId,
      clearHighlightedProduct,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp() must be used inside <AppProvider>.');
  }
  return ctx;
}
