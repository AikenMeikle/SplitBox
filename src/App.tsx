import { BasketDrawer, MobileBasketBar } from './components/basket';
import { DemoControlsBar, OrdersPickupView } from './components/orders';
import { Navbar, StorefrontView } from './components/storefront';
import { DropProvider, useDrop } from './store/DropContext';

function SplitBoxShell() {
  const { activeView } = useDrop();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--sb-bg-canvas)] text-[var(--sb-ink-primary)] pb-20 sm:pb-8">
      <DemoControlsBar />
      <Navbar />
      <div className="flex-1">
        {activeView === 'orders' ? <OrdersPickupView /> : <StorefrontView />}
      </div>
      <BasketDrawer />
      <MobileBasketBar />
    </div>
  );
}

export default function App() {
  return (
    <DropProvider>
      <SplitBoxShell />
    </DropProvider>
  );
}
