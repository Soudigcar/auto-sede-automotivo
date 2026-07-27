import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PublicMarketplace } from '@/components/marketplace/PublicMarketplace';

const INTERNAL_SYSTEM_HOST = 'sistemaautomotivo.autosede.com.br';
const INTERNAL_LOGIN_URL = `https://${INTERNAL_SYSTEM_HOST}/login`;

export const metadata: Metadata = {
  title: 'Veículos disponíveis | Auto Controle Automotivo',
  description: 'Encontre veículos de lojas parceiras, simule seu financiamento e fale diretamente com a loja responsável pelo anúncio.'
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
