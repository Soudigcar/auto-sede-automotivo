import './globals.css';
import type { Metadata } from 'next';
import { appName } from '@/lib/constants';

export const metadata: Metadata = {
  title: appName,
  description: 'Gestão de leads e vendas para eventos automotivos'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
