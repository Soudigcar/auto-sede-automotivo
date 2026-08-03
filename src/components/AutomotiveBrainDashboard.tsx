'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Database,
  FileSearch,
  Filter,
  GitCompareArrows,
  Lightbulb,
  MessageCircle,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  WandSparkles
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';

type AuraMessage = {
  id: number;
  author: 'aura' | 'master';
  text: string;
};

const marketBars = [31, 42, 38, 54, 47, 69, 58, 74, 66, 82, 76, 91];

const patterns = [
  {
    code: 'Zen10MT',
    description: 'Renault Logan Zen · motor 1.0 · câmbio manual',
    occurrences: 24,
    stores: 7,
    confidence: 97,
    status: 'Pronto para análise'
  },
  {
    code: 'LTZ16AT',
    description: 'Chevrolet Onix LTZ · motor 1.6 · câmbio automático',
    occurrences: 18,
    stores: 5,
    confidence: 94,
    status: 'Alta confiança'
  },
  {
    code: 'ComfortPlusCVT',
    description: 'Hyundai HB20 Comfort Plus · câmbio CVT',
    occurrences: 11,
    stores: 4,
    confidence: 89,
    status: 'Em observação'
  }
];

const divergences = [
  {
    vehicle: 'Honda Civic EXL 2.0 2016',
    issue: 'Título informa automático, descrição e catálogo indicam CVT.',
    source: 'Loja BH Norte',
    age: 'há 3 horas',
    severity: 'Alta'
  },
  {
    vehicle: 'Volkswagen T-Cross Comfortline 2022',
    issue: 'Código FIPE não corresponde ao ano-modelo importado.',
    source: 'Loja Centro SP',
    age: 'há 5 horas',
    severity: 'Crítica'
  },
  {
    vehicle: 'Fiat Argo Drive 1.3 2021',
    issue: 'Combustível divergente entre ficha técnica e anúncio.',
    source: 'Loja Campinas',
    age: 'ontem',
    severity: 'Média'
  }
];

const learnings = [
  {
    title: 'Abreviação “Mec.” reconhecida como câmbio manual',
    evidence: '43 correções em 12 lojas',
    confidence: 98,
    state: 'Pronto para aprovação'
  },
  {
    title: 'Versão “Highline TSI AT” agrupada ao catálogo oficial',
    evidence: '19 ocorrências em 6 lojas',
    confidence: 95,
    state: 'Aguardando análise'
  },
  {
    title: 'Preço de entrada de financiamento identificado como anúncio inválido',
    evidence: '31 anúncios filtrados',
    confidence: 92,
    state: 'Em observação'
  }
];

const sources = [
  { label: 'Ficha técnica explícita', value: 100, status: 'Prioridade máxima' },
  { label: 'Descrição original do anúncio', value: 92, status: 'Alta confiança' },
  { label: 'Código e catálogo da versão', value: 86, status: 'Alta confiança' },
  { label: 'Título do anúncio', value: 74, status: 'Confiança moderada' },
  { label: 'Inferência da IA', value: 52, status: 'Sempre revisável' }
];

const initialMessages: AuraMessage[] = [
  {
    id: 1,
    author: 'aura',
    text: 'Olá. Estou no contexto global do Master. Posso explicar divergências, localizar padrões e resumir oportunidades.'
  },
  {
    id: 2,
    author: 'aura',
    text: 'Encontrei 14 aprendizados pendentes. Cinco já possuem evidências suficientes para análise.'
  }
];

export function AutomotiveBrainDashboard() {
  const [storeFilter, setStoreFilter] = useState('Todas as lojas');
  const [periodFilter, setPeriodFilter] = useState('Últimos 7 dias');
  const [brandFilter, setBrandFilter] = useState('Todas as marcas');
  const [sourceFilter, setSourceFilter] = useState('Todas as origens');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('Dados demonstrativos para validação visual do módulo.');
  const [auraInput, setAuraInput] = useState('');
  const [messages, setMessages] = useState<AuraMessage[]>(initialMessages);

  const filterSummary = useMemo(
    () => `${storeFilter} · ${periodFilter} · ${brandFilter} · ${sourceFilter}`,
    [storeFilter, periodFilter, brandFilter, sourceFilter]
  );

  function simulateRefresh() {
    setLoading(true);
    setNotice('Atualizando a visão demonstrativa...');
    window.setTimeout(() => {
      setLoading(false);
      setNotice(`Visão atualizada com os filtros: ${filterSummary}.`);
    }, 700);
  }

  function simulateAnalysis() {
    setNotice('Simulação concluída: nenhuma regra ou dado foi alterado. 5 novas sugestões seriam encaminhadas ao Master.');
  }

  function askAura(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = auraInput.trim();
    if (!question) return;

    const questionMessage: AuraMessage = {
      id: Date.now(),
      author: 'master',
      text: question
    };

    const response = question.toLowerCase().includes('diverg')
      ? 'As divergências de maior impacto estão concentradas em câmbio e código FIPE. Há 8 ocorrências classificadas como alta ou crítica.'
      : question.toLowerCase().includes('padr') || question.toLowerCase().includes('aprend')
        ? 'O padrão com maior confiança é “Mec.” → câmbio manual, com 98% de confiança e evidências em 12 lojas.'
        : question.toLowerCase().includes('fipe') || question.toLowerCase().includes('oportun')
          ? 'Foram identificados 27 veículos abaixo da FIPE. Doze também estão abaixo da mediana regional e merecem revisão comercial.'
          : 'Posso aprofundar a análise usando loja, marca, origem, período, confiança e impacto estimado. Nesta prévia, os dados são demonstrativos.';

    setMessages((current) => [
      ...current,
      questionMessage,
      { id: Date.now() + 1, author: 'aura', text: response }
    ]);
    setAuraInput('');
  }

  return (
    <main className="min-h-screen bg-[#05070D] p-3 text-[#111827] md:p-6">
      <section className="mx-auto flex max-w-[1680px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/50">
        <MasterSidebar active="/master/automotive-brain" />

        <div className="min-w-0 flex-1 bg-[#F4F6FA] p-4 md:p-7">
          <header className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-red-600">Gestão Master</p>
                <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-600">
                  Ambiente Master · Todas as lojas
                </span>
              </div>
              <h1 className="mt-3 flex items-center gap-3 text-3xl font-black tracking-[-0.04em] text-[#101828] md:text-4xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-600/25">
                  <BrainCircuit size={24} />
                </span>
                Cérebro Automotivo
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
                Centro de inteligência global para interpretar anúncios, validar o catálogo, detectar divergências e preparar aprendizados para aprovação do Master.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={simulateRefresh}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-black text-zinc-700 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:text-red-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Atualizando...' : 'Atualizar dashboard'}
              </button>
              <button
                type="button"
                onClick={simulateAnalysis}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/25 transition hover:-translate-y-0.5 hover:bg-red-700"
              >
                <WandSparkles size={16} />
                Executar análise
              </button>
            </div>
          </header>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldCheck className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-black">Prévia segura</p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">{notice} Nenhuma ação desta tela grava informações ou altera o Supabase.</p>
            </div>
          </div>

          <section className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <FilterSelect label="Loja" icon={<Store size={16} />} value={storeFilter} onChange={setStoreFilter} options={['Todas as lojas', 'Grupo Sudeste', 'Loja BH Norte', 'Loja Centro SP']} />
            <FilterSelect label="Período" icon={<Activity size={16} />} value={periodFilter} onChange={setPeriodFilter} options={['Hoje', 'Últimos 7 dias', 'Últimos 15 dias', 'Últimos 30 dias']} />
            <FilterSelect label="Marca" icon={<Filter size={16} />} value={brandFilter} onChange={setBrandFilter} options={['Todas as marcas', 'Chevrolet', 'Fiat', 'Honda', 'Renault', 'Volkswagen']} />
            <FilterSelect label="Origem" icon={<Database size={16} />} value={sourceFilter} onChange={setSourceFilter} options={['Todas as origens', 'OLX', 'Webmotors', 'Cadastro manual', 'Importação']} />
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <KpiCard
              label="Anúncios analisados"
              value="1.247"
              helper="18% acima da semana anterior"
              icon={<FileSearch size={20} />}
              accent="bg-slate-950"
              trend={<span className="inline-flex items-center gap-1 text-emerald-600"><ArrowUpRight size={13} /> +18%</span>}
            />
            <KpiCard
              label="Preenchimento automático"
              value="86%"
              helper="1.073 anúncios completados"
              icon={<Sparkles size={20} />}
              accent="bg-blue-600"
              trend={<span className="inline-flex items-center gap-1 text-emerald-600"><ArrowUpRight size={13} /> +6,2%</span>}
            />
            <KpiCard
              label="Divergências detectadas"
              value="32"
              helper="8 exigem atenção prioritária"
              icon={<GitCompareArrows size={20} />}
              accent="bg-red-600"
              trend={<span className="inline-flex items-center gap-1 text-amber-600"><ArrowDownRight size={13} /> -4</span>}
            />
            <KpiCard
              label="Aprendizados pendentes"
              value="14"
              helper="5 prontos para aprovação"
              icon={<Lightbulb size={20} />}
              accent="bg-violet-600"
              trend={<span className="inline-flex items-center gap-1 text-violet-600"><CircleGauge size={13} /> 5 prontos</span>}
            />
          </section>

          <section className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
              <div className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
                <DashboardCard>
                  <CardHeader
                    eyebrow="Mercado"
                    title="Radar de Mercado"
                    helper="Comparação demonstrativa entre anúncios, mediana regional e FIPE."
                    action="Ver radar completo"
                  />

                  <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="rounded-2xl border border-zinc-100 bg-[#F8FAFC] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-zinc-500">Oportunidades identificadas</p>
                          <p className="mt-1 text-3xl font-black tracking-tight text-zinc-950">27 veículos</p>
                        </div>
                        <span className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><TrendingDown size={20} /></span>
                      </div>

                      <div className="mt-7 flex h-36 items-end gap-2">
                        {marketBars.map((bar, index) => (
                          <div key={`${bar}-${index}`} className="group flex flex-1 items-end">
                            <div
                              className={`w-full rounded-t-lg transition group-hover:opacity-75 ${index >= 9 ? 'bg-red-600' : 'bg-[#C9D2E3]'}`}
                              style={{ height: `${bar}%` }}
                              title={`${bar} oportunidades relativas`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <span>Segunda</span>
                        <span>Hoje</span>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <MiniMetric icon={<TrendingDown size={17} />} label="Abaixo da FIPE" value="27" helper="12 abaixo da mediana" tone="emerald" />
                      <MiniMetric icon={<TrendingUp size={17} />} label="Acima do mercado" value="19" helper="revisão recomendada" tone="red" />
                      <MiniMetric icon={<BarChart3 size={17} />} label="Mediana analisada" value="R$ 79,4 mil" helper="amostra validada" tone="blue" />
                    </div>
                  </div>
                </DashboardCard>

                <DashboardCard>
                  <CardHeader eyebrow="Inteligência" title="Novos padrões identificados" helper="Sugestões que ainda não se tornaram regras globais." />
                  <div className="mt-4 space-y-3">
                    {patterns.map((pattern) => (
                      <button key={pattern.code} type="button" className="w-full rounded-2xl border border-zinc-100 bg-white p-4 text-left transition hover:border-red-200 hover:shadow-lg">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="text-sm font-black text-zinc-950">{pattern.code}</strong>
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">{pattern.confidence}% confiança</span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-zinc-500">{pattern.description}</p>
                            <p className="mt-2 text-[11px] font-bold text-zinc-400">{pattern.occurrences} ocorrências · {pattern.stores} lojas</p>
                          </div>
                          <ChevronRight className="mt-1 shrink-0 text-zinc-300" size={18} />
                        </div>
                      </button>
                    ))}
                  </div>
                </DashboardCard>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <DashboardCard>
                  <CardHeader eyebrow="Revisão" title="Divergências relevantes" helper="Conflitos que precisam de decisão do Master." action="Abrir central" />
                  <div className="mt-4 space-y-3">
                    {divergences.map((item) => (
                      <div key={item.vehicle} className="rounded-2xl border border-zinc-100 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="text-sm font-black text-zinc-950">{item.vehicle}</strong>
                              <SeverityBadge value={item.severity} />
                            </div>
                            <p className="mt-2 text-xs leading-5 text-zinc-500">{item.issue}</p>
                            <p className="mt-2 text-[11px] font-bold text-zinc-400">{item.source} · {item.age}</p>
                          </div>
                          <AlertTriangle className="mt-1 shrink-0 text-amber-500" size={18} />
                        </div>
                      </div>
                    ))}
                  </div>
                </DashboardCard>

                <DashboardCard>
                  <CardHeader eyebrow="Aprendizado" title="Aprendizados e correções" helper="Evidências consolidadas a partir das operações das lojas." action="Revisar pendências" />
                  <div className="mt-4 space-y-3">
                    {learnings.map((item) => (
                      <div key={item.title} className="rounded-2xl border border-zinc-100 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Lightbulb size={17} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black leading-5 text-zinc-950">{item.title}</p>
                            <p className="mt-1 text-xs text-zinc-500">{item.evidence}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">{item.confidence}% confiança</span>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{item.state}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </DashboardCard>
              </div>

              <DashboardCard>
                <CardHeader eyebrow="Governança" title="Fontes e prioridade" helper="Peso demonstrativo das fontes usadas na interpretação." action="Gerenciar prioridades" />
                <div className="mt-5 grid gap-3 lg:grid-cols-5">
                  {sources.map((source, index) => (
                    <div key={source.label} className="rounded-2xl border border-zinc-100 bg-[#F8FAFC] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-xs font-black text-red-600 shadow-sm">{index + 1}</span>
                        <span className="text-xs font-black text-zinc-950">{source.value}</span>
                      </div>
                      <p className="mt-4 text-sm font-black leading-5 text-zinc-900">{source.label}</p>
                      <p className="mt-1 text-[11px] leading-4 text-zinc-500">{source.status}</p>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                        <div className="h-full rounded-full bg-red-600" style={{ width: `${source.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </div>

            <aside className="min-w-0">
              <div className="sticky top-5 overflow-hidden rounded-[26px] border border-[#1B263A] bg-[#071020] text-white shadow-2xl shadow-slate-950/25">
                <div className="relative overflow-hidden border-b border-white/10 p-5">
                  <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-red-600/15 blur-3xl" />
                  <div className="relative flex items-center gap-4">
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black shadow-[0_0_35px_rgba(220,38,38,0.35)]">
                      <div className="absolute inset-2 rounded-full border border-red-500/35" />
                      <Bot className="relative text-red-500" size={29} />
                      <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-[#071020] bg-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-black">AURA</p>
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">Online</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">Assistente Unificada de Resposta Automotiva</p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[430px] space-y-3 overflow-y-auto p-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.author === 'master' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-5 ${message.author === 'master' ? 'rounded-br-md bg-red-600 text-white' : 'rounded-bl-md border border-white/10 bg-white/[0.06] text-zinc-300'}`}>
                        {message.text}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 p-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Sugestões rápidas</p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {['Divergências críticas', 'Padrões acima de 90%', 'Oportunidades FIPE'].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setAuraInput(suggestion)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-zinc-300 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-white"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={askAura} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
                    <MessageCircle className="ml-2 shrink-0 text-zinc-500" size={17} />
                    <input
                      value={auraInput}
                      onChange={(event) => setAuraInput(event.target.value)}
                      placeholder="Pergunte à AURA..."
                      className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-white outline-none placeholder:text-zinc-600"
                    />
                    <button type="submit" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-500" aria-label="Enviar pergunta">
                      <Send size={15} />
                    </button>
                  </form>

                  <div className="mt-3 flex items-center gap-2 text-[10px] leading-4 text-zinc-600">
                    <ShieldCheck size={13} />
                    Ações críticas exigirão confirmação no módulo real.
                  </div>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}

function DashboardCard({ children }: { children: React.ReactNode }) {
  return <section className="rounded-[24px] border border-zinc-200/80 bg-white p-5 shadow-sm shadow-slate-200/60">{children}</section>;
}

function CardHeader({ eyebrow, title, helper, action }: { eyebrow: string; title: string; helper: string; action?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-zinc-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{helper}</p>
      </div>
      {action ? (
        <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-red-600 hover:text-red-700">
          {action} <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

function FilterSelect({ label, icon, value, onChange, options }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition focus-within:border-red-300 focus-within:ring-4 focus-within:ring-red-50">
      <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">{icon}{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full bg-transparent text-sm font-black text-zinc-950 outline-none">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function KpiCard({ label, value, helper, icon, accent, trend }: { label: string; value: string; helper: string; icon: React.ReactNode; accent: string; trend: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-sm shadow-slate-200/70">
      <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-zinc-100/80" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold leading-5 text-zinc-500">{label}</p>
          <strong className="mt-2 block text-3xl font-black tracking-[-0.04em] text-zinc-950">{value}</strong>
          <p className="mt-2 text-[11px] leading-4 text-zinc-400">{helper}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${accent}`}>{icon}</span>
      </div>
      <div className="relative mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-[10px] font-black uppercase tracking-wide">
        <span className="text-zinc-400">Período atual</span>
        {trend}
      </div>
    </div>
  );
}

function MiniMetric({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string; helper: string; tone: 'emerald' | 'red' | 'blue' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700'
  };
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
        <p className="text-[11px] font-bold text-zinc-500">{label}</p>
      </div>
      <p className="mt-3 text-xl font-black tracking-tight text-zinc-950">{value}</p>
      <p className="mt-1 text-[10px] text-zinc-400">{helper}</p>
    </div>
  );
}

function SeverityBadge({ value }: { value: string }) {
  const style = value === 'Crítica'
    ? 'bg-red-100 text-red-700'
    : value === 'Alta'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-blue-100 text-blue-700';

  return <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${style}`}>{value}</span>;
}
