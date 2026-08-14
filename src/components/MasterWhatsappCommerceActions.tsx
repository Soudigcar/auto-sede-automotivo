'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, CalendarDays, Camera, Car, Check, ChevronLeft, Clock3, Loader2, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Mode = 'stock' | 'photos' | 'schedule' | 'transfer' | null;

type Vehicle = {
  id: string;
  store_id?: string | null;
  store_name?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  year?: string | number | null;
  model_year?: string | number | null;
  price?: number | null;
  mileage?: number | null;
  display_name?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
};

type TeamMember = {
  id: string;
  full_name: string;
  role?: string | null;
  role_label?: string | null;
};

const scheduleTypes = [
  { key: 'call_back', label: 'Ligar novamente' },
  { key: 'test_drive', label: 'Test-Drive' },
  { key: 'after_sales', label: 'Pós-venda' },
  { key: 'birthday', label: 'Feliz Aniversário' },
  { key: 'follow_up', label: 'Follow-up' }
] as const;

function vehicleLabel(vehicle: Vehicle) {
  return vehicle.display_name || [vehicle.brand, vehicle.model, vehicle.version, vehicle.model_year || vehicle.year].filter(Boolean).join(' ') || 'Veículo do portal';
}

function priceLabel(value?: number | null) {
  if (!value) return 'Preço não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

export default function MasterWhatsappCommerceActions({ conversationId, leadId, baseLeadId, onRefresh, onStatus }: {
  conversationId: string;
  leadId: string;
  baseLeadId: string;
  onRefresh: () => Promise<void> | void;
  onStatus: (message: string) => void;
}) {
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentResponsibleId, setCurrentResponsibleId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleType, setScheduleType] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [description, setDescription] = useState('');

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  function targetQuery() {
    const query = new URLSearchParams();
    if (leadId) query.set('lead_id', leadId);
    else if (baseLeadId) query.set('base_lead_id', baseLeadId);
    return query;
  }

  async function loadVehicles(nextMode: 'stock' | 'photos') {
    if (!leadId && !baseLeadId) return onStatus('Este contato ainda não possui lead vinculado.');
    setMode(nextMode);
    setSelectedVehicle(null);
    setSearch('');
    setLoading(true);
    try {
      const accessToken = await token();
      const query = targetQuery();
      const response = await fetch(`/api/master/whatsapp/portal-stock?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o estoque do portal.');
      setVehicles(result.vehicles || []);
    } catch (error: any) {
      onStatus(error?.message || 'Erro ao carregar estoque do portal.');
      setMode(null);
    } finally {
      setLoading(false);
    }
  }

  function openSchedule() {
    if (!leadId && !baseLeadId) return onStatus('Este contato ainda não possui lead vinculado.');
    setMode('schedule');
    setScheduleType('');
    setDate('');
    setTime('');
    setDescription('');
  }

  async function openTransfer() {
    setMode('transfer');
    setTeam([]);
    setTargetUserId('');

    if (!leadId) {
      setLoading(false);
      onStatus('Este lead ainda está somente na Base Master. Direcione-o para uma loja antes de transferir para um colaborador.');
      return;
    }

    setLoading(true);
    try {
      const accessToken = await token();
      const response = await fetch(`/api/store/lead-transfer?lead_id=${encodeURIComponent(leadId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a equipe responsável.');
      setTeam(result.team || []);
      setCurrentResponsibleId(String(result.current_responsible_id || ''));
    } catch (error: any) {
      onStatus(error?.message || 'Erro ao carregar responsáveis disponíveis.');
      setMode(null);
    } finally {
      setLoading(false);
    }
  }

  async function transferLead() {
    if (!leadId || !targetUserId) return onStatus('Selecione o novo responsável pelo lead.');
    setSaving(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/store/lead-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ lead_id: leadId, target_user_id: targetUserId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível transferir o lead.');
      const target = team.find((member) => member.id === targetUserId);
      onStatus(result.message || `Lead transferido para ${target?.full_name || 'o novo responsável'}.`);
      setMode(null);
      await onRefresh();
    } catch (error: any) {
      onStatus(error?.message || 'Erro ao transferir o lead.');
    } finally {
      setSaving(false);
    }
  }

  async function setVehicleInterest(confirm: boolean) {
    if (!selectedVehicle || (!leadId && !baseLeadId)) return;
    if (!confirm) {
      setSelectedVehicle(null);
      onStatus('Veículo não vinculado. Você pode escolher outro veículo.');
      return;
    }

    setSaving(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/master/whatsapp/portal-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          ...(leadId ? { lead_id: leadId } : { base_lead_id: baseLeadId }),
          vehicle_id: selectedVehicle.id
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível vincular o veículo do portal.');
      onStatus(`${vehicleLabel(selectedVehicle)} definido como veículo de interesse.`);
      setMode(null);
      setSelectedVehicle(null);
      await onRefresh();
    } catch (error: any) {
      onStatus(error?.message || 'Erro ao vincular veículo do portal.');
    } finally {
      setSaving(false);
    }
  }

  async function sendVehiclePhotos() {
    if (!selectedVehicle || !conversationId) return;
    const photos = Array.from(new Set([selectedVehicle.image_url, ...(selectedVehicle.image_urls || [])].filter(Boolean))) as string[];
    if (!photos.length) return onStatus('Este veículo não possui fotos publicadas no portal.');

    setSaving(true);
    try {
      const accessToken = await token();
      const response = await fetch('/api/whatsapp/messages/send-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ conversation_id: conversationId, media_urls: photos.slice(0, 10), caption: vehicleLabel(selectedVehicle) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar as fotos.');
      onStatus(`${result.sent_count || photos.length} foto(s) de ${vehicleLabel(selectedVehicle)} enviada(s).`);
      setMode(null);
      setSelectedVehicle(null);
      await onRefresh();
    } catch (error: any) {
      onStatus(error?.message || 'Erro ao enviar fotos do veículo.');
    } finally {
      setSaving(false);
    }
  }

  async function createSchedule() {
    if (!scheduleType || !date || !time || (!leadId && !baseLeadId)) return onStatus('Escolha o tipo, a data e o horário do agendamento.');
    setSaving(true);
    try {
      const accessToken = await token();
      const endpoint = leadId ? '/api/store/lead-task' : '/api/master/whatsapp/base-task';
      const payload = leadId
        ? { lead_id: leadId, task_type: scheduleType, date, time, description }
        : { base_lead_id: baseLeadId, task_type: scheduleType, date, time, description };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível criar o agendamento.');
      onStatus(`Agendamento criado: ${result.task?.title || 'tarefa adicionada ao calendário'}.`);
      setMode(null);
      await onRefresh();
    } catch (error: any) {
      onStatus(error?.message || 'Erro ao criar agendamento.');
    } finally {
      setSaving(false);
    }
  }

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vehicles;
    return vehicles.filter((vehicle) => `${vehicleLabel(vehicle)} ${vehicle.store_name || ''}`.toLowerCase().includes(term));
  }, [search, vehicles]);

  useEffect(() => {
    setMode(null);
    setSelectedVehicle(null);
  }, [conversationId]);

  return (
    <>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto py-0.5">
        <button type="button" onClick={() => void loadVehicles('stock')} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase text-blue-700 transition hover:bg-blue-100"><Car size={14} /> Estoque</button>
        <button type="button" onClick={() => void loadVehicles('photos')} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-black uppercase text-violet-700 transition hover:bg-violet-100"><Camera size={14} /> Fotos do veículo</button>
        <button type="button" onClick={openSchedule} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[10px] font-black uppercase text-amber-700 transition hover:bg-amber-100"><CalendarDays size={14} /> Agendar</button>
        <button type="button" onClick={() => void openTransfer()} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-black uppercase text-emerald-700 transition hover:bg-emerald-100"><ArrowRightLeft size={14} /> Transferir lead</button>
      </div>

      {mode ? (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setMode(null); }}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-red-600">Ação comercial Master</p>
                <h3 className="mt-1 text-lg font-black text-zinc-950">{mode === 'stock' ? 'Selecionar veículo do portal' : mode === 'photos' ? 'Enviar fotos do veículo do portal' : mode === 'transfer' ? 'Transferir lead' : 'Agendar atividade'}</h3>
              </div>
              <button type="button" disabled={saving} onClick={() => setMode(null)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50"><X size={17} /></button>
            </div>

            {mode === 'transfer' ? (
              <div className="max-h-[70vh] overflow-auto p-5">
                {!leadId ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center">
                    <ArrowRightLeft className="mx-auto text-emerald-600" size={28} />
                    <p className="mt-3 text-sm font-black text-emerald-900">Lead ainda na Base Master</p>
                    <p className="mt-2 text-xs font-bold leading-relaxed text-emerald-700">Primeiro direcione este lead para uma loja pela Base Master. Depois disso, este mesmo botão permitirá transferir o atendimento para um colaborador da equipe responsável.</p>
                  </div>
                ) : loading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="animate-spin text-emerald-600" /></div> : <>
                  <p className="mb-3 text-xs font-bold text-zinc-500">Selecione um colaborador ativo da loja responsável pelo lead.</p>
                  <div className="grid gap-2 sm:grid-cols-2">{team.map((member) => {
                    const current = member.id === currentResponsibleId;
                    const selected = member.id === targetUserId;
                    return <button key={member.id} type="button" disabled={current} onClick={() => setTargetUserId(member.id)} className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-emerald-400 bg-emerald-50' : 'border-zinc-200 bg-white hover:border-emerald-200'} ${current ? 'cursor-not-allowed opacity-55' : ''}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black text-zinc-900">{member.full_name}</p><p className="mt-1 text-[10px] font-black uppercase text-zinc-400">{member.role_label || member.role || 'Colaborador'}</p></div>{selected ? <Check size={17} className="text-emerald-600" /> : null}</div>{current ? <p className="mt-2 text-[10px] font-black uppercase text-emerald-600">Responsável atual</p> : null}</button>;
                  })}</div>
                  {!team.length ? <p className="py-10 text-center text-sm font-bold text-zinc-400">Este lead ainda não possui uma equipe de loja disponível para transferência.</p> : null}
                  <button type="button" onClick={() => void transferLead()} disabled={saving || !targetUserId} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black uppercase text-white transition hover:bg-emerald-700 disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />} Confirmar transferência</button>
                </>}
              </div>
            ) : mode === 'schedule' ? (
              <div className="max-h-[70vh] overflow-auto p-5">
                <div className="grid gap-2 sm:grid-cols-2">{scheduleTypes.map((item) => <button key={item.key} type="button" onClick={() => setScheduleType(item.key)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${scheduleType === item.key ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'}`}>{item.label}{scheduleType === item.key ? <Check size={16} /> : null}</button>)}</div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-zinc-600">Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-amber-300" /></label><label className="text-xs font-black text-zinc-600">Horário<input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-amber-300" /></label></div>
                <label className="mt-4 block text-xs font-black text-zinc-600">Observação<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Observação opcional..." className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-amber-300" /></label>
                <button type="button" onClick={() => void createSchedule()} disabled={saving || !scheduleType || !date || !time} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-xs font-black uppercase text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Clock3 size={16} />} Confirmar agendamento</button>
              </div>
            ) : selectedVehicle ? (
              <div className="max-h-[70vh] overflow-auto p-5">
                <button type="button" onClick={() => setSelectedVehicle(null)} className="mb-4 inline-flex items-center gap-1 text-xs font-black text-zinc-500 hover:text-red-600"><ChevronLeft size={15} /> Voltar ao estoque do portal</button>
                <div className="flex gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-zinc-200">{selectedVehicle.image_url ? <img src={selectedVehicle.image_url} alt="" className="h-full w-full object-cover" /> : null}</div>
                  <div className="min-w-0"><h4 className="text-base font-black text-zinc-950">{vehicleLabel(selectedVehicle)}</h4><p className="mt-1 text-sm font-black text-red-600">{priceLabel(selectedVehicle.price)}</p><p className="mt-1 text-[10px] font-bold uppercase text-zinc-400">{selectedVehicle.store_name || 'Portal AutoSede'}</p><p className="mt-2 text-xs font-bold text-zinc-500">{selectedVehicle.mileage ? `${Number(selectedVehicle.mileage).toLocaleString('pt-BR')} km` : 'Quilometragem não informada'}</p></div>
                </div>
                {mode === 'stock' ? (
                  <div className="mt-5 rounded-2xl border border-zinc-200 p-4"><p className="text-sm font-black text-zinc-900">Veículo de interesse do lead?</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={saving} onClick={() => void setVehicleInterest(false)} className="h-11 rounded-xl border border-zinc-200 text-xs font-black uppercase text-zinc-600">Não</button><button type="button" disabled={saving} onClick={() => void setVehicleInterest(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black uppercase text-white">{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Sim</button></div></div>
                ) : (
                  <div className="mt-5"><div className="grid grid-cols-4 gap-2">{Array.from(new Set([selectedVehicle.image_url, ...(selectedVehicle.image_urls || [])].filter(Boolean))).slice(0, 8).map((url) => <div key={url as string} className="aspect-square overflow-hidden rounded-xl bg-zinc-100"><img src={url as string} alt="" className="h-full w-full object-cover" /></div>)}</div><button type="button" disabled={saving} onClick={() => void sendVehiclePhotos()} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-black uppercase text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} Enviar fotos</button></div>
                )}
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto p-5">
                <div className="relative mb-4"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar veículo ou loja no portal..." className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm outline-none focus:border-blue-300" /></div>
                {loading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div> : <div className="grid gap-2 sm:grid-cols-2">{filteredVehicles.map((vehicle) => <button key={vehicle.id} type="button" onClick={() => setSelectedVehicle(vehicle)} className="flex gap-3 rounded-2xl border border-zinc-200 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/30"><div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100">{vehicle.image_url ? <img src={vehicle.image_url} alt="" className="h-full w-full object-cover" /> : null}</div><div className="min-w-0"><p className="line-clamp-2 text-xs font-black text-zinc-900">{vehicleLabel(vehicle)}</p><p className="mt-1 text-[11px] font-black text-red-600">{priceLabel(vehicle.price)}</p><p className="mt-1 truncate text-[9px] font-black uppercase text-zinc-400">{vehicle.store_name || 'Portal AutoSede'}</p></div></button>)}</div>}
                {!loading && !filteredVehicles.length ? <p className="py-12 text-center text-sm font-bold text-zinc-400">Nenhum veículo disponível e publicado no portal.</p> : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
