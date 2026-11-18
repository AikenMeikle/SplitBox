/**
 * Root Divly application shell.
 *
 * Wraps the app in `<AppProvider>` and switches cleanly between:
 * - `shop`: `<StorefrontView />` (bulk grocery pools & Aldi savings)
 * - `orders`: `<OrdersView />` (student's live allocations, refunds & QR pickup pass)
 * - `admin`: `<AdminView />` (wholesale shopping list, cutoff controls, product manager & QR scanner)
 */

import { BRAND_NAME, CAMPUS_NAME } from './config/brand';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { StorefrontView } from './components/StorefrontView';
import { OrdersView } from './components/OrdersView';
import { AdminView } from './components/AdminView';
import { BasketDrawer } from './components/BasketDrawer';
import { AuthModal } from './components/AuthModal';

function AppShell() {
  const { activeTab, settings } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] text-gray-900">
      <Navbar />

      <main className="flex-1">
        {activeTab === 'shop' && <StorefrontView />}
        {activeTab === 'orders' && <OrdersView />}
        {activeTab === 'admin' && <AdminView />}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-500">
          <div>
            <span className="font-bold text-gray-800">{BRAND_NAME}</span> · {CAMPUS_NAME} Student Bulk-Buying Platform
          </div>
          <div>
            {settings ? (
              <span>
                Pickup Hub: <span className="font-medium text-gray-700">{settings.hubName}</span> ({settings.pickupWindow}) · 100% auto-refund on unfilled overflow slots
              </span>
            ) : (
              <span>100% automatic refund guarantee on unfilled overflow slots</span>
            )}
          </div>
        </div>
      </footer>

      <BasketDrawer />
      <AuthModal />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

export default App;
