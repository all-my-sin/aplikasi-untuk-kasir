import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@pos/shared';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { ApiError, onUnauthorized } from '@/lib/api';
import { authApi } from '@/services';

interface AuthContextValue {
  user: UserDTO | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<UserDTO>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ME_KEY = ['auth', 'me'];

// Never queryClient.clear() here — it would detach the live auth query observer.
const notAuth = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== 'auth' };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await authApi.me()).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Any 401 from the API (expired / revoked session) signs the user out locally.
  useEffect(() => {
    onUnauthorized(() => {
      if (queryClient.getQueryData(ME_KEY)) {
        queryClient.setQueryData(ME_KEY, null);
        queryClient.removeQueries(notAuth);
      }
    });
  }, [queryClient]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { user } = await authApi.login(username, password);
      queryClient.removeQueries(notAuth);
      queryClient.setQueryData(ME_KEY, user);
      return user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries(notAuth);
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: data ?? null, isLoading, isAdmin: data?.role === 'ADMIN', login, logout }),
    [data, isLoading, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
