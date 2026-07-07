import { Car } from 'lucide-react';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

export function DashboardGoalBar({ sponsorship, goal, done, progress, eventLabel }: { sponsorship: number; goal: number; done: number; progress: number; eventLabel: string }) {
  const safeProgress = Math.max(0, Math.min(progress || 0, 100));

  return (
    <section className="mt-5 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600">Meta do evento</p>
          <h2 className="mt-1 text-2xl font-black text-[#101828]">{eventLabel}</h2>
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <Mini label="Patrocínio" value={money(sponsorship)} />
          <Mini label="Meta" value={money(goal)} />
          <Mini label="Realizado" value={money(done)} />
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-zinc-200 bg-[#F4F6FA] p-5">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-zinc-400">
          <span>Pista da meta</span>
          <span>{safeProgress}%</span>
        </div>
        <div className="relative mt-4 h-14 rounded-full border-4 border-zinc-300 bg-white shadow-inner">
          <div className="absolute left-5 right-5 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500" />
          <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `calc(${safeProgress}% - 20px)` }}>
            <div className="flex h-10 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg"><Car size={18} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3"><p className="text-xs font-bold text-zinc-400">{label}</p><strong className="block text-sm text-zinc-950">{value}</strong></div>;
}
