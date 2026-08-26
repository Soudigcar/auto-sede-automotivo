'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const days = [
  ['monday', 'Segunda'],
  ['tuesday', 'Terça'],
  ['wednesday', 'Quarta'],
  ['thursday', 'Quinta'],
  ['friday', 'Sexta'],
  ['saturday', 'Sábado'],
  ['sunday', 'Domingo']
] as const;

type SpecialHour = {
  date: string;
  closed?: boolean;
  open?: string;
  close?: string;
  label?: string;
};
type Profile = {
  timezone: string;
  address_text: string;
  city: string;
  state: string;
  postal_code: string;
  location_label: string;
  latitude: string | number | null;
  longitude: string | number | null;
  maps_url: string;
  waze_url: string;
  weekly_hours: Record<string, Array<{ open: string; close: string }>>;
  special_hours: SpecialHour[];
  default_visit_duration_minutes: number;
};

function emptyProfile(): Profile {
  return {
    timezone: 'America/Sao_Paulo',
    address_text: '',
    city: '',
    state: '',
    postal_code: '',
    location_label: '',
    latitude: '',
    longitude: '',
    maps_url: '',
    waze_url: '',
    weekly_hours: Object.fromEntries(days.map(([key]) => [key, []])),
    special_hours: [],
    default_visit_duration_minutes: 60
  };
}

function sourceLabel(value: string) {
  return value === 'crm-production' ? 'CRM Production' : 'AUTOCAR DEV';
}

export function AutocarOperationalProfile({ slug, canManage }: { slug: string; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [profileSource, setProfileSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function load() {
    setLoading(true);
    try {
      const accessToken = await token();
      const response = await fetch(`/api/store/portal/autocar/operational-profile?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível carregar o Perfil Operacional.');
      }
      const source = result.profile || result.defaults || {};
      setProfile({
        ...emptyProfile(),
        ...source,
        weekly_hours: {
          ...emptyProfile().weekly_hours,
          ...(source.weekly_hours || {})
        },
        special_hours: source.special_hours || []
      });
      setProfileSource(String(result.profile_source || ''));
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar Perfil Operacional.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [slug]);

  function setDay(key: string, open: string, close: string, closed = false) {
    setProfile((current) => ({
      ...current,
      weekly_hours: {
        ...current.weekly_hours,
        [key]: closed ? [] : [{ open, close }]
      }
    }));
  }

  function addSpecial() {
    setProfile((current) => ({
      ...current,
      special_hours: [
        ...current.special_hours,
        { date: '', closed: true, label: '' }
      ]
    }));
  }

  function updateSpecial(index: number, patch: Partial<SpecialHour>) {
    setProfile((current) => ({
      ...current,
      special_hours: current.special_hours.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };

        if (patch.closed === true) {
          return {
            date: next.date,
            closed: true,
            label: next.label || ''
          };
        }

        if (patch.closed === false) {
          return {
            ...next,
            closed: false,
            open: next.open || '09:00',
            close: next.close || '18:00'
          };
        }

        return next;
      })
    }));
  }

  function removeSpecial(index: number) {
    setProfile((current) => ({
      ...current,
      special_hours: current.special_hours.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function save() {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/store/portal/autocar/operational-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ slug, profile })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');

      setProfile({
        ...emptyProfile(),
        ...result.profile,
        weekly_hours: {
          ...emptyProfile().weekly_hours,
          ...(result.profile?.weekly_hours || {})
        },
        special_hours: result.profile?.special_hours || []
      });
      const nextSource = String(result.profile_source || profileSource || '');
      setProfileSource(nextSource);
      setMessage(`Perfil Operacional salvo na fonte canônica ${sourceLabel(nextSource)}.`);
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao salvar Perfil Operacional.');
    } finally {
      setSaving(false);
    }
  }

  const source = sourceLabel(profileSource);
  const sourceDescription = profileSource === 'crm-production'
    ? 'Fonte canônica do negócio no CRM Production. Esta edição não altera o modo AUTOCAR, o WhatsApp ou o AUTOPILOT.'
    : 'Fonte de desenvolvimento usada por Preview. Esta edição não altera o CRM Production, o WhatsApp ou o AUTOPILOT.';

  return (
    <section className="premium-card mt-6 p-5 md:p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="premium-eyebrow">Fonte operacional oficial da AUTOCAR · {source}</p>
          <h2 className="mt-2 text-2xl font-black text-zinc-950">Horários e localização</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">A AUTOCAR usa estes dados para responder horário, validar visitas e fornecer localização. Campo vazio significa informação não configurada — a IA não deve inventar.</p>
        </div>
        <button type="button" onClick={() => void save()} disabled={!canManage || saving || loading} className="premium-button-primary shrink-0 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar perfil
        </button>
      </div>

      {message ? <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold text-zinc-600">{message}</div> : null}
      {loading ? <div className="mt-5 flex items-center gap-2 text-sm font-bold text-zinc-500"><Loader2 size={17} className="animate-spin" /> Carregando...</div> : (
        <>
          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black text-zinc-900"><MapPin size={17} className="text-red-600" /> Localização da loja</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input className="premium-input md:col-span-2" placeholder="Nome do local / referência" value={profile.location_label || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, location_label: event.target.value })} />
                <input className="premium-input md:col-span-2" placeholder="Endereço completo" value={profile.address_text || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, address_text: event.target.value })} />
                <input className="premium-input" placeholder="Cidade" value={profile.city || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, city: event.target.value })} />
                <input className="premium-input" placeholder="UF" value={profile.state || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, state: event.target.value })} />
                <input className="premium-input" placeholder="CEP" value={profile.postal_code || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, postal_code: event.target.value })} />
                <input className="premium-input" placeholder="Fuso horário IANA" value={profile.timezone || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })} />
                <input className="premium-input" placeholder="Latitude" value={profile.latitude ?? ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, latitude: event.target.value })} />
                <input className="premium-input" placeholder="Longitude" value={profile.longitude ?? ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, longitude: event.target.value })} />
                <p className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-800">Para enviar o pin nativo no WhatsApp, informe latitude e longitude reais. O link do Maps sozinho não substitui as coordenadas, e o ponto 0,0 é bloqueado por segurança.</p>
                <input type="url" className="premium-input md:col-span-2" placeholder="Link Google Maps (HTTPS)" value={profile.maps_url || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, maps_url: event.target.value })} />
                <input type="url" className="premium-input md:col-span-2" placeholder="Link Waze (HTTPS)" value={profile.waze_url || ''} disabled={!canManage} onChange={(event) => setProfile({ ...profile, waze_url: event.target.value })} />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black text-zinc-900"><CalendarClock size={17} className="text-red-600" /> Horário semanal</h3>
              <div className="mt-4 space-y-2">
                {days.map(([key, label]) => {
                  const interval = profile.weekly_hours?.[key]?.[0];
                  const closed = !interval;
                  return <div key={key} className="grid grid-cols-[90px_1fr_1fr_auto] items-center gap-2 rounded-xl bg-zinc-50 p-2">
                    <span className="text-xs font-black text-zinc-700">{label}</span>
                    <input type="time" className="premium-input !py-2" disabled={!canManage || closed} value={interval?.open || '09:00'} onChange={(event) => setDay(key, event.target.value, interval?.close || '18:00')} />
                    <input type="time" className="premium-input !py-2" disabled={!canManage || closed} value={interval?.close || '18:00'} onChange={(event) => setDay(key, interval?.open || '09:00', event.target.value)} />
                    <label className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500"><input type="checkbox" checked={closed} disabled={!canManage} onChange={(event) => setDay(key, interval?.open || '09:00', interval?.close || '18:00', event.target.checked)} /> Fechado</label>
                  </div>;
                })}
              </div>
              <label className="mt-4 block text-xs font-black text-zinc-600">Duração padrão de visita
                <select className="premium-input mt-2" disabled={!canManage} value={profile.default_visit_duration_minutes || 60} onChange={(event) => setProfile({ ...profile, default_visit_duration_minutes: Number(event.target.value) })}>
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>60 minutos</option>
                  <option value={90}>90 minutos</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-zinc-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><h3 className="flex items-center gap-2 text-sm font-black text-zinc-900"><CalendarClock size={17} className="text-red-600" /> Feriados e horários especiais</h3><p className="mt-1 text-xs text-zinc-500">Uma exceção desta lista tem prioridade sobre o horário semanal.</p></div>
              <button type="button" onClick={addSpecial} disabled={!canManage} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-[10px] font-black uppercase text-zinc-700 disabled:opacity-50"><Plus size={14} /> Adicionar exceção</button>
            </div>
            <div className="mt-4 space-y-2">
              {profile.special_hours.map((item, index) => (
                <div key={`${item.date}-${index}`} className="grid gap-2 rounded-xl bg-zinc-50 p-3 lg:grid-cols-[150px_1fr_auto_auto_auto] lg:items-center">
                  <input type="date" className="premium-input !py-2" disabled={!canManage} value={item.date || ''} onChange={(event) => updateSpecial(index, { date: event.target.value })} />
                  <input className="premium-input !py-2" placeholder="Motivo (ex.: Natal)" disabled={!canManage} value={item.label || ''} onChange={(event) => updateSpecial(index, { label: event.target.value })} />
                  <label className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500"><input type="checkbox" checked={Boolean(item.closed)} disabled={!canManage} onChange={(event) => updateSpecial(index, { closed: event.target.checked })} /> Fechado</label>
                  <div className="flex gap-2"><input type="time" className="premium-input !py-2" disabled={!canManage || Boolean(item.closed)} value={item.open || '09:00'} onChange={(event) => updateSpecial(index, { open: event.target.value })} /><input type="time" className="premium-input !py-2" disabled={!canManage || Boolean(item.closed)} value={item.close || '18:00'} onChange={(event) => updateSpecial(index, { close: event.target.value })} /></div>
                  <button type="button" onClick={() => removeSpecial(index)} disabled={!canManage} className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-white text-red-600 disabled:opacity-50"><Trash2 size={14} /></button>
                </div>
              ))}
              {!profile.special_hours.length ? <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-xs font-bold text-zinc-400">Nenhum feriado ou horário especial configurado.</div> : null}
            </div>
          </div>

          <p className="mt-4 text-[10px] font-bold text-zinc-400">{sourceDescription}</p>
        </>
      )}
    </section>
  );
}
