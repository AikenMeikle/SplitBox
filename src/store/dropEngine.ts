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
  BasketLinePreview,
  BasketPreviewSummary,
  BoxSummary,
  CatalogItem,
  ClaimedSlice,
  DropStatus,
  HubId,
  OrderRecord,
  PickupPass,
  PoolFilter,
  ProductCategory,
  ProductLifecycleState,
  ProductPoolSnapshot,
  SimulateStrangersResult,
  SliceLifecycleStatus,
  UserOrderSliceDetail,
  WedgeState,
} from '../types';

export const STORAGE_KEY = 'splitbox_uob_drop_v1';
export const SCHEMA_VERSION = 1;

const SEED_TIMESTAMP = '2026-11-18T09:00:00.000Z';

export interface PersistedDropState {
  schemaVersion: number;
  selectedHubId: HubId;
  dropStatus: DropStatus;
  basket: Record<string, number>;
  slicesByProduct: Record<string, ClaimedSlice[]>;
  orders: OrderRecord[];
  pickupPass: PickupPass | null;
  simulationStep: number;
}

export interface DropUiState extends PersistedDropState {
  activeView: ActiveView;
  isBasketOpen: boolean;
  selectedCategory: ProductCategory | 'All';
  poolFilter: PoolFilter;
  searchQuery: string;
  lastDemoBanner: string | null;
}

/**
 * Allocates `quantity` slices sequentially onto `existingSlices` for `productId`
 * strictly first-come, first-served:
 *   boxNumber = Math.floor(globalSlotIndex / totalSlicesPerBox) + 1
 *   slotIndexInBox = globalSlotIndex % totalSlicesPerBox
 */
export function allocateSequentialSlices(params: {
  existingSlices: ClaimedSlice[];
  productId: string;
  totalSlicesPerBox: number;
  quantity: number;
  owner: 'stranger' | 'user';
  claimedAt: string;
  orderId?: string;
}): { updatedSlices: ClaimedSlice[]; addedSlices: ClaimedSlice[] } {
  const {
    existingSlices,
    productId,
    totalSlicesPerBox,
    quantity,
    owner,
    claimedAt,
    orderId,
  } = params;

  if (quantity <= 0) {
    return { updatedSlices: existingSlices, addedSlices: [] };
  }

  const startIndex = existingSlices.length;
  const addedSlices: ClaimedSlice[] = [];

  for (let i = 0; i < quantity; i += 1) {
    const globalSlotIndex = startIndex + i;
    const boxNumber = Math.floor(globalSlotIndex / totalSlicesPerBox) + 1;
    const slotIndexInBox = globalSlotIndex % totalSlicesPerBox;
    addedSlices.push({
      id: `${productId}-slot-${globalSlotIndex + 1}`,
      productId,
      owner,
      ...(orderId ? { orderId } : {}),
      claimedAt,
      globalSlotIndex,
      boxNumber,
      slotIndexInBox,
    });
  }

  return {
    updatedSlices: [...existingSlices, ...addedSlices],
    addedSlices,
  };
}

export function createInitialPersistedState(): PersistedDropState {
  const slicesByProduct: Record<string, ClaimedSlice[]> = {};

  for (const item of SPLITBOX_CATALOG) {
    const { updatedSlices } = allocateSequentialSlices({
      existingSlices: [],
      productId: item.id,
      totalSlicesPerBox: item.totalSlicesPerBox,
      quantity: item.initialStrangerSlices,
      owner: 'stranger',
      claimedAt: SEED_TIMESTAMP,
    });
    slicesByProduct[item.id] = updatedSlices;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    selectedHubId: UOB_CAMPUS_HUBS[0].id,
    dropStatus: 'open',
    basket: {},
    slicesByProduct,
    orders: [],
    pickupPass: null,
    simulationStep: 0,
  };
}

export function createInitialUiState(persisted?: PersistedDropState): DropUiState {
  const base = persisted ?? createInitialPersistedState();
  return {
    ...base,
    activeView: 'storefront',
    isBasketOpen: false,
    selectedCategory: 'All',
    poolFilter: 'all',
    searchQuery: '',
    lastDemoBanner: null,
  };
}

function isValidHubId(value: unknown): value is HubId {
  return UOB_CAMPUS_HUBS.some((h) => h.id === value);
}

export function loadPersistedDropState(): PersistedDropState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInitialPersistedState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialPersistedState();
    }
    const parsed = JSON.parse(raw) as Partial<PersistedDropState>;
    if (
      !parsed ||
      parsed.schemaVersion !== SCHEMA_VERSION ||
      !isValidHubId(parsed.selectedHubId) ||
      (parsed.dropStatus !== 'open' && parsed.dropStatus !== 'closed') ||
      typeof parsed.slicesByProduct !== 'object' ||
      parsed.slicesByProduct === null ||
      !Array.isArray(parsed.orders)
    ) {
      return createInitialPersistedState();
    }

    // Ensure all catalog items exist in slicesByProduct
    const fallback = createInitialPersistedState();
    const mergedSlices: Record<string, ClaimedSlice[]> = {
      ...fallback.slicesByProduct,
    };
    for (const item of SPLITBOX_CATALOG) {
      const candidate = parsed.slicesByProduct[item.id];
      if (Array.isArray(candidate)) {
        mergedSlices[item.id] = candidate;
      }
    }

    const sanitizedBasket: Record<string, number> = {};
    if (parsed.basket && typeof parsed.basket === 'object' && parsed.dropStatus === 'open') {
      for (const [productId, qty] of Object.entries(parsed.basket)) {
        if (typeof qty === 'number' && Number.isFinite(qty) && qty > 0 && getCatalogItemById(productId)) {
          sanitizedBasket[productId] = Math.floor(qty);
        }
      }
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      selectedHubId: parsed.selectedHubId,
      dropStatus: parsed.dropStatus,
      basket: sanitizedBasket,
      slicesByProduct: mergedSlices,
      orders: parsed.orders,
      pickupPass: parsed.pickupPass ?? null,
      simulationStep: typeof parsed.simulationStep === 'number' ? parsed.simulationStep : 0,
    };
  } catch {
    return createInitialPersistedState();
  }
}

export function savePersistedDropState(state: PersistedDropState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const payload: PersistedDropState = {
      schemaVersion: SCHEMA_VERSION,
      selectedHubId: state.selectedHubId,
      dropStatus: state.dropStatus,
      basket: state.basket,
      slicesByProduct: state.slicesByProduct,
      orders: state.orders,
      pickupPass: state.pickupPass,
      simulationStep: state.simulationStep,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / privacy mode errors gracefully
  }
}

export function clearPersistedDropState(): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function buildBoxSummaryForNumber(params: {
  productId: string;
  boxNumber: number;
  totalSlices: number;
  committedSlices: ClaimedSlice[];
  effectiveBasketQty: number;
}): BoxSummary {
  const { productId, boxNumber, totalSlices, committedSlices, effectiveBasketQty } = params;
  const startGlobal = (boxNumber - 1) * totalSlices;
  const committedLen = committedSlices.length;
  const previewEndGlobal = committedLen + effectiveBasketQty;

  let strangerSlices = 0;
  let userLockedSlices = 0;
  let basketPreviewSlices = 0;
  const wedgeStates: WedgeState[] = [];

  for (let slot = 0; slot < totalSlices; slot += 1) {
    const globalIdx = startGlobal + slot;
    if (globalIdx < committedLen) {
      const slice = committedSlices[globalIdx];
      if (slice.owner === 'user') {
        userLockedSlices += 1;
        wedgeStates.push('user_locked');
      } else {
        strangerSlices += 1;
        wedgeStates.push('stranger');
      }
    } else if (globalIdx < previewEndGlobal) {
      basketPreviewSlices += 1;
      wedgeStates.push('basket_preview');
    } else {
      wedgeStates.push('open');
    }
  }

  const claimedCount = strangerSlices + userLockedSlices;
  const isLockedFull = claimedCount === totalSlices;
  const slicesRemaining = Math.max(0, totalSlices - claimedCount);

  return {
    productId,
    boxNumber,
    totalSlices,
    claimedCount,
    strangerSlices,
    userLockedSlices,
    basketPreviewSlices,
    isLockedFull,
    slicesRemaining,
    wedgeStates,
  };
}

export function buildProductPoolSnapshot(
  state: Pick<PersistedDropState, 'dropStatus' | 'basket' | 'slicesByProduct'>,
  item: CatalogItem
): ProductPoolSnapshot {
  const committedSlices = state.slicesByProduct[item.id] ?? [];
  const totalSlices = item.totalSlicesPerBox;
  const committedCount = committedSlices.length;
  const lockedFullBoxCount = Math.floor(committedCount / totalSlices);
  const rawBasketQty = state.basket[item.id] ?? 0;
  const basketQuantity = state.dropStatus === 'open' ? Math.max(0, rawBasketQty) : 0;

  const userTotalLockedSlices = committedSlices.reduce(
    (sum, s) => (s.owner === 'user' ? sum + 1 : sum),
    0
  );

  // Determine how many boxes to materialize in `allBoxes`
  const totalWithPreview = committedCount + basketQuantity;
  let maxBoxNumber: number;

  if (state.dropStatus === 'open') {
    maxBoxNumber = Math.max(
      lockedFullBoxCount + 1,
      Math.ceil(totalWithPreview / totalSlices)
    );
  } else {
    maxBoxNumber = Math.max(1, Math.ceil(committedCount / totalSlices));
  }

  const allBoxes: BoxSummary[] = [];
  for (let b = 1; b <= maxBoxNumber; b += 1) {
    allBoxes.push(
      buildBoxSummaryForNumber({
        productId: item.id,
        boxNumber: b,
        totalSlices,
        committedSlices,
        effectiveBasketQty: basketQuantity,
      })
    );
  }

  // Active box selection:
  // - While drop is 'open': the current filling box is `lockedFullBoxCount + 1`
  //   (e.g., 3/4 + 2 checked out -> lockedFullBoxCount = 1, activeBox = Box #2 at 1/4).
  // - When drop is 'closed': if at least 1 box locked & settled, show the last settled box
  //   when there is no partial box or so the card reflects settled status cleanly;
  //   if 0 boxes locked, show Box #1 (closed_unfilled).
  let activeBoxIndex: number;
  if (state.dropStatus === 'open') {
    activeBoxIndex = Math.min(lockedFullBoxCount, allBoxes.length - 1);
  } else if (lockedFullBoxCount > 0) {
    activeBoxIndex = lockedFullBoxCount - 1;
  } else {
    activeBoxIndex = 0;
  }

  const activeBox = allBoxes[activeBoxIndex];

  // Determine lifecycleState strictly per spec:
  let lifecycleState: ProductLifecycleState;
  if (state.dropStatus === 'closed') {
    lifecycleState = lockedFullBoxCount > 0 ? 'box_filled_settled' : 'closed_unfilled';
  } else if (userTotalLockedSlices > 0) {
    lifecycleState = 'user_locked';
  } else if (
    activeBox.claimedCount > 0 &&
    (activeBox.slicesRemaining === 1 ||
      (activeBox.slicesRemaining === 2 && activeBox.totalSlices >= 6))
  ) {
    lifecycleState = 'closing_soon';
  } else {
    lifecycleState = 'open';
  }

  return {
    item,
    lockedFullBoxCount,
    activeBox,
    allBoxes,
    userTotalLockedSlices,
    basketQuantity,
    lifecycleState,
  };
}

export function buildBasketPreview(
  state: Pick<PersistedDropState, 'dropStatus' | 'basket' | 'slicesByProduct'>
): BasketPreviewSummary {
  if (state.dropStatus === 'closed') {
    return {
      lines: [],
      totalSlices: 0,
      subtotalGbp: 0,
      platformFeeGbp: 0,
      totalEscrowHoldGbp: 0,
      totalRetailGbp: 0,
      totalSavingsGbp: 0,
      boxesLockedImmediatelyCount: 0,
      overflowSlicesCount: 0,
    };
  }

  const lines: BasketLinePreview[] = [];
  let totalSlices = 0;
  let subtotalPence = 0;
  let totalRetailPence = 0;
  let boxesLockedImmediatelyCount = 0;
  let overflowSlicesCount = 0;

  for (const item of SPLITBOX_CATALOG) {
    const quantity = state.basket[item.id] ?? 0;
    if (quantity <= 0) continue;

    const committedCount = (state.slicesByProduct[item.id] ?? []).length;
    const totalPerBox = item.totalSlicesPerBox;
    const slicePence = toPence(item.slicePriceGbp);
    const retailPence = toPence(item.retailPriceGbp);

    const lineTotalPence = slicePence * quantity;
    const lineRetailPence = retailPence * quantity;
    const lineSavingsPence = Math.max(0, lineRetailPence - lineTotalPence);

    const allocations: BasketLinePreview['allocations'] = [];
    for (let i = 0; i < quantity; i += 1) {
      const globalIdx = committedCount + i;
      const boxNumber = Math.floor(globalIdx / totalPerBox) + 1;
      const slotNumberOneBased = (globalIdx % totalPerBox) + 1;
      const locksThisBox = slotNumberOneBased === totalPerBox;

      let resultingFillLabel: string;
      if (locksThisBox) {
        resultingFillLabel = `Box #${boxNumber} Locks (${slotNumberOneBased}/${totalPerBox})`;
      } else if (slotNumberOneBased === 1) {
        resultingFillLabel = `Box #${boxNumber} Opens Pool (1/${totalPerBox})`;
      } else {
        resultingFillLabel = `Box #${boxNumber} Pooling (${slotNumberOneBased}/${totalPerBox})`;
      }

      allocations.push({
        sliceOffset: i + 1,
        boxNumber,
        slotNumberOneBased,
        totalSlicesPerBox: totalPerBox,
        locksThisBox,
        resultingFillLabel,
      });
    }

    // Count how many boxes in this line reach full capacity once all `quantity` slices are placed
    const finalCommittedCount = committedCount + quantity;
    const beforeLockedBoxes = Math.floor(committedCount / totalPerBox);
    const afterLockedBoxes = Math.floor(finalCommittedCount / totalPerBox);
    boxesLockedImmediatelyCount += Math.max(0, afterLockedBoxes - beforeLockedBoxes);

    for (const alloc of allocations) {
      const boxEndFill =
        alloc.boxNumber <= afterLockedBoxes
          ? totalPerBox
          : finalCommittedCount % totalPerBox;
      if (boxEndFill < totalPerBox) {
        overflowSlicesCount += 1;
      }
    }

    lines.push({
      item,
      quantity,
      lineTotalGbp: fromPence(lineTotalPence),
      lineSavingsGbp: fromPence(lineSavingsPence),
      allocations,
    });

    totalSlices += quantity;
    subtotalPence += lineTotalPence;
    totalRetailPence += lineRetailPence;
  }

  const totalSavingsPence = Math.max(0, totalRetailPence - subtotalPence);

  return {
    lines,
    totalSlices,
    subtotalGbp: fromPence(subtotalPence),
    platformFeeGbp: 0,
    totalEscrowHoldGbp: fromPence(subtotalPence),
    totalRetailGbp: fromPence(totalRetailPence),
    totalSavingsGbp: fromPence(totalSavingsPence),
    boxesLockedImmediatelyCount,
    overflowSlicesCount,
  };
}

export function buildUserOrderSlices(
  state: Pick<PersistedDropState, 'dropStatus' | 'slicesByProduct' | 'orders'>
): UserOrderSliceDetail[] {
  const orderMap = new Map<string, OrderRecord>();
  for (const order of state.orders) {
    orderMap.set(order.id, order);
  }

  const results: UserOrderSliceDetail[] = [];

  for (const item of SPLITBOX_CATALOG) {
    const productSlices = state.slicesByProduct[item.id] ?? [];
    const totalPerBox = item.totalSlicesPerBox;

    // Count total claimed slices per boxNumber for this product
    const boxCounts = new Map<number, number>();
    for (const s of productSlices) {
      boxCounts.set(s.boxNumber, (boxCounts.get(s.boxNumber) ?? 0) + 1);
    }

    for (const slice of productSlices) {
      if (slice.owner !== 'user') continue;

      const boxClaimedCount = boxCounts.get(slice.boxNumber) ?? 0;
      const isBoxFull = boxClaimedCount >= totalPerBox;

      let status: SliceLifecycleStatus;
      if (state.dropStatus === 'closed') {
        status = isBoxFull ? 'fulfilled' : 'auto_refunded';
      } else {
        status = isBoxFull ? 'locked_box' : 'pooling_overflow';
      }

      const parentOrder = slice.orderId ? orderMap.get(slice.orderId) : undefined;

      results.push({
        slice,
        item,
        orderId: parentOrder?.id ?? slice.orderId ?? 'ORD-UOB-LOCAL',
        orderCreatedAt: parentOrder?.createdAt ?? slice.claimedAt,
        hubId: parentOrder?.hubId ?? UOB_CAMPUS_HUBS[0].id,
        status,
        boxClaimedCount,
        totalSlicesPerBox: totalPerBox,
        slicePriceGbp: item.slicePriceGbp,
        retailPriceGbp: item.retailPriceGbp,
      });
    }
  }

  return results;
}

export function applyCheckoutBasket(
  state: PersistedDropState,
  nowIso: string = new Date().toISOString()
): { nextState: PersistedDropState; order: OrderRecord | null } {
  if (state.dropStatus === 'closed') {
    return { nextState: state, order: null };
  }

  const basketEntries = SPLITBOX_CATALOG.map((item) => ({
    item,
    qty: state.basket[item.id] ?? 0,
  })).filter((entry) => entry.qty > 0);

  if (basketEntries.length === 0) {
    return { nextState: state, order: null };
  }

  const orderSeq = state.orders.length + 1;
  const orderId = `UOB-ORD-${String(100 + orderSeq)}`;
  const nextSlicesByProduct: Record<string, ClaimedSlice[]> = {
    ...state.slicesByProduct,
  };

  const allNewSliceIds: string[] = [];
  let escrowHoldPence = 0;

  for (const { item, qty } of basketEntries) {
    const existing = nextSlicesByProduct[item.id] ?? [];
    const { updatedSlices, addedSlices } = allocateSequentialSlices({
      existingSlices: existing,
      productId: item.id,
      totalSlicesPerBox: item.totalSlicesPerBox,
      quantity: qty,
      owner: 'user',
      claimedAt: nowIso,
      orderId,
    });
    nextSlicesByProduct[item.id] = updatedSlices;
    for (const s of addedSlices) {
      allNewSliceIds.push(s.id);
    }
    escrowHoldPence += toPence(item.slicePriceGbp) * qty;
  }

  const order: OrderRecord = {
    id: orderId,
    createdAt: nowIso,
    hubId: state.selectedHubId,
    sliceIds: allNewSliceIds,
    escrowHoldGbp: fromPence(escrowHoldPence),
  };

  const nextState: PersistedDropState = {
    ...state,
    basket: {},
    slicesByProduct: nextSlicesByProduct,
    orders: [...state.orders, order],
  };

  return { nextState, order };
}

export function applySimulateStrangers(
  state: PersistedDropState,
  nowIso: string = new Date().toISOString()
): { nextState: PersistedDropState; result: SimulateStrangersResult } {
  if (state.dropStatus === 'closed') {
    return {
      nextState: state,
      result: {
        slicesAdded: 0,
        boxesNewlyLocked: 0,
        summary: 'Drop cutoff has passed — campus pools are closed.',
      },
    };
  }

  // Prioritize items with partially filled active boxes (starting with any item where
  // the student has overflow slices, then items closest to locking), rotated by simulationStep.
  const step = state.simulationStep;
  const scoredItems = SPLITBOX_CATALOG.map((item, idx) => {
    const slices = state.slicesByProduct[item.id] ?? [];
    const remInActive = slices.length % item.totalSlicesPerBox;
    const slicesLeft = remInActive === 0 ? item.totalSlicesPerBox : item.totalSlicesPerBox - remInActive;
    const lockedCount = Math.floor(slices.length / item.totalSlicesPerBox);
    const hasUserOverflow = slices.some(
      (s) => s.owner === 'user' && s.boxNumber > lockedCount
    );
    const rotatedIdx = (idx + step * 3) % SPLITBOX_CATALOG.length;

    let priority = 0;
    if (hasUserOverflow) priority += 100;
    if (remInActive > 0) priority += 50 - slicesLeft * 5;
    return { item, priority, rotatedIdx };
  }).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.rotatedIdx - b.rotatedIdx;
  });

  const targetPools = scoredItems.slice(0, 5);
  const nextSlicesByProduct: Record<string, ClaimedSlice[]> = {
    ...state.slicesByProduct,
  };

  let slicesAdded = 0;
  let boxesNewlyLocked = 0;

  targetPools.forEach(({ item }, idx) => {
    // Deterministically add 1 or 2 stranger slices across the 5 selected open pools
    const qtyToAdd = (idx + step) % 2 === 0 ? 1 : 2;
    const existing = nextSlicesByProduct[item.id] ?? [];
    const beforeLocked = Math.floor(existing.length / item.totalSlicesPerBox);
    const { updatedSlices } = allocateSequentialSlices({
      existingSlices: existing,
      productId: item.id,
      totalSlicesPerBox: item.totalSlicesPerBox,
      quantity: qtyToAdd,
      owner: 'stranger',
      claimedAt: nowIso,
    });
    const afterLocked = Math.floor(updatedSlices.length / item.totalSlicesPerBox);
    nextSlicesByProduct[item.id] = updatedSlices;
    slicesAdded += qtyToAdd;
    boxesNewlyLocked += Math.max(0, afterLocked - beforeLocked);
  });

  const lockPhrase =
    boxesNewlyLocked === 1
      ? '1 box newly locked'
      : `${boxesNewlyLocked} boxes newly locked`;
  const summary = `+${slicesAdded} stranger slices joined ${targetPools.length} UoB pools (${lockPhrase}).`;

  const nextState: PersistedDropState = {
    ...state,
    slicesByProduct: nextSlicesByProduct,
    simulationStep: step + 1,
  };

  return {
    nextState,
    result: {
      slicesAdded,
      boxesNewlyLocked,
      summary,
    },
  };
}

function buildDeterministicPassIdentifiers(
  hubId: HubId,
  fulfilledCount: number,
  refundedCount: number,
  orderCount: number
): { pickupCode: string; pin: string } {
  let hash = 409;
  const seedStr = `${hubId}:${fulfilledCount}:${refundedCount}:${orderCount}`;
  for (let i = 0; i < seedStr.length; i += 1) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 900;
  }
  const codeNum = 100 + (hash % 900);
  const pinNum = 1000 + ((hash * 17 + fulfilledCount * 131 + orderCount * 43) % 9000);
  return {
    pickupCode: `UOB-BOX-${codeNum}`,
    pin: String(pinNum).padStart(4, '0'),
  };
}

export function buildPickupPassForHub(params: {
  hubId: HubId;
  issuedAt: string;
  fulfilledSliceCount: number;
  refundedSliceCount: number;
  finalChargedGbp: number;
  totalRefundedGbp: number;
  orderCount: number;
}): PickupPass {
  const {
    hubId,
    issuedAt,
    fulfilledSliceCount,
    refundedSliceCount,
    finalChargedGbp,
    totalRefundedGbp,
    orderCount,
  } = params;

  const hub = getCampusHubById(hubId);
  const { pickupCode, pin } = buildDeterministicPassIdentifiers(
    hubId,
    fulfilledSliceCount,
    refundedSliceCount,
    orderCount
  );

  const forfeitureDeadline = `${hub.pickupWindow} (+30m grace window at ${hub.shortLabel}; uncollected slices are forfeited & donated without refund)`;

  const qrPayload = JSON.stringify({
    app: 'SplitBox-UoB',
    pickupCode,
    pin,
    hubId,
    window: hub.pickupWindow,
    fulfilledSlices: fulfilledSliceCount,
    refundedSlices: refundedSliceCount,
    chargedGbp: finalChargedGbp.toFixed(2),
    refundedGbp: totalRefundedGbp.toFixed(2),
  });

  return {
    pickupCode,
    pin,
    hubId,
    issuedAt,
    qrPayload,
    fulfilledSliceCount,
    refundedSliceCount,
    finalChargedGbp,
    totalRefundedGbp,
    forfeitureDeadline,
  };
}

export function applyTriggerCutoff(
  state: PersistedDropState,
  nowIso: string = new Date().toISOString()
): { nextState: PersistedDropState; pickupPass: PickupPass } {
  if (state.dropStatus === 'closed' && state.pickupPass) {
    return { nextState: state, pickupPass: state.pickupPass };
  }

  // Index every slice across all products with whether its box hit 100%
  const sliceStatusLookup = new Map<
    string,
    { isFulfilled: boolean; pricePence: number }
  >();

  for (const item of SPLITBOX_CATALOG) {
    const slices = state.slicesByProduct[item.id] ?? [];
    const boxCounts = new Map<number, number>();
    for (const s of slices) {
      boxCounts.set(s.boxNumber, (boxCounts.get(s.boxNumber) ?? 0) + 1);
    }
    const pricePence = toPence(item.slicePriceGbp);
    for (const s of slices) {
      const boxCount = boxCounts.get(s.boxNumber) ?? 0;
      sliceStatusLookup.set(s.id, {
        isFulfilled: boxCount >= item.totalSlicesPerBox,
        pricePence,
      });
    }
  }

  let fulfilledSliceCount = 0;
  let refundedSliceCount = 0;
  let finalChargedPence = 0;
  let totalRefundedPence = 0;

  const settledOrders: OrderRecord[] = state.orders.map((order) => {
    let orderCapturedPence = 0;
    let orderRefundedPence = 0;

    for (const sliceId of order.sliceIds) {
      const info = sliceStatusLookup.get(sliceId);
      if (!info) continue;
      if (info.isFulfilled) {
        orderCapturedPence += info.pricePence;
        finalChargedPence += info.pricePence;
        fulfilledSliceCount += 1;
      } else {
        orderRefundedPence += info.pricePence;
        totalRefundedPence += info.pricePence;
        refundedSliceCount += 1;
      }
    }

    return {
      ...order,
      capturedTotalGbp: fromPence(orderCapturedPence),
      refundedTotalGbp: fromPence(orderRefundedPence),
    };
  });

  const pickupPass = buildPickupPassForHub({
    hubId: state.selectedHubId,
    issuedAt: nowIso,
    fulfilledSliceCount,
    refundedSliceCount,
    finalChargedGbp: fromPence(finalChargedPence),
    totalRefundedGbp: fromPence(totalRefundedPence),
    orderCount: settledOrders.length,
  });

  const nextState: PersistedDropState = {
    ...state,
    dropStatus: 'closed',
    basket: {},
    orders: settledOrders,
    pickupPass,
  };

  return { nextState, pickupPass };
}
