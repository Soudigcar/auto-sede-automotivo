'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ExternalLink, Globe2, Loader2, RefreshCw, Save } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';
import { defaultPortalSettings, normalizePortalSettings, type PortalSettings } from '@/lib/portalSettings';

type PortalSnapshot = {
  activeStores: number;
  enabledStores: number;
  publicVehicles: number;
  orphanVehicles: number;
  activeCampaigns: number;
  marketplaceLeads: number;
};

type TextField = Exclude<{
  [K in keyof PortalSettings]: PortalSettings[K] extends string ? K : never
}[keyof PortalSettings], undefined>;

const emptySnapshot: PortalSnapshot = {
  activeStores: 0,
  enabledStores: 0,
  publicVehicles: 0,
  orphanVehicles: 0,
  activeCampaigns: 0,
  marketplaceLeads: 0
};

const inputClass = 'mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50';

export default function MasterPortalPage() {
  const supabase = useMemo(() => createClient(), []);
  const [settings, setSettings] = useState<PortalSettings>(defaultPortalSettings);
  const [snapshot, setSnapshot] = useState<PortalSnapshot>(emptySnapshot);
  const [cmsReady, setCmsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');
      const response = await fetch('/api/master/portal/settings', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o CMS.');
      setSettings(normalizePortalSettings(payload.settings));
      setSnapshot(payload.snapshot || emptySnapshot);
      setCmsReady(payload.cms_ready === true);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar o CMS.');
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cmsReady || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sua sessão expirou.');
      const response = await fetch('/api/master/portal/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      setSettings(normalizePortalSettings(payload.settings));
      setMessage(payload.message || 'Configuração salva.');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  function setText(field: TextField, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function setBenefit(index: number, field: 'title' | 'description', value: string) {
    setSettings((current) => ({
      ...current,
      benefits: current.benefits.map((benefit, currentIndex) => currentIndex === index ? { ...benefit, [field]: value } : benefit)
    }));
  }

  useEffect(() => { void load(); }, []);

  const metrics = [
    ['Lojas ativas', snapshot.activeStores],
    ['Portal habilitado', snapshot.enabledStores],
    ['Veículos aptos', snapshot.publicVehicles],
    ['Veículos órfãos', snapshot.orphanVehicles],
    ['Campanhas ativas', snapshot.activeCampaigns],
    ['Leads do portal', snapshot.marketplaceLeads]
  ] as const;

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <MasterSidebar active="/master/portal" />
        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <header className="rounded-[32px] bg-[#071020] p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-300"><Globe2 size={16} /> CMS do Portal Oficial</span>
                <h1 className="mt-5 text-4xl font-black">{settings.brand_name}</h1>
                <p className="mt-3 max-w-3xl text-sm font-medium text-zinc-300">Gerencie identidade, conteúdo, contatos e SEO de www.autosede.com.br.</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => void load()} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/15 px-5 text-sm font-black"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
                <a href="https://www.autosede.com.br" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black">Abrir portal <ExternalLink size={17} /></a>
              </div>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}
          {!cmsReady && !loading ? <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900"><AlertTriangle size={18} /> A migration do CMS ainda não foi aplicada. O editor está somente para visualização.</div> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {metrics.map(([label, value]) => <article key={label} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-zinc-400">{label}</p><strong className="mt-3 block text-3xl font-black">{value}</strong></article>)}
          </div>

          {loading ? <div className="mt-6 flex min-h-64 items-center justify-center rounded-3xl bg-white"><Loader2 size={34} className="animate-spin text-red-600" /></div> : (
            <form onSubmit={save} className="mt-6 space-y-6">
              <section className="rounded-3xl border border-zinc-200 bg-white p-6">
                <h2 className="text-2xl font-black">Identidade e abertura</h2>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className="text-xs font-black uppercase text-zinc-500">Nome da marca<input className={inputClass} value={settings.brand_name} onChange={(event) => setText('brand_name', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500">Assinatura<input className={inputClass} value={settings.brand_tagline} onChange={(event) => setText('brand_tagline', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">URL da logomarca<input className={inputClass} value={settings.logo_url} onChange={(event) => setText('logo_url', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Selo superior<input className={inputClass} value={settings.hero_eyebrow} onChange={(event) => setText('hero_eyebrow', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Título principal<textarea className={inputClass} rows={3} value={settings.hero_title} onChange={(event) => setText('hero_title', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Descrição<textarea className={inputClass} rows={4} value={settings.hero_description} onChange={(event) => setText('hero_description', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500">Botão principal<input className={inputClass} value={settings.primary_cta_label} onChange={(event) => setText('primary_cta_label', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500">Botão secundário<input className={inputClass} value={settings.secondary_cta_label} onChange={(event) => setText('secondary_cta_label', event.target.value)} /></label>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-6">
                <h2 className="text-2xl font-black">Benefícios</h2>
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {settings.benefits.slice(0, 3).map((benefit, index) => <article key={index} className="rounded-2xl bg-zinc-50 p-4"><input className={inputClass} value={benefit.title} onChange={(event) => setBenefit(index, 'title', event.target.value)} /><textarea className={inputClass} rows={4} value={benefit.description} onChange={(event) => setBenefit(index, 'description', event.target.value)} /></article>)}
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-6">
                <h2 className="text-2xl font-black">Confiança, contato e SEO</h2>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Título de confiança<input className={inputClass} value={settings.trust_title} onChange={(event) => setText('trust_title', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Descrição de confiança<textarea className={inputClass} rows={4} value={settings.trust_description} onChange={(event) => setText('trust_description', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500">WhatsApp<input className={inputClass} value={settings.whatsapp_number} onChange={(event) => setText('whatsapp_number', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500">Telefone<input className={inputClass} value={settings.phone} onChange={(event) => setText('phone', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500">E-mail<input className={inputClass} value={settings.email} onChange={(event) => setText('email', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500">Instagram<input className={inputClass} value={settings.instagram_url} onChange={(event) => setText('instagram_url', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Endereço<input className={inputClass} value={settings.address_text} onChange={(event) => setText('address_text', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Título SEO<input className={inputClass} value={settings.seo_title} onChange={(event) => setText('seo_title', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Descrição SEO<textarea className={inputClass} rows={4} value={settings.seo_description} onChange={(event) => setText('seo_description', event.target.value)} /></label>
                  <label className="text-xs font-black uppercase text-zinc-500 md:col-span-2">Imagem de compartilhamento<input className={inputClass} value={settings.og_image_url} onChange={(event) => setText('og_image_url', event.target.value)} /></label>
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => setSettings((current) => ({ ...current, is_published: !current.is_published }))} className="rounded-2xl bg-zinc-100 px-5 py-3 text-sm font-black">{settings.is_published ? 'Publicado' : 'Rascunho'}</button>
                <button type="submit" disabled={!cmsReady || saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar configuração</button>
              </section>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
