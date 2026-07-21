'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LogOut,
  Package,
  Plus,
  Store,
  XCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getStorePortalContext } from '@/lib/storePortalClient';

type CalendarEvent = {
  id: string;
  source: 'lead' | 'task';
  title: string;
  subtitle: string;
  starts_at: string;
  status: string;
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

export default function StoreCalendarPage() {
  const supabase = createClient();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const slug = String(params?.slug || '');

  const [store, setStore] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
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

    const [leadsResponse, tasksResponse] = await Promise.all([
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
        .order('starts_at', { ascending: true })
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
    setMessage('');
  }

  useEffect(() => {
    loadCalendar().catch(() => setMessage('Não foi possível carregar o calendário.'));
  }, [slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setBrasiliaClock(formatBrazilTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const events: CalendarEvent[] = useMemo(() => {
    const leadEvents = leads.map((lead) => ({
      id: `lead-${lead.id}`,
      source: 'lead' as const,
      title: lead.customer_name || 'Cliente sem nome',
      subtitle: lead.interested_vehicle || 'Agendamento de lead',
      starts_at: lead.scheduled_at,
      status: lead.status || 'scheduled'
    }));

    const taskEvents = tasks.map((task) => ({
      id: `task-${task.id}`,
      source: 'task' as const,
      title: task.title,
      subtitle: task.description || 'Tarefa futura',
      starts_at: task.starts_at,
      status: task.status || 'pending'
    }));

    return [...leadEvents, ...taskEvents].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [leads, tasks]);

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
                Todos os agendamentos e tarefas futuras da loja ficam registrados aqui. Horários ocupados não podem ser usados novamente.
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
                    <div key={event.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-zinc-950">{event.title}</p>
                          <p className="mt-1 text-xs text-zinc-500">{event.subtitle}</p>
                        </div>
                        <span className={event.source === 'lead' ? 'rounded-full bg-red-50 px-3 py-1 text-[10px] font-black uppercase text-red-700' : 'rounded-full bg-sky-50 px-3 py-1 text-[10px] font-black uppercase text-sky-700'}>{event.source === 'lead' ? 'Lead' : 'Tarefa'}</span>
                      </div>
                      <p className="mt-3 text-sm font-black text-zinc-700">{formatEventTime(event.starts_at)}</p>
                      <p className="mt-1 text-xs text-zinc-400">{formatEventDateTime(event.starts_at)}</p>
                    </div>
                  ))}

                  {selectedEvents.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-400">Nenhum compromisso neste dia.</div> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
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