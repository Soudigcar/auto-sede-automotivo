'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Car, Crown, Gauge, Medal, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type GoalSummary = { sponsorship: number; goal: number; done: number; progress: number; label: string };
type DashboardPayload = { goal?: GoalSummary; rankings?: { stores?: string[] } };
type RankingItem = { name: string; sales: number; revenue: number };

const initialGoal: GoalSummary = { sponsorship: 0, goal: 0, done: 0, progress: 0, label: 'Todos os eventos' };

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function percent(value: number) {
  return `${Math.max(0, Number(value || 0)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function parseMoney(value: string) {
  return Number(value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.') || 0);
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
    const response = await fetch(`/api/master/dashboard-real?${new URLSearchParams(currentFilters()).toString()}`, {
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
    const original = Array.from(root.querySelectorAll<HTMLElement>('section')).find((section) => section.textContent?.includes('Meta do evento'));
    if (!original) return;
    original.style.display = 'none';
    const target = document.createElement('div');
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
    <section className="goal3d-panel mt-4 h-[238px] overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#081321] shadow-[0_18px_55px_rgba(0,0,0,.28)]">
      <div className="relative grid h-full grid-cols-[1.05fr_1.35fr] gap-4 overflow-hidden p-4 xl:grid-cols-[1fr_1.45fr]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_38%,rgba(239,39,55,.16),transparent_30%),radial-gradient(circle_at_78%_40%,rgba(56,189,248,.1),transparent_32%),linear-gradient(135deg,#081321_0%,#0A1627_58%,#07101D_100%)]" />

        <div className="relative z-10 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.24em] text-red-500">Meta do evento</p>
              <h2 className="mt-1 truncate text-lg font-black tracking-[-0.03em] text-white">{goal.label}</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Meta x realizado</span>
          </div>

          <div className="mt-2 grid grid-cols-[150px_1fr] items-center gap-3">
            <div className="relative h-[150px] w-[150px]">
              <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_210deg,#ef2737_0deg,#f97316_70deg,#facc15_125deg,#22c55e_180deg,#10b981_240deg,transparent_241deg)] p-[9px] shadow-[0_0_22px_rgba(239,39,55,.22),inset_0_0_18px_rgba(255,255,255,.06)]">
                <div className="relative h-full w-full rounded-full border border-white/10 bg-[radial-gradient(circle_at_50%_42%,#17263a_0%,#091422_54%,#020711_80%)] shadow-[inset_0_8px_14px_rgba(255,255,255,.05),inset_0_-12px_18px_rgba(0,0,0,.7)]">
                  {[0, 25, 50, 75, 100].map((mark, index) => {
                    const angle = -120 + index * 60;
                    const radians = angle * Math.PI / 180;
                    return <span key={mark} className="absolute -translate-x-1/2 -translate-y-1/2 text-[6px] font-black text-slate-500" style={{ left: `${50 + Math.cos(radians) * 37}%`, top: `${52 + Math.sin(radians) * 37}%` }}>{mark}</span>;
                  })}
                  <div className="absolute left-1/2 top-[52%] h-[48px] w-[4px] origin-bottom rounded-full bg-gradient-to-t from-red-500 to-white shadow-[0_0_10px_rgba(239,39,55,.85)] transition-transform duration-700" style={{ transform: `translateX(-50%) translateY(-100%) rotate(${needleRotation}deg)` }} />
                  <div className="absolute left-1/2 top-[52%] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[5px] border-[#172437] bg-[radial-gradient(circle_at_35%_30%,#f8fafc_0%,#64748b_20%,#111827_50%,#020617_78%)] shadow-[0_5px_14px_rgba(0,0,0,.65),0_0_12px_rgba(239,39,55,.25)]">
                    <Gauge size={14} className="text-red-400" />
                  </div>
                  <div className="absolute inset-x-0 bottom-4 text-center">
                    <strong className="text-2xl font-black tracking-[-0.05em] text-white">{percent(progress)}</strong>
                    <p className="text-[6px] font-black uppercase tracking-[0.14em] text-slate-500">realizado</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MetricMini label="Realizado" value={money(goal.done)} accent="#10B981" icon={<TrendingUp size={12} />} />
              <MetricMini label="Meta" value={money(goal.goal)} accent="#38BDF8" icon={<Medal size={12} />} />
              <MetricMini label="Falta" value={money(remaining)} accent="#EF2737" icon={<Car size={12} />} />
              <MetricMini label="Patrocínio" value={money(goal.sponsorship)} accent="#F59E0B" icon={<Crown size={12} />} />
            </div>
          </div>
        </div>

        <div className="relative z-10 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-400">Ranking de vendas</p>
              <h3 className="text-base font-black text-white">Top 3 lojas</h3>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10 text-amber-300"><Crown size={15} /></div>
          </div>

          <div className="mt-3 grid h-[166px] grid-cols-3 items-end gap-2">
            {podium.map((item, index) => {
              const place = index === 1 ? 1 : index === 0 ? 2 : 3;
              return <PodiumMini key={`${item?.name || 'empty'}-${place}`} item={item} place={place} goal={goal.goal} />;
            })}
          </div>
        </div>
      </div>

      <style>{`
        .goal3d-panel { perspective: 1100px; }
        .goal3d-podium-mini { transform-style: preserve-3d; }
        .goal3d-podium-mini:hover { transform: translateY(-2px) rotateX(1deg); }
      `}</style>
    </section>,
    mount
  );
}

function MetricMini({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.035] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_8px_16px_rgba(0,0,0,.16)]">
      <div className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[7px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
          <strong className="mt-0.5 block truncate text-[10px] font-black text-white">{value}</strong>
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ color: accent, backgroundColor: `${accent}18` }}>{icon}</span>
      </div>
    </div>
  );
}

function PodiumMini({ item, place, goal }: { item?: RankingItem; place: number; goal: number }) {
  const colors = place === 1
    ? { border: '#F59E0B', glow: 'rgba(245,158,11,.26)', badge: '#FBBF24', height: 'h-[150px]' }
    : place === 2
      ? { border: '#94A3B8', glow: 'rgba(148,163,184,.18)', badge: '#CBD5E1', height: 'h-[126px]' }
      : { border: '#F97316', glow: 'rgba(249,115,22,.18)', badge: '#FB923C', height: 'h-[116px]' };
  const share = goal > 0 && item ? (item.revenue / goal) * 100 : 0;

  return (
    <article className={`goal3d-podium-mini relative flex ${colors.height} min-w-0 flex-col items-center justify-end rounded-t-[18px] border bg-[linear-gradient(180deg,rgba(18,31,49,.96),rgba(6,14,25,.98))] px-2 pb-3 text-center transition duration-300`} style={{ borderColor: `${colors.border}88`, boxShadow: `0 12px 24px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,.07)` }}>
      <div className="absolute -top-4 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-[#081321] text-xs font-black text-[#07101D] shadow-[0_5px_12px_rgba(0,0,0,.42)]" style={{ background: `radial-gradient(circle at 35% 30%, #fff 0%, ${colors.badge} 38%, ${colors.border} 72%)` }}>{place}</div>
      <Car size={place === 1 ? 34 : 28} className="mb-2" style={{ color: colors.badge, filter: `drop-shadow(0 6px 9px ${colors.glow})` }} />
      <strong className="line-clamp-2 text-[9px] font-black leading-3 text-white">{item?.name || 'Sem resultado'}</strong>
      <p className="mt-1 text-[8px] font-black" style={{ color: colors.badge }}>{item ? money(item.revenue) : money(0)}</p>
      <p className="mt-0.5 text-[6px] font-bold uppercase tracking-[0.07em] text-slate-500">{item?.sales || 0} venda(s) · {percent(share)}</p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: `linear-gradient(90deg, ${colors.border}, ${colors.badge})` }} /></div>
      <div className="absolute inset-x-0 bottom-0 h-2 translate-y-1 rounded-[50%] bg-black/50 shadow-[0_6px_12px_rgba(0,0,0,.4)]" />
    </article>
  );
}
