'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CarFront, CheckCircle2, ExternalLink, Globe2, Megaphone, RefreshCw, Search, ShieldCheck, ShoppingBag } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type PortalSnapshot = {
  activeStores: number;
  enabledStores: number;
  publicVehicles: number;
  orphanVehicles: number;
  activeCampaigns: number;
  marketplaceLeads: number;
};

const emptySnapshot: PortalSnapshot = {
  activeStores: 0,
  enabledStores: 0,
  publicVehicles: 0,
  orphanVehicles: 0,
  activeCampaigns: 0,
  marketplaceLeads: 0
};

function MetricCard({ icon, label, value, detail, warning = false }: { icon: React.ReactNode; label: string; value: number; detail: string; warning?: boolean }) {
  return (
    <article className={`rounded-3xl border bg-white p-5 shadow-sm ${warning ? 'border-amber-200' : 'border-zinc-200'}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${warning ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-700'}`}>{icon}</div>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <strong className="mt-2 block text-3xl font-black text-zinc-950">{value.toLocaleString('pt-BR')}</strong>
      <p className="mt-2 text-xs font-bold text-zinc-500">{detail}</p>
    </article>
  );
}

export default function MasterPortalPage() {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<PortalSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function loadSnapshot() {
    setLoading(true);
    setMessage('');

    const [vehiclesResult, storesResult, campaignsResult, leadsResult] = await Promise.all([
      supabase.from('site_vehicles').select('id,status,show_on_landing,price,store_id').neq('status', 'excluido'),
      supabase.from('stores').select('id,status,portal_enabled').neq('status', 'deleted'),
      supabase.from('site_campaigns').select('id,is_active'),
      supabase.from('leads').select('id,origin').eq('origin', 'marketplace_site')
    ]);

    const firstError = vehiclesResult.error || storesResult.error || campaignsResult.error || leadsResult.error;
    if (firstError) {
      setMessage(firstError.message || 'Não foi possível carregar a situação do portal.');
      setLoading(false);
      return;
    }

    const vehicles = vehiclesResult.data || [];
    const stores = storesResult.data || [];
    const campaigns = campaignsResult.data || [];
    const publicCandidates = vehicles.filter((vehicle: any) => vehicle.status === 'disponivel' && vehicle.show_on_landing === true && Number(vehicle.price || 0) > 0);

    setSnapshot({
      activeStores: stores.filter((store: any) => store.status === 'active').length,
      enabledStores: stores.filter((store: any) => store.status === 'active' && store.portal_enabled === true).length,
      publicVehicles: publicCandidates.filter((vehicle: any) => Boolean(vehicle.store_id)).length,
      orphanVehicles: publicCandidates.filter((vehicle: any) => !vehicle.store_id).length,
      activeCampaigns: campaigns.filter((campaign: any) => campaign.is_active === true).length,
      marketplaceLeads: (leadsResult.data || []).length
    });

    setLoading(false);
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const launchBlockers = [
    snapshot.orphanVehicles > 0 ? `${snapshot.orphanVehicles} veículo(s) publicado(s) sem loja responsável direta` : '',
    snapshot.activeCampaigns > 1 ? `${snapshot.activeCampaigns} campanhas estão ativas ao mesmo tempo` : '',
    'Domínios www, raiz e sistema ainda precisam ser confirmados no painel da Vercel',
    'Identidade visual final, páginas institucionais e políticas legais entram na Fase 2C.4B'
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <MasterSidebar active="/master/portal" />

        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <header className="rounded-[32px] bg-[#071020] p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-300">
                  <Globe2 size={16} /> Portal oficial
                </span>
                <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Auto Sede</h1>
                <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-zinc-300 sm:text-base">
                  Centro de controle do portal permanente em www.autosede.com.br. Este módulo separa identidade institucional, marketplace e campanhas temporárias sem alterar DNS nesta fase.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => void loadSnapshot()} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-sm font-black text-white disabled:opacity-60">
                  <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar diagnóstico
                </button>
                <a href="https://www.autosede.com.br" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-500">
                  Abrir portal público <ExternalLink size={17} />
                </a>
              </div>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard icon={<Building2 size={21} />} label="Lojas ativas" value={snapshot.activeStores} detail="Lojas operacionais cadastradas" />
            <MetricCard icon={<ShieldCheck size={21} />} label="Portal habilitado" value={snapshot.enabledStores} detail="Lojas liberadas para a vitrine" />
            <MetricCard icon={<CarFront size={21} />} label="Veículos aptos" value={snapshot.publicVehicles} detail="Com preço, visibilidade e loja" />
            <MetricCard icon={<AlertTriangle size={21} />} label="Veículos órfãos" value={snapshot.orphanVehicles} detail="Ficam fora do portal até revisão" warning={snapshot.orphanVehicles > 0} />
            <MetricCard icon={<Megaphone size={21} />} label="Campanhas ativas" value={snapshot.activeCampaigns} detail="Landings temporárias publicadas" warning={snapshot.activeCampaigns > 1} />
            <MetricCard icon={<Search size={21} />} label="Leads do portal" value={snapshot.marketplaceLeads} detail="Origem marketplace_site" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Arquitetura oficial</p>
              <h2 className="mt-2 text-2xl font-black">Responsabilidade de cada ambiente</h2>

              <div className="mt-6 space-y-4">
                {[
                  { title: 'www.autosede.com.br', text: 'Portal público oficial, catálogo permanente, simulação e captação de leads.', icon: Globe2 },
                  { title: 'sistemaautomotivo.autosede.com.br', text: 'Sistema interno para Master, lojas, equipes, leads, vendas e relatórios.', icon: ShieldCheck },
                  { title: '/campanha/[slug]', text: 'Landing temporária para feirões, ações promocionais e eventos específicos.', icon: Megaphone }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} className="flex gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-white"><Icon size={20} /></div>
                      <div><h3 className="font-black text-zinc-950">{item.title}</h3><p className="mt-1 text-sm font-medium leading-relaxed text-zinc-500">{item.text}</p></div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">Pendências de lançamento</p>
              <h2 className="mt-2 text-2xl font-black">Bloqueadores controlados</h2>
              <div className="mt-6 space-y-3">
                {launchBlockers.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {item}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Módulos separados</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Link href="/master/portal" className="rounded-3xl border-2 border-red-200 bg-red-50 p-5 transition hover:-translate-y-0.5">
                <Globe2 size={24} className="text-red-600" /><h3 className="mt-4 text-xl font-black">Portal Oficial</h3><p className="mt-2 text-sm font-medium text-zinc-600">Identidade pública, prontidão de lançamento e futura gestão institucional.</p>
              </Link>
              <Link href="/master/marketplace" className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 transition hover:-translate-y-0.5">
                <ShoppingBag size={24} className="text-zinc-800" /><h3 className="mt-4 text-xl font-black">Marketplace</h3><p className="mt-2 text-sm font-medium text-zinc-600">Veículos, lojas, aprovações, pendências, problemas e leads.</p>
              </Link>
              <Link href="/master/campaigns" className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5 transition hover:-translate-y-0.5">
                <Megaphone size={24} className="text-zinc-800" /><h3 className="mt-4 text-xl font-black">Campanhas e Landings</h3><p className="mt-2 text-sm font-medium text-zinc-600">Feirões temporários, links públicos, campanhas ativas e encerradas.</p>
              </Link>
            </div>
          </section>

          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            <CheckCircle2 size={19} /> Esta fase não altera DNS, domínios, campanhas nem estoque de produção automaticamente.
          </div>
        </section>
      </div>
    </main>
  );
}
