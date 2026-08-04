'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, Car, Crown, Gauge, Medal, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type GoalSummary = {
  sponsorship: number;
  goal: number;
  done: number;
  progress: number;
  label: string;
};

type DashboardPayload = {
  goal?: GoalSummary;
  rankings?: { stores?: string[] };
};

type RankingItem = {
  name: string;
  sales: number;
  revenue: number;
};

const initialGoal: GoalSummary = {
  sponsorship: 0,
  goal: 0,
  done: 0,
  progress: 0,
  label: 'Todos os eventos'
};

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function percent(value: number) {
  return `${Math.max(0, Number(value || 0)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function parseMoney(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized || 0);
}

function parseRanking(items: string[]) {
  return items.slice(0, 3).map((item) => {
    const [namePart, details = ''] = item.split(' — ');
    const salesMatch = details.match(/(\d+) venda/);
    const revenueMatch = details.match(/R\$\s?[\d.,]+/);
    return {
      name: namePart?.trim() || 'Loja',
      sales: Number(salesMatch?.[1] || 0),
      revenue: revenueMatch ? parseMoney(revenueMatch[0]) : 0
    };
  });
}

function currentFilters() {
  const root = document.querySelector('.master-dashboard-filter-first');
  const selects = root?.querySelectorAll<HTMLSelectElement>('select') || [];
  const dates = root?.querySelectorAll<HTMLInputElement>('input[type="date"]') || [];
  return {
    event_id: selects[0]?.value || 'all',
    store_id: selects[1]?.value || 'all',
    date_from: dates[0]?.value || '',
    date_to: dates[1]?.value || ''
  };
}

export function MasterGoalPerformance3D() {
  const supabase = useMemo(() => createClient(), []);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [goal, setGoal] = useState<GoalSummary>(initialGoal);
  const [ranking, setRanking] = useState<RankingItem[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || '';
    if (!token) return;
    const filters = currentFilters();
    const query = new URLSearchParams(filters);
    const response = await fetch(`/api/master/dashboard-real?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return;
    const payload = await response.json() as DashboardPayload;
    setGoal(payload.goal || initialGoal);
    setRanking(parseRanking(payload.rankings?.stores || []));
  }, [supabase]);

  useEffect(() => {
    const root = document.querySelector('.master-dashboard-filter-first');
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('section'));
    const original = sections.find((section) => section.textContent?.includes('Meta do evento'));
    if (!original) return;
    original.style.display = 'none';
    const target = document.createElement('div');
    target.dataset.goal3dMount = 'true';
    original.parentElement?.insertBefore(target, original);
    setMount(target);

    const refresh = () => void load();
    root.addEventListener('change', refresh);
    void load();
    return () => {
      root.removeEventListener('change', refresh);
      original.style.display = '';
      target.remove();
    };
  }, [load]);

  if (!mount) return null;

  const progress = Math.max(0, Math.min(Number(goal.progress || 0), 100));
  const remaining = Math.max(Number(goal.goal || 0) - Number(goal.done || 0), 0);
  const needleRotation = -120 + (progress / 100) * 240;
  const podium = [ranking[1], ranking[0], ranking[2]];

  return createPortal(
    <section className="goal3d-panel mt-4 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#081321] shadow-[0_24px_70px_rgba(0,0,0,.35)]">
      <div className="relative grid gap-6 overflow-hidden p-5 lg:p-7 2xl:grid-cols-[0.92fr_1.3fr]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_35%,rgba(239,39,55,.18),transparent_34%),radial-gradient(circle_at_78%_35%,rgba(56,189,248,.12),transparent_34%),linear-gradient(135deg,#081321_0%,#0A1627_55%,#07101D_100%)]" />

        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-red-500">Performance comercial</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.04em] text-white">Meta x Realizado</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{goal.label}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Meta do evento</span>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[270px_1fr] xl:items-center">
            <div className="relative mx-auto h-[230px] w-[270px]">
              <div className="absolute inset-x-2 top-0 h-[220px] rounded-full bg-[conic-gradient(from_210deg,#ef2737_0deg,#ef2737_55deg,#f97316_95deg,#facc15_130deg,#22c55e_180deg,#10b981_240deg,transparent_241deg)] p-[13px] shadow-[0_0_30px_rgba(239,39,55,.28),inset_0_0_25px_rgba(255,255,255,.08)]">
                <div className="relative h-full w-full rounded-full border border-white/10 bg-[radial-gradient(circle_at_50%_42%,#17263a_0%,#091422_52%,#020711_78%)] shadow-[inset_0_12px_20px_rgba(255,255,255,.06),inset_0_-18px_28px_rgba(0,0,0,.7)]">
                  {[0, 25, 50, 75, 100].map((mark, index) => {
                    const angle = -120 + index * 60;
                    const radians = angle * Math.PI / 180;
                    const x = 50 + Math.cos(radians) * 38;
                    const y = 53 + Math.sin(radians) * 38;
                    return <span key={mark} className="absolute -translate-x-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400" style={{ left: `${x}%`, top: `${y}%` }}>{mark}%</span>;
                  })}
                  <div className="absolute left-1/2 top-[53%] h-[74px] w-[6px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-gradient-to-t from-red-500 to-white shadow-[0_0_14px_rgba(239,39,55,.9)] transition-transform duration-700" style={{ transform: `translateX(-50%) translateY(-100%) rotate(${needleRotation}deg)` }} />
                  <div className="absolute left-1/2 top-[53%] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[7px] border-[#172437] bg-[radial-gradient(circle_at_35%_30%,#f8fafc_0%,#64748b_18%,#111827_48%,#020617_75%)] shadow-[0_8px_20px_rgba(0,0,0,.7),0_0_20px_rgba(239,39,55,.3)]">
                    <Gauge size={22} className="text-red-400" />
                  </div>
                  <div className="absolute inset-x-0 bottom-6 text-center">
                    <strong className="text-4xl font-black tracking-[-0.06em] text-white">{percent(progress)}</strong>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">realizado</p>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-1/2 h-8 w-[220px] -translate-x-1/2 rounded-[50%] bg-black/70 blur-md" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Metric3D label="Realizado" value={money(goal.done)} accent="#10B981" icon={<TrendingUp size={17} />} />
              <Metric3D label="Meta total" value={money(goal.goal)} accent="#38BDF8" icon={<Award size={17} />} />
              <Metric3D label="Falta para a meta" value={money(remaining)} accent="#EF2737" icon={<Car size={17} />} />
              <Metric3D label="Patrocínio" value={money(goal.sponsorship)} accent="#F59E0B" icon={<Medal size={17} />} />
            </div>
          </div>
        </div>

        <div className="relative z-10 min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-400">Ranking de vendas</p>
              <h3 className="mt-1 text-xl font-black text-white">Top 3 lojas</h3>
            </div>
            <TrophyBadge />
          </div>

          <div className="mt-6 grid min-h-[330px] grid-cols-3 items-end gap-2 sm:gap-4">
            {podium.map((item, index) => {
              const place = index === 1 ? 1 : index === 0 ? 2 : 3;
              return <PodiumCard key={`${item?.name || 'empty'}-${place}`} item={item} place={place} goal={goal.goal} />;
            })}
          </div>
        </div>
      </div>

      <style>{`
        .goal3d-panel { perspective: 1400px; }
        .goal3d-podium { transform-style: preserve-3d; }
        .goal3d-podium:hover { transform: translateY(-6px) rotateX(2deg); }
      `}</style>
    </section>,
    mount
  );
}

function Metric3D({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_12px_25px_rgba(0,0,0,.2)]">
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <strong className="mt-1 block text-sm font-black text-white">{value}</strong>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ color: accent, backgroundColor: `${accent}18` }}>{icon}</span>
      </div>
    </div>
  );
}

function TrophyBadge() {
  return <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-300 shadow-[0_0_25px_rgba(245,158,11,.12)]"><Crown size={20} /></div>;
}

function PodiumCard({ item, place, goal }: { item?: RankingItem; place: number; goal: number }) {
  const colors = place === 1
    ? { border: '#F59E0B', glow: 'rgba(245,158,11,.35)', badge: '#FBBF24', height: 'h-[292px]' }
    : place === 2
      ? { border: '#94A3B8', glow: 'rgba(148,163,184,.24)', badge: '#CBD5E1', height: 'h-[238px]' }
      : { border: '#F97316', glow: 'rgba(249,115,22,.24)', badge: '#FB923C', height: 'h-[214px]' };
  const share = goal > 0 && item ? (item.revenue / goal) * 100 : 0;

  return (
    <article className={`goal3d-podium relative flex ${colors.height} min-w-0 flex-col items-center justify-end rounded-t-[26px] border bg-[linear-gradient(180deg,rgba(18,31,49,.96),rgba(6,14,25,.98))] px-2 pb-5 text-center transition duration-300 sm:px-4`} style={{ borderColor: `${colors.border}88`, boxShadow: `0 20px 40px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,.08)` }}>
      <div className="absolute inset-x-3 top-3 h-20 rounded-full opacity-40 blur-2xl" style={{ backgroundColor: colors.glow }} />
      <div className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full border-[5px] border-[#081321] text-xl font-black text-[#07101D] shadow-[0_8px_20px_rgba(0,0,0,.45)]" style={{ background: `radial-gradient(circle at 35% 30%, #fff 0%, ${colors.badge} 38%, ${colors.border} 72%)` }}>{place}</div>
      <div className="relative mb-4 flex h-16 w-24 items-end justify-center">
        <div className="absolute bottom-0 h-5 w-24 rounded-[50%] blur-md" style={{ backgroundColor: colors.glow }} />
        <Car size={place === 1 ? 66 : 54} className="relative" style={{ color: colors.badge, filter: `drop-shadow(0 10px 16px ${colors.glow})` }} />
      </div>
      <strong className="line-clamp-2 text-sm font-black leading-5 text-white sm:text-base">{item?.name || 'Sem resultado'}</strong>
      <p className="mt-2 text-xs font-black" style={{ color: colors.badge }}>{item ? money(item.revenue) : money(0)}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">{item?.sales || 0} venda(s) · {percent(share)} da meta</p>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-black/40 shadow-inner"><div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: `linear-gradient(90deg, ${colors.border}, ${colors.badge})` }} /></div>
      <div className="absolute inset-x-0 bottom-0 h-4 translate-y-2 rounded-[50%] border border-white/5 bg-black/50 shadow-[0_10px_20px_rgba(0,0,0,.45)]" />
    </article>
  );
}
