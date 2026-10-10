import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@pos/shared';
import { Lock, ShoppingCart, User } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { homeFor } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form-controls';
import { Card } from '@/components/ui/misc';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { username: '', password: '' } });

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(null);
    try {
      const u = await login(username, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : homeFor(u.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in. Please try again.'));
    }
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-[oklch(0.25_0.04_220)] via-[oklch(0.3_0.06_200)] to-[oklch(0.4_0.08_180)] p-4">
      <Card className="w-full max-w-sm p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary shadow-lg">
            <ShoppingCart className="size-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold">Sign in to Retail POS</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your username and password</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Field label="Username or email" htmlFor="username" error={errors.username?.message}>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                className="h-10 pl-9"
                aria-invalid={!!errors.username}
                {...register('username')}
              />
            </div>
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="h-10 pl-9"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
            </div>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
