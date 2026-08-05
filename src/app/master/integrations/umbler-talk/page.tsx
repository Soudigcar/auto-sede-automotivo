'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, Copy, KeyRound, MessageCircle, RefreshCcw, Save, ShieldCheck, Webhook, XCircle } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const defaults = {
  is_active: false,
  verify_token: '',
  source_name: 'Umbler Talk / WhatsApp',
  routing_mode: 'round_robin_event',
  event_id: '',
  event_name: '',
  last_webhook_at: '',
  last_error: '',
  last_lead_phone: '',
  last_lead_id: ''
};

type ActiveEvent = {
  id: string;
  event_name: string;
  start_date?: string;
  end_date?: string;
  active_store_count: number;
};

function formatDateTime(value: string) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca';
  return date.toLocaleString('pt-BR');
}

function formatDate(value?: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function UmblerTalkIntegrationPage() {
  const supabase = createClient();
  const [origin, setOrigin] = useState('');
  const [form, setForm] = useState(defaults);
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const webhookUrl = useMemo(() => {
    const base = origin || 'https://sistemaautomotivo.autosede.com.br';
    const token = encodeURIComponent(form.verify_token || 'SEU_TOKEN');
    return `${base}/api/webhooks/umbler-talk?token=${token}`;
  }, [origin, form.verify_token]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === form.event_id) || null,
    [events, form.event_id]
  );

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function load(showMessage = false) {
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/master/integrations/umbler-talk', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível carregar a integração.');
        return;
      }

      const integration = result.integration || {};
      const settings = integration.settings || {};
      setEvents(Array.isArray(result.events) ? result.events : []);
      setForm({
        is_active: Boolean(integration.is_active),
        verify_token: settings.verify_token || '',
        source_name: settings.source_name || defaults.source_name,
        routing_mode: 'round_robin_event',
        event_id: settings.event_id || '',
        event_name: settings.event_name || '',
        last_webhook_at: settings.last_webhook_at || '',
        last_error: settings.last_error || '',
        last_lead_phone: settings.last_lead_phone || '',
        last_lead_id: settings.last_lead_id || ''
      });

      if (showMessage) setMessage('Status atualizado.');
    } catch {
      setMessage('Erro ao carregar a integração Umbler Talk.');
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('Salvando integração...');

    try {
      const token = await getAuthToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await fetch('/api/master/integrations/umbler-talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar a integração.');
        return;
      }

      setMessage('Integração Umbler Talk salva com sucesso.');
      await load();
    } catch {
      setMessage('Erro ao salvar a integração Umbler Talk.');
    } finally {
      setSaving(false);
    }
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value);
    setMessage('URL copiada.');
  }

  async function clearError() {
    const token = await getAuthToken();
    if (!token) return;
    const response = await fetch('/api/master/integrations/umbler-talk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'clear_error' })
    });
    if (response.ok) {
      setMessage('Erro limpo.');
      await load();
    }
  }

  return (
    <main className="min-h-screen bg-[#050912] text-white lg:flex">
      <MasterSidebar active="/master/integrations/umbler-talk" />

      <section className="flex-1 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500">Master · Integrações</p>
              <h1 className="mt-2 text-3xl font-black">Umbler Talk</h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                Recebe novos contatos, grava na Base e distribui somente entre as lojas vinculadas ao evento escolhido.
              </p>
            </div>
            <button type="button" onClick={() => void load(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold hover:bg-white/10">
              <RefreshCcw size={17} /> Atualizar status
            </button>
          </div>

          {message ? <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">{message}</div> : null}

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
            <form onSubmit={save} className="rounded-3xl border border-white/10 bg-[#0a111d] p-6 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-red-600/15 p-3 text-red-500"><Webhook size={22} /></div>
                <div>
                  <h2 className="text-xl font-black">Entrada automática de leads</h2>
                  <p className="text-sm text-zinc-500">O primeiro contato cria o lead dentro do evento selecionado.</p>
                </div>
              </div>

              <div className="mt-7 grid gap-5">
                <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div>
                    <p className="font-bold">Integração ativa</p>
                    <p className="mt-1 text-xs text-zinc-500">Exige token seguro, evento ativo e ao menos uma loja vinculada.</p>
                  </div>
                  <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} className="h-5 w-5 accent-red-600" />
                </label>

                <label>
                  <span className="flex items-center gap-2 text-sm font-bold text-zinc-300"><CalendarDays size={16} /> Evento de destino</span>
                  <select
                    value={form.event_id}
                    onChange={(event) => {
                      const next = events.find((item) => item.id === event.target.value);
                      setForm((current) => ({ ...current, event_id: event.target.value, event_name: next?.event_name || '' }));
                    }}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-[#080d16] px-4 py-3 outline-none focus:border-red-500"
                  >
                    <option value="">Selecione um evento ativo</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id} disabled={event.active_store_count === 0}>
                        {event.event_name} · {event.active_store_count} loja(s) ativa(s)
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-zinc-500">Os leads serão distribuídos em rodízio somente entre as lojas cadastradas neste evento.</p>
                </label>

                {selectedEvent ? (
                  <div className={`rounded-2xl border p-4 ${selectedEvent.active_store_count > 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="font-black">{selectedEvent.event_name}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {formatDate(selectedEvent.start_date)} até {formatDate(selectedEvent.end_date)} · {selectedEvent.active_store_count} loja(s) apta(s) ao rodízio
                    </p>
                  </div>
                ) : null}

                <label>
                  <span className="text-sm font-bold text-zinc-300">Nome da origem</span>
                  <input value={form.source_name} onChange={(event) => setForm((current) => ({ ...current, source_name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-red-500" />
                </label>

                <label>
                  <span className="text-sm font-bold text-zinc-300">Token de segurança</span>
                  <div className="mt-2 flex gap-2">
                    <input value={form.verify_token} onChange={(event) => setForm((current) => ({ ...current, verify_token: event.target.value }))} placeholder="Gere um token antes de ativar" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm outline-none focus:border-red-500" />
                    <button type="button" onClick={() => setForm((current) => ({ ...current, verify_token: generateToken() }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 hover:bg-white/10" title="Gerar token"><KeyRound size={18} /></button>
                  </div>
                </label>

                <div>
                  <span className="text-sm font-bold text-zinc-300">URL para cadastrar na Umbler Talk</span>
                  <div className="mt-2 flex gap-2">
                    <input readOnly value={webhookUrl} className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-zinc-300" />
                    <button type="button" onClick={() => copy(webhookUrl)} className="rounded-2xl bg-red-600 px-4 hover:bg-red-500" title="Copiar URL"><Copy size={18} /></button>
                  </div>
                </div>

                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-zinc-300">
                  <p className="font-bold text-cyan-300">Regra de distribuição</p>
                  <p className="mt-2">Evento: <strong>{selectedEvent?.event_name || 'não selecionado'}</strong></p>
                  <p>Lojas participantes: <strong>{selectedEvent?.active_store_count || 0}</strong></p>
                  <p>Estratégia: rodízio exclusivo por evento</p>
                </div>
              </div>

              <button type="submit" disabled={saving || loading} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-4 font-black hover:bg-red-500 disabled:opacity-50">
                <Save size={18} /> {saving ? 'Salvando...' : 'Salvar integração'}
              </button>
            </form>

            <aside className="space-y-5">
              <div className="rounded-3xl border border-white/10 bg-[#0a111d] p-6">
                <div className="flex items-center gap-3">
                  {form.is_active ? <CheckCircle2 className="text-emerald-400" /> : <XCircle className="text-zinc-600" />}
                  <div><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Status</p><p className="font-black">{form.is_active ? 'Ativa' : 'Desativada'}</p></div>
                </div>
                <div className="mt-6 space-y-4 text-sm">
                  <div><p className="text-zinc-500">Evento configurado</p><p className="mt-1 font-bold">{form.event_name || 'Nenhum'}</p></div>
                  <div><p className="text-zinc-500">Último webhook</p><p className="mt-1 font-bold">{formatDateTime(form.last_webhook_at)}</p></div>
                  <div><p className="text-zinc-500">Último telefone</p><p className="mt-1 font-bold">{form.last_lead_phone || 'Nenhum'}</p></div>
                  <div><p className="text-zinc-500">Distribuição</p><p className="mt-1 font-bold">Rodízio por evento</p></div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0a111d] p-6">
                <div className="flex items-center gap-3"><ShieldCheck className="text-cyan-400" /><p className="font-black">Proteções aplicadas</p></div>
                <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                  <li>• somente eventos ativos;</li>
                  <li>• somente lojas ativas do evento;</li>
                  <li>• rodízio independente por evento;</li>
                  <li>• mensagens enviadas e grupos ignorados;</li>
                  <li>• mesmo telefone não reinicia o rodízio no evento.</li>
                </ul>
              </div>

              {form.last_error ? (
                <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
                  <div className="flex items-center gap-3 text-red-300"><MessageCircle size={19} /><p className="font-black">Último erro</p></div>
                  <p className="mt-3 text-sm text-red-100">{form.last_error}</p>
                  <button type="button" onClick={() => void clearError()} className="mt-4 rounded-xl border border-red-400/30 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/10">Limpar erro</button>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
