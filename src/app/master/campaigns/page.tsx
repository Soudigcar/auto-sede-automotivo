'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, ExternalLink, FilePenLine, Megaphone, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

function dateTime(value: unknown) {
  if (!value) return 'Sem data';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CampaignCard({ campaign, onToggle, actionId }: { campaign: any; onToggle: (campaign: any) => void; actionId: string }) {
  const active = campaign.is_active === true;

  return (
    <article className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>
              {active ? <CheckCircle2 size={14} /> : <Archive size={14} />} {active ? 'Ativa' : 'Encerrada'}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-500">/{campaign.slug}</span>
          </div>

          <h3 className="mt-4 text-2xl font-black text-zinc-950">{campaign.name || 'Campanha sem nome'}</h3>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-zinc-500">{campaign.title || campaign.description || 'Sem título público cadastrado.'}</p>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-zinc-400">
            <span>Taxa: {Number(campaign.interest_rate || 0).toLocaleString('pt-BR')}% a.m.</span>
            <span>Atualizada: {dateTime(campaign.updated_at || campaign.created_at)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={`/campanha/${campaign.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 hover:border-red-200 hover:text-red-600">
            Ver landing <ExternalLink size={15} />
          </a>
          <button type="button" onClick={() => onToggle(campaign)} disabled={actionId === campaign.id} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black text-white disabled:opacity-60 ${active ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {active ? <PauseCircle size={16} /> : <PlayCircle size={16} />} {active ? 'Encerrar' : 'Reativar'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function MasterCampaignsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [actionId, setActionId] = useState('');

  async function loadCampaigns() {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.from('site_campaigns').select('*').order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message || 'Não foi possível carregar as campanhas.');
      setLoading(false);
      return;
    }

    setCampaigns(data || []);
    setLoading(false);
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const activeCampaigns = campaigns.filter((campaign) => campaign.is_active === true);
  const closedCampaigns = campaigns.filter((campaign) => campaign.is_active !== true);

  async function toggleCampaign(campaign: any) {
    const nextActive = campaign.is_active !== true;
    const action = nextActive ? 'reativar' : 'encerrar';
    if (!window.confirm(`Confirma ${action} a campanha “${campaign.name}”?`)) return;

    setActionId(campaign.id);
    setMessage('');
    const { error } = await supabase
      .from('site_campaigns')
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);

    setActionId('');
    if (error) {
      setMessage(error.message || 'Não foi possível atualizar a campanha.');
      return;
    }

    setMessage(nextActive ? 'Campanha reativada.' : 'Campanha encerrada e retirada da consulta pública por slug.');
    await loadCampaigns();
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <MasterSidebar active="/master/campaigns" />

        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <header className="rounded-[32px] bg-[#071020] p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-300">
                  <Megaphone size={16} /> Campanhas e landings
                </span>
                <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Ações temporárias separadas do portal</h1>
                <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-zinc-300 sm:text-base">
                  Organize feirões e campanhas promocionais sem confundir a landing do evento com o marketplace permanente de www.autosede.com.br.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => void loadCampaigns()} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-sm font-black text-white disabled:opacity-60">
                  <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar
                </button>
                <Link href="/master/site" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-500">
                  <FilePenLine size={17} /> Abrir editor técnico
                </Link>
              </div>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:max-w-3xl">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Ativas</p><strong className="mt-2 block text-4xl font-black text-emerald-950">{activeCampaigns.length}</strong><p className="mt-2 text-xs font-bold text-emerald-700">Disponíveis em /campanha/[slug]</p></div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">Encerradas</p><strong className="mt-2 block text-4xl font-black text-zinc-950">{closedCampaigns.length}</strong><p className="mt-2 text-xs font-bold text-zinc-500">Preservadas para histórico e reativação</p></div>
          </div>

          <section className="mt-8">
            <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Publicadas</p><h2 className="mt-1 text-2xl font-black">Campanhas ativas</h2></div></div>
            <div className="mt-4 space-y-4">
              {loading ? <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center font-bold text-zinc-500">Carregando campanhas...</div> : activeCampaigns.length ? activeCampaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} onToggle={toggleCampaign} actionId={actionId} />) : <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center font-bold text-zinc-500">Nenhuma campanha ativa.</div>}
            </div>
          </section>

          <section className="mt-10">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Histórico</p><h2 className="mt-1 text-2xl font-black">Campanhas encerradas</h2></div>
            <div className="mt-4 space-y-4">
              {closedCampaigns.length ? closedCampaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} onToggle={toggleCampaign} actionId={actionId} />) : <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center font-bold text-zinc-500">Nenhuma campanha encerrada.</div>}
            </div>
          </section>

          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            O editor legado permanece em <code>/master/site</code> apenas para cadastro técnico de campanha e veículos. A gestão institucional do portal ficará em Portal Oficial.
          </div>
        </section>
      </div>
    </main>
  );
}
