import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/context/theme-context';
import { DsaInspectorProvider } from '@/context/dsa-inspector-context';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Threads · C++17 DSA Prototype',
  description:
    'Production-grade Threads web clone powered by Supabase and a C++17 Data Structures & Algorithms engine.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans min-h-screen bg-threads-bg text-threads-text antialiased`}>
        <ThemeProvider>
          <DsaInspectorProvider>{children}</DsaInspectorProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
