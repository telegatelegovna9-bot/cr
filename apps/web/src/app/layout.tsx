import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crypto Screener Pro | Institutional Trading Terminal',
  description: 'Production-grade crypto screener with real-time market data, liquidity heatmap, pattern detection, and multi-exchange aggregation.',
  manifest: '/manifest.json',
  other: {
    'telegram-webapp-capabilities': 'fullscreen',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  user-scalable: false,
  themeColor: '#0a0a0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body className="min-h-screen bg-terminal-bg">
        {children}
      </body>
    </html>
  );
}
