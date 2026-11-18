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
}

export interface ProductWithPool extends Product {
  totalClaimedSlots: number;
  lockedCasesCount: number;
  openCaseClaimedSlots: number;
  openCaseRemainingSlots: number;
  currentCaseNumber: number;
  savingsPercent: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
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

export interface AdminSummary {
  settings: DropSettings;
  products: ProductWithPool[];
  shoppingList: WholesaleShoppingLine[];
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
