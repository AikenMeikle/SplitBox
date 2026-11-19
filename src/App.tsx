/**
 * Root Divly application shell.
 *
 * Wraps the app in `<AppProvider>` and switches cleanly between:
 * - `shop`: `<StorefrontView />` (bulk grocery pools, closer bonuses & request voting)
 * - `orders`: `<OrdersView />` (student's live allocations, refunds & QR pickup pass)
 * - `admin`: `<AdminView />` (wholesale shopping list, cutoff controls, product manager & QR scanner)
 */

import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { StorefrontView } from './components/StorefrontView';
import { OrdersView } from './components/OrdersView';
import { AdminView } from './components/AdminView';
import { BasketDrawer } from './components/BasketDrawer';
import { AuthModal } from './components/AuthModal';
import { LegalFooter } from './components/LegalFooter';

function AppShell() {
  const { activeTab } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] text-gray-900">
      <Navbar />

      <main className="flex-1">
        {activeTab === 'shop' && <StorefrontView />}
        {activeTab === 'orders' && <OrdersView />}
        {activeTab === 'admin' && <AdminView />}
      </main>

      <LegalFooter />
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
