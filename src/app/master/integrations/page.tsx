'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BarChart3, CheckCircle2, Database, Globe, MousePointerClick, Plug, Save, UploadCloud } from 'lucide-react';
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

const defaultEvents = Object.fromEntries(eventOptions.map((event) => [event.key, true]));

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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: 'Pixel do Facebook / Meta',
    pixel_id: '',
    additional_pixel_ids: '',
    is_active: false,
    events: defaultEvents as Record<string, boolean>
  });

  const allPixelIds = useMemo(() => {
    return Array.from(
      new Set([
        form.pixel_id.replace(/\D/g, '').trim(),
        ...parsePixelIds(form.additional_pixel_ids)
      ].filter(Boolean))
    );
  }, [form.pixel_id, form.additional_pixel_ids]);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadPixel() {
    setLoading(true);
    setMessage('Carregando integração do Pixel...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setLoading(false);
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
        setLoading(false);
        return;
      }

      const integration = result.integration;
      const additionalIds = Array.isArray(integration?.settings?.additional_pixel_ids)
        ? integration.settings.additional_pixel_ids
        : [];

      setForm({
        name: integration.name || 'Pixel do Facebook / Meta',
        pixel_id: integration.pixel_id || '',
        additional_pixel_ids: additionalIds.join('\n'),
        is_active: Boolean(integration.is_active),
        events: {
          ...defaultEvents,
          ...(integration?.settings?.events || {})
        }
      });

      setMessage('');
    } catch {
      setMessage('Erro ao carregar integração.');
    }

    setLoading(false);
  }

  async function savePixel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage('Salvando Pixels...');

    try {
      const token = await getAuthToken();

      if (!token) {
        setMessage('Sessão expirada. Faça login novamente.');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/master/integrations/meta-pixel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...form,
          additional_pixel_ids: parsePixelIds(form.additional_pixel_ids)
        })
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || 'Não foi possível salvar.');
        setSaving(false);
        return;
      }

      setMessage('Pixels salvos com sucesso. A landing vai disparar eventos para todos os IDs cadastrados.');
      await loadPixel();
    } catch {
      setMessage('Erro ao salvar Pixels.');
    }

    setSaving(false);
  }

  function updateEvent(key: string, value: boolean) {
    setForm((current) => ({
      ...current,
      events: {
        ...current.events,
        [key]: value
      }
    }));
  }

  useEffect(() => {
    loadPixel();
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
                Central de conexões técnicas do sistema. O Pixel do Facebook/Meta pode usar um ID principal e IDs adicionais.
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
            <div className={`premium-card p-5 ${form.is_active ? 'border-emerald-200 bg-emerald-50/40' : ''}`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <MousePointerClick size={22} />
              </div>
              <h2 className="mt-5 text-xl font-black text-zinc-950">Pixel do Facebook</h2>
              <p className="mt-2 text-sm font-bold text-zinc-500">
                {form.is_active ? `${allPixelIds.length} ID(s) ativo(s)` : 'Inativo'}
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

          <form onSubmit={savePixel} className="mt-7 grid gap-5 xl:grid-cols-[1fr_420px]">
            <section className="premium-card p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="premium-eyebrow">Meta Ads</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">Pixel do Facebook / Meta</h2>
                  <p className="mt-2 text-sm font-bold text-zinc-500">
                    Cadastre um Pixel principal e quantos Pixels adicionais precisar. Todos receberão os mesmos eventos da landing e do simulador.
                  </p>
                </div>

                <span className={`rounded-full px-4 py-2 text-xs font-black uppercase ${form.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {form.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Nome da integração</span>
                  <input
                    className="premium-input"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Pixel do Facebook / Meta"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">ID do Pixel principal</span>
                  <input
                    className="premium-input"
                    value={form.pixel_id}
                    onChange={(event) => setForm({ ...form, pixel_id: event.target.value.replace(/\D/g, '') })}
                    placeholder="Ex: 889787523792519"
                    inputMode="numeric"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-zinc-500">IDs adicionais de Pixel</span>
                  <textarea
                    className="premium-input min-h-32"
                    value={form.additional_pixel_ids}
                    onChange={(event) => setForm({ ...form, additional_pixel_ids: event.target.value })}
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
                    checked={form.is_active}
                    onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
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
                      checked={Boolean(form.events[event.key])}
                      onChange={(changeEvent) => updateEvent(event.key, changeEvent.target.checked)}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                <button className="premium-button-primary justify-center" type="submit" disabled={saving || loading}>
                  <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Pixels'}
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
