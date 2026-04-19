'use client';

import { ReactNode } from 'react';
import { Toaster } from 'sonner';

// ---------------------------------------------------------------------------
// AppRegistry — thin client wrapper.
//
// Previously wrapped children in an MUI <ThemeProvider> + <CssBaseline>.
// With the migration to shadcn/Tailwind complete, we no longer need MUI's
// theme engine. Design tokens now live in globals.css (Kuja-Studio CSS
// custom properties) and Tailwind utility classes.
// ---------------------------------------------------------------------------

export function AppRegistry({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  );
}
