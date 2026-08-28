'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  RefreshCw,
  ShieldCheck,
  Users,
  type LucideIcon
} from 'lucide-react';
import { useStorePortal } from '@/components/StorePortalShell';
import { createClient } from '@/lib/supabase';

type StoreBillingOverview = {
  success: true;
  schema_ready: boolean;
  plan: {
    code: string;
    name: string;
    amount_cents: number;
    billing_cycle: string;
    included_users: number;
    ai_included: boolean;
  } | null;
  subscription: {
    status: string;
    access_enforcement_mode: 'observe' | 'enforce';
    trial_started_at: string | null;
    trial_ends_at: string | null;
    current_period_started_at: string | null;
    current_period_ends_at: string | null;
    past_due_at: string | null;
    grace_ends_at: string | null;
    checkout_registered: boolean;
    card_registered: boolean;
  } | null;
  payment: {
    provider_status: string;
    amount_cents: number;
    due_at: string;
    confirmed_at: string | null;
    received_at: string | null;
    overdue_at: string | null;
    refunded_at: string | null;
    chargeback_at: string | null;
  } | null;
  latest_event: { action: string; created_at: string } | null;
  entitlement: {
    access_preserved: true;
    enforced: false;
    mode: 'observe';
    reason: string;
    observed_allowed: boolean;
    observed_reason: string;
  };
  safety: {
    read_only: true;
    mutations_enabled: false;
    runtime_environment: string;
    deployment_environment: 'preview' | 'production';
    connected_project_ref: string;
    preview_only: boolean;
    production_observe_prepared: boolean;
  };
};

const subscriptionLabels: Record<string, string> = {
  pending_checkout: 'Aguardando cadastro do cartão',
  trialing: 'Trial ativo',
  active: 'Assinatura ativa',
  past_due: 'Pagamento pendente',
  suspended: 'Assinatura suspensa',
  cancelled: 'Assinatura cancelada'
};

const paymentLabels: Record<string, string> = {
  PENDING: 'Cobrança agendada',
  CONFIRMED: 'Pagamento confirmado',
  RECEIVED: 'Pagamento recebido',
  OVERDUE: 'Cobrança vencida',
  CREDIT_CARD_CAPTURE_REFUSED: 'Cartão recusado',
  REFUNDED: 'Pagamento estornado',
  CHARGEBACK_REQUESTED: 'Chargeback solicitado',
  CHARGEBACK_DISPUTE: 'Chargeback em disputa'
};

const observationLabels: Record<string, string> = {
  subscription_required: 'O sistema identificaria assinatura necessária.',
  checkout_required: 'O sistema identificaria cadastro de cartão pendente.',
  trial_active: 'O sistema reconhece o trial como válido.',
  trial_expired: 'O sistema identificaria o término do trial.',
  subscription_active: 'O sistema reconhece a assinatura como ativa.',
  past_due_grace: 'O sistema reconhece a carência de três dias.',
  payment_required: 'O sistema identificaria pagamento necessário.',
  subscription_suspended: 'O sistema identificaria assinatura suspensa.',
  subscription_cancelled: 'O sistema identificaria assinatura cancelada.',
  billing_infrastructure_unavailable: 'O billing ficou indisponível e o acesso foi preservado.',
  global_observation_mode: 'O billing está em observação global.',
  subscription_observation_mode: 'A assinatura está em observação.',
  master_bypass: 'O Master possui acesso administrativo permanente.'
};

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
}

function dateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function asaasDueDate(value: string | null | undefined) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : dateTime(value);
}

function remaining(value: string | null | undefined, nowMs: number) {
  const end = Date.parse(String(value || ''));
  if (!Number.isFinite(end) || !nowMs) return '—';
  const difference = Math.max(0, end - nowMs);
  const days = Math.floor(difference / 86_400_000);
  const hours = Math.floor((difference % 86_400_000) / 3_600_000);
  return difference > 0 ? `${days}d ${hours}h restantes` : 'Prazo encerrado';
}

function statusTone(status: string | undefined) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'trialing') return 'bg-sky-50 text-sky-700';
  if (status === 'past_due') return 'bg-amber-50 text-amber-700';
  return 'bg-zinc-100 text-zinc-600';
}

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}

export function StoreBillingExperience() {
  const portal = useStorePortal();
  const supabase = useMemo(() => createClient(), []);
  const [overview, setOverview] = useState<StoreBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
      const response = await fetch(`/api/store/portal/billing?slug=${encodeURIComponent(portal.store.slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a assinatura.');
      setOverview(body as StoreBillingOverview);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar a assinatura.');
    } finally {
      setLoading(false);
    }
  }, [portal.store.slug, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const plan = overview?.plan;
  const subscription = overview?.subscription;
  const payment = overview?.payment;
  const observation = overview?.entitlement.observed_reason
    ? observationLabels[overview.entitlement.observed_reason] || overview.entitlement.observed_reason
    : 'Aguardando leitura do billing.';
  const referenceLabel = subscription?.status === 'trialing'
    ? 'Fim do trial'
    : subscription?.status === 'past_due'
      ? 'Fim da carência'
      : 'Período vigente até';
  const referenceDate = subscription?.status === 'trialing'
    ? subscription.trial_ends_at
    : subscription?.status === 'past_due'
      ? subscription.grace_ends_at
      : subscription?.current_period_ends_at;

  return (
    <main className="premium-page">
      <section className="mx-auto max-w-[1500px] py-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-red-600">
              <CreditCard size={18} />
              <span className="premium-eyebrow">SaaS · etapa 6 · observação</span>
            </div>
            <h1 className="premium-title mt-2 text-4xl md:text-5xl">Plano e Assinatura</h1>
            <p className="premium-muted mt-3 max-w-3xl text-sm">
              Acompanhe o trial, o plano e a cobrança da {portal.store.store_name}. O cadastro público da loja permanece independente da assinatura do sistema.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="premium-button-secondary">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </header>

        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          <ShieldCheck size={17} className="mr-2 inline" />
          Modo de observação ativo: seu acesso está preservado. Nenhuma situação de pagamento bloqueia o sistema nesta etapa.
        </div>

        {message ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div> : null}

        {!overview?.schema_ready && !loading ? (
          <div className="premium-card mt-6 p-6">
            <h2 className="text-xl font-black text-zinc-950">Billing em preparação</h2>
            <p className="mt-2 text-sm font-bold text-zinc-500">A estrutura financeira ainda não está disponível neste ambiente, e o acesso da loja continua preservado.</p>
          </div>
        ) : null}

        <section className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <article className="premium-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="premium-eyebrow text-red-600">Plano atual</p>
                <h2 className="mt-2 text-3xl font-black text-zinc-950">{plan?.name || 'Profissional'}</h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${statusTone(subscription?.status)}`}>
                {subscription ? subscriptionLabels[subscription.status] || subscription.status : 'Sem assinatura'}
              </span>
            </div>
            <p className="mt-5 text-4xl font-black text-zinc-950">
              {money(plan?.amount_cents || 149700)}<span className="text-sm font-bold text-zinc-400">/mês</span>
            </p>
            <div className="mt-6 space-y-3 text-sm font-bold text-zinc-700">
              <Feature icon={Users} text={`Até ${plan?.included_users || 5} usuários incluídos`} />
              <Feature icon={Bot} text={plan?.ai_included === false ? 'IA não incluída' : 'I.A AUTOCAR incluída'} />
              <Feature icon={Clock3} text="Trial único de 7 dias" />
              <Feature icon={Eye} text="Acesso em observação, sem bloqueio" />
            </div>
          </article>

          <div className="grid gap-4 sm:grid-cols-2">
            <Detail icon={Activity} label="Situação da assinatura" value={subscription ? subscriptionLabels[subscription.status] || subscription.status : 'Sem assinatura vinculada'} tone={subscription?.status === 'active' ? 'success' : subscription?.status === 'past_due' ? 'warning' : 'neutral'} />
            <Detail icon={CreditCard} label="Cartão recorrente" value={subscription?.card_registered ? 'Cartão Sandbox cadastrado' : subscription?.checkout_registered ? 'Checkout preenchido; aguardando vínculo' : 'Cadastro ainda não realizado'} tone={subscription?.card_registered ? 'success' : 'neutral'} />
            <Detail icon={CalendarDays} label={referenceLabel} value={dateTime(referenceDate)} tone={subscription?.status === 'past_due' ? 'warning' : 'neutral'} />
            <Detail icon={Clock3} label="Contagem" value={subscription?.status === 'trialing' || subscription?.status === 'past_due' ? remaining(referenceDate, nowMs) : payment?.due_at ? `Vencimento ${asaasDueDate(payment.due_at)}` : 'Sem prazo em andamento'} tone={subscription?.status === 'past_due' ? 'warning' : 'neutral'} />
            <Detail icon={CheckCircle2} label="Situação da cobrança" value={payment ? paymentLabels[String(payment.provider_status || '').toUpperCase()] || payment.provider_status : 'Nenhuma cobrança vinculada'} tone={payment && ['CONFIRMED', 'RECEIVED'].includes(String(payment.provider_status || '').toUpperCase()) ? 'success' : subscription?.status === 'past_due' ? 'warning' : 'neutral'} />
            <Detail icon={ShieldCheck} label="Entitlement observado" value={observation} tone={overview?.entitlement.observed_allowed ? 'success' : 'warning'} />
          </div>
        </section>

        <section className="premium-card mt-6 p-6">
          <h2 className="text-xl font-black text-zinc-950">Como funciona nesta etapa</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Explanation title="Portal público" text="A presença da loja e o estoque público não dependem da assinatura do sistema." />
            <Explanation title="Acesso ao sistema" text="O billing calcula o estado comercial, mas o modo observe preserva todas as funcionalidades." />
            <Explanation title="Cobrança" text="Checkout e alterações financeiras estão bloqueados neste ambiente de observação." />
          </div>
        </section>
      </section>
    </main>
  );
}

function Feature({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><Icon size={18} /></span><span>{text}</span></div>;
}

function Detail({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: 'success' | 'warning' | 'neutral' }) {
  const toneClass = tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-zinc-700';
  return <article className="premium-card p-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600"><Icon size={18} /></span><p className="mt-4 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">{label}</p><p className={`mt-2 text-sm font-black leading-5 ${toneClass}`}>{value}</p></article>;
}

function Explanation({ title, text }: { title: string; text: string }) {
  return <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><h3 className="font-black text-zinc-950">{title}</h3><p className="mt-2 text-xs font-bold leading-5 text-zinc-500">{text}</p></article>;
}
