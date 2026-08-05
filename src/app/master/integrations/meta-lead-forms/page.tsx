'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type EventOption = {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
};

type FormMapping = {
  name: string;
  form_id: string;
  event_id: string;
  event_name: string;
  is_active: boolean;
};

const emptyMapping: FormMapping = {
  name: '',
  form_id: '',
  event_id: '',
  event_name: '',
  is_active: true
};

export default function MetaLeadFormsByEventPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [events, setEvents] = useState<EventOption[]>([]);
  const [mappings, setMappings] = useState<FormMapping[]>([]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function load() {
    setLoading(true);
    setMessage('Carregando formulários e eventos...');

    try {
      const token = await getToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-leads/forms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível carregar os formulários.');
      } else {
        setEvents(result.events || []);
        setMappings(result.mappings || []);
        setMessage('');
      }
    } catch {
      setMessage('Erro ao carregar os formulários vinculados.');
    }

    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setMessage('Salvando vínculos...');

    try {
      const token = await getToken();
      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-leads/forms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mappings })
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar os vínculos.');
      } else {
        setMappings(result.mappings || mappings);
        setMessage('Formulários vinculados com sucesso.');
      }
    } catch {
      setMessage('Erro ao salvar os vínculos.');
    }

    setSaving(false);
  }

  function update(index: number, patch: Partial<FormMapping>) {
    setMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function add() {
    setMappings((current) => [...current, { ...emptyMapping }]);
  }

  function remove(index: number) {
    setMappings((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="Integração" />

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Facebook / Instagram</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Formulários por evento</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Relacione cada Form ID da Meta ao evento que receberá e distribuirá seus leads.
              </p>
            </div>

            <Link href="/master/integrations" className="premium-button-secondary">
              <ArrowLeft size={18} /> Voltar às integrações
            </Link>
          </header>

          {message ? (
            <div className="mt-5 rounded-2xl border border-zinc-100 bg-white p-4 text-sm font-black text-zinc-600">
              {message}
            </div>
          ) : null}

          <section className="premium-card mt-7 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-950">Formulários vinculados</h2>
                <p className="mt-2 text-sm font-bold text-zinc-500">
                  Um formulário ativo precisa ter um evento ativo. IDs repetidos são bloqueados.
                </p>
              </div>

              <button className="premium-button-secondary" type="button" onClick={add} disabled={loading || saving}>
                <Plus size={18} /> Adicionar formulário
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              {mappings.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-zinc-200 p-8 text-center">
                  <p className="text-sm font-black text-zinc-700">Nenhum formulário vinculado.</p>
                  <p className="mt-2 text-xs font-bold text-zinc-400">Adicione o Form ID da nova campanha e escolha o evento de destino.</p>
                </div>
              ) : null}

              {mappings.map((mapping, index) => (
                <div key={`${mapping.form_id}-${index}`} className="rounded-[24px] border border-zinc-100 bg-zinc-50 p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
                    <label className="grid gap-2">
                      <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Nome do formulário</span>
                      <input className="premium-input" value={mapping.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Ex: Paizão - Cadastro" />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Form ID</span>
                      <input className="premium-input" value={mapping.form_id} onChange={(event) => update(index, { form_id: event.target.value.replace(/\D/g, '') })} placeholder="ID numérico da Meta" />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Evento de destino</span>
                      <select className="premium-input" value={mapping.event_id} onChange={(event) => {
                        const selected = events.find((item) => item.id === event.target.value);
                        update(index, { event_id: event.target.value, event_name: selected?.name || '' });
                      }}>
                        <option value="">Selecione o evento</option>
                        {events.map((event) => (
                          <option key={event.id} value={event.id}>{event.name}</option>
                        ))}
                      </select>
                    </label>

                    <button className="premium-button-secondary justify-center" type="button" onClick={() => remove(index)} disabled={saving}>
                      <Trash2 size={18} /> Remover
                    </button>
                  </div>

                  <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-zinc-100 bg-white p-4">
                    <div>
                      <p className="text-sm font-black text-zinc-950">Formulário ativo</p>
                      <p className="mt-1 text-xs font-bold text-zinc-500">Somente formulários ativos serão aceitos pelo webhook.</p>
                    </div>
                    <input className="h-5 w-5" type="checkbox" checked={mapping.is_active} onChange={(event) => update(index, { is_active: event.target.checked })} />
                  </label>
                </div>
              ))}
            </div>

            <button className="premium-button-primary mt-6 justify-center" type="button" onClick={save} disabled={loading || saving}>
              <Save size={18} /> {saving ? 'Salvando...' : 'Salvar formulários e eventos'}
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}
