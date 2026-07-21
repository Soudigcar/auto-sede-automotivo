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

const defaultMetaLeads = {
  is_active: false,
  app_id: '',
  page_id: '',
  form_id: '',
  page_access_token: '',
  verify_token: 'auto-controle-meta-leads-2026',
  graph_version: 'v20.0'
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
  const [origin, setOrigin] = useState('');

  const [pixelForm, setPixelForm] = useState({
    name: 'Pixel do Facebook / Meta',
    pixel_id: '',
    additional_pixel_ids: '',
    is_active: false,
    events: defaultEvents
  });

  const [metaLeadsForm, setMetaLeadsForm] = useState(defaultMetaLeads);

  const callbackUrl = useMemo(() => {
    return `${origin || 'https://sistemaautomotivo.autosede.com.br'}/api/webhooks/meta-leads`;
  }, [origin]);

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
      headers: {
        Authorization: `Bearer ${token}`
      }
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
      headers: {
        Authorization: `Bearer ${token}`
      }
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
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();
      setMetaLeadsDiagnostic(result);

      if (!response.ok) {
        setMessage(result.error || 'Erro ao testar integração.');
      } else {
        setMessage(result.summary || 'Teste concluído.');
      }
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
        headers: {
          Authorization: `Bearer ${token}`
        }
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

          <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className={`premium-card p-5 ${metaLeadsForm.is_active ? 'border-blue-200 bg-blue-50/40' : ''}`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <ShieldCheck size={22} />
              </div>
              <h2 className="mt-5 text-xl font-black text-zinc-950">Facebook Lead Forms</h2>
              <p className="mt-2 text-sm font-bold text-zinc-500">
                {metaLeadsForm.is_active ? 'Ativo' : 'Configurar'}
              </p>
            </div>

            <div className={`premium-card p-5 ${pixelForm.is_active ? 'border-emerald-200 bg-emerald-50/40' : ''}`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <MousePointerClick size={22} />
              </div>
              <h2 className="mt-5 text-xl font-black text-zinc-950">Pixel do Facebook</h2>
              <p className="mt-2 text-sm font-bold text-zinc-500">
                {pixelForm.is_active ? `${allPixelIds.length} ID(s) ativo(s)` : 'Inativo'}
              </p>
            </div>

            {baseItems.map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.title} className="premium-card premium-card-hover p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                    <Icon size={22} />
                  </div>
                  <h2 className="mt-5 text-xl font-black text-zinc-950">{item.title}</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">{item.status}</p>
                </div>
              );
            })}
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <form onSubmit={saveMetaLeads} className="premium-card p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="premium-eyebrow text-blue-700">Facebook / Instagram</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">Facebook Lead Forms</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">
                    Configure o webhook para os leads dos formulários instantâneos caírem automaticamente na Base.
                  </p>
                </div>

                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${metaLeadsForm.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {metaLeadsForm.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <div className="rounded-[24px] border border-blue-100 bg-blue-50/50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-blue-700">Callback URL para Meta Developers</p>
                  <p className="mt-2 break-all text-sm font-black text-zinc-950">{callbackUrl}</p>
                  <button
                    className="mt-3 inline-flex items-center gap-2 text-xs font-black text-blue-700"
                    type="button"
                    onClick={() => copy(callbackUrl)}
                  >
                    <Copy size={14} /> Copiar Callback URL
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">App ID</span>
                    <input
                      className="premium-input"
                      value={metaLeadsForm.app_id}
                      onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, app_id: event.target.value.replace(/\D/g, '') })}
                      placeholder="Ex: 588388460517343"
                      inputMode="numeric"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Page ID</span>
                    <input
                      className="premium-input"
                      value={metaLeadsForm.page_id}
                      onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, page_id: event.target.value.replace(/\D/g, '') })}
                      placeholder="ID da página"
                      inputMode="numeric"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Form ID opcional</span>
                    <input
                      className="premium-input"
                      value={metaLeadsForm.form_id}
                      onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, form_id: event.target.value.replace(/\D/g, '') })}
                      placeholder="ID do formulário"
                      inputMode="numeric"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Graph API Version</span>
                    <input
                      className="premium-input"
                      value={metaLeadsForm.graph_version}
                      onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, graph_version: event.target.value.trim() })}
                      placeholder="v20.0"
                    />
                  </label>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Page Access Token</span>
                  <textarea
                    className="premium-input min-h-28"
                    value={metaLeadsForm.page_access_token}
                    onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, page_access_token: event.target.value.trim() })}
                    placeholder="Cole aqui o token da Página. Não envie esse token por print ou no chat."
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Verify Token</span>
                  <div className="flex gap-2">
                    <input
                      className="premium-input"
                      value={metaLeadsForm.verify_token}
                      onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, verify_token: event.target.value.trim() })}
                      placeholder="auto-controle-meta-leads-2026"
                    />
                    <button
                      className="premium-button-secondary shrink-0"
                      type="button"
                      onClick={() => copy(metaLeadsForm.verify_token)}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </label>

                <label className="flex items-center justify-between gap-4 rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                  <div>
                    <p className="text-sm font-black text-zinc-950">Ativar recebimento de leads</p>
                    <p className="mt-1 text-xs font-bold text-zinc-500">
                      Quando ativo, os leads do formulário entram automaticamente na Base.
                    </p>
                  </div>

                  <input
                    className="h-5 w-5"
                    type="checkbox"
                    checked={metaLeadsForm.is_active}
                    onChange={(event) => setMetaLeadsForm({ ...metaLeadsForm, is_active: event.target.checked })}
                  />
                </label>

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
                <button
                  className="premium-button-primary justify-center"
                  type="button"
                  onClick={subscribeMetaLeadsPage}
                  disabled={subscribingMetaLeads || testingMetaLeads || loading}
                >
                  <ShieldCheck size={18} /> {subscribingMetaLeads ? 'Inscrevendo...' : 'Inscrever página no leadgen'}
                </button>

                <button
                  className="premium-button-secondary justify-center"
                  type="button"
                  onClick={testMetaLeadsConnection}
                  disabled={subscribingMetaLeads || testingMetaLeads || loading}
                >
                  <CheckCircle2 size={18} /> {testingMetaLeads ? 'Testando...' : 'Testar token e webhook'}
                </button>
              </div>

              {metaLeadsDiagnostic ? (
                <div className="mt-6 rounded-2xl border border-zinc-100 bg-zinc-950 p-4 text-xs text-white">
                  <p className="font-black uppercase tracking-wide text-zinc-400">Diagnóstico da Meta</p>

                  {(metaLeadsDiagnostic.checks || []).length ? (
                    <div className="mt-4 grid gap-3">
                      {metaLeadsDiagnostic.checks.map((check: any, index: number) => (
                        <div key={`${check.name}-${index}`} className="rounded-xl bg-white/5 p-3">
                          <p className={check.ok ? 'font-black text-emerald-300' : 'font-black text-red-300'}>
                            {check.ok ? 'OK' : 'ERRO'} — {check.name}
                          </p>
                          <p className="mt-1 break-words text-zinc-300">{check.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words text-zinc-300">
                      {JSON.stringify(metaLeadsDiagnostic, null, 2)}
                    </pre>
                  )}
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Callback URL</p>
                <p className="mt-2 break-all text-xs font-black text-zinc-800">{callbackUrl}</p>
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Verify Token</p>
                <p className="mt-2 break-all text-xs font-black text-zinc-800">{metaLeadsForm.verify_token}</p>
              </div>
            </aside>
          </section>

          <form onSubmit={savePixel} className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <section className="premium-card p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="premium-eyebrow">Meta Pixel</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">Pixel do Facebook / Meta</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">
                    Cadastre um Pixel principal e quantos Pixels adicionais precisar. Todos receberão os mesmos eventos da landing e do simulador.
                  </p>
                </div>

                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${pixelForm.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {pixelForm.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Nome da integração</span>
                  <input
                    className="premium-input"
                    value={pixelForm.name}
                    onChange={(event) => setPixelForm({ ...pixelForm, name: event.target.value })}
                    placeholder="Pixel do Facebook / Meta"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">ID do Pixel principal</span>
                  <input
                    className="premium-input"
                    value={pixelForm.pixel_id}
                    onChange={(event) => setPixelForm({ ...pixelForm, pixel_id: event.target.value.replace(/\D/g, '') })}
                    placeholder="Ex: 889787523792519"
                    inputMode="numeric"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">IDs adicionais de Pixel</span>
                  <textarea
                    className="premium-input min-h-32"
                    value={pixelForm.additional_pixel_ids}
                    onChange={(event) => setPixelForm({ ...pixelForm, additional_pixel_ids: event.target.value })}
                    placeholder={`Um por linha ou separados por vírgula\n123456789012345\n987654321098765`}
                  />
                  <span className="text-xs font-bold text-zinc-400">
                    IDs válidos detectados: {allPixelIds.length}
                  </span>
                </label>

                {allPixelIds.length ? (
                  <div className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Pixels que serão instalados</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {allPixelIds.map((pixelId) => (
                        <span key={pixelId} className="rounded-full bg-white px-3 py-2 text-xs font-black text-zinc-700">
                          {pixelId}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className="flex items-center justify-between gap-4 rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                  <div>
                    <p className="text-sm font-black text-zinc-950">Ativar Pixels na landing</p>
                    <p className="mt-1 text-xs font-bold text-zinc-500">
                      Quando ativo, todos os IDs cadastrados serão carregados no site público e no simulador.
                    </p>
                  </div>

                  <input
                    className="h-5 w-5"
                    type="checkbox"
                    checked={pixelForm.is_active}
                    onChange={(event) => setPixelForm({ ...pixelForm, is_active: event.target.checked })}
                  />
                </label>
              </div>
            </section>

            <section className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Eventos rastreados</h2>
              <p className="mt-2 text-sm font-bold text-zinc-500">
                O principal evento para campanhas será Lead. Todos os Pixels ativos recebem os mesmos eventos.
              </p>

              <div className="mt-5 grid gap-3">
                {eventOptions.map((event) => (
                  <label key={event.key} className="flex items-start justify-between gap-4 rounded-2xl bg-zinc-50 p-4">
                    <div>
                      <p className="text-sm font-black text-zinc-950">{event.label}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-500">{event.description}</p>
                    </div>

                    <input
                      className="mt-1 h-5 w-5"
                      type="checkbox"
                      checked={Boolean(pixelForm.events[event.key])}
                      onChange={(changeEvent) => updatePixelEvent(event.key, changeEvent.target.checked)}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <button className="premium-button-primary justify-center" type="submit" disabled={savingPixel || loading}>
                  <Save size={18} /> {savingPixel ? 'Salvando...' : 'Salvar Pixels'}
                </button>

                <a
                  className="premium-button-secondary justify-center"
                  href="/campanha/festival-seu-carro-agora"
                  target="_blank"
                >
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
