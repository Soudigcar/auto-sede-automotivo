'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Copy,
  Database,
  Globe,
  MousePointerClick,
  Plug,
  RefreshCcw,
  Save,
  ShieldCheck,
  UploadCloud,
  XCircle
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

const defaultMetaLeads = {
  is_active: false,
  app_id: '',
  page_id: '',
  form_id: '',
  page_access_token: '',
  verify_token: 'auto-controle-meta-leads-2026',
  graph_version: 'v20.0'
};

const defaultWatiLeads = {
  is_active: false,
  verify_token: 'auto-controle-wati-leads-2026',
  source_name: 'WATI / Click-to-WhatsApp',
  routing_mode: 'round_robin',
  last_webhook_at: '',
  last_error: ''
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

function formatDateTime(value: string) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function MasterIntegrationsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [savingPixel, setSavingPixel] = useState(false);
  const [savingMetaLeads, setSavingMetaLeads] = useState(false);
  const [savingWatiLeads, setSavingWatiLeads] = useState(false);
  const [refreshingWati, setRefreshingWati] = useState(false);
  const [clearingWatiError, setClearingWatiError] = useState(false);
  const [testingMetaLeads, setTestingMetaLeads] = useState(false);
  const [subscribingMetaLeads, setSubscribingMetaLeads] = useState(false);
  const [metaLeadsDiagnostic, setMetaLeadsDiagnostic] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState('');

  const [pixelForm, setPixelForm] = useState({
    name: 'Pixel do Facebook / Meta',
    pixel_id: '',
    additional_pixel_ids: '',
    is_active: false,
    events: defaultEvents
  });

  const [metaLeadsForm, setMetaLeadsForm] = useState(defaultMetaLeads);
  const [watiLeadsForm, setWatiLeadsForm] = useState(defaultWatiLeads);

  const callbackUrl = useMemo(() => {
    return `${origin || 'https://sistemaautomotivo.autosede.com.br'}/api/webhooks/meta-leads`;
  }, [origin]);

  const watiCallbackUrl = useMemo(() => {
    const token = encodeURIComponent(watiLeadsForm.verify_token || defaultWatiLeads.verify_token);
    return `${origin || 'https://sistemaautomotivo.autosede.com.br'}/api/webhooks/wati-leads?token=${token}`;
  }, [origin, watiLeadsForm.verify_token]);

  const allPixelIds = useMemo(() => {
    return Array.from(
      new Set([
        pixelForm.pixel_id.replace(/\D/g, '').trim(),
        ...parsePixelIds(pixelForm.additional_pixel_ids)
      ].filter(Boolean))
    );
  }, [pixelForm.pixel_id, pixelForm.additional_pixel_ids]);

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

    setPixelForm({
      name: integration.name || 'Pixel do Facebook / Meta',
      pixel_id: integration.pixel_id || '',
      additional_pixel_ids: additionalIds.join('\n'),
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
      page_access_token: settings.page_access_token || '',
      verify_token: settings.verify_token || defaultMetaLeads.verify_token,
      graph_version: settings.graph_version || defaultMetaLeads.graph_version
    });
  }

  async function loadWatiLeads(showStatusMessage = false) {
    const token = await getAuthToken();
    if (!token) {
      setMessage('Sessão expirada. Faça login novamente.');
      return;
    }

    const response = await fetch('/api/master/integrations/wati', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || 'Não foi possível carregar WATI Leads.');
      return;
    }

    const integration = result.integration;
    const settings = integration?.settings || {};

    setWatiLeadsForm({
      is_active: Boolean(integration.is_active),
      verify_token: settings.verify_token || defaultWatiLeads.verify_token,
      source_name: settings.source_name || defaultWatiLeads.source_name,
      routing_mode: settings.routing_mode || defaultWatiLeads.routing_mode,
      last_webhook_at: settings.last_webhook_at || '',
      last_error: settings.last_error || ''
    });

    if (showStatusMessage) setMessage('Status do WATI atualizado.');
  }

  async function loadAll() {
    setLoading(true);
    setMessage('Carregando integrações...');

    try {
      await Promise.all([loadPixel(), loadMetaLeads(), loadWatiLeads()]);
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

      setMessage('Pixels salvos com sucesso.');
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
        body: JSON.stringify(metaLeadsForm)
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

  async function saveWatiLeads(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingWatiLeads(true);
    setMessage('Salvando WATI Leads...');

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSavingWatiLeads(false);
        return;
      }

      const response = await fetch('/api/master/integrations/wati', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(watiLeadsForm)
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar WATI Leads.');
        setSavingWatiLeads(false);
        return;
      }

      setMessage('WATI Leads salvo com sucesso.');
      await loadWatiLeads();
    } catch {
      setMessage('Erro ao salvar WATI Leads.');
    }

    setSavingWatiLeads(false);
  }

  async function refreshWatiStatus() {
    setRefreshingWati(true);
    await loadWatiLeads(true);
    setRefreshingWati(false);
  }

  async function clearWatiError() {
    setClearingWatiError(true);
    setMessage('Limpando erro do WATI...');

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setClearingWatiError(false);
        return;
      }

      const response = await fetch('/api/master/integrations/wati', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'clear_error' })
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível limpar o erro do WATI.');
        setClearingWatiError(false);
        return;
      }

      setMessage('Erro do WATI limpo com sucesso.');
      await loadWatiLeads();
    } catch {
      setMessage('Erro ao limpar o status do WATI.');
    }

    setClearingWatiError(false);
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
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
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
                Configure Pixel, Facebook Lead Forms, WATI, Webhook, API da Meta e conexões técnicas do sistema.
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
            <IntegrationCard title="Facebook Lead Forms" status={metaLeadsForm.is_active ? 'Ativo' : 'Configurar'} active={metaLeadsForm.is_active} icon={<ShieldCheck size={22} />} />
            <IntegrationCard title="WATI Leads" status={watiLeadsForm.is_active ? 'Ativo' : 'Configurar'} active={watiLeadsForm.is_active} icon={<Plug size={22} />} />
            <IntegrationCard title="Pixel do Facebook" status={pixelForm.is_active ? `${allPixelIds.length} ID(s) ativo(s)` : 'Inativo'} active={pixelForm.is_active} icon={<MousePointerClick size={22} />} />
            {baseItems.map((item) => {
              const Icon = item.icon;
              return <IntegrationCard key={item.title} title={item.title} status={item.status} icon={<Icon size={22} />} />;
            })}
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <form onSubmit={saveWatiLeads} className="premium-card p-6">
              <PanelHeader eyebrow="WATI / WhatsApp Ads" title="WATI Leads" description="Receba contatos do WATI, registre na Base Master e distribua automaticamente para as lojas." active={watiLeadsForm.is_active} />

              <div className="mt-6 grid gap-4">
                <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Webhook URL para colar no WATI</p>
                  <p className="mt-2 break-all text-sm font-black text-zinc-950">{watiCallbackUrl}</p>
                  <button className="mt-3 inline-flex items-center gap-2 text-xs font-black text-emerald-700" type="button" onClick={() => copy(watiCallbackUrl)}>
                    <Copy size={14} /> Copiar Webhook URL
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormInput label="Nome da origem" value={watiLeadsForm.source_name} onChange={(value) => setWatiLeadsForm({ ...watiLeadsForm, source_name: value })} placeholder="WATI / Click-to-WhatsApp" />
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Modo de distribuição</span>
                    <select className="premium-input" value={watiLeadsForm.routing_mode} onChange={(event) => setWatiLeadsForm({ ...watiLeadsForm, routing_mode: event.target.value })}>
                      <option value="round_robin">Distribuição uniforme / round-robin</option>
                    </select>
                  </label>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Token de segurança</span>
                  <div className="flex gap-2">
                    <input className="premium-input" value={watiLeadsForm.verify_token} onChange={(event) => setWatiLeadsForm({ ...watiLeadsForm, verify_token: event.target.value.trim() })} placeholder="auto-controle-wati-leads-2026" />
                    <button className="premium-button-secondary shrink-0" type="button" onClick={() => copy(watiLeadsForm.verify_token)}>
                      <Copy size={16} />
                    </button>
                  </div>
                </label>

                <ToggleCard title="Ativar recebimento de leads WATI" description="Quando ativo, cada novo contato recebido pelo webhook entra na Base e é direcionado para uma loja." checked={watiLeadsForm.is_active} onChange={(checked) => setWatiLeadsForm({ ...watiLeadsForm, is_active: checked })} />

                <button className="premium-button-primary justify-center" type="submit" disabled={savingWatiLeads || loading}>
                  <Save size={18} /> {savingWatiLeads ? 'Salvando...' : 'Salvar WATI Leads'}
                </button>
              </div>
            </form>

            <aside className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Como configurar no WATI</h2>
              <div className="mt-5 space-y-4 text-sm font-bold text-zinc-500">
                <p>1. No WATI, abra a área de Webhooks ou integrações.</p>
                <p>2. Cole a Webhook URL exibida neste painel.</p>
                <p>3. Ative apenas o evento de mensagem recebida para evitar duplicidade.</p>
                <p>4. Salve a integração e envie uma mensagem teste para o número conectado.</p>
                <p>5. Confira se o lead entrou na Base Master e no Pipeline da loja.</p>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Último webhook WATI</p>
                <p className="mt-2 text-sm font-black text-zinc-800">{formatDateTime(watiLeadsForm.last_webhook_at)}</p>
              </div>

              {watiLeadsForm.last_error ? (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-red-600">Último erro</p>
                  <p className="mt-2 break-words text-xs font-black text-red-700">{watiLeadsForm.last_error}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Status</p>
                  <p className="mt-2 text-xs font-black text-emerald-700">Sem erro salvo no WATI Leads.</p>
                </div>
              )}

              <div className="mt-4 grid gap-3">
                <button className="premium-button-secondary justify-center" type="button" onClick={refreshWatiStatus} disabled={refreshingWati || loading}>
                  <RefreshCcw size={18} /> {refreshingWati ? 'Atualizando...' : 'Atualizar status'}
                </button>

                <button className="premium-button-secondary justify-center" type="button" onClick={clearWatiError} disabled={clearingWatiError || loading || !watiLeadsForm.last_error}>
                  <XCircle size={18} /> {clearingWatiError ? 'Limpando...' : 'Limpar erro'}
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Importante</p>
                <p className="mt-2 text-xs font-bold leading-relaxed text-zinc-500">
                  O AUTO CONTROLE agora bloqueia webhooks duplicados do WATI por telefone em uma janela curta de segurança.
                </p>
              </div>
            </aside>
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

                <div className="grid gap-4 md:grid-cols-2">
                  <FormInput label="Form ID opcional" value={metaLeadsForm.form_id} onChange={(value) => setMetaLeadsForm({ ...metaLeadsForm, form_id: value.replace(/\D/g, '') })} placeholder="ID do formulário" />
                  <FormInput label="Graph API Version" value={metaLeadsForm.graph_version} onChange={(value) => setMetaLeadsForm({ ...metaLeadsForm, graph_version: value.trim() })} placeholder="v20.0" />
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Page Access Token</span>
                  <textarea className="premium-input min-h-28" value={metaLeadsForm.page_access_token} onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, page_access_token: event.target.value.trim() })} placeholder="Cole aqui o token da Página. Não envie esse token por print ou no chat." />
                </label>

                <FormInput label="Verify Token" value={metaLeadsForm.verify_token} onChange={(value) => setMetaLeadsForm({ ...metaLeadsForm, verify_token: value.trim() })} placeholder="auto-controle-meta-leads-2026" />

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
                <p>4. Cole o Verify Token exibido aqui.</p>
                <p>5. Assine o campo leadgen.</p>
                <p>6. Gere um lead teste e confira em Base.</p>
              </div>

              <div className="mt-6 grid gap-3">
                <button className="premium-button-primary justify-center" type="button" onClick={subscribeMetaLeadsPage} disabled={subscribingMetaLeads || testingMetaLeads || loading}>
                  <ShieldCheck size={18} /> {subscribingMetaLeads ? 'Inscrevendo...' : 'Inscrever página no leadgen'}
                </button>

                <button className="premium-button-secondary justify-center" type="button" onClick={testMetaLeadsConnection} disabled={subscribingMetaLeads || testingMetaLeads || loading}>
                  <CheckCircle2 size={18} /> {testingMetaLeads ? 'Testando...' : 'Testar token e webhook'}
                </button>
              </div>

              {metaLeadsDiagnostic ? (
                <pre className="mt-6 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-zinc-100 bg-zinc-950 p-4 text-xs text-zinc-200">
                  {JSON.stringify(metaLeadsDiagnostic, null, 2)}
                </pre>
              ) : null}

              <InfoBox className="mt-6" label="Callback URL" value={callbackUrl} />
              <InfoBox className="mt-4" label="Verify Token" value={metaLeadsForm.verify_token} />
            </aside>
          </section>

          <form onSubmit={savePixel} className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <section className="premium-card p-6">
              <PanelHeader eyebrow="Meta Pixel" title="Pixel do Facebook / Meta" description="Cadastre um Pixel principal e quantos Pixels adicionais precisar. Todos receberão os mesmos eventos da landing e do simulador." active={pixelForm.is_active} />

              <div className="mt-6 grid gap-4">
                <FormInput label="Nome da integração" value={pixelForm.name} onChange={(value) => setPixelForm({ ...pixelForm, name: value })} placeholder="Pixel do Facebook / Meta" />
                <FormInput label="ID do Pixel principal" value={pixelForm.pixel_id} onChange={(value) => setPixelForm({ ...pixelForm, pixel_id: value.replace(/\D/g, '') })} placeholder="Ex: 889787523792519" />

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

                <ToggleCard title="Ativar Pixels na landing" description="Quando ativo, todos os IDs cadastrados serão carregados no site público e no simulador." checked={pixelForm.is_active} onChange={(checked) => setPixelForm({ ...pixelForm, is_active: checked })} />
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

                <a className="premium-button-secondary justify-center" href="/campanha/festival-seu-carro-agora" target="_blank">
                  <CheckCircle2 size={18} /> Abrir landing para testar
                </a>
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
