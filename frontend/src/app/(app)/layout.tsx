'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { AIPanel } from '@/components/layout/ai-panel';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Container from '@mui/material/Container';
import GlobalStyles from '@mui/material/GlobalStyles';

// ---------------------------------------------------------------------------
// Constants — matching Devias Kit / Materio pattern
// ---------------------------------------------------------------------------

const SIDEBAR_WIDTH = 280;
const NAV_HEIGHT = 64;

// ---------------------------------------------------------------------------
// App Layout
// ---------------------------------------------------------------------------

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, checkSession } = useAuthStore();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#F8FAFC',
        }}
      >
        <Stack alignItems="center" spacing={2}>
          <Box
            sx={{
              width: 48,
              height: 48,
              bgcolor: 'primary.main',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1.25rem' }}>K</Typography>
          </Box>
          <CircularProgress size={28} sx={{ color: 'primary.main' }} />
        </Stack>
      </Box>
    );
  }

  if (!user) return null;

  const currentWidth = sidebarCollapsed ? 72 : SIDEBAR_WIDTH;

  return (
    <>
      <GlobalStyles
        styles={{
          ':root': {
            '--SideNav-width': `${SIDEBAR_WIDTH}px`,
            '--SideNav-collapsed': '72px',
            '--MainNav-height': `${NAV_HEIGHT}px`,
          },
        }}
      />
      <Box
        sx={{
          bgcolor: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          minHeight: '100vh',
        }}
      >
        <Sidebar width={SIDEBAR_WIDTH} collapsedWidth={72} />
        <Box
          sx={{
            display: 'flex',
            flex: '1 1 auto',
            flexDirection: 'column',
            pl: { lg: `${currentWidth}px` },
            transition: 'padding-left 0.25s ease',
          }}
        >
          <Header />
          <Box
            component="main"
            sx={{
              display: 'flex',
              flex: '1 1 auto',
              flexDirection: 'column',
              py: 3,
              px: { xs: 2, sm: 3, md: 4 },
            }}
          >
            <Container maxWidth="xl" disableGutters>
              {children}
            </Container>
          </Box>
        </Box>
        <AIPanel />
      </Box>
    </>
  );
}
