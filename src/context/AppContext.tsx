/**
 * Global React state & real-time Server-Sent Events (SSE) synchronisation for Divly.
 *
 * What this file manages:
 * 1. Live drop settings & bulk pool counts (`GET /api/state`)
 * 2. Student / Admin authentication (`GET /api/auth/me`, token login, logout)
 * 3. Student's active & past orders (`GET /api/orders/mine`)
 * 4. Shopping basket persisted in `localStorage['divly_basket']`
 * 5. Live SSE stream (`/api/events`) so pool bars update automatically across tabs
 * 6. Stripe Checkout return verification (`?checkout=success&session_id=...`)
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

interface StateResponse {
  settings: DropSettings;
  products: ProductWithPool[];
  stripeConfigured: boolean;
  devMode: boolean;
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
      if (productId && qty > 0 && qty <= 99) {
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
    const safeQty = Number.isFinite(qty) ? Math.min(99, Math.floor(qty)) : 0;
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
      const nextQty = Math.min(99, Math.floor(current + delta));
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

  const refreshState = useCallback(async () => {
    const data = await apiFetch<StateResponse>('/api/state');
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
      const data = await apiFetch<{ orders: Order[] }>('/api/orders/mine');
      setOrders(data.orders);
    } catch {
      setOrders([]);
    }
  }, []);

  const loginWithToken = useCallback(
    (token: string, nextUser: AuthUser) => {
      setAuthToken(token);
      setUser(nextUser);
      setIsAuthModalOpen(false);
      void apiFetch<{ orders: Order[] }>('/api/orders/mine')
        .then((res) => setOrders(res.orders))
        .catch(() => setOrders([]));
    },
    []
  );

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

  // Initial load + Stripe Checkout redirect verification (`?checkout=success&session_id=...`)
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
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
        const params = new URLSearchParams(window.location.search);
        const checkoutStatus = params.get('checkout');
        const sessionId = params.get('session_id');

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
