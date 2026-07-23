'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Copy, MessageCircle, Save, Trash2 } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const defaultVerifyToken = 'auto-controle-whatsapp-2026';
const defaultGraphVersion = 'v20.0';

type StoreItem = {
  id: string;
  store_name: string;
  slug?: string;
  status?: string;
};

type WhatsappNumber = {
  id: string;
  label: string;
  store_id: string | null;
  phone_number: string | null;
  phone_number_id: string;
  waba_id: string | null;
  verify_token: string;
  graph_version: string;
  routing_mode: string;
  is_active: boolean;
  status: string;
  last_webhook_at: string | null;
  last_error: string | null;
  has_access_token: boolean;
  stores?: StoreItem | null;
};

const emptyForm = {
  id: '',
  label: '',
  store_id: '',
  phone_number: '',
  phone_number_id: '',
  waba_id: '',
  access_token: '',
  verify_token: defaultVerifyToken,
  graph_version: defaultGraphVersion,
  routing_mode: 'store_pipeline',
  is_active: true,
  auto_create_lead: true,
  auto_route_to_store: true
};

function formatDate(value: string | null) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data inválida';

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function MasterWhatsappIntegrationPage() {
  const supabase = createClient();
  const [origin, setOrigin] = useState('');
  const [message, setMessage] = useState('Carregando WhatsApp Oficial...');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [form, setForm] = useState(emptyForm);

  const callbackUrl = useMemo(() => {
    return `${origin || 'https://sistemaautomotivo.autosede.com.br'}/api/webhooks/whatsapp`;
  }, [origin]);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadData() {
    setLoading(true);
    setMessage('Carregando WhatsApp Oficial...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/master/integrations/whatsapp', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível carregar WhatsApp Oficial.');
        setLoading(false);
        return;
      }

      setStores(result.stores || []);
      setNumbers(result.numbers || []);
      setMessage('');
    } catch {
      setMessage('Erro ao carregar WhatsApp Oficial.');
    }

    setLoading(false);
  }

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
    loadData();
  }, []);

  function copy(value: string) {
    navigator.clipboard?.writeText(value);
    setMessage('Copiado.');
  }

  function editNumber(number: WhatsappNumber) {
    setForm({
      id: number.id,
      label: number.label || '',
      store_id: number.store_id || '',
      phone_number: number.phone_number || '',
      phone_number_id: number.phone_number_id || '',
      waba_id: number.waba_id || '',
      access_token: '',
      verify_token: number.verify_token || defaultVerifyToken,
      graph_version: number.graph_version || defaultGraphVersion,
      routing_mode: number.routing_mode || 'store_pipeline',
      is_active: Boolean(number.is_active),
      auto_create_lead: true,
      auto_route_to_store: true
    });

    setMessage('Editando número. O token fica oculto; preencha novamente apenas se quiser trocar.');
  }

  function resetForm() {
    setForm(emptyForm);
  }

  async function saveNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('Salvando número WhatsApp...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/master/integrations/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar número WhatsApp.');
        setSaving(false);
        return;
      }

      setMessage('Número WhatsApp salvo com sucesso. Configure o webhook na Meta com a Callback URL desta tela.');
      resetForm();
      await loadData();
    } catch {
      setMessage('Erro ao salvar número WhatsApp.');
    }

    setSaving(false);
  }

  async function deleteNumber(number: WhatsappNumber) {
    const confirmed = window.confirm(`Excluir o número ${number.label}? As conversas antigas permanecem no banco.`);

    if (!confirmed) return;

    setMessage('Excluindo número WhatsApp...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/master/integrations/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'delete', id: number.id })
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível excluir número WhatsApp.');
        return;
      }

      setMessage('Número excluído.');
      await loadData();
    } catch {
      setMessage('Erro ao excluir número WhatsApp.');
    }
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Integração" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Meta / WhatsApp Oficial</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">WhatsApp Oficial</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Cadastre números oficiais por loja. Quando uma mensagem chegar, o AUTO CONTROLE identifica o Phone Number ID e cria o lead automaticamente na loja vinculada.
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
            <form onSubmit={saveNumber} className="premium-card p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="premium-eyebrow text-emerald-700">Cloud API</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">Cadastrar número da loja</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">
                    Use os dados do WhatsApp Business Platform: WABA ID, Phone Number ID e Access Token.
                  </p>
                </div>

                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${form.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {form.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Callback URL para Webhook do WhatsApp</p>
                  <p className="mt-2 break-all text-sm font-black text-zinc-950">{callbackUrl}</p>
                  <button className="mt-3 inline-flex items-center gap-2 text-xs font-black text-emerald-700" type="button" onClick={() => copy(callbackUrl)}>
                    <Copy size={14} /> Copiar Callback URL
                  </button>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Loja vinculada</span>
                  <select className="premium-input" value={form.store_id} onChange={(event) => setForm({ ...form, store_id: event.target.value })}>
                    <option value="">Sem loja — enviar para Base Master</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>{store.store_name}</option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Nome interno</span>
                    <input className="premium-input" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Ex: WhatsApp Brasília Automóveis" required />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Número exibido</span>
                    <input className="premium-input" value={form.phone_number} onChange={(event) => setForm({ ...form, phone_number: event.target.value })} placeholder="Ex: +55 61 99999-9999" />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Phone Number ID</span>
                    <input className="premium-input" value={form.phone_number_id} onChange={(event) => setForm({ ...form, phone_number_id: event.target.value.replace(/\D/g, '') })} placeholder="ID do número na Meta" inputMode="numeric" required />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">WABA ID</span>
                    <input className="premium-input" value={form.waba_id} onChange={(event) => setForm({ ...form, waba_id: event.target.value.replace(/\D/g, '') })} placeholder="WhatsApp Business Account ID" inputMode="numeric" />
                  </label>
                </div>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Access Token</span>
                  <textarea className="premium-input min-h-28" value={form.access_token} onChange={(event) => setForm({ ...form, access_token: event.target.value.trim() })} placeholder={form.id ? 'Token oculto. Preencha apenas se quiser trocar.' : 'Cole aqui o token do WhatsApp Cloud API. Não envie por print ou chat.'} />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Verify Token</span>
                    <div className="flex gap-2">
                      <input className="premium-input" value={form.verify_token} onChange={(event) => setForm({ ...form, verify_token: event.target.value.trim() })} placeholder={defaultVerifyToken} required />
                      <button className="premium-button-secondary shrink-0" type="button" onClick={() => copy(form.verify_token)}>
                        <Copy size={16} />
                      </button>
                    </div>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Graph API Version</span>
                    <input className="premium-input" value={form.graph_version} onChange={(event) => setForm({ ...form, graph_version: event.target.value.trim() })} placeholder="v20.0" />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between gap-4 rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                    <div>
                      <p className="text-sm font-black text-zinc-950">Ativar número</p>
                      <p className="mt-1 text-xs font-bold text-zinc-500">Recebe mensagens e cria leads.</p>
                    </div>
                    <input className="h-5 w-5" type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                    <div>
                      <p className="text-sm font-black text-zinc-950">Criar lead automático</p>
                      <p className="mt-1 text-xs font-bold text-zinc-500">Telefone novo vira lead.</p>
                    </div>
                    <input className="h-5 w-5" type="checkbox" checked={form.auto_create_lead} onChange={(event) => setForm({ ...form, auto_create_lead: event.target.checked })} />
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
                  <button className="premium-button-secondary justify-center" type="button" onClick={resetForm}>
                    Limpar
                  </button>

                  <button className="premium-button-primary justify-center" type="submit" disabled={saving || loading}>
                    <Save size={18} /> {saving ? 'Salvando...' : form.id ? 'Atualizar número' : 'Salvar número WhatsApp'}
                  </button>
                </div>
              </div>
            </form>

            <aside className="premium-card p-6">
              <h2 className="text-2xl font-black text-zinc-950">Como configurar na Meta</h2>
              <div className="mt-5 space-y-4 text-sm font-bold text-zinc-500">
                <p>1. No Meta Developers, abra o app do WhatsApp.</p>
                <p>2. Vá em Webhooks e selecione WhatsApp Business Account.</p>
                <p>3. Cole a Callback URL desta tela.</p>
                <p>4. Cole o Verify Token desta tela.</p>
                <p>5. Assine o campo messages.</p>
                <p>6. Envie uma mensagem teste para o número conectado.</p>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-100 bg-zinc-950 p-4 text-xs text-white">
                <p className="font-black uppercase tracking-wide text-zinc-400">Regra de roteamento</p>
                <p className="mt-3 leading-relaxed text-zinc-300">
                  Toda mensagem recebida pelo Phone Number ID cadastrado será ligada à loja selecionada. Se a loja estiver vazia, o lead cai na Base Master sem loja.
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Verify Token</p>
                <p className="mt-2 break-all text-xs font-black text-zinc-800">{form.verify_token || defaultVerifyToken}</p>
              </div>
            </aside>
          </section>

          <section className="mt-7 premium-card p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="premium-eyebrow">Números cadastrados</p>
                <h2 className="mt-2 text-3xl font-black text-zinc-950">WhatsApps conectados às lojas</h2>
              </div>
              <button className="premium-button-secondary" type="button" onClick={loadData} disabled={loading}>Atualizar</button>
            </div>

            <div className="mt-6 grid gap-4">
              {numbers.map((number) => (
                <div key={number.id} className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <MessageCircle size={22} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-zinc-950">{number.label}</h3>
                        <p className="mt-1 text-sm font-bold text-zinc-500">{number.phone_number || 'Número não informado'} • {number.stores?.store_name || 'Sem loja vinculada'}</p>
                        <p className="mt-1 text-xs font-bold text-zinc-400">Phone Number ID: {number.phone_number_id}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-2 text-xs font-black uppercase ${number.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
                        {number.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-black uppercase text-zinc-500">
                        Token: {number.has_access_token ? 'Salvo' : 'Não salvo'}
                      </span>
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-black uppercase text-zinc-500">
                        Último webhook: {formatDate(number.last_webhook_at)}
                      </span>
                    </div>
                  </div>

                  {number.last_error ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{number.last_error}</p> : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="premium-button-secondary" type="button" onClick={() => editNumber(number)}>Editar</button>
                    <button className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700" type="button" onClick={() => deleteNumber(number)}>
                      <Trash2 size={16} /> Excluir
                    </button>
                  </div>
                </div>
              ))}

              {numbers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm font-bold text-zinc-400">
                  Nenhum número WhatsApp cadastrado ainda.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
