/**
 * Shared TypeScript contract between the Divly React frontend (`src/`)
 * and the Node.js + SQLite backend (`server/`).
 *
 * All monetary amounts are integer GBP pence (e.g. 295 = £2.95) so there
 * are never floating-point rounding bugs. Use `formatPence()` only in the UI.
 */

export type ProductCategory =
  | 'Rice & Noodles'
  | 'Drinks & Caffeine'
  | 'Protein & Snacks'
  | 'Toiletries & Laundry'
  | 'Cooking Staples';

export type DropStatus = 'open' | 'closed';
export type AllocationStatus = 'pooling' | 'locked_box' | 'fulfilled' | 'auto_refunded';
export type OrderStatus = 'pending_payment' | 'paid_pooling' | 'settled' | 'refunded' | 'collected';

export type BuyAheadDecision = 'SAFE_BUY_AHEAD' | 'BORDERLINE_REVIEW' | 'AUTO_REFUND';

export interface DropSettings {
  hubName: string;
  hubShortLabel: string;
  hubAddress: string;
  pickupWindow: string;
  cutoffAtIso: string;
  dropStatus: DropStatus;
  freeDeliveryThresholdPence: number; // default 800 (£8.00)
  smallOrderFeePence: number;         // default 50 (£0.50)
  dropCycleNumber: number;            // starts at 1
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  imageEmoji: string;
  unitDescription: string;
  caseDescription: string;
  caseSize: number;
  sharePricePence: number;
  aldiPricePence: number;
  aldiUnitLabel: string;
  wholesaleCaseCostPence: number;
  isActive: boolean;
  eanBarcode?: string;
  supplierSku?: string;
  supplierName?: string;
  shelfLifeWeeks?: number;
  carryoverStockSlots?: number;
}

export interface ProductWithPool extends Product {
  totalClaimedSlots: number;
  lockedCasesCount: number;
  openCaseClaimedSlots: number;
  openCaseRemainingSlots: number;
  currentCaseNumber: number;
  savingsPercent: number;
  fillRatio: number;
  isAlmostFull: boolean;
  closerDiscountPercent: number;
  closerDiscountPence: number;
  effectiveSharePricePence: number;
  waivesSmallOrderFee: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
  referralCode?: string;
  creditBalancePence?: number;
}

export interface OrderItemAllocation {
  id: string;
  productId: string;
  productName: string;
  productBrand: string;
  unitDescription: string;
  imageEmoji: string;
  globalSlotIndex: number;
  boxNumber: number;
  slotInBox: number;
  caseSize: number;
  sharePricePence: number;
  aldiPricePence: number;
  status: AllocationStatus;
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: OrderStatus;
  subtotalPence: number;
  feePence: number;
  totalPaidPence: number;
  refundedPence: number;
  netChargedPence: number;
  totalAldiComparisonPence: number;
  closerDiscountTotalPence?: number;
  creditAppliedPence?: number;
  creditRestoredPence?: number;
  pickupCode: string;
  pickupPin: string;
  qrToken: string;
  paymentMode: 'stripe_live' | 'test_simulated';
  stripeSessionId: string | null;
  collectedAt: string | null;
  createdAt: string;
  allocations: OrderItemAllocation[];
}

export interface WholesaleShoppingLine {
  productId: string;
  productName: string;
  brand: string;
  caseDescription: string;
  caseSize: number;
  lockedCasesCount: number;
  overflowSlotsCount: number;
  wholesaleCaseCostPence: number;
  totalWholesaleCostPence: number;
  studentCaseRevenuePence: number;
  totalRevenuePence: number;
  grossProfitPence: number;
}

export interface BuyAheadPrediction {
  productId: string;
  productName: string;
  brand: string;
  imageEmoji: string;
  caseSize: number;
  openCaseClaimedSlots: number;
  unsoldSlotsCount: number;
  shelfLifeWeeks: number;
  safeHorizonWeeks: number;
  estimatedWeeklyDemand: number;
  sellThroughProbability: number;
  wholesaleCaseCostPence: number;
  immediateStudentCashPence: number;
  upfrontCashCoverageRatio: number;
  netOutOfPocketFloatPence: number;
  expectedNetProfitPence: number;
  safetyScore: number;
  decision: BuyAheadDecision;
  explanation: string;
}

export interface LiveSupplierProductResult {
  externalId: string;
  eanBarcode: string;
  name: string;
  brand: string;
  packSizeLabel: string;
  imageUrl: string | null;
  category: ProductCategory;
  suggestedCaseSize: number;
  estimatedWholesaleCaseCostPence: number;
  suggestedSharePricePence: number;
  estimatedAldiPricePence: number;
  shelfLifeWeeks: number;
  source: 'qogita_live' | 'openfoodfacts_uk_live';
  supplierPortalUrl: string;
}

export interface WholesalePurchaseOrder {
  id: string;
  dropCycleNumber: number;
  supplierName: string;
  mode: 'qogita_api_live' | 'webhook_edi_live' | 'manual_portal_assisted';
  externalOrderRef: string;
  status: 'submitted' | 'confirmed' | 'draft_ready';
  totalCasesCount: number;
  totalSpendPence: number;
  createdAt: string;
  portalLinks: Array<{
    productId: string;
    productName: string;
    eanBarcode: string;
    casesToBuy: number;
    lineCostPence: number;
    qogitaUrl: string;
    bookerUrl: string;
    bestwayUrl: string;
  }>;
}

export interface ProductRequest {
  id: string;
  itemName: string;
  brandOrSize: string;
  category: string;
  requestedByName: string;
  upvotesCount: number;
  viewerHasVoted: boolean;
  status: 'open' | 'stocked';
  createdAt: string;
}

export interface AdminSummary {
  settings: DropSettings;
  products: ProductWithPool[];
  shoppingList: WholesaleShoppingLine[];
  buyAheadPredictions: BuyAheadPrediction[];
  wholesaleOrders: WholesalePurchaseOrder[];
  wholesaleApiConfigured: boolean;
  productRequests?: ProductRequest[];
  orders: Order[];
  totals: {
    totalOrdersCount: number;
    paidStudentsCount: number;
    lockedCasesTotal: number;
    totalWholesaleSpendPence: number;
    totalGrossRevenuePence: number;
    totalFeeRevenuePence: number;
    estimatedGrossProfitPence: number;
  };
}

export interface CreateCheckoutRequest {
  items: Array<{ productId: string; quantity: number }>;
}

export interface CreateCheckoutResponse {
  mode: 'stripe_redirect' | 'test_modal';
  checkoutUrl?: string;
  pendingOrderId: string;
  totalPaidPence: number;
  subtotalPence: number;
  feePence: number;
  creditAppliedPence?: number;
}

export interface ScanLookupResult {
  valid: boolean;
  alreadyCollected: boolean;
  reason?: string;
  order?: Order;
}

export function formatPence(pence: number): string {
  const safe = Number.isFinite(pence) ? Math.round(pence) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  return `${sign}£${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
