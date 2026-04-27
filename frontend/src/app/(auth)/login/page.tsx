'use client';

/**
 * Kuja login — shadcn + Tailwind.
 *
 * Uses plain `useState` + controlled inputs. react-hook-form's register()
 * was previously missing password-manager autofill events in some browsers
 * (the value hit the DOM but never reached RHF state), which left users
 * on /login after clicking Sign in. Controlled state captures every
 * browser autofill and manual keystroke reliably.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';

import { Loader2, Mail, Lock, Building2, Wallet, Star, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const INPUT_CLS =
  'block w-full h-10 pl-9 pr-3 text-sm bg-background text-foreground ' +
  'rounded-md border border-input transition-colors ' +
  'placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--kuja-clay))] focus-visible:border-[hsl(var(--kuja-clay))] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const { t } = useTranslation();

  useEffect(() => {
    setIsDev(
      typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      ),
    );
  }, []);

  const demoAccounts = [
    {
      label: t('auth.role_ngo'),
      email: 'fatima@amani.org',
      icon: Building2,
      accent: 'hsl(var(--kuja-grow))',
      description: 'Amani Foundation',
    },
    {
      label: t('auth.role_donor'),
      email: 'sarah@globalhealth.org',
      icon: Wallet,
      accent: 'hsl(var(--kuja-clay-dark))',
      description: 'Global Health Fund',
    },
    {
      label: t('auth.role_reviewer'),
      email: 'james@reviewer.org',
      icon: Star,
      accent: 'hsl(var(--kuja-sun))',
      description: 'Independent Reviewer',
    },
  ];

  const attemptLogin = async (submittedEmail: string, submittedPassword: string) => {
    setIsLoading(true);
    setFieldError({});
    try {
      const success = await login(submittedEmail, submittedPassword);
      if (success) {
        toast.success(t('toast.welcome_back'));
        // Hard navigate — next/router.replace inside a static export
        // sometimes stalls when the target layout runs its own session
        // check on mount. window.location guarantees the full shell
        // reload with the authenticated cookie set.
        window.location.href = '/dashboard/';
      } else {
        toast.error(t('toast.invalid_credentials'));
      }
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read values straight off the DOM so password-manager autofill that
    // skipped React state is still captured.
    const form = e.currentTarget;
    const emailInput = form.elements.namedItem('email') as HTMLInputElement | null;
    const passwordInput = form.elements.namedItem('password') as HTMLInputElement | null;
    const submittedEmail = (emailInput?.value ?? email).trim();
    const submittedPassword = passwordInput?.value ?? password;

    const errors: { email?: string; password?: string } = {};
    if (!submittedEmail) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail)) errors.email = 'Enter a valid email';
    if (!submittedPassword) errors.password = 'Password is required';

    if (Object.keys(errors).length > 0) {
      setFieldError(errors);
      return;
    }

    // Sync state back so the UI reflects what was actually submitted
    if (submittedEmail !== email) setEmail(submittedEmail);
    if (submittedPassword !== password) setPassword(submittedPassword);

    void attemptLogin(submittedEmail, submittedPassword);
  };

  const handleDemoLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('pass123');
    setFieldError({});
    void attemptLogin(demoEmail, 'pass123');
  };

  // Router prefetch hint (unused but kept to preserve file contract)
  void router;

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-10">
      {/* Hero gradient */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #261A14 30%, #4A1F10 70%, #7C2D12 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -top-40 -left-20 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-30"
        style={{ background: 'radial-gradient(circle, #C2410C, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -right-20 h-[32rem] w-[32rem] rounded-full blur-3xl opacity-25"
        style={{ background: 'radial-gradient(circle, #F97316, transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
        {/* LEFT — Brand + tagline */}
        <div className="lg:col-span-2 text-white space-y-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#C2410C] to-[#7C2D12] shadow-lg">
              <span className="kuja-display text-2xl text-white">K</span>
            </div>
            <div>
              <div className="kuja-display text-2xl">Kuja</div>
              <div className="text-xs text-orange-200 uppercase tracking-widest">Grant intelligence</div>
            </div>
          </div>
          <h1 className="kuja-display text-4xl lg:text-5xl text-white text-balance">
            Grants done with the
            <span className="block text-orange-300">Global South</span>
            in mind.
          </h1>
          <p className="text-orange-100/90 text-base max-w-md leading-relaxed">
            Kuja unifies donor grant design, NGO readiness coaching, reviewer intelligence, and ongoing compliance — with AI that grounds every recommendation in your own documents.
          </p>
          <div className="pt-2 flex items-center gap-2 text-xs text-orange-100/70">
            <Sparkles className="h-3.5 w-3.5" />
            AI co-pilot embedded in every surface
          </div>
        </div>

        {/* RIGHT — Login card */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl bg-white/95 backdrop-blur border border-white/20 shadow-2xl p-6 lg:p-8">
            <div className="mb-6">
              <h2 className="kuja-display text-2xl text-foreground">Sign in</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Welcome back. Pick up where you left off.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@organization.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className={INPUT_CLS}
                  />
                </div>
                {fieldError.email && <p className="text-xs text-destructive">{fieldError.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className={INPUT_CLS}
                  />
                </div>
                {fieldError.password && <p className="text-xs text-destructive">{fieldError.password}</p>}
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 bg-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-clay-dark))] text-white font-medium"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Demo login cards */}
            <div className="mt-6 pt-6 border-t border-border">
              <p className="kuja-eyebrow text-[10px] mb-3">Try a demo account</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {demoAccounts.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => handleDemoLogin(a.email)}
                      disabled={isLoading}
                      className="group flex items-center gap-2 p-3 rounded-lg border border-border hover:border-[hsl(var(--kuja-clay))] hover:bg-[hsl(var(--kuja-sand-50))] transition-all text-left"
                    >
                      <div
                        className="grid h-8 w-8 place-items-center rounded-md text-white flex-shrink-0"
                        style={{ backgroundColor: a.accent }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{a.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{a.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground text-center">
                Password: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">pass123</code> for all demos
              </p>
            </div>
          </div>

          {isDev && (
            <p className="mt-3 text-center text-xs text-orange-100/60">
              Development mode · {process.env.NODE_ENV}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
