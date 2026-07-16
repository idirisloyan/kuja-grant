import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import { AppRegistry } from '@/components/app-registry';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
// Editorial serif reserved for hero/numbers. Gives Kuja a distinctive
// "premium publication" feel vs the generic sans-only SaaS default.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'Kuja — Grant intelligence for the Global South',
  description: 'Unified grant platform: donor co-pilot, NGO readiness coaching, reviewer intelligence, ongoing compliance. Built for African organizations.',
  manifest: '/manifest.webmanifest',
  themeColor: '#C2410C',
  appleWebApp: {
    capable: true,
    title: 'Kuja',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/* QA 2026-07-15 (dark-mode inconsistency): the dark class used to
            be applied only by the header ThemeToggle, so login + public
            token pages always rendered light even for dark-theme users,
            and app pages flashed light on first paint. Apply the stored
            preference (kuja_theme_v1, same key the toggle writes) before
            hydration on EVERY page. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('kuja_theme_v1')||'system';var d=m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        <AppRegistry>
          {children}
        </AppRegistry>
      </body>
    </html>
  );
}
