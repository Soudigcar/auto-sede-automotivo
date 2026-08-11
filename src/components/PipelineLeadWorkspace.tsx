'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, usePathname } from 'next/navigation';
import { ArrowRightLeft, CalendarPlus, Car, Check, Loader2, Save, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Member = { id: string; full_name: string; role: string; role_label: string };
type Vehicle = { id: string; display_name: string; price?: number | null; mileage?: string | null; image_url?: string | null; status: string };
type CatalogVehicle = { id: string; name: string; manufacture_year?: number | null; model_year?: number | null };
type Lead = { id: string; customer_name: string | null; customer_phone?: string | null; interested_vehicle: string | null; interested_vehicle_id?: string | null; origin: string | null; status: string; notes: string | null; appointment_notes: string | null };
type TransferData = { current_responsible_id: string | null; current_responsible?: Member | null; responsibilities?: { pre_sales?: Member | null; seller?: Member | null; prospector?: Member | null }; team: Member[] };
type CommercialDetails = { has_driver_license?: boolean | null; cpf?: string | null; birth_date?: string | null; payment_type?: string | null; has_trade_in?: boolean | null; trade_vehicle_configuration_id?: string | null; trade_vehicle_name?: string | null; trade_vehicle_manufacture_year?: number | null; trade_vehicle_model_year?: number | null };

const stages = [['new_lead','Novo lead'],['in_service','Em atendimento'],['scheduled','Agendado'],['appointment_cancelled','Cancelou'],['no_show','Não compareceu'],['showed_up','Compareceu'],['sale_confirmed','Venda'],['lost','Perdido']];
const taskTypes = [['call_back','Ligar novamente'],['send_simulation','Enviar simulação'],['request_documents','Solicitar documentos'],['confirm_visit','Confirmar visita'],['whatsapp_followup','Retornar pelo WhatsApp'],['other','Outra tarefa']];

function originLabel(origin: string | null) {
  const value = String(origin || '').toLowerCase();
  if (value.includes('event') || value.includes('campanha') || value.includes('landing')) return 'Evento';
  if (value.includes('portal') || value.includes('site') || value.includes('official')) return 'Portal oficial';
  return origin ? origin.replace(/_/g, ' ') : 'Não informada';
}

function defaultTask() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`, time: `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}` };
}

export function PipelineLeadWorkspace() {
  const pathname = usePathname() || '';
  const params = useParams();
  const slug = String(params?.slug || '');
  const supabase = useMemo(() => createClient(), []);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [transfer, setTransfer] = useState<TransferData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [notes, setNotes] = useState(''); const [appointmentNotes, setAppointmentNotes] = useState('');
  const [vehicleId, setVehicleId] = useState(''); const [responsibleId, setResponsibleId] = useState('');
  const [taskType, setTaskType] = useState('call_back'); const [taskDate, setTaskDate] = useState(''); const [taskTime, setTaskTime] = useState(''); const [taskDescription, setTaskDescription] = useState('');
  const [hasCnh, setHasCnh] = useState(''); const [cpf, setCpf] = useState(''); const [birthDate, setBirthDate] = useState(''); const [paymentType, setPaymentType] = useState(''); const [hasTradeIn, setHasTradeIn] = useState('');
  const [tradeQuery, setTradeQuery] = useState(''); const [tradeOptions, setTradeOptions] = useState<CatalogVehicle[]>([]); const [tradeVehicle, setTradeVehicle] = useState<CatalogVehicle | null>(null); const [commercialReady, setCommercialReady] = useState(true);
  const taskSlot = useMemo(defaultTask, [leadId]);

  async function request(url: string, options: RequestInit = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type':'application/json' } : {}), Authorization:`Bearer ${token}`, ...(options.headers || {}) }, cache:'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a ação.');
    return payload;
  }

  async function loadWorkspace(id: string) {
    setLoading(true); setMessage('');
    try {
      const [details, transferData, stock, phoneView] = await Promise.all([
        request(`/api/store/portal/pipeline/lead?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(id)}`),
        request(`/api/store/lead-transfer?lead_id=${encodeURIComponent(id)}`),
        request(`/api/store/portal/pipeline/lead-interest?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(id)}`),
        request('/api/store/portal/pipeline/actions', {
          method:'POST',
          body:JSON.stringify({ command:'reveal_phone', slug, lead_id:id })
        }).catch(() => ({ phone:'' }))
      ]);
      const currentLead = details.lead as Lead;
      setLead(currentLead); setTransfer(transferData); setVehicles(stock.vehicles || []);
      setName(currentLead.customer_name || ''); setPhone(phoneView.phone || currentLead.customer_phone || ''); setNotes(currentLead.notes || ''); setAppointmentNotes(currentLead.appointment_notes || ''); setVehicleId(currentLead.interested_vehicle_id || ''); setResponsibleId(transferData.current_responsible_id || '');
      setTaskDate(taskSlot.date); setTaskTime(taskSlot.time); setTaskDescription('');
      try {
        const commercial = await request(`/api/store/portal/pipeline/lead-commercial?slug=${encodeURIComponent(slug)}&lead_id=${encodeURIComponent(id)}`);
        const data = (commercial.details || {}) as CommercialDetails;
        setCommercialReady(true); setHasCnh(data.has_driver_license === true ? 'yes' : data.has_driver_license === false ? 'no' : ''); setCpf(data.cpf || ''); setBirthDate(data.birth_date || ''); setPaymentType(data.payment_type || ''); setHasTradeIn(data.has_trade_in === true ? 'yes' : data.has_trade_in === false ? 'no' : '');
        if (data.trade_vehicle_configuration_id) setTradeVehicle({ id:data.trade_vehicle_configuration_id, name:data.trade_vehicle_name || 'Veículo selecionado', manufacture_year:data.trade_vehicle_manufacture_year, model_year:data.trade_vehicle_model_year }); else setTradeVehicle(null);
        setTradeQuery(data.trade_vehicle_name || '');
      } catch (error: any) {
        setCommercialReady(false);
        setMessage(error?.message || 'Novos campos aguardam a migration.');
      }
    } catch (error: any) { setMessage(error?.message || 'Não foi possível carregar o atendimento.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!pathname.includes('/pipeline')) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const card = target.closest<HTMLElement>('[data-lead-id]');
      if (!card?.dataset.leadId) return;
      const button = target.closest<HTMLButtonElement>('button');
      const isEditButton = button?.textContent?.trim() === 'Editar';
      if (target.closest('a,input,textarea,select,label') || (button && !isEditButton)) return;
      event.preventDefault(); event.stopPropagation(); setLeadId(card.dataset.leadId); void loadWorkspace(card.dataset.leadId);
    };
    document.addEventListener('click', handler, true); return () => document.removeEventListener('click', handler, true);
  }, [pathname, slug]);

  useEffect(() => {
    if (!leadId) return;
    const previous = document.body.style.overflow; document.body.style.overflow='hidden';
    const close=(event:KeyboardEvent)=>event.key==='Escape'&&setLeadId(null); window.addEventListener('keydown', close);
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',close);};
  }, [leadId]);

  useEffect(() => {
    if (hasTradeIn !== 'yes' || tradeQuery.trim().length < 2) { setTradeOptions([]); return; }
    const timer = window.setTimeout(async () => {
      try { const result = await request(`/api/store/portal/vehicle-catalog-search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(tradeQuery)}`); setTradeOptions(result.vehicles || []); } catch { setTradeOptions([]); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [tradeQuery, hasTradeIn, slug]);

  async function saveLead() {
    if (!lead) return; setBusy(true);
    try { await request('/api/store/portal/pipeline/actions',{method:'POST',body:JSON.stringify({command:'edit_lead',slug,lead_id:lead.id,customer_name:name,customer_phone:phone,interested_vehicle:lead.interested_vehicle,origin:lead.origin,notes,appointment_notes:appointmentNotes})}); setMessage('Informações salvas.'); }
    catch(error:any){setMessage(error?.message||'Não foi possível salvar.');} finally{setBusy(false);}
  }

  async function saveCommercial() {
    if (!lead) return; setBusy(true);
    try {
      const result = await request('/api/store/portal/pipeline/lead-commercial',{method:'POST',body:JSON.stringify({slug,lead_id:lead.id,has_driver_license:hasCnh==='yes'?true:hasCnh==='no'?false:null,cpf,birth_date:birthDate||null,payment_type:paymentType||null,has_trade_in:hasTradeIn==='yes'?true:hasTradeIn==='no'?false:null,trade_vehicle_configuration_id:tradeVehicle?.id||null,trade_vehicle_name:tradeVehicle?.name||null,trade_vehicle_manufacture_year:tradeVehicle?.manufacture_year||null,trade_vehicle_model_year:tradeVehicle?.model_year||null})});
      setMessage(result.message || 'Dados comerciais salvos.');
    } catch(error:any){setMessage(error?.message||'Não foi possível salvar os dados comerciais.');} finally{setBusy(false);}
  }

  async function saveVehicle(){if(!lead)return;setBusy(true);try{const result=await request('/api/store/portal/pipeline/lead-interest',{method:'POST',body:JSON.stringify({slug,lead_id:lead.id,vehicle_id:vehicleId||null})});setLead((current)=>current?{...current,...result.lead}:current);setMessage(result.message||'Veículo atualizado.');}catch(error:any){setMessage(error?.message||'Não foi possível vincular o veículo.');}finally{setBusy(false);}}
  async function saveTransfer(){if(!lead)return;setBusy(true);try{const result=await request('/api/store/lead-transfer',{method:'POST',body:JSON.stringify({lead_id:lead.id,target_user_id:responsibleId||null})});setMessage(result.message||'Atendimento transferido.');setTransfer(await request(`/api/store/lead-transfer?lead_id=${encodeURIComponent(lead.id)}`));}catch(error:any){setMessage(error?.message||'Não foi possível transferir.');}finally{setBusy(false);}}
  async function saveTask(){if(!lead)return;setBusy(true);try{await request('/api/store/lead-task',{method:'POST',body:JSON.stringify({lead_id:lead.id,task_type:taskType,date:taskDate,time:taskTime,description:taskDescription})});setMessage('Tarefa adicionada ao calendário e ao histórico do lead.');setTaskDescription('');}catch(error:any){setMessage(error?.message||'Não foi possível agendar a tarefa.');}finally{setBusy(false);}}

  if (!leadId || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[2147483646] overflow-y-auto bg-black/80 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" onMouseDown={(event)=>{if(event.currentTarget===event.target)setLeadId(null);}}>
      <div className="mx-auto flex min-h-full max-w-6xl items-start justify-center"><section className="my-2 flex max-h-[calc(100dvh-16px)] w-full flex-col overflow-hidden rounded-[26px] bg-white text-zinc-950 shadow-2xl sm:my-4 sm:max-h-[calc(100dvh-32px)]">
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 sm:px-7"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Central de atendimento</p><h2 className="mt-1 text-2xl font-black">Detalhes do lead</h2></div><button type="button" onClick={()=>setLeadId(null)} className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"><X /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50 p-4 sm:p-7">
          {loading?<div className="flex min-h-96 items-center justify-center"><Loader2 className="animate-spin text-red-600" size={36}/></div>:lead?<div className="grid gap-5">
            <section className="rounded-[24px] bg-[#071020] p-5 text-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Carteira autorizada</p><h3 className="mt-2 text-2xl font-black sm:text-3xl">{name||'Cliente sem nome'}</h3><p className="mt-2 text-sm text-zinc-300">{lead.interested_vehicle||'Interesse não informado'}</p></div><span className="w-fit rounded-full bg-white/10 px-3 py-2 text-xs font-black uppercase text-white">Origem: {originLabel(lead.origin)}</span></div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3"><Responsibility label="Pré-venda" member={transfer?.responsibilities?.pre_sales}/><Responsibility label="Vendedor" member={transfer?.responsibilities?.seller}/><Responsibility label="Prospectador" member={transfer?.responsibilities?.prospector}/></div>
              <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Etapas do atendimento</p><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{stages.map(([key,label])=><span key={key} className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black ${lead.status===key?'bg-red-600 text-white':'bg-white/10 text-zinc-300'}`}>{lead.status===key?<Check size={13} className="mr-1 inline"/>:null}{label}</span>)}</div></div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="grid gap-3 lg:grid-cols-[1fr_auto]"><label className="text-xs font-black text-zinc-700">Transferir atendimento<select value={responsibleId} onChange={(e)=>setResponsibleId(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-black"><option value="">Carteira geral da loja</option>{transfer?.team?.map((member)=><option key={member.id} value={member.id}>{member.full_name} · {member.role_label}</option>)}</select></label><button onClick={saveTransfer} disabled={busy} className="self-end rounded-xl bg-zinc-950 px-5 py-3 text-sm font-black text-white"><ArrowRightLeft size={16} className="mr-2 inline"/>Transferir atendimento</button></div></section>

            <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-2"><WhiteField label="Nome do cliente" value={name} onChange={setName}/><WhiteField label="Telefone / WhatsApp" value={phone} onChange={setPhone}/><WhiteArea label="Observação geral" value={notes} onChange={setNotes}/><WhiteArea label="Observação do agendamento" value={appointmentNotes} onChange={setAppointmentNotes}/><div className="md:col-span-2 flex justify-end"><button onClick={saveLead} disabled={busy} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white"><Save size={17} className="mr-2 inline"/>Salvar informações</button></div></section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4"><h3 className="font-black">Qualificação pessoal e comercial</h3>{!commercialReady?<p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">A interface está pronta, mas a migration dos novos campos ainda precisa ser aplicada.</p>:null}<div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Choice label="Tem CNH?" value={hasCnh} onChange={setHasCnh} options={[['yes','Sim'],['no','Não']]}/><WhiteField label="CPF" value={cpf} onChange={setCpf}/><WhiteField label="Data de nascimento" type="date" value={birthDate} onChange={setBirthDate}/><Choice label="Forma de pagamento" value={paymentType} onChange={setPaymentType} options={[['cash','À vista'],['financed','Financiado'],['credit_letter','Carta de crédito']]}/><Choice label="Possui veículo na troca?" value={hasTradeIn} onChange={(value)=>{setHasTradeIn(value);if(value!=='yes'){setTradeVehicle(null);setTradeQuery('');}}} options={[['yes','Sim'],['no','Não']]}/></div>
              {hasTradeIn==='yes'?<div className="relative mt-4"><label className="text-xs font-black text-zinc-700">Qual carro será usado na troca?<div className="relative mt-2"><Search className="absolute left-3 top-3.5 text-zinc-400" size={18}/><input value={tradeQuery} onChange={(e)=>{setTradeQuery(e.target.value);setTradeVehicle(null);}} placeholder="Digite marca, modelo ou versão" className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-4 text-sm font-bold text-black"/></div></label>{tradeOptions.length?<div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl">{tradeOptions.map((item)=><button type="button" key={item.id} onClick={()=>{setTradeVehicle(item);setTradeQuery(`${item.name} ${item.manufacture_year||''}/${item.model_year||''}`.trim());setTradeOptions([]);}} className="block w-full border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50"><p className="text-sm font-black text-zinc-950">{item.name}</p><p className="text-xs text-zinc-500">{item.manufacture_year||'—'}/{item.model_year||'—'}</p></button>)}</div>:null}</div>:null}
              <div className="mt-4 flex justify-end"><button onClick={saveCommercial} disabled={busy||!commercialReady} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Salvar qualificação</button></div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center gap-2"><Car className="text-red-600"/><h3 className="font-black">Veículo de interesse no estoque</h3></div><div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"><select value={vehicleId} onChange={(e)=>setVehicleId(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-black"><option value="">Nenhum veículo vinculado</option>{vehicles.map((vehicle)=><option key={vehicle.id} value={vehicle.id}>{vehicle.display_name} · {vehicle.status}{vehicle.price?` · R$ ${Number(vehicle.price).toLocaleString('pt-BR')}`:''}</option>)}</select><button onClick={saveVehicle} disabled={busy} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white">Vincular veículo</button></div>{vehicleId?<VehiclePreview vehicle={vehicles.find((item)=>item.id===vehicleId)}/>:null}</section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center gap-2"><CalendarPlus className="text-red-600"/><h3 className="font-black">Agendar tarefa</h3></div><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"><Choice label="Tipo" value={taskType} onChange={setTaskType} options={taskTypes}/><WhiteField label="Data" type="date" value={taskDate} onChange={setTaskDate}/><WhiteField label="Hora" type="time" value={taskTime} onChange={setTaskTime}/><label className="text-xs font-black text-zinc-700">Responsável<input readOnly value={transfer?.current_responsible?.full_name||'Carteira geral da loja'} className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-3 text-sm font-bold text-black"/></label><div className="md:col-span-2 lg:col-span-4"><WhiteArea label="Descrição da tarefa" value={taskDescription} onChange={setTaskDescription}/></div><div className="md:col-span-2 lg:col-span-4 flex justify-end"><button onClick={saveTask} disabled={busy} className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-black text-white"><CalendarPlus size={17} className="mr-2 inline"/>Agendar tarefa</button></div></div></section>
            {message?<div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">{message}</div>:null}
          </div>:<div className="rounded-xl bg-red-50 p-4 text-red-700">{message||'Lead não encontrado.'}</div>}
        </div>
      </section></div>
    </div>, document.body
  );
}

function Responsibility({label,member}:{label:string;member?:Member|null}){return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-1 truncate text-sm font-black text-white">{member?.full_name||'Não atribuído'}</p></div>;}
function WhiteField({label,value,onChange,type='text'}:{label:string;value:string;onChange:(value:string)=>void;type?:string}){return <label className="text-xs font-black text-zinc-700">{label}<input type={type} value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-black outline-none focus:border-red-500"/></label>;}
function WhiteArea({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <label className="text-xs font-black text-zinc-700">{label}<textarea value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-black outline-none focus:border-red-500"/></label>;}
function Choice({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:string[][]}){return <label className="text-xs font-black text-zinc-700">{label}<select value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-black"><option value="">Selecione</option>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>;}
function VehiclePreview({vehicle}:{vehicle?:Vehicle}){if(!vehicle)return null;return <div className="mt-4 flex items-center gap-3 rounded-xl bg-zinc-50 p-3">{vehicle.image_url?<img src={vehicle.image_url} alt="" className="h-16 w-24 rounded-lg object-cover"/>:<div className="flex h-16 w-24 items-center justify-center rounded-lg bg-zinc-200"><Car/></div>}<div><p className="font-black text-zinc-950">{vehicle.display_name}</p><p className="mt-1 text-xs font-bold text-zinc-500">{vehicle.status}{vehicle.mileage?` · ${vehicle.mileage}`:''}</p></div></div>;}