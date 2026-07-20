'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Copy, Save, ShieldCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const defaultForm = {
  is_active: false,
  app_id: '',
  page_id: '',
  form_id: '',
  page_access_token: '',
  verify_token: 'auto-controle-meta-leads-2026',
  graph_version: 'v20.0'
};

export default function MetaLeadsIntegrationPage() {
  const supabase = createClient();

  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState('Carregando integração...');
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState('');

  const callbackUrl = useMemo(() => {
    return `${origin || 'https://sistemaautomotivo.autosede.com.br'}/api/webhooks/meta-leads`;
  }, [origin]);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadIntegration() {
    setMessage('Carregando integração...');

    try {
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
        setMessage(result.error || 'Não foi possível carregar a integração.');
        return;
      }

      const integration = result.integration;
      const settings = integration.settings || {};

      setForm({
        is_active: Boolean(integration.is_active),
        app_id: settings.app_id || '',
        page_id: settings.page_id || '',
        form_id: settings.form_id || '',
        page_access_token: settings.page_access_token || '',
        verify_token: settings.verify_token || defaultForm.verify_token,
        graph_version: settings.graph_version || defaultForm.graph_version
      });

      setMessage('');
    } catch {
      setMessage('Erro ao carregar integração.');
    }
  }

  async function saveIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Salvando integração...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar.');
        setSaving(false);
        return;
      }

      setMessage('Integração salva com sucesso.');
      await loadIntegration();
    } catch {
      setMessage('Erro ao salvar integração.');
    }

    setSaving(false);
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value);
    setMessage('Copiado.');
  }

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
    loadIntegration();
  }, []);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Integração" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Meta Ads</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Facebook Lead Forms</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Receba automaticamente na Base os leads dos formulários instantâneos do Facebook e Instagram.
              </p>
            </div>

            <Link href="/master/integrations" className="premium-button-secondary">
              <ArrowLeft size={18} /> Voltar
            </Link>
          </header>

          {message ? (
            <div className="mt-5 rounded-2xl border border-zinc-100 bg-white p-4 text-sm font-black text-zinc-600">
              {message}
            </div>
          ) : null}

          <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_420px]">
            <form onSubmit={saveIntegration} className="premium-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="premium-eyebrow">Configuração</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">Conectar formulário da Meta</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">
                    Salve o Page Access Token e use a URL de webhook abaixo no Meta Developers.
                  </p>
                </div>

                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${form.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {form.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">App ID</span>
                  <input
                    className="premium-input"
                    value={form.app_id}
                    onChange={(event) => setForm({ ...form, app_id: event.target.value.replace(/\D/g, '') })}
                    placeholder="Ex: 588388460517343"
                    inputMode="numeric"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Page ID</span>
                  <input
                    className="premium-input"
                    value={form.page_id}
                    onChange={(event) => setForm({ ...form, page_id: event.target.value.replace(/\D/g, '') })}
                    placeholder="ID da página que contém o formulário"
                    inputMode="numeric"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Form ID opcional</span>
                  <input
                    className="premium-input"
                    value={form.form_id}
                    onChange={(event) => setForm({ ...form, form_id: event.target.value.replace(/\D/g, '') })}
                    placeholder="Preencha apenas se quiser aceitar só um formulário"
                    inputMode="numeric"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Page Access Token</span>
                  <textarea
                    className="premium-input min-h-28"
                    value={form.page_access_token}
                    onChange={(event) => setForm({ ...form, page_access_token: event.target.value.trim() })}
                    placeholder="Cole aqui o token da Página. Não envie esse token por print ou no chat."
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Verify Token</span>
                  <input
                    className="premium-input"
                    value={form.verify_token}
                    onChange={(event) => setForm({ ...form, verify_token: event.target.value.trim() })}
                    placeholder="auto-controle-meta-leads-2026"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Graph API Version</span>
                  <input
                    className="premium-input"
                    value={form.graph_version}
                    onChange={(event) => setForm({ ...form, graph_version: event.target.value.trim() })}
                    placeholder="v20.0"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                  <div>
                    <p className="text-sm font-black text-zinc-950">Ativar recebimento de leads</p>
                    <p className="mt-1 text-xs font-bold text-zinc-500">
                      Quando ativo, novos leads do formulário entram automaticamente na Base.
                    </p>
                  </div>

                  <input
                    className="h-5 w-5"
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  />
                </label>

                <button className="premium-button-primary justify-center" type="submit" disabled={saving}>
                  <Save size={18} /> {saving ? 'Salvando...' : 'Salvar integração'}
                </button>
              </div>
            </form>

            <aside className="grid gap-5">
              <div className="premium-card p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <ShieldCheck size={22} />
                </div>

                <h2 className="mt-4 text-2xl font-black text-zinc-950">Dados para colocar na Meta</h2>

                <div className="mt-5 grid gap-4">
                  <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Callback URL</p>
                    <p className="mt-2 break-all text-sm font-black text-zinc-950">{callbackUrl}</p>
                    <button className="mt-3 inline-flex items-center gap-2 text-xs font-black text-red-600" type="button" onClick={() => copy(callbackUrl)}>
                      <Copy size={14} /> Copiar URL
                    </button>
                  </div>

                  <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Verify Token</p>
                    <p className="mt-2 break-all text-sm font-black text-zinc-950">{form.verify_token}</p>
                    <button className="mt-3 inline-flex items-center gap-2 text-xs font-black text-red-600" type="button" onClick={() => copy(form.verify_token)}>
                      <Copy size={14} /> Copiar token
                    </button>
                  </div>
                </div>
              </div>

              <div className="premium-card p-6">
                <h2 className="text-xl font-black text-zinc-950">Como configurar no Meta Developers</h2>
                <div className="mt-4 space-y-3 text-sm font-bold text-zinc-500">
                  <p>1. Vá em Webhooks.</p>
                  <p>2. Escolha o objeto Page.</p>
                  <p>3. Cole a Callback URL.</p>
                  <p>4. Cole o Verify Token.</p>
                  <p>5. Assine o campo leadgen.</p>
                  <p>6. Gere um lead teste e confira na Base.</p>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}
