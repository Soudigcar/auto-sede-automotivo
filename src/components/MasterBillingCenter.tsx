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
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Store,
  Users
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

type BillingPlan = {
  id: string;
  code: string;
  name: string;
  amount_cents: number;
  billing_cycle: 'monthly';
  included_users: number;
  ai_included: boolean;
  is_active: boolean;
  version: number;
};

type BillingSubscription = {
  id: string;
  store_id: string;
  plan_id: string;
  status: 'pending_checkout' | 'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  access_enforcement_mode: 'observe' | 'enforce';
  activation_source: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  past_due_at: string | null;
  grace_ends_at: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_checkout_id: string | null;
};

type BillingPayment = {
  id: string;
  subscription_id: string;
  store_id: string;
  provider_status: string;
  amount_cents: number;
  due_at: string | null;
  confirmed_at: string | null;
  received_at: string | null;
  overdue_at: string | null;
  refunded_at: string | null;
  chargeback_at: string | null;
};

type BillingAuditEntry = {
  id: string;
  store_id: string;
  subscription_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
};

type BillingWebhookHealth = {
  total: number;
  processed: number;
  ignored: number;
  pending: number;
  failed: number;
  last_event_type: string | null;
  last_received_at: string | null;
};

type BillingStore = {
  id: string;
  store_name: string;
  slug: string | null;
  status: string | null;
  portal_enabled: boolean | null;
  active_system_users: number;
  billing_eligible: boolean;
};

type BillingOverview = {
  schema_ready: boolean;
  required_migration: string | null;
  plans: BillingPlan[];
  subscriptions: BillingSubscription[];
  payments: BillingPayment[];
  webhook_health: BillingWebhookHealth;
  audit_log: BillingAuditEntry[];
  stores: BillingStore[];
  safety: {
    global_enforcement_enabled: boolean;
    trial_start_enabled: boolean;
    existing_store_default: 'observe';
    runtime_environment: string;
    connected_project_ref: string;
    preview_only: boolean;
  };
  asaas: {
    environment: string;
    api_configured: boolean;
    webhook_configured: boolean;
    sandbox_enabled: boolean;
    synthetic_store_configured: boolean;
    preview_callback_configured: boolean;
    webhook_bypass_configured: boolean;
    sandbox_payment_confirmation_enabled: boolean;
    sandbox_failure_test_enabled: boolean;
    failure_synthetic_store_configured: boolean;
    configuration_valid: boolean;
    errors: string[];
  };
};

const paymentStatusLabels: Record<string, string> = {
  PENDING: 'Cobrança agendada',
  SANDBOX_CONFIRMATION_REQUESTED: 'Confirmação Sandbox em processamento',
  CONFIRMED: 'Pagamento confirmado',
  RECEIVED: 'Pagamento recebido',
  CREDIT_CARD_CAPTURE_REFUSED: 'Cartão Sandbox recusado',
  OVERDUE: 'Cobrança vencida',
  REFUNDED: 'Pagamento estornado',
  CHARGEBACK_REQUESTED: 'Chargeback solicitado',
  CHARGEBACK_DISPUTE: 'Chargeback em disputa'
};

const auditLabels: Record<string, string> = {
  trial_started_by_master: 'Trial iniciado pelo Master',
  asaas_sandbox_checkout_created: 'Checkout Sandbox criado',
  asaas_sandbox_webhooks_reconciled: 'Webhooks Sandbox reconciliados',
  asaas_sandbox_payment_confirmation_requested: 'Confirmação Sandbox solicitada',
  asaas_webhook_subscription_transition: 'Assinatura atualizada pelo webhook',
  asaas_webhook_stale_transition_ignored: 'Evento antigo preservado sem regressão'
};

const statusLabels: Record<BillingSubscription['status'], string> = {
  pending_checkout: 'Aguardando checkout',
  trialing: 'Trial ativo',
  active: 'Assinatura ativa',
  past_due: 'Pagamento pendente',
  suspended: 'Suspensa',
  cancelled: 'Cancelada'
};

function money(amountCents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0
  }).format(amountCents / 100);
}

function dateTime(value: string | null) {
  if (!value) return 'Não definido';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Data inválida';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function asaasDueDate(value: string | null) {
  if (!value) return 'Não definido';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return 'Data inválida';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function trialRemaining(value: string | null, nowMs: number) {
  if (!value || !nowMs) return '7 dias fixos';
  const remaining = Date.parse(value) - nowMs;
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Trial encerrado';
  const hours = Math.ceil(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  const extraHours = hours % 24;
  if (!days) return `${extraHours}h restantes`;
  return `${days}d ${extraHours}h restantes`;
}

function graceRemaining(value: string | null, nowMs: number) {
  if (!value || !nowMs) return 'Carência não definida';
  const remaining = Date.parse(value) - nowMs;
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Carência encerrada — acesso ainda preservado em observe';
  const hours = Math.ceil(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  const extraHours = hours % 24;
  return `${days}d ${extraHours}h de carência · acesso preservado`;
}

function sandboxCheckoutLink(checkoutId: string | null) {
  if (!checkoutId || !/^[0-9a-f-]{36}$/i.test(checkoutId)) return '';
  return `https://sandbox.asaas.com/checkoutSession/show/${encodeURIComponent(checkoutId)}`;
}

function statusTone(status: BillingSubscription['status']) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'trialing') return 'bg-sky-50 text-sky-700';
  if (status === 'past_due') return 'bg-amber-50 text-amber-700';
  if (status === 'suspended') return 'bg-red-50 text-red-700';
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

export function MasterBillingCenter() {
  const supabase = useMemo(() => createClient(), []);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [reason, setReason] = useState('');
  const [nowMs, setNowMs] = useState(0);

  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  const load = useCallback(async (preserveMessage = false) => {
    setBusy(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada. Entre novamente.');
      const response = await fetch('/api/master/billing', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar o billing.');
      setOverview(body as BillingOverview);
      if (!preserveMessage) setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível carregar o billing.');
    } finally {
      setBusy(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function startTrial() {
    if (!overview?.safety.trial_start_enabled || !selectedStoreId || reason.trim().length < 10) return;
    setBusy(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada. Entre novamente.');
      const response = await fetch('/api/master/billing', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'start-trial',
          store_id: selectedStoreId,
          plan_code: 'professional',
          reason
        })
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível iniciar o trial.');
      setSelectedStoreId('');
      setReason('');
      setMessage(body.message || 'Trial iniciado em modo de observação.');
      await load(true);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível iniciar o trial.');
    } finally {
      setBusy(false);
    }
  }

  async function createSandboxCheckout(storeId: string) {
    if (!overview?.asaas.sandbox_enabled || busy) return;
    setBusy(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada. Entre novamente.');
      const response = await fetch('/api/master/billing', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'create-sandbox-checkout',
          store_id: storeId
        })
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível criar o Checkout Sandbox.');
      if (!body.checkout_url || !String(body.checkout_url).startsWith('https://sandbox.asaas.com/')) {
        throw new Error('O Asaas não retornou um link Sandbox válido.');
      }
      setMessage(body.message || 'Checkout Sandbox criado.');
      await load();
      window.location.assign(body.checkout_url);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível criar o Checkout Sandbox.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSandboxPayment(storeId: string) {
    if (!overview?.asaas.sandbox_payment_confirmation_enabled || busy) return;
    setBusy(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada. Entre novamente.');
      const response = await fetch('/api/master/billing', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'confirm-sandbox-payment',
          store_id: storeId
        })
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível confirmar a cobrança Sandbox.');
      await load(true);
      setMessage(body.message || 'Confirmação Sandbox solicitada; aguardando o webhook autenticado.');
      window.setTimeout(() => void load(true), 2500);
      window.setTimeout(() => void load(true), 6000);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível confirmar a cobrança Sandbox.');
    } finally {
      setBusy(false);
    }
  }

  async function runStageFiveScenario(storeId: string, action: string) {
    if (!overview?.asaas.sandbox_failure_test_enabled || busy) return;
    setBusy(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada. Entre novamente.');
      const response = await fetch('/api/master/billing', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, store_id: storeId })
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível executar o cenário da etapa 5.');
      setMessage(body.message || 'Cenário sintético processado sem bloqueio de acesso.');
      await load(true);
      window.setTimeout(() => void load(true), 2500);
      window.setTimeout(() => void load(true), 6000);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível executar o cenário da etapa 5.');
    } finally {
      setBusy(false);
    }
  }

  const subscriptionsByStore = useMemo(() => new Map(
    (overview?.subscriptions || []).map((subscription) => [subscription.store_id, subscription])
  ), [overview?.subscriptions]);
  const paymentsBySubscription = useMemo(() => {
    const result = new Map<string, BillingPayment>();
    for (const payment of overview?.payments || []) {
      if (!result.has(payment.subscription_id)) result.set(payment.subscription_id, payment);
    }
    return result;
  }, [overview?.payments]);
  const latestAuditBySubscription = useMemo(() => {
    const result = new Map<string, BillingAuditEntry>();
    for (const entry of overview?.audit_log || []) {
      if (entry.subscription_id && !result.has(entry.subscription_id)) {
        result.set(entry.subscription_id, entry);
      }
    }
    return result;
  }, [overview?.audit_log]);
  const professional = overview?.plans.find((plan) => plan.code === 'professional') || null;
  const stores = (overview?.stores || []).filter((store) => (
    store.store_name.toLowerCase().includes(query.trim().toLowerCase())
  ));
  const trialing = (overview?.subscriptions || []).filter((item) => item.status === 'trialing').length;
  const active = (overview?.subscriptions || []).filter((item) => item.status === 'active').length;
  const withoutSubscription = (overview?.stores || []).filter((store) => (
    store.billing_eligible && !subscriptionsByStore.has(store.id)
  )).length;
  const selectedStore = overview?.stores.find((store) => store.id === selectedStoreId) || null;
  const activationAllowed = Boolean(
    overview?.safety.trial_start_enabled
    && selectedStore?.billing_eligible
    && !subscriptionsByStore.has(selectedStore.id)
    && reason.trim().length >= 10
    && !busy
  );

  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/billing" />
        <div className="premium-canvas master-mobile-navigation-anchor min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-600">
                <CreditCard size={18} />
                <span className="premium-eyebrow">SaaS · etapa 5 · {overview?.safety.runtime_environment || 'saas-dev'}</span>
              </div>
              <h1 className="premium-title mt-2 text-4xl md:text-5xl">Planos e Billing</h1>
              <p className="premium-muted mt-3 max-w-4xl text-sm">
                Gestão comercial separada do cadastro público das lojas. Nesta etapa, tudo permanece em observação e nenhuma loja pode ser bloqueada.
              </p>
            </div>
            <button type="button" onClick={() => void load()} disabled={busy} className="premium-button-secondary">
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Atualizar
            </button>
          </header>

          <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SafetyCard icon={ShieldCheck} label="Bloqueio global" value={overview?.safety.global_enforcement_enabled ? 'Ligado' : 'Desligado'} safe={!overview?.safety.global_enforcement_enabled} />
            <SafetyCard icon={Eye} label="Modo das lojas" value="Observação" safe />
            <SafetyCard icon={CreditCard} label="Liberar trial" value={overview?.safety.trial_start_enabled ? 'Habilitado' : 'Bloqueado nesta etapa'} safe={!overview?.safety.trial_start_enabled} />
            <SafetyCard icon={CreditCard} label="Asaas" value={overview?.asaas.sandbox_enabled ? 'Sandbox habilitado' : 'Aguardando configuração'} safe={Boolean(overview?.asaas.sandbox_enabled)} />
            <SafetyCard
              icon={Activity}
              label="Falhas sintéticas"
              value={overview?.asaas.sandbox_failure_test_enabled ? 'Etapa 5 habilitada' : 'Desabilitadas'}
              safe={Boolean(overview?.asaas.sandbox_failure_test_enabled)}
            />
          </section>

          {!overview?.safety.trial_start_enabled ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-800">
              Preview somente para leitura e validação. O botão final de liberar os sete dias está bloqueado no servidor; nenhuma assinatura será criada.
            </div>
          ) : null}
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            Homologação isolada: a Loja DEV Roteamento permanece como controle positivo; falhas são restritas à Loja DEV Billing Falhas. Ambas continuam em observação e nenhum acesso será bloqueado.
          </div>
          {message ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">
              {busy ? <Loader2 size={16} className="mr-2 inline animate-spin text-red-600" /> : null}{message}
            </div>
          ) : null}

          <section className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="premium-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="premium-eyebrow text-red-600">Plano principal</p>
                  <h2 className="mt-2 text-3xl font-black text-zinc-950">{professional?.name || 'Profissional'}</h2>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">Ativo</span>
              </div>
              <p className="mt-5 text-4xl font-black text-zinc-950">{money(professional?.amount_cents || 149700)}<span className="text-sm font-bold text-zinc-400">/mês</span></p>
              <div className="mt-6 space-y-3 text-sm font-bold text-zinc-700">
                <PlanFeature icon={Users} text={`Até ${professional?.included_users || 5} usuários incluídos`} />
                <PlanFeature icon={Bot} text={professional?.ai_included === false ? 'IA não incluída' : 'I.A AUTOCAR incluída'} />
                <PlanFeature icon={Clock3} text="Trial único de 7 dias, somente pelo Master" />
                <PlanFeature icon={Eye} text="Acesso inicial sempre em modo observe" />
              </div>
              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-bold leading-5 text-zinc-600">
                {overview?.asaas.sandbox_enabled
                  ? 'Asaas Sandbox conectado para homologação. Nenhuma cobrança real é permitida e o acesso continua em observação.'
                  : 'Asaas Sandbox ainda não está configurado. O cadastro público no portal continua independente deste plano.'}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Metric label="Trials ativos" value={trialing} />
              <Metric label="Assinaturas ativas" value={active} />
              <Metric label="Elegíveis sem assinatura" value={withoutSubscription} />
              <Metric label="Webhooks processados" value={overview?.webhook_health.processed || 0} />
              <div className="premium-card p-5 sm:col-span-2">
                <h2 className="text-lg font-black text-zinc-950">Preparar liberação de trial</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  {overview?.safety.trial_start_enabled
                    ? 'A liberação permanece restrita ao Master e sempre cria sete dias exatos em modo de observação.'
                    : 'A seleção e a justificativa podem ser revisadas; a gravação permanece bloqueada neste Preview.'}
                </p>
                <div className="mt-4 grid gap-3">
                  <select className="premium-input" value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}>
                    <option value="">Selecione uma loja elegível</option>
                    {(overview?.stores || []).filter((store) => store.billing_eligible && !subscriptionsByStore.has(store.id)).map((store) => (
                      <option key={store.id} value={store.id}>{store.store_name}</option>
                    ))}
                  </select>
                  <textarea className="premium-input min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Motivo da liberação pelo Master (mínimo de 10 caracteres)" />
                  <button type="button" className="premium-button-primary justify-center disabled:cursor-not-allowed disabled:opacity-50" disabled={!activationAllowed} onClick={() => void startTrial()}>
                    <Clock3 size={16} /> Liberar trial de 7 dias
                  </button>
                  <p className="text-center text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    {overview?.safety.trial_start_enabled ? 'Aguardando loja e justificativa válidas' : 'Gravação bloqueada por BILLING_TRIAL_START_ENABLED=false'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-black text-zinc-950">Situação por loja</h2>
                <p className="mt-1 text-xs text-zinc-500">Portal, acesso ao sistema e assinatura são exibidos separadamente.</p>
              </div>
              <input className="premium-input md:max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar loja" />
            </div>
            <div className="mt-5 space-y-3">
              {stores.map((store) => {
                const subscription = subscriptionsByStore.get(store.id) || null;
                const payment = subscription ? paymentsBySubscription.get(subscription.id) || null : null;
                const latestAudit = subscription ? latestAuditBySubscription.get(subscription.id) || null : null;
                const cardReady = Boolean(
                  subscription?.provider_customer_id
                  && subscription?.provider_subscription_id
                  && payment
                );
                const normalizedPaymentStatus = String(payment?.provider_status || '').toUpperCase();
                const confirmationRequested = latestAudit?.action === 'asaas_sandbox_payment_confirmation_requested'
                  || normalizedPaymentStatus === 'SANDBOX_CONFIRMATION_REQUESTED';
                const canConfirmSandboxPayment = Boolean(
                  overview?.asaas.sandbox_payment_confirmation_enabled
                  && subscription?.status === 'trialing'
                  && subscription.access_enforcement_mode === 'observe'
                  && payment
                  && normalizedPaymentStatus === 'PENDING'
                  && !confirmationRequested
                  && !busy
                );
                const isFailureStore = store.store_name === 'Loja DEV Billing Falhas';
                const canRunStageFive = Boolean(
                  isFailureStore
                  && overview?.asaas.sandbox_failure_test_enabled
                  && subscription?.access_enforcement_mode === 'observe'
                  && payment
                  && !busy
                );
                return (
                  <article key={store.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-black text-zinc-950">{store.store_name}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${store.portal_enabled ? 'bg-violet-50 text-violet-700' : 'bg-zinc-200 text-zinc-600'}`}>Portal {store.portal_enabled ? 'ativo' : 'desligado'}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${store.billing_eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{store.billing_eligible ? 'Acesso SaaS identificado' : 'Somente portal/sem usuário ativo'}</span>
                        </div>
                        <p className="mt-2 text-xs font-bold text-zinc-500">{store.active_system_users} usuário(s) ativo(s) vinculado(s) ao sistema · loja {String(store.status || 'sem status')}</p>
                      </div>
                      <div className="flex flex-col items-start gap-2 xl:items-end">
                        {subscription ? (
                          <>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${statusTone(subscription.status)}`}>{statusLabels[subscription.status]}</span>
                            <p className="text-xs font-bold text-zinc-500">Modo: {subscription.access_enforcement_mode === 'observe' ? 'observação' : 'bloqueio habilitado'}</p>
                            {subscription.status === 'trialing' ? <p className="text-xs font-black text-sky-700">{trialRemaining(subscription.trial_ends_at, nowMs)} · termina em {dateTime(subscription.trial_ends_at)}</p> : null}
                            {cardReady ? (
                              <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                                <CheckCircle2 size={14} /> Cartão Sandbox cadastrado
                              </span>
                            ) : sandboxCheckoutLink(subscription.provider_checkout_id) ? (
                              <a
                                href={sandboxCheckoutLink(subscription.provider_checkout_id)}
                                target="_blank"
                                rel="noreferrer"
                                className="premium-button-secondary text-xs"
                              >
                                <ExternalLink size={14} /> Abrir Checkout Sandbox
                              </a>
                            ) : subscription.status === 'trialing' ? (
                              <button
                                type="button"
                                disabled={!overview?.asaas.sandbox_enabled || busy}
                                onClick={() => void createSandboxCheckout(store.id)}
                                className="premium-button-secondary text-xs disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                                Gerar Checkout Sandbox
                              </button>
                            ) : null}
                            {canConfirmSandboxPayment ? (
                              <button
                                type="button"
                                onClick={() => void confirmSandboxPayment(store.id)}
                                className="premium-button-primary text-xs disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <CreditCard size={14} /> Confirmar cobrança Sandbox
                              </button>
                            ) : null}
                            {confirmationRequested && ['PENDING', 'SANDBOX_CONFIRMATION_REQUESTED'].includes(normalizedPaymentStatus) ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-black text-sky-700">
                                <Loader2 size={13} className="animate-spin" /> Aguardando webhook do Sandbox
                              </span>
                            ) : null}
                            {canRunStageFive && normalizedPaymentStatus === 'PENDING' ? (
                              <button type="button" onClick={() => void runStageFiveScenario(store.id, 'stage5-card-refused')} className="premium-button-secondary text-xs">
                                <CreditCard size={14} /> Simular cartão recusado
                              </button>
                            ) : null}
                            {canRunStageFive && normalizedPaymentStatus === 'CREDIT_CARD_CAPTURE_REFUSED' ? (
                              <button type="button" onClick={() => void runStageFiveScenario(store.id, 'stage5-overdue')} className="premium-button-secondary text-xs">
                                <Clock3 size={14} /> Forçar atraso Sandbox
                              </button>
                            ) : null}
                            {canRunStageFive && normalizedPaymentStatus === 'OVERDUE' ? (
                              <button type="button" onClick={() => void runStageFiveScenario(store.id, 'stage5-confirm-for-refund')} className="premium-button-secondary text-xs">
                                <CheckCircle2 size={14} /> Confirmar para testar estorno
                              </button>
                            ) : null}
                            {canRunStageFive && ['CONFIRMED', 'RECEIVED'].includes(normalizedPaymentStatus) ? (
                              <button type="button" onClick={() => void runStageFiveScenario(store.id, 'stage5-refund')} className="premium-button-secondary text-xs">
                                <History size={14} /> Estornar no Sandbox
                              </button>
                            ) : null}
                            {canRunStageFive && normalizedPaymentStatus === 'REFUNDED' ? (
                              <button type="button" onClick={() => void runStageFiveScenario(store.id, 'stage5-chargeback-sequence')} className="premium-button-secondary text-xs">
                                <ShieldCheck size={14} /> Testar chargeback e idempotência
                              </button>
                            ) : null}
                            {isFailureStore && ['CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(normalizedPaymentStatus) ? (
                              <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
                                <CheckCircle2 size={14} /> Cenário negativo concluído sem bloqueio
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase text-zinc-500">Sem assinatura</span>
                            <button type="button" disabled={!store.billing_eligible} onClick={() => setSelectedStoreId(store.id)} className="premium-button-secondary text-xs disabled:cursor-not-allowed disabled:opacity-40">Selecionar para trial</button>
                          </>
                        )}
                      </div>
                    </div>
                    {subscription ? (
                      <div className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                        <BillingDetail
                          icon={CreditCard}
                          label="Cartão recorrente"
                          value={cardReady ? 'Cadastrado no Sandbox' : 'Aguardando cadastro'}
                          tone={cardReady ? 'success' : 'neutral'}
                        />
                        <BillingDetail
                          icon={Activity}
                          label="Situação da cobrança"
                          value={payment
                            ? paymentStatusLabels[normalizedPaymentStatus] || normalizedPaymentStatus || 'Não informada'
                            : 'Cobrança ainda não criada'}
                          tone={payment && ['CONFIRMED', 'RECEIVED'].includes(normalizedPaymentStatus)
                            ? 'success'
                            : payment && ['CREDIT_CARD_CAPTURE_REFUSED', 'OVERDUE', 'REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(normalizedPaymentStatus)
                              ? 'warning'
                              : 'neutral'}
                        />
                        <BillingDetail
                          icon={CalendarDays}
                          label={subscription.status === 'past_due' ? 'Carência de 3 dias' : subscription.status === 'active' ? 'Período vigente até' : 'Primeira cobrança'}
                          value={subscription.status === 'past_due'
                            ? `${graceRemaining(subscription.grace_ends_at, nowMs)} · até ${dateTime(subscription.grace_ends_at)}`
                            : subscription.status === 'active'
                            ? dateTime(subscription.current_period_ends_at)
                            : payment?.due_at
                              ? asaasDueDate(payment.due_at)
                              : dateTime(subscription.trial_ends_at)}
                          tone={subscription.status === 'past_due' ? 'warning' : 'neutral'}
                        />
                        <BillingDetail
                          icon={History}
                          label="Última auditoria"
                          value={latestAudit
                            ? auditLabels[latestAudit.action] || latestAudit.action
                            : 'Nenhum evento registrado'}
                          tone="neutral"
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!stores.length && !busy ? <div className="rounded-2xl border border-dashed border-zinc-300 p-7 text-center text-sm font-bold text-zinc-400">Nenhuma loja encontrada.</div> : null}
            </div>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
            <div className="premium-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Activity size={18} /></span>
                <div>
                  <h2 className="text-lg font-black text-zinc-950">Saúde dos webhooks</h2>
                  <p className="text-xs text-zinc-500">Eventos autenticados do Asaas Sandbox</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <WebhookMetric label="Processados" value={overview?.webhook_health.processed || 0} tone="success" />
                <WebhookMetric label="Pendentes" value={overview?.webhook_health.pending || 0} tone="neutral" />
                <WebhookMetric label="Ignorados" value={overview?.webhook_health.ignored || 0} tone="neutral" />
                <WebhookMetric label="Falhas" value={overview?.webhook_health.failed || 0} tone={(overview?.webhook_health.failed || 0) > 0 ? 'warning' : 'success'} />
              </div>
              <p className="mt-4 text-xs font-bold leading-5 text-zinc-500">
                Último evento: <span className="text-zinc-800">{overview?.webhook_health.last_event_type || 'Nenhum'}</span>
                {' · '}{dateTime(overview?.webhook_health.last_received_at || null)}
              </p>
            </div>

            <div className="premium-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><History size={18} /></span>
                <div>
                  <h2 className="text-lg font-black text-zinc-950">Auditoria do billing</h2>
                  <p className="text-xs text-zinc-500">Ações do Master e transições processadas pelo webhook</p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {(overview?.audit_log || []).slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black text-zinc-800">{auditLabels[entry.action] || entry.action}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{entry.reason || 'Registro técnico do billing.'}</p>
                    </div>
                    <div className="shrink-0 text-[10px] font-bold text-zinc-400 sm:text-right">
                      {entry.previous_status && entry.new_status ? <p>{entry.previous_status} → {entry.new_status}</p> : null}
                      <p>{dateTime(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
                {!overview?.audit_log?.length ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs font-bold text-zinc-400">Nenhuma auditoria registrada.</div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="premium-card p-5"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{value}</p></div>;
}

function BillingDetail({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof Store;
  label: string;
  value: string;
  tone: 'success' | 'neutral' | 'warning';
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-center gap-2 text-zinc-400"><Icon size={14} /><p className="text-[9px] font-black uppercase tracking-wider">{label}</p></div>
      <p className={`mt-2 text-xs font-black ${tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-zinc-700'}`}>{value}</p>
    </div>
  );
}

function WebhookMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: 'success' | 'neutral' | 'warning';
}) {
  const className = tone === 'success'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'warning'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-zinc-100 text-zinc-700';
  return <div className={`rounded-xl p-3 ${className}`}><p className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;
}

function PlanFeature({ icon: Icon, text }: { icon: typeof Store; text: string }) {
  return <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600"><Icon size={17} /></span><span>{text}</span></div>;
}

function SafetyCard({ icon: Icon, label, value, safe }: { icon: typeof Store; label: string; value: string; safe: boolean }) {
  return <div className="premium-card flex items-center gap-3 p-4"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${safe ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{safe ? <CheckCircle2 size={19} /> : <Icon size={19} />}</span><div><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-1 text-sm font-black text-zinc-950">{value}</p></div></div>;
}
