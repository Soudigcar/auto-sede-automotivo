import type { Metadata } from 'next';
import { PublicMarketplace } from '@/components/marketplace/PublicMarketplace';

export const metadata: Metadata = {
  title: 'Veículos disponíveis | Auto Controle Automotivo',
  description: 'Encontre veículos de lojas parceiras, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.'
};

export default function HomePage() {
  return <PublicMarketplace />;
}
