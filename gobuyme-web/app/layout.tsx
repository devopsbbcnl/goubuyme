import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { CityProvider } from '@/context/CityContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeScript } from '@/components/ui/ThemeScript';

export const metadata: Metadata = {
  title: 'GoBuyMe — Hungry? GoBuyMe. Anything.',
  description: 'On-demand food, groceries & goods delivery across Nigeria in 25 minutes or less.',
  icons: { icon: '/icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ThemeScript />
      </head>
      <body>
        <AuthProvider>
          <CityProvider>
            <CartProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </CartProvider>
          </CityProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
