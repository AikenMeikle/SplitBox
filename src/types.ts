export type HubId =
  | 'vale-shackleton'
  | 'guild-mermaid'
  | 'selly-oak-bristol'
  | 'pritchatts-park';

export interface CampusHub {
  id: HubId;
  name: string;
  shortLabel: string;
  area: string;
  addressNote: string;
  pickupWindow: string;
  walkingNote: string;
}

export type ProductCategory =
  | 'Pantry & Cooking'
  | 'Drinks & Oat Milk'
  | 'Snacks & Study Fuel'
  | 'Household & Dorm';

export type PoolFilter = 'all' | 'closing-soon' | 'locked-by-me';

export type DropStatus = 'open' | 'closed';

export type ActiveView = 'storefront' | 'orders';

export type SliceLifecycleStatus =
  | 'locked_box'
  | 'pooling_overflow'
  | 'fulfilled'
  | 'auto_refunded';

export type WedgeState = 'stranger' | 'user_locked' | 'basket_preview' | 'open';

export type ProductLifecycleState =
  | 'open'
  | 'closing_soon'
  | 'user_locked'
  | 'box_filled_settled'
  | 'closed_unfilled';

export interface CatalogItem {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  caseDescription: string;
  sliceUnitDescription: string;
  totalSlicesPerBox: 4 | 6 | 8 | 10 | 12;
  slicePriceGbp: number;
  retailPriceGbp: number;
  initialStrangerSlices: number;
  packBadge: string;
}

export interface ClaimedSlice {
  id: string;
  productId: string;
  owner: 'stranger' | 'user';
  orderId?: string;
  claimedAt: string;
  globalSlotIndex: number;
  boxNumber: number;
  slotIndexInBox: number;
}

export interface OrderRecord {
  id: string;
  createdAt: string;
  hubId: HubId;
  sliceIds: string[];
  escrowHoldGbp: number;
  capturedTotalGbp?: number;
  refundedTotalGbp?: number;
}

export interface PickupPass {
  pickupCode: string;
  pin: string;
  hubId: HubId;
  issuedAt: string;
  qrPayload: string;
  fulfilledSliceCount: number;
  refundedSliceCount: number;
  finalChargedGbp: number;
  totalRefundedGbp: number;
  forfeitureDeadline: string;
}

export interface BoxSummary {
  productId: string;
  boxNumber: number;
  totalSlices: number;
  claimedCount: number;
  strangerSlices: number;
  userLockedSlices: number;
  basketPreviewSlices: number;
  isLockedFull: boolean;
  slicesRemaining: number;
  wedgeStates: Array<'stranger' | 'user_locked' | 'basket_preview' | 'open'>;
}

export interface ProductPoolSnapshot {
  item: CatalogItem;
  lockedFullBoxCount: number;
  activeBox: BoxSummary;
  allBoxes: BoxSummary[];
  userTotalLockedSlices: number;
  basketQuantity: number;
  lifecycleState: ProductLifecycleState;
}

export interface BasketSliceAllocation {
  sliceOffset: number;
  boxNumber: number;
  slotNumberOneBased: number;
  totalSlicesPerBox: number;
  locksThisBox: boolean;
  resultingFillLabel: string;
}

export interface BasketLinePreview {
  item: CatalogItem;
  quantity: number;
  lineTotalGbp: number;
  lineSavingsGbp: number;
  allocations: Array<{
    sliceOffset: number;
    boxNumber: number;
    slotNumberOneBased: number;
    totalSlicesPerBox: number;
    locksThisBox: boolean;
    resultingFillLabel: string;
  }>;
}

export interface BasketPreviewSummary {
  lines: BasketLinePreview[];
  totalSlices: number;
  subtotalGbp: number;
  platformFeeGbp: number;
  totalEscrowHoldGbp: number;
  totalRetailGbp: number;
  totalSavingsGbp: number;
  boxesLockedImmediatelyCount: number;
  overflowSlicesCount: number;
}

export interface UserOrderSliceDetail {
  slice: ClaimedSlice;
  item: CatalogItem;
  orderId: string;
  orderCreatedAt: string;
  hubId: HubId;
  status: SliceLifecycleStatus;
  boxClaimedCount: number;
  totalSlicesPerBox: number;
  slicePriceGbp: number;
  retailPriceGbp: number;
}

export interface SimulateStrangersResult {
  slicesAdded: number;
  boxesNewlyLocked: number;
  summary: string;
}
