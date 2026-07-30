import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PublicMarketplace } from '@/components/marketplace/PublicMarketplace';

const INTERNAL_SYSTEM_HOST = 'sistemaautomotivo.autosede.com.br';
const INTERNAL_LOGIN_URL = `https://${INTERNAL_SYSTEM_HOST}/login`;

export const metadata: Metadata = {
  title: 'Auto Sede | Veículos de lojas parceiras em um só lugar',
  description: 'Encontre veículos disponíveis, compare opções, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.',
  alternates: {
    canonical: 'https://www.autosede.com.br'
  },
  openGraph: {
    title: 'Auto Sede | Marketplace automotivo',
    description: 'Veículos de lojas parceiras com atendimento direcionado para a proprietária do anúncio.',
    url: 'https://www.autosede.com.br',
    siteName: 'Auto Sede',
    locale: 'pt_BR',
    type: 'website'
  }
};

export default async function HomePage() {
  const headerStore = await headers();
  const host = (headerStore.get('x-forwarded-host') || headerStore.get('host') || '')
    .split(':')[0]
    .trim()
    .toLowerCase();

  if (host === INTERNAL_SYSTEM_HOST) {
    redirect('/login');
  }

  return <PublicMarketplace internalAccessUrl={INTERNAL_LOGIN_URL} />;
}
