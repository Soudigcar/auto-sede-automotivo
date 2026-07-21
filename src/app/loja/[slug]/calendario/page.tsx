'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  Car,
  ClipboardList,
  Clock3,
  LogOut,
  Package,
  Plus,
  Store,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

type ResponsibleInfo = {
  name: string;
  phone: string;
  email: string;
  photo_url: string;
};

type CalendarEvent = {
  id: string;
  source: 'lead' | 'task';
  title: string;
  subtitle: string;
  starts_at: string;
  status: string;
  adSource: string;
  customerName: string;
  customerPhone: string;
  vehicle: string;
  notes: string;
  responsible: ResponsibleInfo;
  raw: any;
};

function formatBrazilTime(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';

  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatEventDateTime(value: string) {
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

function buildMonthDays(baseDate: Date) {
  const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const days = [];

  const startPadding = firstDay.getDay();
  for (let i = 0; i < startPadding; i += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(baseDate.getFullYear(), baseDate.getMonth(), day));
  }

  return days;
}

function buildSlotWindow(date: string, time: string) {
  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

function initials(value: string) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] || 'A';
  const second = words[1]?.[0] || 'C';
  return `${first}${second}`.toUpperCase();
}

function buildResponsible(store: any, responsibleUser: any): ResponsibleInfo {
  return {
    name: responsibleUser?.full_name || store?.responsible_name || store?.store_name || 'Responsável da loja',
    phone: responsibleUser?.phone || store?.responsible_phone || 'Telefone não informado',
    email: responsibleUser?.email || store?.responsible_email || 'E-mail não informado',
    photo_url: responsibleUser?.photo_url || store?.photo_url || store?.responsible_photo_url || ''
  };
}

export default function StoreCalendarPage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [responsibleUser, setResponsibleUser] = useState<any>(null);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [message, setMessage] = useState('Validando acesso da loja...');
  const [brasiliaClock, setBrasiliaClock] = useState(formatBrazilTime());

  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDate, setTaskDate] = useState(() => toDateKey(new Date()));
  const [taskTime, setTaskTime] = useState('09:00');
  const [taskDescription, setTaskDescription] = useState('');

  async function loadCalendar() {
    const context = await getStorePortalContext(slug);

    if (context.status === 'unauthenticated') {
      router.replace(`/login?redirectedFrom=${encodeURIComponent(pathname)}`);
      return;
    }

    if (context.status !== 'ok') {
      setMessage('Acesso bloqueado. Este usuário não tem permissão para acessar esta loja.');
      return;
    }

    const [leadsResponse, tasksResponse, responsibleResponse] = await Promise.all([
      supabase
        .from('leads')
        .select('*')
        .eq('assigned_store_id', context.store.id)
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: true }),
      supabase
        .from('store_calendar_tasks')
        .select('*')
        .eq('store_id', context.store.id)
        .order('starts_at', { ascending: true }),
      supabase
        .from('users')
        .select('full_name, photo_url, email, phone')
        .eq('store_id', context.store.id)
        .eq('role', 'store')
        .limit(1)
    ]);

    if (leadsResponse.error) {
      setStore(context.store);
      setMessage('Não foi possível carregar os agendamentos dos leads.');
      return;
    }

    if (tasksResponse.error) {
      setStore(context.store);
      setMessage('Não foi possível carregar as tarefas do calendário.');
      return;
    }

    setStore(context.store);
    setLeads(leadsResponse.data || []);
    setTasks(tasksResponse.data || []);
    setResponsibleUser(responsibleResponse.error ? null : (responsibleResponse.data || [])[0] || null);
    setMessage('');
  }

  useEffect(() => {
    loadCalendar().catch(() => setMessage('Não foi possível carregar o calendário.'));
  }, [slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setBrasiliaClock(formatBrazilTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const responsible = buildResponsible(store, responsibleUser);

  const events: CalendarEvent[] = useMemo(() => {
    const leadEvents: CalendarEvent[] = leads.map((lead) => ({
      id: `lead-${lead.id}`,
      source: 'lead' as const,
      title: lead.customer_name || 'Cliente sem nome',
      subtitle: lead.interested_vehicle || 'Agendamento de lead',
      starts_at: lead.scheduled_at,
      status: lead.status || 'scheduled',
      adSource: lead.origin || lead.source || lead.campaign_name || lead.ad_name || 'Anúncio / origem não informado',
      customerName: lead.customer_name || 'Cliente sem nome',
      customerPhone: lead.customer_phone || 'Telefone não informado',
      vehicle: lead.interested_vehicle || lead.vehicle_category_interest || 'Veículo não informado',
      notes: lead.appointment_notes || lead.notes || 'Sem observação registrada.',
      responsible,
      raw: lead
    }));

    const taskEvents: CalendarEvent[] = tasks.map((task) => ({
      id: `task-${task.id}`,
      source: 'task' as const,
      title: task.title,
      subtitle: task.description || 'Tarefa futura',
      starts_at: task.starts_at,
      status: task.status || 'pending',
      adSource: 'Tarefa interna da loja',
      customerName: task.title,
      customerPhone: 'Não se aplica',
      vehicle: 'Não se aplica',
      notes: task.description || 'Sem observação registrada.',
      responsible,
      raw: task
    }));

    return [...leadEvents, ...taskEvents].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [leads, tasks, responsible.name, responsible.phone, responsible.email, responsible.photo_url]);

  const selectedEvents = events.filter((event) => toDateKey(new Date(event.starts_at)) === selectedDate);
  const todayEvents = events.filter((event) => toDateKey(new Date(event.starts_at)) === toDateKey(new Date()));
  const futureEvents = events.filter((event) => new Date(event.starts_at).getTime() >= Date.now());
  const monthDays = buildMonthDays(monthDate);

  async function hasConflict(start: Date, end: Date) {
    if (!store?.id) return true;

    const [leadConflict, taskConflict] = await Promise.all([
      supabase
        .from('leads')
        .select('id, customer_name, scheduled_at')
        .eq('assigned_store_id', store.id)
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', start.toISOString())
        .lt('scheduled_at', end.toISOString())
        .limit(1),
      supabase
        .from('store_calendar_tasks')
        .select('id, title, starts_at')
        .eq('store_id', store.id)
        .gte('starts_at', start.toISOString())
        .lt('starts_at', end.toISOString())
        .limit(1)
    ]);

    if (leadConflict.error || taskConflict.error) return true;

    return Boolean((leadConflict.data || []).length || (taskConflict.data || []).length);
  }

  async function createTask() {
    if (!store?.id) return;

    if (!taskTitle.trim()) {
      setMessage('Informe o título da tarefa.');
      return;
    }

    if (!taskDate || !taskTime) {
      setMessage('Informe data e hora da tarefa.');
      return;
    }

    const { start, end } = buildSlotWindow(taskDate, taskTime);

    if (Number.isNaN(start.getTime())) {
      setMessage('Data ou hora inválida.');
      return;
    }

    if (start.getTime() < Date.now()) {
      setMessage('Não é permitido criar tarefa em horário passado.');
      return;
    }

    const occupied = await hasConflict(start, end);

    if (occupied) {
      setMessage('Horário ocupado. Escolha outro horário no calendário.');
      return;
    }

    const { error } = await supabase.from('store_calendar_tasks').insert({
      store_id: store.id,
      title: taskTitle.trim(),
      description: taskDescription.trim() || null,
      task_type: 'task',
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'pending'
    });

    if (error) {
      setMessage('Erro ao salvar tarefa no calendário.');
      return;
    }

    setTaskTitle('');
    setTaskDescription('');
    setMessage('Tarefa registrada no calendário.');
    await loadCalendar();
  }

  if (message && !store) {
    return <main className="flex min-h-screen items-center justify-center bg-[#071020] p-6 text-center text-white">{message}</main>;
  }

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <aside className="hidden w-72 shrink-0 bg-[#071020] px-6 py-7 text-white lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/15 text-red-500"><Car size={22} /></div>
            <div>
              <p className="text-sm font-black tracking-wide">AUTO CONTROLE</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Automotivo</p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs text-zinc-500">Área operacional</p>
            <p className="mt-1 font-bold">{store?.store_name}</p>
            <span className="mt-2 inline-flex rounded-lg bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Store</span>
          </div>

          <nav className="mt-8 space-y-3 text-sm">
            <Link href={`/loja/${slug}`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Dashboard</Link>
            <Link href={`/loja/${slug}/minha-loja`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Store size={18} /> Minha Loja</Link>
            <Link href={`/loja/${slug}/estoque`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><Package size={18} /> Estoque</Link>
            <Link href={`/loja/${slug}/pipeline`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><BarChart3 size={18} /> Pipeline</Link>
            <Link href={`/loja/${slug}/calendario`} className="flex items-center gap-3 rounded-2xl bg-red-600 px-4 py-4 font-bold shadow-lg shadow-red-600/20"><CalendarDays size={18} /> Calendário</Link>
            <Link href={`/loja/${slug}/operacao`} className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><ClipboardList size={18} /> Operação</Link>
            <Link href="/logout" className="flex items-center gap-3 rounded-2xl px-4 py-4 text-zinc-400 hover:bg-white/5 hover:text-white"><LogOut size={18} /> Sair</Link>
          </nav>
        </aside>

        <div className="premium-canvas min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="premium-eyebrow">Agenda da Loja</p>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Calendário</h1>
              <p className="premium-muted mt-3 max-w-3xl text-sm">
                Todos os agendamentos e tarefas futuras da loja ficam registrados aqui. Passe o mouse ou clique no card para abrir os detalhes em 3D.
              </p>
            </div>

            <div className="rounded-[24px] border border-zinc-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-red-600">Horário de Brasília</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-black text-zinc-950"><Clock3 size={18} /> {brasiliaClock}</p>
            </div>
          </header>

          {message ? <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm font-medium text-zinc-600">{message}</div> : null}

          <section className="mt-7 grid gap-4 md:grid-cols-4">
            <Kpi label="Hoje" value={todayEvents.length} />
            <Kpi label="Futuros" value={futureEvents.length} />
            <Kpi label="Agendamentos" value={leads.length} />
            <Kpi label="Tarefas" value={tasks.length} />
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_380px]">
            <div className="premium-card p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-zinc-950">
                    {monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">Clique em um dia para ver os agendamentos e tarefas.</p>
                </div>

                <div className="flex gap-2">
                  <button className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-black text-zinc-600" type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}>Mês anterior</button>
                  <button className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white" type="button" onClick={() => setMonthDate(new Date())}>Hoje</button>
                  <button className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-black text-zinc-600" type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}>Próximo mês</button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-black uppercase tracking-wide text-zinc-400">
                <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-2">
                {monthDays.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} className="min-h-24 rounded-3xl bg-transparent" />;

                  const key = toDateKey(date);
                  const dayEvents = events.filter((event) => toDateKey(new Date(event.starts_at)) === key);
                  const isSelected = key === selectedDate;
                  const isToday = key === toDateKey(new Date());

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedDate(key);
                        setTaskDate(key);
                      }}
                      className={[
                        'min-h-24 rounded-3xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md',
                        isSelected ? 'border-red-300 bg-red-50 shadow-sm' : 'border-zinc-200 bg-white',
                        isToday ? 'ring-2 ring-red-100' : ''
                      ].join(' ')}
                    >
                      <span className="text-sm font-black text-zinc-950">{date.getDate()}</span>
                      {dayEvents.length ? <span className="mt-2 block rounded-full bg-red-600 px-2 py-1 text-center text-[10px] font-black text-white">{dayEvents.length} compromisso(s)</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5">
              <div className="premium-card p-6">
                <h2 className="text-2xl font-black text-zinc-950">Nova tarefa futura</h2>
                <p className="mt-1 text-sm text-zinc-500">O sistema bloqueia horários já ocupados por lead ou tarefa.</p>

                <div className="mt-5 grid gap-3">
                  <input className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" placeholder="Título da tarefa" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} />
                    <input className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} />
                  </div>
                  <textarea className="min-h-24 rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-red-500" placeholder="Observação" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} />
                  <button className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-4 text-sm font-black uppercase tracking-wide text-white" type="button" onClick={createTask}><Plus size={18} /> Salvar no calendário</button>
                </div>
              </div>

              <div className="premium-card p-6">
                <h2 className="text-2xl font-black text-zinc-950">Dia selecionado</h2>
                <p className="mt-1 text-sm text-zinc-500">{parseDateKey(selectedDate).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>

                <div className="mt-5 grid gap-3">
                  {selectedEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onMouseEnter={() => setActiveEvent(event)}
                      onFocus={() => setActiveEvent(event)}
                      onClick={() => setActiveEvent(event)}
                      className="group rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-left transition hover:-translate-y-1 hover:border-cyan-200 hover:bg-slate-950 hover:text-white hover:shadow-2xl hover:shadow-cyan-500/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-zinc-950 group-hover:text-white">{event.title}</p>
                          <p className="mt-1 text-xs text-zinc-500 group-hover:text-cyan-100">{event.subtitle}</p>
                        </div>
                        <span className={event.source === 'lead' ? 'rounded-full bg-red-50 px-3 py-1 text-[10px] font-black uppercase text-red-700' : 'rounded-full bg-sky-50 px-3 py-1 text-[10px] font-black uppercase text-sky-700'}>{event.source === 'lead' ? 'Lead' : 'Tarefa'}</span>
                      </div>
                      <p className="mt-3 text-sm font-black text-zinc-700 group-hover:text-cyan-100">{formatEventTime(event.starts_at)}</p>
                      <p className="mt-1 text-xs text-zinc-400 group-hover:text-cyan-200">{formatEventDateTime(event.starts_at)}</p>
                      <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-red-600 group-hover:text-cyan-300">Ver detalhes 3D</p>
                    </button>
                  ))}

                  {selectedEvents.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">Nenhum compromisso neste dia.</div> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      {activeEvent ? <Appointment3DModal event={activeEvent} onClose={() => setActiveEvent(null)} /> : null}
    </main>
  );
}

function Appointment3DModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const responsible = event.responsible;
  const isLead = event.source === 'lead';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-5xl" style={{ perspective: '1400px' }}>
        <div
          className="relative overflow-hidden rounded-[34px] border border-cyan-300/30 bg-slate-950 text-white shadow-2xl shadow-cyan-500/20"
          style={{ transform: 'rotateX(5deg) rotateY(-5deg)', transformStyle: 'preserve-3d' }}
          onClick={(eventClick) => eventClick.stopPropagation()}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.20),transparent_32%),radial-gradient(circle_at_70%_10%,rgba(239,68,68,0.16),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]" />
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.12) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

          <button className="absolute right-5 top-5 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20" type="button" onClick={onClose}>
            <X size={20} />
          </button>

          <div className="relative z-10 grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-5 flex items-center gap-3">
                <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-cyan-100">
                  {isLead ? 'Detalhes do Agendamento' : 'Detalhes da Tarefa'}
                </span>
                <span className="rounded-full bg-red-500/20 px-4 py-2 text-xs font-black uppercase tracking-wide text-red-100">{event.status}</span>
              </div>

              <div className="relative min-h-[285px] overflow-hidden rounded-[30px] border border-cyan-200/20 bg-black/30 p-5">
                <div className="absolute inset-x-8 bottom-10 h-24 rounded-[100%] border border-cyan-300/50 shadow-[0_0_35px_rgba(34,211,238,.45)]" />
                <div className="absolute inset-x-16 bottom-14 h-12 rounded-[100%] border border-red-300/50 shadow-[0_0_30px_rgba(239,68,68,.35)]" />
                <div className="absolute left-1/2 top-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[34px] border border-cyan-300/30 bg-cyan-300/10 shadow-[0_0_60px_rgba(34,211,238,.32)]">
                  <Car size={76} className="text-cyan-100 drop-shadow-[0_0_18px_rgba(34,211,238,.8)]" />
                </div>
                <div className="absolute bottom-4 left-5 right-5 grid grid-cols-3 gap-3 text-[10px] font-black uppercase tracking-wide text-cyan-100">
                  <span className="rounded-xl bg-white/10 px-3 py-2">Origem</span>
                  <span className="rounded-xl bg-white/10 px-3 py-2">Cliente</span>
                  <span className="rounded-xl bg-white/10 px-3 py-2">Agenda</span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <DataBlock label="Anúncio / origem do lead" value={event.adSource} />
                <DataBlock label="Carro de interesse" value={event.vehicle} />
                <DataBlock label="Cliente" value={event.customerName} />
                <DataBlock label="Telefone" value={event.customerPhone} />
                <DataBlock label="Data e hora" value={formatEventDateTime(event.starts_at)} />
                <DataBlock label="Observação" value={event.notes} />
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-100">Responsável pelo agendamento</p>

              <div className="mt-5 flex items-center gap-4">
                {responsible.photo_url ? (
                  <img src={responsible.photo_url} alt={responsible.name} className="h-24 w-24 rounded-3xl object-cover ring-4 ring-cyan-300/20" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-cyan-300/15 text-3xl font-black text-cyan-100 ring-4 ring-cyan-300/20">
                    {initials(responsible.name)}
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-black">{responsible.name}</h3>
                  <p className="mt-1 text-sm text-cyan-100">{responsible.phone}</p>
                  <p className="mt-1 text-xs text-white/50">{responsible.email}</p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl bg-black/25 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-white/50">Resumo rápido</p>
                <p className="mt-3 text-sm leading-relaxed text-white/80">
                  {isLead
                    ? `Lead ${event.customerName} agendado para ${formatEventDateTime(event.starts_at)}. Origem: ${event.adSource}. Interesse: ${event.vehicle}.`
                    : `Tarefa futura registrada para ${formatEventDateTime(event.starts_at)}. Descrição: ${event.notes}.`}
                </p>
              </div>

              <div className="mt-6 grid gap-3">
                <span className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-50">Horário bloqueado no calendário</span>
                <span className="rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-50">Não permite outro agendamento no mesmo horário</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-cyan-100/70">{label}</p>
      <p className="mt-2 text-sm font-bold text-white">{value || 'Não informado'}</p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="premium-card p-5">
      <p className="text-xs font-bold text-zinc-400">{label}</p>
      <strong className="mt-2 block text-3xl font-black text-zinc-950">{value}</strong>
    </div>
  );
}
