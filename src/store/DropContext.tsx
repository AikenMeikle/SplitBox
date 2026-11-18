import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  SPLITBOX_CATALOG,
  UOB_CAMPUS_HUBS,
  fromPence,
  getCampusHubById,
  getCatalogItemById,
  toPence,
} from '../data/catalog';
import type {
  ActiveView,
  BasketPreviewSummary,
  CampusHub,
  CatalogItem,
  ClaimedSlice,
  DropStatus,
  HubId,
  OrderRecord,
  PickupPass,
  PoolFilter,
  ProductCategory,
  ProductPoolSnapshot,
  SimulateStrangersResult,
  UserOrderSliceDetail,
} from '../types';
import {
  STORAGE_KEY,
  applyCheckoutBasket,
  applySimulateStrangers,
  applyTriggerCutoff,
  buildBasketPreview,
  buildPickupPassForHub,
  buildProductPoolSnapshot,
  buildUserOrderSlices,
  clearPersistedDropState,
  createInitialPersistedState,
  createInitialUiState,
  loadPersistedDropState,
  savePersistedDropState,
  type DropUiState,
  type PersistedDropState,
} from './dropEngine';

export { STORAGE_KEY };

type DropAction =
  | { type: 'SET_SELECTED_HUB'; hubId: HubId }
  | { type: 'SET_ACTIVE_VIEW'; view: ActiveView }
  | { type: 'SET_BASKET_OPEN'; open: boolean }
  | { type: 'SET_SELECTED_CATEGORY'; category: ProductCategory | 'All' }
  | { type: 'SET_POOL_FILTER'; filter: PoolFilter }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'DISMISS_DEMO_BANNER' }
  | { type: 'ADD_TO_BASKET'; productId: string; qty: number }
  | { type: 'UPDATE_BASKET_QTY'; productId: string; qty: number }
  | { type: 'CLEAR_BASKET' }
  | {
      type: 'COMMIT_PERSISTED_TRANSITION';
      persisted: PersistedDropState;
      banner?: string | null;
      closeBasket?: boolean;
      navigateToOrders?: boolean;
    }
  | { type: 'RESET_DROP' };

function dropReducer(state: DropUiState, action: DropAction): DropUiState {
  switch (action.type) {
    case 'SET_SELECTED_HUB': {
      const updatedPass = state.pickupPass
        ? buildPickupPassForHub({
            hubId: action.hubId,
            issuedAt: state.pickupPass.issuedAt,
            fulfilledSliceCount: state.pickupPass.fulfilledSliceCount,
            refundedSliceCount: state.pickupPass.refundedSliceCount,
            finalChargedGbp: state.pickupPass.finalChargedGbp,
            totalRefundedGbp: state.pickupPass.totalRefundedGbp,
            orderCount: state.orders.length,
          })
        : null;
      return {
        ...state,
        selectedHubId: action.hubId,
        pickupPass: updatedPass,
      };
    }

    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.view };

    case 'SET_BASKET_OPEN':
      return { ...state, isBasketOpen: action.open };

    case 'SET_SELECTED_CATEGORY':
      return { ...state, selectedCategory: action.category };

    case 'SET_POOL_FILTER':
      return { ...state, poolFilter: action.filter };

    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.query };

    case 'DISMISS_DEMO_BANNER':
      return { ...state, lastDemoBanner: null };

    case 'ADD_TO_BASKET': {
      if (state.dropStatus === 'closed') return state;
      const item = getCatalogItemById(action.productId);
      if (!item || action.qty <= 0) return state;
      const prevQty = state.basket[action.productId] ?? 0;
      const nextQty = Math.min(24, prevQty + Math.floor(action.qty));
      return {
        ...state,
        basket: {
          ...state.basket,
          [action.productId]: nextQty,
        },
      };
    }

    case 'UPDATE_BASKET_QTY': {
      if (state.dropStatus === 'closed') return state;
      const item = getCatalogItemById(action.productId);
      if (!item) return state;
      const sanitized = Math.floor(action.qty);
      if (sanitized <= 0) {
        const nextBasket = { ...state.basket };
        delete nextBasket[action.productId];
        return { ...state, basket: nextBasket };
      }
      return {
        ...state,
        basket: {
          ...state.basket,
          [action.productId]: Math.min(24, sanitized),
        },
      };
    }

    case 'CLEAR_BASKET':
      return { ...state, basket: {} };

    case 'COMMIT_PERSISTED_TRANSITION':
      return {
        ...state,
        ...action.persisted,
        ...(action.closeBasket ? { isBasketOpen: false } : {}),
        ...(action.navigateToOrders ? { activeView: 'orders' } : {}),
        ...(action.banner !== undefined ? { lastDemoBanner: action.banner } : {}),
      };

    case 'RESET_DROP':
      return {
        ...createInitialUiState(createInitialPersistedState()),
        lastDemoBanner: 'Drop state reset to fresh UoB Wednesday seed pools.',
      };

    default:
      return state;
  }
}

export interface DropContextValue {
  // Static & active entities
  catalog: CatalogItem[];
  hubs: CampusHub[];
  selectedHubId: HubId;
  selectedHub: CampusHub;
  activeView: ActiveView;
  isBasketOpen: boolean;
  dropStatus: DropStatus;
  selectedCategory: ProductCategory | 'All';
  poolFilter: PoolFilter;
  searchQuery: string;
  lastDemoBanner: string | null;

  // Underlying ledger & records
  basket: Record<string, number>;
  slicesByProduct: Record<string, ClaimedSlice[]>;
  orders: OrderRecord[];
  pickupPass: PickupPass | null;

  // Totals & derived counters
  totalBasketSlices: number;
  totalUserEscrowSlices: number;
  totalUserEscrowGbp: number;

  // View-model selectors
  getProductPoolSnapshot: (productId: string) => ProductPoolSnapshot;
  getAllProductSnapshots: () => ProductPoolSnapshot[];
  getFilteredProductSnapshots: () => ProductPoolSnapshot[];
  getBasketPreview: () => BasketPreviewSummary;
  getBasketItemQty: (productId: string) => number;
  getUserOrderSlices: () => UserOrderSliceDetail[];

  // Required state actions
  setSelectedHub: (hubId: HubId) => void;
  setActiveView: (view: ActiveView) => void;
  setBasketOpen: (open: boolean) => void;
  setSelectedCategory: (category: ProductCategory | 'All') => void;
  setPoolFilter: (filter: PoolFilter) => void;
  setSearchQuery: (query: string) => void;
  dismissDemoBanner: () => void;
  addToBasket: (productId: string, qty?: number) => void;
  updateBasketQty: (productId: string, qty: number) => void;
  clearBasket: () => void;
  checkoutBasket: () => OrderRecord | null;
  simulateStrangers: () => SimulateStrangersResult;
  triggerCutoff: () => PickupPass;
  resetDrop: () => void;
}

const DropContext = createContext<DropContextValue | null>(null);

export function DropProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dropReducer, undefined, () =>
    createInitialUiState(loadPersistedDropState())
  );

  // Keep a synchronous ref of the latest state so imperative return-value actions
  // (`checkoutBasket`, `simulateStrangers`, `triggerCutoff`) always operate on the
  // exact freshest state even when invoked back-to-back in one event handler.
  const stateRef = useRef<DropUiState>(state);
  stateRef.current = state;

  useEffect(() => {
    savePersistedDropState(state);
  }, [
    state.selectedHubId,
    state.dropStatus,
    state.basket,
    state.slicesByProduct,
    state.orders,
    state.pickupPass,
    state.simulationStep,
  ]);

  const setSelectedHub = useCallback((hubId: HubId) => {
    dispatch({ type: 'SET_SELECTED_HUB', hubId });
  }, []);

  const setActiveView = useCallback((view: ActiveView) => {
    dispatch({ type: 'SET_ACTIVE_VIEW', view });
  }, []);

  const setBasketOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_BASKET_OPEN', open });
  }, []);

  const setSelectedCategory = useCallback((category: ProductCategory | 'All') => {
    dispatch({ type: 'SET_SELECTED_CATEGORY', category });
  }, []);

  const setPoolFilter = useCallback((filter: PoolFilter) => {
    dispatch({ type: 'SET_POOL_FILTER', filter });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', query });
  }, []);

  const dismissDemoBanner = useCallback(() => {
    dispatch({ type: 'DISMISS_DEMO_BANNER' });
  }, []);

  const addToBasket = useCallback((productId: string, qty = 1) => {
    dispatch({ type: 'ADD_TO_BASKET', productId, qty });
  }, []);

  const updateBasketQty = useCallback((productId: string, qty: number) => {
    dispatch({ type: 'UPDATE_BASKET_QTY', productId, qty });
  }, []);

  const clearBasket = useCallback(() => {
    dispatch({ type: 'CLEAR_BASKET' });
  }, []);

  const checkoutBasket = useCallback((): OrderRecord | null => {
    const current = stateRef.current;
    const { nextState, order } = applyCheckoutBasket(current);
    if (!order) return null;

    savePersistedDropState(nextState);
    const nextUi: DropUiState = {
      ...current,
      ...nextState,
      isBasketOpen: false,
      lastDemoBanner: `Locked ${order.sliceIds.length} slice${order.sliceIds.length === 1 ? '' : 's'} in escrow (${order.id}) · £0.00 fees.`,
    };
    stateRef.current = nextUi;

    dispatch({
      type: 'COMMIT_PERSISTED_TRANSITION',
      persisted: nextState,
      closeBasket: true,
      banner: nextUi.lastDemoBanner,
    });

    return order;
  }, []);

  const simulateStrangers = useCallback((): SimulateStrangersResult => {
    const current = stateRef.current;
    const { nextState, result } = applySimulateStrangers(current);
    savePersistedDropState(nextState);

    const nextUi: DropUiState = {
      ...current,
      ...nextState,
      lastDemoBanner: result.summary,
    };
    stateRef.current = nextUi;

    dispatch({
      type: 'COMMIT_PERSISTED_TRANSITION',
      persisted: nextState,
      banner: result.summary,
    });

    return result;
  }, []);

  const triggerCutoff = useCallback((): PickupPass => {
    const current = stateRef.current;
    const { nextState, pickupPass } = applyTriggerCutoff(current);
    savePersistedDropState(nextState);

    const banner = `Drop cutoff resolved: ${pickupPass.fulfilledSliceCount} fulfilled, ${pickupPass.refundedSliceCount} auto-refunded · Pass ${pickupPass.pickupCode}`;
    const nextUi: DropUiState = {
      ...current,
      ...nextState,
      isBasketOpen: false,
      activeView: 'orders',
      lastDemoBanner: banner,
    };
    stateRef.current = nextUi;

    dispatch({
      type: 'COMMIT_PERSISTED_TRANSITION',
      persisted: nextState,
      closeBasket: true,
      navigateToOrders: true,
      banner,
    });

    return pickupPass;
  }, []);

  const resetDrop = useCallback(() => {
    clearPersistedDropState();
    const freshPersisted = createInitialPersistedState();
    savePersistedDropState(freshPersisted);
    stateRef.current = createInitialUiState(freshPersisted);
    dispatch({ type: 'RESET_DROP' });
  }, []);

  const allSnapshots = useMemo(() => {
    return SPLITBOX_CATALOG.map((item) => buildProductPoolSnapshot(state, item));
  }, [state.dropStatus, state.basket, state.slicesByProduct]);

  const snapshotMap = useMemo(() => {
    const map = new Map<string, ProductPoolSnapshot>();
    for (const snap of allSnapshots) {
      map.set(snap.item.id, snap);
    }
    return map;
  }, [allSnapshots]);

  const getProductPoolSnapshot = useCallback(
    (productId: string): ProductPoolSnapshot => {
      const found = snapshotMap.get(productId);
      if (found) return found;
      const fallbackItem = getCatalogItemById(productId) ?? SPLITBOX_CATALOG[0];
      return buildProductPoolSnapshot(stateRef.current, fallbackItem);
    },
    [snapshotMap]
  );

  const getAllProductSnapshots = useCallback(
    () => allSnapshots,
    [allSnapshots]
  );

  const getFilteredProductSnapshots = useCallback((): ProductPoolSnapshot[] => {
    const q = state.searchQuery.trim().toLowerCase();
    return allSnapshots.filter((snap) => {
      if (state.selectedCategory !== 'All' && snap.item.category !== state.selectedCategory) {
        return false;
      }
      if (state.poolFilter === 'closing-soon') {
        const rem = snap.activeBox.slicesRemaining;
        const isClosingSoon =
          snap.activeBox.claimedCount > 0 &&
          (rem === 1 || (rem === 2 && snap.activeBox.totalSlices >= 6));
        if (!isClosingSoon) return false;
      } else if (state.poolFilter === 'locked-by-me') {
        if (snap.userTotalLockedSlices <= 0 && snap.basketQuantity <= 0) {
          return false;
        }
      }
      if (q) {
        const haystack = `${snap.item.name} ${snap.item.brand} ${snap.item.category} ${snap.item.sliceUnitDescription}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allSnapshots, state.selectedCategory, state.poolFilter, state.searchQuery]);

  const basketPreview = useMemo(
    () => buildBasketPreview(state),
    [state.dropStatus, state.basket, state.slicesByProduct]
  );

  const getBasketPreview = useCallback(() => basketPreview, [basketPreview]);

  const getBasketItemQty = useCallback(
    (productId: string) => (state.dropStatus === 'open' ? state.basket[productId] ?? 0 : 0),
    [state.dropStatus, state.basket]
  );

  const userOrderSlices = useMemo(
    () => buildUserOrderSlices(state),
    [state.dropStatus, state.slicesByProduct, state.orders]
  );

  const getUserOrderSlices = useCallback(() => userOrderSlices, [userOrderSlices]);

  const { totalUserEscrowSlices, totalUserEscrowGbp } = useMemo(() => {
    let count = 0;
    let pence = 0;
    for (const detail of userOrderSlices) {
      if (state.dropStatus === 'open' || detail.status === 'fulfilled') {
        count += 1;
        pence += toPence(detail.slicePriceGbp);
      }
    }
    return {
      totalUserEscrowSlices: count,
      totalUserEscrowGbp: fromPence(pence),
    };
  }, [userOrderSlices, state.dropStatus]);

  const selectedHub = useMemo(
    () => getCampusHubById(state.selectedHubId),
    [state.selectedHubId]
  );

  const value = useMemo<DropContextValue>(
    () => ({
      catalog: SPLITBOX_CATALOG,
      hubs: UOB_CAMPUS_HUBS,
      selectedHubId: state.selectedHubId,
      selectedHub,
      activeView: state.activeView,
      isBasketOpen: state.isBasketOpen,
      dropStatus: state.dropStatus,
      selectedCategory: state.selectedCategory,
      poolFilter: state.poolFilter,
      searchQuery: state.searchQuery,
      lastDemoBanner: state.lastDemoBanner,
      basket: state.basket,
      slicesByProduct: state.slicesByProduct,
      orders: state.orders,
      pickupPass: state.pickupPass,
      totalBasketSlices: basketPreview.totalSlices,
      totalUserEscrowSlices,
      totalUserEscrowGbp,
      getProductPoolSnapshot,
      getAllProductSnapshots,
      getFilteredProductSnapshots,
      getBasketPreview,
      getBasketItemQty,
      getUserOrderSlices,
      setSelectedHub,
      setActiveView,
      setBasketOpen,
      setSelectedCategory,
      setPoolFilter,
      setSearchQuery,
      dismissDemoBanner,
      addToBasket,
      updateBasketQty,
      clearBasket,
      checkoutBasket,
      simulateStrangers,
      triggerCutoff,
      resetDrop,
    }),
    [
      state.selectedHubId,
      selectedHub,
      state.activeView,
      state.isBasketOpen,
      state.dropStatus,
      state.selectedCategory,
      state.poolFilter,
      state.searchQuery,
      state.lastDemoBanner,
      state.basket,
      state.slicesByProduct,
      state.orders,
      state.pickupPass,
      basketPreview.totalSlices,
      totalUserEscrowSlices,
      totalUserEscrowGbp,
      getProductPoolSnapshot,
      getAllProductSnapshots,
      getFilteredProductSnapshots,
      getBasketPreview,
      getBasketItemQty,
      getUserOrderSlices,
      setSelectedHub,
      setActiveView,
      setBasketOpen,
      setSelectedCategory,
      setPoolFilter,
      setSearchQuery,
      dismissDemoBanner,
      addToBasket,
      updateBasketQty,
      clearBasket,
      checkoutBasket,
      simulateStrangers,
      triggerCutoff,
      resetDrop,
    ]
  );

  return <DropContext.Provider value={value}>{children}</DropContext.Provider>;
}

export function useDrop(): DropContextValue {
  const ctx = useContext(DropContext);
  if (!ctx) {
    throw new Error('useDrop() must be used inside a <DropProvider>');
  }
  return ctx;
}
