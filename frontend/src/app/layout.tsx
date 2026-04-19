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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <body className={`${inter.className} antialiased`}>
        <AppRegistry>
          {children}
        </AppRegistry>
      </body>
    </html>
  );
}
