'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/hooks/use-translation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';

import EmailOutlined from '@mui/icons-material/EmailOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import Business from '@mui/icons-material/Business';
import AccountBalanceWallet from '@mui/icons-material/AccountBalanceWallet';
import StarOutline from '@mui/icons-material/StarOutline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoginFormValues = { email: string; password: string };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [isLoading, setIsLoading] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setIsDev(
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  }, []);

  // Demo accounts — built inside component to use t()
  const demoAccounts = [
    {
      label: t('auth.role_ngo'),
      email: 'fatima@amani.org',
      icon: <Business />,
      color: '#10B981',
      description: 'Amani Foundation',
    },
    {
      label: t('auth.role_donor'),
      email: 'sarah@globalhealth.org',
      icon: <AccountBalanceWallet />,
      color: '#3B82F6',
      description: 'Global Health Fund',
    },
    {
      label: t('auth.role_reviewer'),
      email: 'james@reviewer.org',
      icon: <StarOutline />,
      color: '#F59E0B',
      description: 'Independent Reviewer',
    },
  ];

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
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Gradient background */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 30%, #312E81 70%, #4338CA 100%)',
        }}
      />

      {/* Decorative blurred orbs */}
      <Box
        sx={{
          position: 'absolute',
          top: -120,
          left: -60,
          width: 384,
          height: 384,
          borderRadius: '50%',
          background: 'rgba(129,140,248,0.3)',
          filter: 'blur(80px)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: -100,
          right: -80,
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'rgba(168,85,247,0.2)',
          filter: 'blur(80px)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '33%',
          width: 288,
          height: 288,
          borderRadius: '50%',
          background: 'rgba(165,180,252,0.2)',
          filter: 'blur(60px)',
        }}
      />

      {/* Login card */}
      <Box sx={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 440, mx: 2 }}>
        {/* Logo & title */}
        <Stack alignItems="center" spacing={1} sx={{ mb: 4 }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
              K
            </Typography>
          </Box>
          <Typography variant="h4" sx={{ color: '#fff', fontWeight: 700 }}>
            {t('auth.login_title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(224,231,255,0.7)' }}>
            {t('auth.subtitle')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', mt: 1, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.625rem' }}>
            Trusted across 7 African countries
          </Typography>
        </Stack>

        {/* Frosted glass card */}
        <Card
          sx={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 3,
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25)',
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Stack spacing={2.5}>
                {/* Email */}
                <TextField
                  fullWidth
                  label={t('auth.email_label')}
                  type="email"
                  placeholder={t('auth.email_placeholder')}
                  error={!!errors.email}
                  helperText={errors.email?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailOutlined sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
                      '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.6)' },
                    },
                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                    '& .MuiInputLabel-root.Mui-focused': { color: 'rgba(255,255,255,0.9)' },
                    '& .MuiFormHelperText-root': { color: '#FCA5A5' },
                    '& input::placeholder': { color: 'rgba(255,255,255,0.4)' },
                  }}
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Invalid email address',
                    },
                  })}
                />

                {/* Password */}
                <TextField
                  fullWidth
                  label={t('auth.password_label')}
                  type="password"
                  placeholder={t('auth.password_placeholder')}
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlined sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: '#fff',
                      '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
                      '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.6)' },
                    },
                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                    '& .MuiInputLabel-root.Mui-focused': { color: 'rgba(255,255,255,0.9)' },
                    '& .MuiFormHelperText-root': { color: '#FCA5A5' },
                    '& input::placeholder': { color: 'rgba(255,255,255,0.4)' },
                  }}
                  {...register('password', {
                    required: 'Password is required',
                  })}
                />

                {/* Submit */}
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={isLoading}
                  size="large"
                  sx={{
                    height: 48,
                    bgcolor: '#fff',
                    color: '#4F46E5',
                    fontWeight: 600,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
                    '&.Mui-disabled': {
                      bgcolor: 'rgba(255,255,255,0.6)',
                      color: '#4F46E5',
                    },
                  }}
                >
                  {isLoading ? (
                    <CircularProgress size={22} sx={{ color: '#4F46E5' }} />
                  ) : (
                    t('auth.sign_in')
                  )}
                </Button>
              </Stack>
            </form>

            {/* Demo accounts — only visible on localhost */}
            {isDev && (
              <>
                <Divider
                  sx={{
                    my: 3,
                    '&::before, &::after': { borderColor: 'rgba(255,255,255,0.2)' },
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', px: 1 }}>
                    {t('auth.demo_accounts')}
                  </Typography>
                </Divider>

                <Stack direction="row" spacing={1.5}>
                  {demoAccounts.map((account) => (
                    <Card
                      key={account.email}
                      onClick={() => !isLoading && handleDemoLogin(account.email)}
                      sx={{
                        flex: 1,
                        cursor: isLoading ? 'default' : 'pointer',
                        opacity: isLoading ? 0.5 : 1,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 2,
                        transition: 'all 0.2s',
                        '&:hover': {
                          background: isLoading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
                          borderColor: 'rgba(255,255,255,0.3)',
                          transform: isLoading ? 'none' : 'translateY(-1px)',
                        },
                      }}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Stack alignItems="center" spacing={1}>
                          <Avatar
                            sx={{
                              bgcolor: account.color,
                              width: 40,
                              height: 40,
                              boxShadow: `0 4px 12px ${account.color}40`,
                            }}
                          >
                            {account.icon}
                          </Avatar>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography
                              variant="caption"
                              sx={{ color: '#fff', fontWeight: 600, display: 'block' }}
                            >
                              {account.label}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.625rem', lineHeight: 1.3 }}
                            >
                              {account.description}
                            </Typography>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </>
            )}
          </CardContent>
        </Card>

        {/* Trust indicators */}
        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 3, flexWrap: 'wrap', gap: 1 }}>
          {[
            { icon: '🔒', label: 'Encrypted' },
            { icon: '🌍', label: '6 Languages' },
            { icon: '🤖', label: 'AI-Powered' },
          ].map((badge) => (
            <Box key={badge.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Typography sx={{ fontSize: '0.7rem' }}>{badge.icon}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(199,210,254,0.5)', fontSize: '0.65rem', letterSpacing: '0.04em' }}>
                {badge.label}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* Footer */}
        <Typography
          variant="caption"
          sx={{ display: 'block', textAlign: 'center', mt: 2, color: 'rgba(199,210,254,0.35)' }}
        >
          Adeso &mdash; African Development Solutions
        </Typography>
      </Box>
    </Box>
  );
}
