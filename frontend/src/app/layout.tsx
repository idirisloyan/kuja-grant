import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppRegistry } from '@/components/app-registry';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Kuja Grant Management',
  description: 'AI-Powered Grant Management for Impact',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <AppRegistry>
          {children}
        </AppRegistry>
      </body>
    </html>
  );
}
