import type { RoleValue } from '@pos/shared';
import {
  BarChart3,
  Boxes,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Tags,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/common';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export const NAV_ITEMS: { to: string; label: string; icon: typeof LayoutDashboard; roles: RoleValue[] }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
  { to: '/pos', label: 'POS / Cashier', icon: ShoppingCart, roles: ['ADMIN', 'CASHIER'] },
  { to: '/products', label: 'Products', icon: Package, roles: ['ADMIN'] },
  { to: '/categories', label: 'Categories', icon: Tags, roles: ['ADMIN'] },
  { to: '/inventory', label: 'Inventory', icon: Boxes, roles: ['ADMIN'] },
  { to: '/transactions', label: 'Transactions', icon: Receipt, roles: ['ADMIN', 'CASHIER'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN'] },
  { to: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { to: '/activity', label: 'Activity Log', icon: ScrollText, roles: ['ADMIN'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { data: settings } = useSettings();
  const navigate = useNavigate();
  const items = NAV_ITEMS.filter((i) => user && i.roles.includes(user.role));

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      toast.error('Unable to sign out cleanly, but your local session was cleared.');
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-4 py-4">
        {settings?.logoUrl ? (
          <img src={settings.logoUrl} alt="" className="size-9 rounded-lg bg-white object-contain p-0.5" />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <ShoppingCart className="size-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{settings?.storeName ?? 'Retail POS'}</p>
          <p className="text-xs text-sidebar-muted">Point of Sale</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Main">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-foreground/85 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <item.icon className="size-4.5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <div className="flex size-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
            {user?.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs capitalize text-sidebar-muted">{user?.role.toLowerCase()}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-4.5" /> Logout
        </button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const current = NAV_ITEMS.find((i) => location.pathname.startsWith(i.to));
  const isPos = location.pathname.startsWith('/pos');

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-dvh overflow-hidden print-full">
      <aside className="no-print hidden w-60 shrink-0 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              aria-label="Close menu"
              className="absolute right-2 top-4 rounded-md p-1.5 text-white/80 hover:bg-white/10"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col print-full">
        <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            {current && <current.icon className="size-5 text-muted-foreground" />}
            <span className="truncate font-semibold">{current?.label ?? ''}</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            {isPos && (
              <span className="hidden items-center gap-1.5 xl:flex">
                <History className="size-4" />
                <kbd className="rounded border bg-muted px-1.5 text-xs">F2</kbd> search
                <kbd className="rounded border bg-muted px-1.5 text-xs">F4</kbd> pay
                <kbd className="rounded border bg-muted px-1.5 text-xs">Esc</kbd> close
              </span>
            )}
            <span className="hidden sm:inline">{user?.name}</span>
          </div>
        </header>
        <main className={cn('min-h-0 flex-1 overflow-y-auto print-full', isPos ? 'p-0' : 'p-4 lg:p-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
