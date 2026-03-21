'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';

// ---------------------------------------------------------------------------
// AppRegistry wraps the app with MUI ThemeProvider + CssBaseline and Sonner.
// This is a client component because MUI ThemeProvider requires 'use client'.
// ---------------------------------------------------------------------------

export function AppRegistry({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  );
}
