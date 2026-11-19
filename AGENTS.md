# Divly — University of Birmingham Student Bulk-Buying MVP (Master Spec & Contract)

> **CRITICAL OVERRIDE:** The previous SplitBox / PalletCut neo-brutalist localStorage prototype has been retired. Every agent working in this repository MUST follow this clean full-stack **Divly** specification. Keep all files concise, modular (~150–350 lines per file), and clearly commented so a 1st-year CS student can read and maintain every line.

---

## 1. Product & Engineering Principles

1. **What Divly Does:** Students at the University of Birmingham chip in with other students they don't know to split wholesale bulk cases at prices **15–35% lower than UK supermarket prices**. Pools close at a weekly cutoff; `100%` filled cases (plus shelf-stable cases underwritten via the Buy-Ahead Predictor) are fulfilled for campus hub pickup (verified via HMAC-SHA256 QR pass or 6-digit PIN), while unfilled overflow slots are **automatically refunded**.
2. **Full-Stack Single-Repo Architecture:**
   - **Backend (`server/`):** Node.js 22 (`tsx`) + Express (`express`) + built-in `node:sqlite` (`DatabaseSync` in WAL mode at `data/divly.sqlite`, configurable via `SQLITE_PATH`) + `node:crypto` (`HMAC-SHA256`, `randomBytes`, `timingSafeEqual`). Serves `/api/*`, `/api/events` (SSE real-time updates), `/flyer.html`, and static `dist/` in production on one port (`PORT`, default `3001` in dev API / `3000` in prod).
   - **Frontend (`src/`):** React 19 + TypeScript + Vite + Tailwind CSS v4 + `@fontsource/*` + `lucide-react` + `qrcode.react`.
3. **Visual Style & Public Copy Rule (Clean Modern Grocery App — Ocado / Tesco / Deliveroo Feel):**
   - Crisp light surfaces (`#F9FAFB` background, `#FFFFFF` cards, `1px solid #E5E7EB` subtle borders, soft `0 1px 3px rgba(0,0,0,0.05)` shadows, `12px` rounded cards). **NO neo-brutalist thick black borders, NO hard offset shadows, NO radial citrus wheels.**
   - Fresh grocery emerald (`#059669` / `#047857`, `#ECFDF5` soft badge fill) for **"Save X% vs Supermarkets"** tags and horizontal segmented slot progress bars (`"3 of 4 students chipped in"`).
   - **Zero Public Competitor Names:** Student-facing UI, seeded `aldiUnitLabel` values, and `/flyer.html` must **NEVER** display competing supermarket names like `"Aldi"` (use `"Supermarket equiv."` / `"Save X% vs Supermarkets"`). Internal TypeScript field identifiers (`aldiPricePence`, `aldiUnitLabel`, `totalAldiComparisonPence`) are preserved for schema compatibility, and internal Admin-only benchmarking labels inside `src/components/admin/` are permitted.
   - Integer GBP pence (`£`) everywhere in database, API, and state. Format via `formatPence(pence)` only in UI.
4. **Brand Configurability & Launch Docs:** Keep brand name (`Divly`), campus (`University of Birmingham`), and domain rules in `src/config/brand.ts`. See [`STUDENT_DEV_GUIDE.md`](./STUDENT_DEV_GUIDE.md) for codebase & algorithm guides and [`LAUNCH_IN_14_DAYS.md`](./LAUNCH_IN_14_DAYS.md) for the UoB 2-week launch playbook.

---

## 2. Canonical Shared Contract (`src/shared/types.ts`)

`backend-core` creates `src/shared/types.ts` with these exact exports, and `ui-storefront` + `ui-checkout-admin` import directly from `../shared/types` (or `./shared/types`):

```ts
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
```

---

## 3. REST & Real-Time SSE API Contract

All JSON endpoints accept `Authorization: Bearer <token>` (stored in `localStorage['divly_auth_token']`):
- `GET /api/state` → `{ settings: DropSettings, products: ProductWithPool[], stripeConfigured: boolean, devMode: boolean }`
- `GET /api/events` → SSE (`text/event-stream`), emits `data: {"type":"pool_updated"|"drop_updated"|"products_updated","timestamp":"..."}\n\n`
- `GET /api/auth/me` → `{ user: AuthUser | null }`
- `POST /api/auth/request-otp` → `{ email: string, name?: string }` → `{ ok: true, message: string, devOtpCode?: string }` (requires `@student.bham.ac.uk` or `@bham.ac.uk` unless listed in `ADMIN_EMAILS`)
- `POST /api/auth/verify-otp` → `{ email: string, code: string, name?: string }` → `{ token: string, user: AuthUser }`
- `POST /api/auth/admin-login` → `{ pin: string, email?: string }` → `{ token: string, user: AuthUser }`
- `POST /api/auth/dev-login` → `{ role: 'student' | 'admin', persona?: string }` → `{ token: string, user: AuthUser }` (enabled when `NODE_ENV !== 'production'` or `ALLOW_DEV_LOGIN === 'true'`)
- `POST /api/auth/logout` → `{ ok: true }`
- `GET /api/orders/mine` → `{ orders: Order[] }`
- `POST /api/checkout/create` → `CreateCheckoutRequest` → `CreateCheckoutResponse`
- `POST /api/checkout/confirm-test` → `{ pendingOrderId: string }` → `{ order: Order }`
- `GET /api/checkout/verify-session?session_id=...` → `{ order: Order }`
- `POST /api/webhooks/stripe` → Stripe raw body webhook (`checkout.session.completed`)
- **Admin (`role === 'admin'`):**
  - `GET /api/admin/summary` → `AdminSummary`
  - `PUT /api/admin/settings` → `Partial<DropSettings>` → `{ settings: DropSettings }`
  - `POST /api/admin/cutoff` → settles current drop (`locked_box -> fulfilled`, `pooling -> auto_refunded`, issues partial/full refunds), returns `AdminSummary`
  - `POST /api/admin/new-drop` → increments `dropCycleNumber`, resets active pool cycle while preserving historical orders, reopens drop, returns `AdminSummary`
  - `POST /api/admin/products` → `Omit<Product, 'id'>` → `{ product: ProductWithPool }`
  - `PUT /api/admin/products/:id` → `Partial<Product>` → `{ product: ProductWithPool }`
  - `DELETE /api/admin/products/:id` → `{ ok: true }`
  - `POST /api/admin/scan/verify` → `{ input: string }` → `ScanLookupResult`
  - `POST /api/admin/scan/collect` → `{ orderId: string }` → `{ order: Order }`
  - `GET /api/admin/wholesale/search?q=...` → `{ results: LiveSupplierProductResult[] }`
  - `POST /api/admin/wholesale/order` → `{ includeBuyAheadProductIds?: string[] }` → `{ order: WholesalePurchaseOrder, ...AdminSummary }`
  - `PUT /api/admin/requests/:id` → `{ status: 'open' | 'stocked' }` → `{ request: ProductRequest }`
  - `GET /api/admin/backup` → JSON attachment export (`settings`, `products`, `orders`, `wholesaleOrders`, `productRequests`, `exportedAt`)
- **Student Item Request Board:**
  - `GET /api/requests` → `{ requests: ProductRequest[] }`
  - `POST /api/requests` → `{ itemName: string, brandOrSize: string, category: string }` → `{ request: ProductRequest }`
  - `POST /api/requests/:id/vote` → toggles upvote → `{ request: ProductRequest }`

---

## 4. Frontend AppContext Contract (`src/context/AppContext.tsx` & `src/lib/api.ts`)

`ui-storefront` creates `src/lib/api.ts` (typed fetch wrapper attaching Bearer token) and `src/context/AppContext.tsx` exporting:
- `export type ActiveTab = 'shop' | 'orders' | 'admin';`
- `export function useApp()` returning:
  - `settings: DropSettings | null`
  - `products: ProductWithPool[]`
  - `user: AuthUser | null`
  - `orders: Order[]`
  - `loading: boolean`
  - `devMode: boolean`
  - `stripeConfigured: boolean`
  - `activeTab: ActiveTab` & `setActiveTab: (tab: ActiveTab) => void`
  - `isBasketOpen: boolean` & `setIsBasketOpen: (open: boolean) => void`
  - `isAuthModalOpen: boolean` & `setIsAuthModalOpen: (open: boolean) => void`
  - `basket: Record<string, number>`
  - `basketCount: number`
  - `addToBasket: (productId: string, delta?: number) => void`
  - `setBasketQty: (productId: string, qty: number) => void`
  - `clearBasket: () => void`
  - `refreshState: () => Promise<void>`
  - `refreshOrders: () => Promise<void>`
  - `loginWithToken: (token: string, user: AuthUser) => void`
  - `logout: () => Promise<void>`

`ui-checkout-admin` exports `BasketDrawer` (`src/components/BasketDrawer.tsx`), `OrdersView` (`src/components/OrdersView.tsx`), and `AdminView` (`src/components/AdminView.tsx`) consuming `useApp()` and `apiFetch` from `src/lib/api.ts`.
