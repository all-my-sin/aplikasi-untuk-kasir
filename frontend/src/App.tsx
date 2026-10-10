import type { RoleValue } from '@pos/shared';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Spinner } from '@/components/ui/misc';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/layouts/AppLayout';
import { homeFor } from '@/lib/routes';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Route-level code splitting keeps the POS screen fast to load.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PosPage = lazy(() => import('@/pages/PosPage'));
const ProductsPage = lazy(() => import('@/pages/ProductsPage'));
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ActivityLogPage = lazy(() => import('@/pages/ActivityLogPage'));

function RequireAuth({ roles, children }: { roles?: RoleValue[]; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Spinner className="h-dvh" label="Loading…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}


function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

const admin: RoleValue[] = ['ADMIN'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        {[
          { path: 'dashboard', el: <DashboardPage />, roles: admin },
          { path: 'pos', el: <PosPage /> },
          { path: 'products', el: <ProductsPage />, roles: admin },
          { path: 'categories', el: <CategoriesPage />, roles: admin },
          { path: 'inventory', el: <InventoryPage />, roles: admin },
          { path: 'transactions', el: <TransactionsPage /> },
          { path: 'reports', el: <ReportsPage />, roles: admin },
          { path: 'users', el: <UsersPage />, roles: admin },
          { path: 'activity', el: <ActivityLogPage />, roles: admin },
          { path: 'settings', el: <SettingsPage />, roles: admin },
        ].map((r) => (
          <Route
            key={r.path}
            path={r.path}
            element={
              <RequireAuth roles={r.roles}>
                <Suspense fallback={<Spinner />}>{r.el}</Suspense>
              </RequireAuth>
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
