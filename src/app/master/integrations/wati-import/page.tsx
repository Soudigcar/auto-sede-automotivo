'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, DownloadCloud, KeyRound, Plug, Save, ShieldAlert } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const defaultForm = {
  api_endpoint: '',
  api_token: '',
  has_api_token: false,
  page_size: 50,
  pages: 2,
  last_import_at: '',
  last_import_summary: ''
};

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

export default function WatiImportPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('Carregando configuração WATI...');
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadConfig() {
    setLoading(true);
    setMessage('Carregando configuração WATI...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/master/integrations/wati', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível carregar a configuração WATI.');
        setLoading(false);
        return;
      }

      const settings = payload.integration?.settings || {};

      setForm({
        api_endpoint: settings.api_endpoint || '',
        api_token: '',
        has_api_token: Boolean(settings.has_api_token),
        page_size: 50,
        pages: 2,
        last_import_at: settings.last_import_at || '',
        last_import_summary: settings.last_import_summary || ''
      });
      setMessage('');
    } catch {
      setMessage('Erro ao carregar configuração WATI.');
    }

    setLoading(false);
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('Salvando credenciais do WATI...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/master/integrations/wati', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          api_endpoint: form.api_endpoint,
          api_token: form.api_token
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível salvar credenciais WATI.');
        setSaving(false);
        return;
      }

      setMessage('Credenciais WATI salvas com sucesso.');
      await loadConfig();
    } catch {
      setMessage('Erro ao salvar credenciais WATI.');
    }

    setSaving(false);
  }

  async function importContacts() {
    setImporting(true);
    setResult(null);
    setMessage('Importando contatos recentes do WATI...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setImporting(false);
        return;
      }

      const response = await fetch('/api/master/integrations/wati/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          api_endpoint: form.api_endpoint,
          api_token: form.api_token,
          page_size: form.page_size,
          pages: form.pages
        })
      });

      const payload = await response.json();
      setResult(payload);

      if (!response.ok) {
        setMessage(payload.error || 'Não foi possível importar contatos WATI.');
        setImporting(false);
        return;
      }

      setMessage(payload.summary || 'Importação concluída.');
      await loadConfig();
    } catch {
      setMessage('Erro ao importar contatos WATI.');
    }

    setImporting(false);
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Integração" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">WATI / Recuperação de Leads</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Importar contatos recentes do WATI</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Busque contatos que ficaram no WATI e ainda não entraram na Base Master. O sistema só importa telefones que ainda não existem na Base.
              </p>
            </div>

            <Link href="/master/integrations" className="premium-button-secondary">
              <ArrowLeft size={18} /> Voltar para Integrações
            </Link>
          </header>

          {message ? (
            <div className="mt-5 rounded-2xl border border-zinc-100 bg-white p-4 text-sm font-black text-zinc-600">
              {message}
            </div>
          ) : null}

          <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <form onSubmit={saveConfig} className="premium-card p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="premium-eyebrow text-emerald-700">Credenciais WATI</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">Configurar API WATI</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">
                    No WATI, entre em API Docs/Developer e copie o API Endpoint e o Access Token.
                  </p>
                </div>

                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${form.has_api_token ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {form.has_api_token ? 'Token salvo' : 'Sem token'}
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">URL/base da API WATI</span>
                  <input
                    className="premium-input"
                    value={form.api_endpoint}
                    onChange={(event) => setForm({ ...form, api_endpoint: event.target.value.trim() })}
                    placeholder="Ex: https://live-mt-server.wati.io/10209416"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">API Key / Access Token WATI</span>
                  <div className="flex gap-2">
                    <input
                      className="premium-input"
                      type="password"
                      value={form.api_token}
                      onChange={(event) => setForm({ ...form, api_token: event.target.value.trim() })}
                      placeholder={form.has_api_token ? 'Token já salvo. Cole um novo apenas se quiser substituir.' : 'Cole o token do WATI aqui'}
                    />
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-zinc-100 bg-zinc-50 text-zinc-500">
                      <KeyRound size={18} />
                    </div>
                  </div>
                </label>

                <button className="premium-button-primary justify-center" type="submit" disabled={saving || loading}>
                  <Save size={18} /> {saving ? 'Salvando...' : 'Salvar credenciais WATI'}
                </button>
              </div>
            </form>

            <aside className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Importação</h2>
              <p className="mt-2 text-sm font-bold text-zinc-500">
                O endpoint usado é o getContacts do WATI. A importação respeita duplicidade por telefone.
              </p>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Contatos por página</span>
                    <input
                      className="premium-input"
                      type="number"
                      min={1}
                      max={100}
                      value={form.page_size}
                      onChange={(event) => setForm({ ...form, page_size: Number(event.target.value || 50) })}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Páginas</span>
                    <input
                      className="premium-input"
                      type="number"
                      min={1}
                      max={5}
                      value={form.pages}
                      onChange={(event) => setForm({ ...form, pages: Number(event.target.value || 2) })}
                    />
                  </label>
                </div>

                <button className="premium-button-primary justify-center" type="button" onClick={importContacts} disabled={importing || loading}>
                  <DownloadCloud size={18} /> {importing ? 'Importando...' : 'Importar contatos recentes'}
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Última importação</p>
                <p className="mt-2 text-sm font-black text-zinc-800">{formatDateTime(form.last_import_at)}</p>
                {form.last_import_summary ? <p className="mt-2 text-xs font-bold text-zinc-500">{form.last_import_summary}</p> : null}
              </div>

              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 text-amber-600" size={18} />
                  <p className="text-xs font-bold leading-relaxed text-amber-800">
                    Comece com 50 contatos por página e 2 páginas. Depois aumente se precisar. Não cole token em print ou conversa.
                  </p>
                </div>
              </div>
            </aside>
          </section>

          {result ? (
            <section className="premium-card mt-7 p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="premium-eyebrow text-emerald-700">Resultado</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">Resumo da importação</h2>
                </div>
                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {result.success ? 'Concluído' : 'Erro'}
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-5">
                <MiniStat label="Buscados" value={result.fetched_contacts || 0} />
                <MiniStat label="Com telefone" value={result.extracted_contacts || 0} />
                <MiniStat label="Processados" value={result.processed_contacts || 0} />
                <MiniStat label="Importados" value={result.imported || 0} />
                <MiniStat label="Já existiam" value={result.existing || 0} />
              </div>

              {(result.results || []).length ? (
                <div className="mt-5 max-h-[420px] overflow-auto rounded-2xl border border-zinc-100">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-400">
                      <tr>
                        <th className="p-4">Status</th>
                        <th className="p-4">Nome</th>
                        <th className="p-4">Telefone</th>
                        <th className="p-4">Loja</th>
                        <th className="p-4">Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.results || []).map((item: any, index: number) => (
                        <tr key={`${item.phone}-${index}`} className="border-t border-zinc-100">
                          <td className="p-4 font-black text-zinc-700">{item.status}</td>
                          <td className="p-4 font-bold text-zinc-600">{item.name || '-'}</td>
                          <td className="p-4 font-bold text-zinc-600">{item.phone || '-'}</td>
                          <td className="p-4 font-bold text-zinc-600">{item.assigned_store_name || '-'}</td>
                          <td className="p-4 font-bold text-red-600">{item.error || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
        <CheckCircle2 size={16} className="text-emerald-600" />
      </div>
      <p className="mt-2 text-3xl font-black text-zinc-950">{Number(value || 0).toLocaleString('pt-BR')}</p>
    </div>
  );
}
