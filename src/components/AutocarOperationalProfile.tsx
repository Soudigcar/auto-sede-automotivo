'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, MapPin, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const days = [
  ['monday', 'Segunda'], ['tuesday', 'Terça'], ['wednesday', 'Quarta'], ['thursday', 'Quinta'],
  ['friday', 'Sexta'], ['saturday', 'Sábado'], ['sunday', 'Domingo']
] as const;

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
  special_hours: Array<{ date: string; closed?: boolean; open?: string; close?: string; label?: string }>;
  default_visit_duration_minutes: number;
};

function emptyProfile(): Profile {
  return {
    timezone: 'America/Sao_Paulo', address_text: '', city: '', state: '', postal_code: '', location_label: '',
    latitude: '', longitude: '', maps_url: '', waze_url: '',
    weekly_hours: Object.fromEntries(days.map(([key]) => [key, []])),
    special_hours: [], default_visit_duration_minutes: 60
  };
}

export function AutocarOperationalProfile({ slug, canManage }: { slug: string; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile>(emptyProfile());
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
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o Perfil Operacional.');
      const source = result.profile || result.defaults || {};
      setProfile({ ...emptyProfile(), ...source, weekly_hours: { ...emptyProfile().weekly_hours, ...(source.weekly_hours || {}) }, special_hours: source.special_hours || [] });
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao carregar Perfil Operacional.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [slug]);

  function setDay(key: string, open: string, close: string, closed = false) {
    setProfile((current) => ({
      ...current,
      weekly_hours: { ...current.weekly_hours, [key]: closed ? [] : [{ open, close }] }
    }));
  }

  async function save() {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/store/portal/autocar/operational-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ slug, profile })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
      setProfile({ ...emptyProfile(), ...result.profile, weekly_hours: { ...emptyProfile().weekly_hours, ...(result.profile?.weekly_hours || {}) }, special_hours: result.profile?.special_hours || [] });
      setMessage('Perfil Operacional salvo somente no ambiente AUTOCAR de Preview.');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao salvar Perfil Operacional.');
    } finally { setSaving(false); }
  }

  return (
    <section className="premium-card mt-6 p-5 md:p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="premium-eyebrow">Fonte operacional oficial da AUTOCAR</p>
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
                <input className="premium-input md:col-span-2" placeholder="Endereço completo" value={profile.address_text || ''} disabled={!canManage} onChange={(e) => setProfile({ ...profile, address_text: e.target.value })} />
                <input className="premium-input" placeholder="Cidade" value={profile.city || ''} disabled={!canManage} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
                <input className="premium-input" placeholder="UF" value={profile.state || ''} disabled={!canManage} onChange={(e) => setProfile({ ...profile, state: e.target.value })} />
                <input className="premium-input" placeholder="Latitude" value={profile.latitude ?? ''} disabled={!canManage} onChange={(e) => setProfile({ ...profile, latitude: e.target.value })} />
                <input className="premium-input" placeholder="Longitude" value={profile.longitude ?? ''} disabled={!canManage} onChange={(e) => setProfile({ ...profile, longitude: e.target.value })} />
                <input className="premium-input md:col-span-2" placeholder="Link Google Maps" value={profile.maps_url || ''} disabled={!canManage} onChange={(e) => setProfile({ ...profile, maps_url: e.target.value })} />
                <input className="premium-input md:col-span-2" placeholder="Link Waze" value={profile.waze_url || ''} disabled={!canManage} onChange={(e) => setProfile({ ...profile, waze_url: e.target.value })} />
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
                    <input type="time" className="premium-input !py-2" disabled={!canManage || closed} value={interval?.open || '09:00'} onChange={(e) => setDay(key, e.target.value, interval?.close || '18:00')} />
                    <input type="time" className="premium-input !py-2" disabled={!canManage || closed} value={interval?.close || '18:00'} onChange={(e) => setDay(key, interval?.open || '09:00', e.target.value)} />
                    <label className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500"><input type="checkbox" checked={closed} disabled={!canManage} onChange={(e) => setDay(key, interval?.open || '09:00', interval?.close || '18:00', e.target.checked)} /> Fechado</label>
                  </div>;
                })}
              </div>
              <label className="mt-4 block text-xs font-black text-zinc-600">Duração padrão de visita
                <select className="premium-input mt-2" disabled={!canManage} value={profile.default_visit_duration_minutes || 60} onChange={(e) => setProfile({ ...profile, default_visit_duration_minutes: Number(e.target.value) })}>
                  <option value={30}>30 minutos</option><option value={45}>45 minutos</option><option value={60}>60 minutos</option><option value={90}>90 minutos</option>
                </select>
              </label>
            </div>
          </div>
          <p className="mt-4 text-[10px] font-bold text-zinc-400">Feriados e horários especiais já são suportados pela estrutura de dados e serão expostos na próxima evolução visual. Nenhuma alteração aqui muda o cadastro Production da loja.</p>
        </>
      )}
    </section>
  );
}
