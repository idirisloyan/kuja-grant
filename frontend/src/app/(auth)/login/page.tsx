'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Mail, Lock, Building2, Wallet, Star, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoginFormValues = { email: string; password: string };

// ---------------------------------------------------------------------------
// Demo accounts
// ---------------------------------------------------------------------------

const demoAccounts = [
  {
    label: 'NGO',
    email: 'fatima@amani.org',
    icon: Building2,
    color: 'bg-emerald-500',
    description: 'Amani Foundation',
  },
  {
    label: 'Donor',
    email: 'sarah@globalhealth.org',
    icon: Wallet,
    color: 'bg-blue-500',
    description: 'Global Health Fund',
  },
  {
    label: 'Reviewer',
    email: 'james@reviewer.org',
    icon: Star,
    color: 'bg-amber-500',
    description: 'Independent Reviewer',
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const success = await login(data.email, data.password);
      if (success) {
        toast.success('Welcome back!');
        router.replace('/dashboard');
      } else {
        toast.error('Invalid email or password');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (email: string) => {
    setValue('email', email);
    setValue('password', 'pass123');
    handleSubmit(onSubmit)();
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500" />

      {/* Decorative blurred orbs */}
      <div className="absolute top-[-120px] left-[-60px] w-96 h-96 rounded-full bg-brand-400/30 blur-3xl" />
      <div className="absolute bottom-[-100px] right-[-80px] w-[500px] h-[500px] rounded-full bg-purple-400/20 blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-72 h-72 rounded-full bg-indigo-300/20 blur-2xl" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo & title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 mb-4">
            <span className="text-3xl font-bold text-white">K</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Kuja Grant Management</h1>
          <p className="text-indigo-100/80 text-sm">AI-Powered Grant Management for Impact</p>
        </div>

        {/* Frosted glass card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-white/90">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@organization.org"
                  className="h-11 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:border-white/50 focus-visible:ring-white/20"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Invalid email address',
                    },
                  })}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-300">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-white/90">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  className="h-11 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:border-white/50 focus-visible:ring-white/20"
                  {...register('password', {
                    required: 'Password is required',
                  })}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-300">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-white text-brand-700 font-semibold hover:bg-white/90 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 text-white/60 bg-transparent backdrop-blur-sm">
                Quick Demo Access
              </span>
            </div>
          </div>

          {/* Demo account cards */}
          <div className="grid grid-cols-3 gap-3">
            {demoAccounts.map((account) => {
              const Icon = account.icon;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => handleDemoLogin(account.email)}
                  disabled={isLoading}
                  className="group flex flex-col items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/15 hover:border-white/30 transition-all duration-200 disabled:opacity-50"
                >
                  <div className={`w-10 h-10 rounded-lg ${account.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-white">{account.label}</div>
                    <div className="text-[10px] text-white/50 leading-tight mt-0.5">
                      {account.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-indigo-200/50 mt-6">
          Kuja Link &middot; Empowering grants through AI
        </p>
      </div>
    </div>
  );
}
