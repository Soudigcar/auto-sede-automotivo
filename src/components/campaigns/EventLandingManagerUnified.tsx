'use client';

import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { CampaignInventoryTable } from './CampaignInventoryTable';
import { CampaignLandingAdminForm } from './CampaignLandingAdminForm';
import { CampaignLandingSidebar } from './CampaignLandingSidebar';
import {
  CAMPAIGN_VISUAL_EDITOR_OPEN_EVENT,
  CAMPAIGN_VISUAL_EDITOR_REFRESH_EVENT,
  type CampaignVisualEditorRefreshDetail
} from './CampaignVisualEditorBridge';

const emptyForm: any = {
  id: '', event_id: '', name: '', slug: '', interest_rate: '1.89', whatsapp_number: '',
  auto_sync_inventory: true, is_active: false, published_at: null, draft_updated_at: null,
  editor_draft: null, published_layout: null, layout_version: 2
};

function slugify(value: string) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function campaignForm(campaign: any) {
  return { ...emptyForm, ...campaign, interest_rate: String(campaign?.interest_rate || '1.89') };
}

export function EventLandingManagerUnified() {
  const supabase = useMemo(() => createClient(), []);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');

  async function authHeaders(json = true) {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function load(preferredCampaignId?: string) {
    setLoading(true);
    try {
      const response = await fetch('/api/master/campaigns', { headers: await authHeaders(false), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as landings.');
      const nextCampaigns = result.campaigns || [];
      setCampaigns(nextCampaigns);
      setEvents(result.events || []);
      setForm((current: any) => {
        const targetId = preferredCampaignId || current.id || nextCampaigns[0]?.id || '';
        const selected = nextCampaigns.find((item: any) => item.id === targetId);
        return selected ? campaignForm(selected) : current;
      });
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar as landings.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAssignments(eventId: string) {
    if (!eventId) return setAssignments([]);
    const response = await fetch(`/api/master/event-vehicle-assignments?event_id=${encodeURIComponent(eventId)}`, { headers: await authHeaders(false), cache: 'no-store' });
    const result = await response.json();
    if (response.ok) setAssignments(result.assignments || []);
  }

  useEffect(() => {
    void load();
    const refresh = (event: Event) => {
      const campaignId = (event as CustomEvent<CampaignVisualEditorRefreshDetail>).detail?.campaignId;
      void load(campaignId);
    };
    window.addEventListener(CAMPAIGN_VISUAL_EDITOR_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(CAMPAIGN_VISUAL_EDITOR_REFRESH_EVENT, refresh);
  }, []);

  useEffect(() => { void loadAssignments(form.event_id); }, [form.event_id]);

  function selectCampaign(campaign: any) {
    setForm(campaignForm(campaign));
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNew() {
    setForm({ ...emptyForm });
    setAssignments([]);
    setMessage('Nova landing iniciada. Defina os dados administrativos e salve antes de editar o design.');
  }

  function selectEvent(eventId: string) {
    const event = events.find((item) => item.id === eventId);
    setForm((current: any) => ({
      ...current,
      event_id: eventId,
      name: current.id ? current.name : event?.event_name || '',
      slug: current.id ? current.slug : event?.slug || slugify(event?.event_name || '')
    }));
  }

  function openVisualEditor() {
    if (!form.id) return setMessage('Salve as configurações administrativas antes de abrir o editor visual.');
    window.dispatchEvent(new CustomEvent(CAMPAIGN_VISUAL_EDITOR_OPEN_EVENT, { detail: { campaignId: form.id } }));
  }

  async function save() {
    if (!form.event_id) return setMessage('Selecione o evento que será vinculado à landing.');
    setSaving(true);
    setMessage('Salvando configurações administrativas...');
    try {
      const response = await fetch('/api/master/campaigns/admin', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({
          id: form.id, event_id: form.event_id, name: form.name, slug: slugify(form.slug),
          interest_rate: form.interest_rate, whatsapp_number: form.whatsapp_number,
          auto_sync_inventory: form.auto_sync_inventory
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a landing.');
      setForm((current: any) => campaignForm({ ...current, ...result.campaign }));
      setMessage('Configurações administrativas salvas. O design do editor não foi alterado.');
      await load(result.campaign.id);
      await loadAssignments(result.campaign.event_id);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar a landing.');
    } finally {
      setSaving(false);
    }
  }

  async function syncInventory() {
    if (!form.event_id) return;
    setSyncing(true);
    const response = await fetch('/api/master/campaigns/sync', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ event_id: form.event_id }) });
    const result = await response.json();
    setSyncing(false);
    if (!response.ok) return setMessage(result.error || 'Erro ao sincronizar estoque.');
    setMessage(`Estoque sincronizado: ${result.inserted} novo(s) vínculo(s), ${result.total} veículo(s) no evento.`);
    await loadAssignments(form.event_id);
    await load(form.id);
  }

  async function updateAssignment(assignmentId: string, patch: Record<string, unknown>) {
    const response = await fetch('/api/master/event-vehicle-assignments', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ assignment_id: assignmentId, ...patch }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || 'Erro ao atualizar veículo.');
    setAssignments((current) => current.map((item) => item.id === assignmentId ? { ...item, ...result.assignment } : item));
  }

  const selectedEvent = events.find((item) => item.id === form.event_id);
  const activeCampaigns = campaigns.filter((item) => item.is_active);
  const usedEventIds = new Set<string>(campaigns.filter((item) => item.id !== form.id).map((item) => item.event_id).filter(Boolean));
  const previewVehicles = assignments.filter((item) => item.status === 'active' && item.show_on_landing === true && item.vehicle).map((item) => ({
    ...item.vehicle,
    price: Number(item.promotional_price || 0) > 0 ? Number(item.promotional_price) : Number(item.vehicle?.price || 0),
    store_name: item.store?.store_name || item.vehicle?.store_name
  }));
  const previewStores = Array.from(new Map<string, any>(assignments.filter((item) => item.store?.id).map((item) => [item.store.id, item.store])).values());

  return <div>
    <header className="rounded-[32px] bg-[#071020] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div><span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-300"><Megaphone size={16} /> Landings por evento</span><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Administração e design sem configurações duplicadas</h1><p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-zinc-300 sm:text-base">Esta tela controla evento, endereço, financiamento e estoque. Todo o conteúdo visual é editado exclusivamente no editor visual.</p></div>
        <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void load(form.id)} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-sm font-black"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar</button><button type="button" onClick={startNew} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black"><Plus size={17} /> Nova landing</button></div>
      </div>
    </header>

    {message ? <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}

    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-3xl border border-zinc-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Landings</p><strong className="mt-2 block text-4xl font-black">{campaigns.length}</strong></div>
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Publicadas</p><strong className="mt-2 block text-4xl font-black text-emerald-950">{activeCampaigns.length}</strong></div>
      <div className="rounded-3xl border border-zinc-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Veículos selecionados</p><strong className="mt-2 block text-4xl font-black">{assignments.filter((item) => item.status === 'active' && item.show_on_landing).length}</strong></div>
    </div>

    <div className="mt-6 grid gap-6 2xl:grid-cols-[1fr_420px]">
      <CampaignLandingAdminForm form={form} events={events} selectedEvent={selectedEvent} usedEventIds={usedEventIds} saving={saving} setForm={setForm} onSelectEvent={selectEvent} onOpenEditor={openVisualEditor} onSave={() => void save()} />
      <CampaignLandingSidebar form={form} selectedEvent={selectedEvent} campaigns={campaigns} assignments={assignments} previewVehicles={previewVehicles} previewStores={previewStores} syncing={syncing} onSync={() => void syncInventory()} onSelectCampaign={selectCampaign} />
    </div>

    {form.event_id ? <CampaignInventoryTable assignments={assignments} search={vehicleSearch} setSearch={setVehicleSearch} onUpdate={(id, patch) => void updateAssignment(id, patch)} /> : null}
  </div>;
}
