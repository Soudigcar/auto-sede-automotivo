'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CarFront,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  Megaphone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles
} from 'lucide-react';
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  help,
  textarea = false,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  textarea?: boolean;
  type?: string;
}) {
  const className = 'mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-50';

  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} className={`${className} resize-y`} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />
      )}
      {help ? <span className="mt-2 block text-xs font-medium leading-relaxed text-zinc-400">{help}</span> : null}
    </label>
  );
}

function Section({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-950">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-zinc-500">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function formatDate(value?: string | null) {
  if (!value) return 'Ainda não publicado pelo CMS';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não disponível';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MasterPortalPage() {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<PortalSnapshot>(emptySnapshot);
  const [settings, setSettings] = useState<PortalSettings>(defaultPortalSettings);
  const [cmsReady, setCmsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error' | 'info'>('info');

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadPortal(preserveMessage = false) {
    setLoading(true);
    if (!preserveMessage) setMessage('');

    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente para acessar o Portal Oficial.');

      const response = await fetch('/api/master/portal/settings', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o CMS do portal.');

      setSnapshot(payload.snapshot || emptySnapshot);
      setSettings(normalizePortalSettings(payload.settings || defaultPortalSettings));
      setCmsReady(payload.cms_ready === true);
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível carregar o CMS do portal.');
    } finally {
      setLoading(false);
    }
  }

  async function savePortal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !cmsReady) return;

    setSaving(true);
    setMessage('');

    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente para salvar.');

      const response = await fetch('/api/master/portal/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar o portal.');

      setSettings(normalizePortalSettings(payload.settings || settings));
      setMessageTone('success');
      setMessage(payload.message || 'Configuração salva com sucesso.');
      await loadPortal(true);
    } catch (error: any) {
      setMessageTone('error');
      setMessage(error?.message || 'Não foi possível salvar o portal.');
    } finally {
      setSaving(false);
    }
  }

  function change<K extends keyof PortalSettings>(field: K, value: PortalSettings[K]) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function changeBenefit(index: number, field: 'title' | 'description', value: string) {
    setSettings((current) => ({
      ...current,
      benefits: current.benefits.map((benefit, benefitIndex) => benefitIndex === index ? { ...benefit, [field]: value } : benefit)
    }));
  }

  useEffect(() => {
    void loadPortal();
  }, []);

  const blockers = [
    !cmsReady ? 'A migration do CMS ainda não foi aplicada no Supabase' : '',
    snapshot.orphanVehicles > 0 ? `${snapshot.orphanVehicles} veículo(s) publicável(is) sem loja responsável válida` : '',
    snapshot.activeCampaigns > 1 ? `${snapshot.activeCampaigns} campanhas temporárias continuam ativas simultaneamente` : '',
    'Os domínios www, raiz e sistema ainda precisam ser confirmados no painel da Vercel'
  ].filter(Boolean);

  const alertClass = messageTone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : messageTone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-blue-200 bg-blue-50 text-blue-700';

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <MasterSidebar active="/master/portal" />

        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <header className="rounded-[32px] bg-[#071020] p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-300">
                  <Globe2 size={16} /> CMS do Portal Oficial
                </span>
                <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">{settings.brand_name || 'Auto Sede'}</h1>
                <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-zinc-300 sm:text-base">
                  Edite a identidade, o conteúdo público, os contatos e o SEO de www.autosede.com.br sem misturar o portal permanente com campanhas temporárias.
                </p>
                <p className="mt-4 text-xs font-bold text-zinc-500">Última atualização: {formatDate(settings.updated_at)}</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => void loadPortal()} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-sm font-black text-white disabled:opacity-60">
                  <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar
                </button>
                <a href="https://www.autosede.com.br" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-500">
                  Abrir portal público <ExternalLink size={17} />
                </a>
              </div>
            </div>
          </header>

          {message ? <div className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${alertClass}`}>{message}</div> : null}

          {!cmsReady && !loading ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-900">
              <AlertTriangle size={19} className="mt-0.5 shrink-0" />
              O editor está em modo de visualização com dados padrão. O salvamento ficará disponível somente após a aplicação autorizada do arquivo <code>phase-2c4b-01-portal-settings.sql</code>.
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard icon={<Building2 size={21} />} label="Lojas ativas" value={snapshot.activeStores} detail="Lojas operacionais cadastradas" />
            <MetricCard icon={<ShieldCheck size={21} />} label="Portal habilitado" value={snapshot.enabledStores} detail="Lojas liberadas para a vitrine" />
            <MetricCard icon={<CarFront size={21} />} label="Veículos aptos" value={snapshot.publicVehicles} detail="Com preço, visibilidade e loja" />
            <MetricCard icon={<AlertTriangle size={21} />} label="Veículos órfãos" value={snapshot.orphanVehicles} detail="Ficam fora do portal até revisão" warning={snapshot.orphanVehicles > 0} />
            <MetricCard icon={<Megaphone size={21} />} label="Campanhas ativas" value={snapshot.activeCampaigns} detail="Landings temporárias publicadas" warning={snapshot.activeCampaigns > 1} />
            <MetricCard icon={<Search size={21} />} label="Leads do portal" value={snapshot.marketplaceLeads} detail="Origem marketplace_site" />
          </div>

          {loading ? (
            <div className="mt-6 flex min-h-80 items-center justify-center rounded-[30px] border border-zinc-200 bg-white">
              <div className="text-center"><Loader2 size={34} className="mx-auto animate-spin text-red-600" /><p className="mt-3 text-sm font-bold text-zinc-500">Carregando CMS seguro...</p></div>
            </div>
          ) : (
            <form onSubmit={savePortal} className="mt-6 space-y-6">
              <Section eyebrow="Identidade" title="Marca pública" description="Esses campos aparecem no cabeçalho e no rodapé do portal oficial.">
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Nome da marca" value={settings.brand_name} onChange={(value) => change('brand_name', value)} />
                  <Field label="Assinatura da marca" value={settings.brand_tagline} onChange={(value) => change('brand_tagline', value)} />
                  <div className="md:col-span-2"><Field label="URL da logomarca" value={settings.logo_url} onChange={(value) => change('logo_url', value)} placeholder="https://..." help="Deixe vazio para usar o ícone padrão do portal." /></div>
                </div>
              </Section>

              <Section eyebrow="Página inicial" title="Mensagem principal" description="Controle o primeiro conteúdo visto pelo cliente e os botões de navegação do hero.">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2"><Field label="Selo superior" value={settings.hero_eyebrow} onChange={(value) => change('hero_eyebrow', value)} /></div>
                  <div className="md:col-span-2"><Field label="Título principal" value={settings.hero_title} onChange={(value) => change('hero_title', value)} textarea /></div>
                  <div className="md:col-span-2"><Field label="Descrição principal" value={settings.hero_description} onChange={(value) => change('hero_description', value)} textarea /></div>
                  <Field label="Botão principal" value={settings.primary_cta_label} onChange={(value) => change('primary_cta_label', value)} />
                  <Field label="Botão secundário" value={settings.secondary_cta_label} onChange={(value) => change('secondary_cta_label', value)} />
                </div>
              </Section>

              <Section eyebrow="Benefícios" title="Argumentos institucionais" description="Até seis benefícios podem ser publicados; nesta fase, os três primeiros compõem a seção principal.">
                <div className="grid gap-4 lg:grid-cols-3">
                  {settings.benefits.slice(0, 3).map((benefit, index) => (
                    <article key={index} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 text-white"><Sparkles size={18} /></div>
                      <div className="mt-4 space-y-4">
                        <Field label={`Benefício ${index + 1}`} value={benefit.title} onChange={(value) => changeBenefit(index, 'title', value)} />
                        <Field label="Descrição" value={benefit.description} onChange={(value) => changeBenefit(index, 'description', value)} textarea />
                      </div>
                    </article>
                  ))}
                </div>
              </Section>

              <Section eyebrow="Confiança" title="Direcionamento e segurança" description="Explique por que o catálogo é confiável e como o interesse chega à loja correta.">
                <div className="grid gap-5">
                  <Field label="Título do bloco" value={settings.trust_title} onChange={(value) => change('trust_title', value)} />
                  <Field label="Descrição do bloco" value={settings.trust_description} onChange={(value) => change('trust_description', value)} textarea />
                </div>
              </Section>

              <Section eyebrow="Contato" title="Canais oficiais" description="Os campos preenchidos serão exibidos no rodapé do portal.">
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="WhatsApp" value={settings.whatsapp_number} onChange={(value) => change('whatsapp_number', value)} placeholder="5561999999999" help="Inclua código do país e DDD." />
                  <Field label="Telefone" value={settings.phone} onChange={(value) => change('phone', value)} placeholder="(61) 0000-0000" />
                  <Field label="E-mail" value={settings.email} onChange={(value) => change('email', value)} type="email" />
                  <Field label="Instagram" value={settings.instagram_url} onChange={(value) => change('instagram_url', value)} placeholder="https://instagram.com/..." />
                  <div className="md:col-span-2"><Field label="Endereço ou região de atendimento" value={settings.address_text} onChange={(value) => change('address_text', value)} /></div>
                </div>
              </Section>

              <Section eyebrow="SEO" title="Busca e compartilhamento" description="Defina como o portal aparece no Google e ao ser compartilhado em redes sociais.">
                <div className="grid gap-5">
                  <Field label="Título SEO" value={settings.seo_title} onChange={(value) => change('seo_title', value)} help={`${settings.seo_title.length} caracteres`} />
                  <Field label="Descrição SEO" value={settings.seo_description} onChange={(value) => change('seo_description', value)} textarea help={`${settings.seo_description.length} caracteres`} />
                  <Field label="Imagem de compartilhamento" value={settings.og_image_url} onChange={(value) => change('og_image_url', value)} placeholder="https://..." />
                </div>
              </Section>

              <section className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Estado da configuração</p>
                    <h2 className="mt-2 text-2xl font-black">{settings.is_published ? 'Publicar no portal' : 'Salvar como rascunho'}</h2>
                    <p className="mt-2 text-sm font-medium text-zinc-500">Quando estiver como rascunho, a home continua usando a identidade padrão segura.</p>
                  </div>
                  <button type="button" onClick={() => change('is_published', !settings.is_published)} className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-5 text-sm font-black ${settings.is_published ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
                    {settings.is_published ? 'Publicado' : 'Rascunho'}
                  </button>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setSettings(defaultPortalSettings)} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-zinc-200 px-5 text-sm font-black text-zinc-700">Restaurar campos padrão</button>
                  <button type="submit" disabled={!cmsReady || saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-black text-white shadow-lg shadow-red-600/20 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {settings.is_published ? 'Salvar e publicar' : 'Salvar rascunho'}
                  </button>
                </div>
              </section>
            </form>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
            <section className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Módulos separados</p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Link href="/master/portal" className="rounded-3xl border-2 border-red-200 bg-red-50 p-5"><Globe2 size={24} className="text-red-600" /><h3 className="mt-4 font-black">Portal Oficial</h3></Link>
                <Link href="/master/marketplace" className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5"><ShoppingBag size={24} /><h3 className="mt-4 font-black">Marketplace</h3></Link>
                <Link href="/master/campaigns" className="rounded-3xl border border-zinc-200 bg-zinc-50 p-5"><Megaphone size={24} /><h3 className="mt-4 font-black">Campanhas</h3></Link>
              </div>
            </section>

            <section className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600">Pendências de lançamento</p>
              <div className="mt-5 space-y-3">
                {blockers.length ? blockers.map((item) => <div key={item} className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900"><AlertTriangle size={18} className="shrink-0" /> {item}</div>) : <div className="flex gap-3 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 size={18} /> Nenhum bloqueador estrutural identificado.</div>}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
