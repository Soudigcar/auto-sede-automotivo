'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Copy,
  Database,
  Globe,
  MessageCircle,
  MousePointerClick,
  Plug,
  Save,
  ShieldCheck,
  UploadCloud
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const baseItems = [
  { title: 'Supabase', status: 'Conectado', icon: Database },
  { title: 'Vercel', status: 'Configurar', icon: Globe },
  { title: 'Importação de Estoque', status: 'Em implantação', icon: UploadCloud },
  { title: 'APIs externas', status: 'Futuro', icon: Plug }
];

const eventOptions = [
  { key: 'page_view', label: 'PageView', description: 'Quando o cliente abre a landing.' },
  { key: 'view_content', label: 'ViewContent', description: 'Quando visualiza ou seleciona um veículo.' },
  { key: 'simulator_opened', label: 'SimulatorOpened', description: 'Quando o simulador abre.' },
  { key: 'simulation_started', label: 'SimulationStarted', description: 'Quando começa a preencher ou selecionar opções.' },
  { key: 'lead', label: 'Lead', description: 'Quando envia a simulação e entra na Base.' },
  { key: 'contact', label: 'Contact', description: 'Quando clica para antecipar atendimento no WhatsApp.' }
];

const defaultEvents: Record<string, boolean> = Object.fromEntries(eventOptions.map((event) => [event.key, true]));

const META_LEADS_CALLBACK_URL = 'https://sistemaautomotivo.autosede.com.br/api/webhooks/meta-leads';

const defaultMetaLeads = {
  is_active: false,
  app_id: '',
  page_id: '',
  form_id: '',
  has_page_access_token: false,
  has_verify_token: false,
  graph_version: 'v25.0'
};

type LandingOption = {
  id: string;
  name: string;
  slug: string;
  title?: string;
};

function parsePixelIds(value: string) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\n,;| ]+/)
        .map((item) => item.replace(/\D/g, '').trim())
        .filter((item) => item.length >= 8)
    )
  );
}

export default function MasterIntegrationsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingPixel, setSavingPixel] = useState(false);
  const [savingMetaLeads, setSavingMetaLeads] = useState(false);
  const [testingMetaLeads, setTestingMetaLeads] = useState(false);
  const [subscribingMetaLeads, setSubscribingMetaLeads] = useState(false);
  const [metaLeadsDiagnostic, setMetaLeadsDiagnostic] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [landings, setLandings] = useState<LandingOption[]>([]);

  const [pixelForm, setPixelForm] = useState({
    name: 'Pixel do Facebook / Meta',
    pixel_id: '',
    additional_pixel_ids: '',
    test_campaign_id: '',
    is_active: false,
    events: defaultEvents
  });

  const [metaLeadsForm, setMetaLeadsForm] = useState(defaultMetaLeads);

  const callbackUrl = META_LEADS_CALLBACK_URL;

  const allPixelIds = useMemo(() => {
    return Array.from(
      new Set([
        pixelForm.pixel_id.replace(/\D/g, '').trim(),
        ...parsePixelIds(pixelForm.additional_pixel_ids)
      ].filter(Boolean))
    );
  }, [pixelForm.pixel_id, pixelForm.additional_pixel_ids]);

  const selectedLanding = useMemo(
    () => landings.find((landing) => landing.id === pixelForm.test_campaign_id) || null,
    [landings, pixelForm.test_campaign_id]
  );

  const selectedLandingHref = selectedLanding?.slug ? `/campanha/simulador?campanha=${encodeURIComponent(selectedLanding.slug)}` : '';

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadPixel() {
    const token = await getAuthToken();
    if (!token) {
      setMessage('Sessão expirada. Faça login novamente.');
      return;
    }

    const response = await fetch('/api/master/integrations/meta-pixel', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || 'Não foi possível carregar o Pixel.');
      return;
    }

    const integration = result.integration;
    const additionalIds = Array.isArray(integration?.settings?.additional_pixel_ids)
      ? integration.settings.additional_pixel_ids
      : [];

    setLandings(Array.isArray(result.landings) ? result.landings : []);
    setPixelForm({
      name: integration.name || 'Pixel do Facebook / Meta',
      pixel_id: integration.pixel_id || '',
      additional_pixel_ids: additionalIds.join('\n'),
      test_campaign_id: integration?.settings?.test_campaign_id || integration?.settings?.campaign_id || '',
      is_active: Boolean(integration.is_active),
      events: {
        ...defaultEvents,
        ...(integration?.settings?.events || {})
      }
    });
  }

  async function loadMetaLeads() {
    const token = await getAuthToken();
    if (!token) {
      setMessage('Sessão expirada. Faça login novamente.');
      return;
    }

    const response = await fetch('/api/master/integrations/meta-leads', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || 'Não foi possível carregar Facebook Lead Forms.');
      return;
    }

    const integration = result.integration;
    const settings = integration?.settings || {};

    setMetaLeadsForm({
      is_active: Boolean(integration.is_active),
      app_id: settings.app_id || '',
      page_id: settings.page_id || '',
      form_id: settings.form_id || '',
      has_page_access_token: Boolean(settings.has_page_access_token),
      has_verify_token: Boolean(settings.has_verify_token),
      graph_version: settings.graph_version || defaultMetaLeads.graph_version
    });
  }

  async function loadAll() {
    setLoading(true);
    setMessage('Carregando integrações...');

    try {
      await Promise.all([loadPixel(), loadMetaLeads()]);
      setMessage('');
    } catch {
      setMessage('Erro ao carregar integrações.');
    }

    setLoading(false);
  }

  async function savePixel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPixel(true);
    setMessage('Salvando Pixels...');

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSavingPixel(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-pixel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...pixelForm,
          additional_pixel_ids: parsePixelIds(pixelForm.additional_pixel_ids)
        })
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar Pixel.');
        setSavingPixel(false);
        return;
      }

      setMessage('Pixel global e landing de teste salvos com sucesso.');
      await loadPixel();
    } catch {
      setMessage('Erro ao salvar Pixels.');
    }

    setSavingPixel(false);
  }

  async function saveMetaLeads(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMetaLeads(true);
    setMessage('Salvando Facebook Lead Forms...');

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSavingMetaLeads(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          is_active: metaLeadsForm.is_active,
          app_id: metaLeadsForm.app_id,
          page_id: metaLeadsForm.page_id,
          graph_version: metaLeadsForm.graph_version
        })
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar Facebook Lead Forms.');
        setSavingMetaLeads(false);
        return;
      }

      setMessage('Facebook Lead Forms salvo com sucesso.');
      await loadMetaLeads();
    } catch {
      setMessage('Erro ao salvar Facebook Lead Forms.');
    }

    setSavingMetaLeads(false);
  }

  function updatePixelEvent(key: string, value: boolean) {
    setPixelForm((current) => ({
      ...current,
      events: {
        ...current.events,
        [key]: value
      }
    }));
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value);
    setMessage('Copiado.');
  }

  async function testMetaLeadsConnection() {
    setTestingMetaLeads(true);
    setMessage('Testando conexão com a Meta...');
    setMetaLeadsDiagnostic(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setTestingMetaLeads(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-leads/test', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      setMetaLeadsDiagnostic(result);

      if (!response.ok) setMessage(result.error || 'Erro ao testar integração.');
      else setMessage(result.summary || 'Teste concluído.');
    } catch {
      setMessage('Erro ao testar conexão com a Meta.');
    }

    setTestingMetaLeads(false);
  }

  async function subscribeMetaLeadsPage() {
    setSubscribingMetaLeads(true);
    setMessage('Inscrevendo página no webhook leadgen...');
    setMetaLeadsDiagnostic(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSubscribingMetaLeads(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-leads/subscribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      setMetaLeadsDiagnostic(result);

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível inscrever a página.');
      } else {
        setMessage(result.message || 'Página inscrita com sucesso.');
        await testMetaLeadsConnection();
      }
    } catch {
      setMessage('Erro ao inscrever página no webhook leadgen.');
    }

    setSubscribingMetaLeads(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Integração" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Gestão Master</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Integração</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Configure Pixel, Facebook Lead Forms, Webhook, API da Meta e conexões técnicas do sistema.
              </p>
            </div>

            <Link href="/master/dashboard/live" className="premium-button-secondary">
              <BarChart3 size={18} /> Voltar ao Dashboard
            </Link>
          </header>

          {message ? (
            <div className="mt-5 rounded-2xl border border-zinc-100 bg-white p-4 text-sm font-black text-zinc-600">
              {message}
            </div>
          ) : null}

          <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Link href="/master/integrations/whatsapp" className="block">
              <IntegrationCard title="WhatsApp central" status="Abrir QR e números" active icon={<MessageCircle size={22} />} />
            </Link>
            <IntegrationCard title="Facebook Lead Forms" status={metaLeadsForm.is_active ? 'Ativo' : 'Configurar'} active={metaLeadsForm.is_active} icon={<ShieldCheck size={22} />} />
            <IntegrationCard title="Pixel do Facebook" status={pixelForm.is_active ? `${allPixelIds.length} ID(s) ativo(s)` : 'Inativo'} active={pixelForm.is_active} icon={<MousePointerClick size={22} />} />
            {baseItems.map((item) => {
              const Icon = item.icon;
              return <IntegrationCard key={item.title} title={item.title} status={item.status} icon={<Icon size={22} />} />;
            })}
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <form onSubmit={saveMetaLeads} className="premium-card p-6">
              <PanelHeader eyebrow="Facebook / Instagram" title="Facebook Lead Forms" description="Configure o webhook para os leads dos formulários instantâneos caírem automaticamente na Base." active={metaLeadsForm.is_active} />

              <div className="mt-6 grid gap-4">
                <InfoBox label="Callback URL para Meta Developers" value={callbackUrl} onCopy={() => copy(callbackUrl)} />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormInput label="App ID" value={metaLeadsForm.app_id} onChange={(value) => setMetaLeadsForm({ ...metaLeadsForm, app_id: value.replace(/\D/g, '') })} placeholder="Ex: 588388460517343" />
                  <FormInput label="Page ID" value={metaLeadsForm.page_id} onChange={(value) => setMetaLeadsForm({ ...metaLeadsForm, page_id: value.replace(/\D/g, '') })} placeholder="ID da página" />
                </div>

                <FormInput label="Graph API Version" value={metaLeadsForm.graph_version} onChange={(value) => setMetaLeadsForm({ ...metaLeadsForm, graph_version: value.trim() })} placeholder="v25.0" />

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold leading-5 text-blue-700">
                  Os formulários aceitos são definidos exclusivamente em “Gerenciar formulários por evento”. Isso evita que um Form ID antigo substitua o evento correto.
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <ServerSecretStatus label="Page Access Token" configured={metaLeadsForm.has_page_access_token} variable="META_PAGE_ACCESS_TOKEN" />
                  <ServerSecretStatus label="Verify Token" configured={metaLeadsForm.has_verify_token} variable="META_LEADS_VERIFY_TOKEN" />
                </div>

                <ToggleCard title="Ativar recebimento de leads" description="Quando ativo, os leads do formulário entram automaticamente na Base." checked={metaLeadsForm.is_active} onChange={(checked) => setMetaLeadsForm({ ...metaLeadsForm, is_active: checked })} />

                <button className="premium-button-primary justify-center" type="submit" disabled={savingMetaLeads || loading}>
                  <Save size={18} /> {savingMetaLeads ? 'Salvando...' : 'Salvar Facebook Lead Forms'}
                </button>
              </div>
            </form>

            <aside className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Como configurar na Meta</h2>
              <div className="mt-5 space-y-4 text-sm font-bold text-zinc-500">
                <p>1. No Meta Developers, vá em Webhooks.</p>
                <p>2. Escolha o objeto Page.</p>
                <p>3. Cole a Callback URL exibida aqui.</p>
                <p>4. Cole o Verify Token diretamente do gerenciador de segredos; ele nunca é enviado ao navegador.</p>
                <p>5. Assine o campo leadgen.</p>
                <p>6. Gere um lead teste e confira em Base.</p>
              </div>

              <div className="mt-6 grid gap-3">
                <button className="premium-button-primary justify-center" type="button" onClick={subscribeMetaLeadsPage} disabled={subscribingMetaLeads || testingMetaLeads || loading}>
                  <ShieldCheck size={18} /> {subscribingMetaLeads ? 'Inscrevendo...' : 'Inscrever página no leadgen'}
                </button>

                <button className="premium-button-secondary justify-center" type="button" onClick={testMetaLeadsConnection} disabled={subscribingMetaLeads || testingMetaLeads || loading}>
                  <CheckCircle2 size={18} /> {testingMetaLeads ? 'Testando...' : 'Testar configuração e webhook'}
                </button>
              </div>

              {metaLeadsDiagnostic ? (
                <pre className="mt-6 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-zinc-100 bg-zinc-950 p-4 text-xs text-zinc-200">
                  {JSON.stringify(metaLeadsDiagnostic, null, 2)}
                </pre>
              ) : null}

              <InfoBox className="mt-6" label="Callback URL" value={callbackUrl} />
              <div className="mt-4">
                <ServerSecretStatus label="Segredos Meta" configured={metaLeadsForm.has_page_access_token && metaLeadsForm.has_verify_token} variable="Vercel server-side" />
              </div>
            </aside>
          </section>

          <form onSubmit={savePixel} className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <section className="premium-card p-6">
              <PanelHeader eyebrow="Meta Pixel" title="Pixel global do Facebook / Meta" description="Mantenha um Pixel permanente. Ele será usado em todas as landing pages de eventos e cada conversão levará a identificação da campanha e do evento." active={pixelForm.is_active} />

              <div className="mt-6 grid gap-4">
                <FormInput label="Nome da integração" value={pixelForm.name} onChange={(value) => setPixelForm({ ...pixelForm, name: value })} placeholder="Pixel do Facebook / Meta" />
                <FormInput label="ID do Pixel principal" value={pixelForm.pixel_id} onChange={(value) => setPixelForm({ ...pixelForm, pixel_id: value.replace(/\D/g, '') })} placeholder="Ex: 889787523792519" />

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Landing para teste (não vincula o Pixel)</span>
                  <select className="premium-input" value={pixelForm.test_campaign_id} onChange={(event) => setPixelForm({ ...pixelForm, test_campaign_id: event.target.value })}>
                    <option value="">Selecione uma landing ativa e publicada</option>
                    {landings.map((landing) => (
                      <option key={landing.id} value={landing.id}>{landing.name}</option>
                    ))}
                  </select>
                  <span className="text-xs font-bold text-zinc-400">
                    O Pixel funciona globalmente em todas as landings. Esta seleção serve somente para abrir uma página durante o teste.
                  </span>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">IDs adicionais de Pixel</span>
                  <textarea className="premium-input min-h-32" value={pixelForm.additional_pixel_ids} onChange={(event) => setPixelForm({ ...pixelForm, additional_pixel_ids: event.target.value })} placeholder={`Um por linha ou separados por vírgula\n123456789012345\n987654321098765`} />
                  <span className="text-xs font-bold text-zinc-400">IDs válidos detectados: {allPixelIds.length}</span>
                </label>

                {allPixelIds.length ? (
                  <div className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Pixels que serão instalados</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {allPixelIds.map((pixelId) => (
                        <span key={pixelId} className="rounded-full bg-white px-3 py-2 text-xs font-black text-zinc-700">{pixelId}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <ToggleCard title="Ativar Pixel global" description="Quando ativo, os IDs cadastrados serão carregados em todas as landings públicas e seus simuladores." checked={pixelForm.is_active} onChange={(checked) => setPixelForm({ ...pixelForm, is_active: checked })} />
              </div>
            </section>

            <section className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Eventos rastreados</h2>
              <p className="mt-2 text-sm font-bold text-zinc-500">O principal evento para campanhas será Lead. Todos os Pixels ativos recebem os mesmos eventos.</p>

              <div className="mt-5 grid gap-3">
                {eventOptions.map((event) => (
                  <label key={event.key} className="flex items-start justify-between gap-4 rounded-2xl bg-zinc-50 p-4">
                    <div>
                      <p className="text-sm font-black text-zinc-950">{event.label}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-500">{event.description}</p>
                    </div>
                    <input className="mt-1 h-5 w-5" type="checkbox" checked={Boolean(pixelForm.events[event.key])} onChange={(changeEvent) => updatePixelEvent(event.key, changeEvent.target.checked)} />
                  </label>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <button className="premium-button-primary justify-center" type="submit" disabled={savingPixel || loading}>
                  <Save size={18} /> {savingPixel ? 'Salvando...' : 'Salvar Pixels'}
                </button>

                {selectedLandingHref ? (
                  <a className="premium-button-secondary justify-center" href={selectedLandingHref} target="_blank" rel="noreferrer">
                    <CheckCircle2 size={18} /> Abrir landing selecionada
                  </a>
                ) : (
                  <button className="premium-button-secondary justify-center opacity-50" type="button" disabled>
                    <CheckCircle2 size={18} /> Selecione uma landing para testar
                  </button>
                )}
              </div>
            </section>
          </form>
        </div>
      </section>
    </main>
  );
}

function IntegrationCard({ title, status, icon, active = false }: { title: string; status: string; icon: React.ReactNode; active?: boolean }) {
  return (
    <div className={`premium-card p-5 ${active ? 'border-emerald-200 bg-emerald-50/40' : ''}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">{icon}</div>
      <h2 className="mt-5 text-xl font-black text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm font-bold text-zinc-500">{status}</p>
    </div>
  );
}

function PanelHeader({ eyebrow, title, description, active }: { eyebrow: string; title: string; description: string; active: boolean }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="premium-eyebrow text-red-700">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-black text-zinc-950">{title}</h2>
        <p className="mt-2 text-sm font-bold text-zinc-500">{description}</p>
      </div>
      <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
        {active ? 'Ativo' : 'Inativo'}
      </span>
    </div>
  );
}

function FormInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-wide text-zinc-500">{label}</span>
      <input className="premium-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function ToggleCard({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
      <div>
        <p className="text-sm font-black text-zinc-950">{title}</p>
        <p className="mt-1 text-xs font-bold text-zinc-500">{description}</p>
      </div>
      <input className="h-5 w-5" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function InfoBox({ label, value, onCopy, className = '' }: { label: string; value: string; onCopy?: () => void; className?: string }) {
  return (
    <div className={`rounded-2xl border border-zinc-100 bg-zinc-50 p-4 ${className}`}>
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-2 break-all text-xs font-black text-zinc-800">{value}</p>
      {onCopy ? (
        <button className="mt-3 inline-flex items-center gap-2 text-xs font-black text-zinc-700" type="button" onClick={onCopy}>
          <Copy size={14} /> Copiar
        </button>
      ) : null}
    </div>
  );
}

function ServerSecretStatus({ label, configured, variable }: { label: string; configured: boolean; variable: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <p className="text-xs font-black uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-sm font-black ${configured ? 'text-emerald-700' : 'text-amber-700'}`}>
        {configured ? 'Configurado com segurança no servidor' : 'Não configurado no servidor'}
      </p>
      <p className="mt-1 text-xs font-bold text-zinc-500">{variable} · valor nunca enviado ao navegador</p>
    </div>
  );
}
