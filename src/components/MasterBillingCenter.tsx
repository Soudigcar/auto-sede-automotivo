'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  FileCheck2,
  History,
  IdCard,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  Store,
  Users
} from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import {
  evaluateBillingRegistrationReadiness,
  type BillingRegistrationReadiness
} from '@/lib/billingRegistrationReadiness';
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
  registration_source: string | null;
  legal_name: string | null;
  cnpj: string | null;
  responsible_email: string | null;
  responsible_phone: string | null;
  active_system_users: number;
  billing_eligible: boolean;
  billing_registration_simulation_allowed: boolean;
  billing_registration_write_allowed: boolean;
  billing_stage13_activation_allowed: boolean;
  billing_registration_profile: BillingRegistrationProfile | null;
};

type BillingRegistrationProfile = {
  id: string;
  store_id: string;
  legal_name: string | null;
  cnpj: string | null;
  financial_email: string | null;
  financial_phone: string | null;
  registration_status: 'incomplete' | 'ready_for_activation';
  validated_at: string | null;
  version: number;
  updated_at: string;
};

type BillingRegistrationAudit = {
  id: string;
  profile_id: string;
  store_id: string;
  action: 'registration_created' | 'registration_updated' | 'registration_revalidated';
  previous_status: 'incomplete' | 'ready_for_activation' | null;
  new_status: 'incomplete' | 'ready_for_activation';
  changed_fields: string[];
  created_at: string;
};

type BillingOverview = {
  schema_ready: boolean;
  required_migration: string | null;
  plans: BillingPlan[];
  subscriptions: BillingSubscription[];
  payments: BillingPayment[];
  webhook_health: BillingWebhookHealth;
  audit_log: BillingAuditEntry[];
  registration_audit_log: BillingRegistrationAudit[];
  stores: BillingStore[];
  safety: {
    global_enforcement_enabled: boolean;
    mutations_enabled: boolean;
    trial_start_enabled: boolean;
    existing_store_default: 'observe';
    runtime_environment: string;
    deployment_environment: 'preview' | 'production';
    connected_project_ref: string;
    preview_only: boolean;
    registration_simulation_enabled: boolean;
    registration_persistence_enabled: boolean;
    stage13_activation_enabled: boolean;
    production_observe_prepared: boolean;
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
    stage13_synthetic_store_configured: boolean;
    stage13_activation_enabled: boolean;
    production_blocked: true;
    configuration_valid: boolean;
    errors: string[];
  };
};

type RegistrationDraft = {
  legalName: string;
  cnpj: string;
  financialEmail: string;
  financialPhone: string;
};

type RegistrationResult = {
  persisted: boolean;
  idempotent?: boolean;
  readiness: BillingRegistrationReadiness;
  activation_simulation?: {
    outcome: 'ready_for_future_activation' | 'blocked_by_registration';
    would_start_trial: false;
    would_create_asaas_customer: false;
    would_charge: false;
    access_enforcement_mode: 'observe';
  };
  safety?: {
    would_start_trial: false;
    would_create_asaas_customer: false;
    would_charge: false;
    access_enforcement_mode: 'observe';
  };
  message: string;
};

type Stage13ActivationResult = {
  checkout_id: string;
  checkout_url: string;
  reused: boolean;
  webhook_created: boolean;
  customer_data_prefilled: boolean;
  trial_ends_at: string;
  payment_confirmed: false;
  access_enforcement_mode: 'observe';
  subscription: {
    id: string;
    status: 'trialing';
    trial_started_at: string;
    trial_ends_at: string;
    access_enforcement_mode: 'observe';
  };
  message: string;
};

const emptyRegistrationDraft: RegistrationDraft = {
  legalName: '',
  cnpj: '',
  financialEmail: '',
  financialPhone: ''
};

function registrationDraftFromStore(store: BillingStore): RegistrationDraft {
  const profile = store.billing_registration_profile;
  return {
    legalName: profile?.legal_name || store.legal_name || '',
    cnpj: profile?.cnpj ? formatStoredCnpj(profile.cnpj) : store.cnpj || '',
    financialEmail: profile?.financial_email || store.responsible_email || '',
    financialPhone: profile?.financial_phone
      ? formatStoredPhone(profile.financial_phone)
      : store.responsible_phone || ''
  };
}

function formatStoredCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : value;
}

function formatStoredPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return value;
}

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
  asaas_webhook_stale_transition_ignored: 'Evento antigo preservado sem regressão',
  asaas_webhook_terminal_transition_ignored: 'Evento atrasado não reabriu assinatura cancelada'
};

const registrationAuditLabels: Record<BillingRegistrationAudit['action'], string> = {
  registration_created: 'Cadastro financeiro criado',
  registration_updated: 'Cadastro financeiro atualizado',
  registration_revalidated: 'Cadastro financeiro revalidado'
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
  // Compatibilidade dos testes de segurança históricos: SaaS · etapa 11; SaaS · etapa 12;
  // Persistência restrita à Loja DEV Billing Falhas.
  const supabase = useMemo(() => createClient(), []);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [nowMs, setNowMs] = useState(0);
  const [registrationStoreId, setRegistrationStoreId] = useState('');
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft>(emptyRegistrationDraft);
  const [registrationResult, setRegistrationResult] = useState<RegistrationResult | null>(null);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [stage13Result, setStage13Result] = useState<Stage13ActivationResult | null>(null);
  const [stage13Busy, setStage13Busy] = useState(false);

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

  const registrationStores = useMemo(() => (
    (overview?.stores || []).filter((store) => store.billing_registration_simulation_allowed)
  ), [overview?.stores]);

  useEffect(() => {
    if (!registrationStores.length) return;
    if (registrationStores.some((store) => store.id === registrationStoreId)) return;
    const first = registrationStores[0];
    setRegistrationStoreId(first.id);
    setRegistrationDraft(registrationDraftFromStore(first));
    setRegistrationResult(null);
  }, [registrationStoreId, registrationStores]);

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
  const selectedRegistrationStore = registrationStores.find((store) => (
    store.id === registrationStoreId
  )) || null;
  const liveRegistrationReadiness = evaluateBillingRegistrationReadiness({
    ...registrationDraft,
    storeStatus: selectedRegistrationStore?.status,
    activeSystemUsers: selectedRegistrationStore?.active_system_users
  });
  const storedReadinessByStore = new Map(registrationStores.map((store) => [
    store.id,
    evaluateBillingRegistrationReadiness({
      ...registrationDraftFromStore(store),
      storeStatus: store.status,
      activeSystemUsers: store.active_system_users
    })
  ]));
  const readyRegistrations = registrationStores.filter((store) => (
    store.billing_registration_profile?.registration_status === 'ready_for_activation'
  )).length;
  const incompleteRegistrations = registrationStores.length - readyRegistrations;
  const selectedRegistrationSubscription = selectedRegistrationStore
    ? subscriptionsByStore.get(selectedRegistrationStore.id) || null
    : null;
  const stage13CheckoutId = String(
    stage13Result?.checkout_id || selectedRegistrationSubscription?.provider_checkout_id || ''
  );
  const stage13CheckoutUrl = stage13Result?.checkout_url
    || (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stage13CheckoutId)
      ? `https://sandbox.asaas.com/checkoutSession/show/${encodeURIComponent(stage13CheckoutId)}`
      : '');

  const selectRegistrationStore = (storeId: string) => {
    const store = registrationStores.find((item) => item.id === storeId);
    setRegistrationStoreId(storeId);
    setRegistrationDraft(store ? registrationDraftFromStore(store) : emptyRegistrationDraft);
    setRegistrationResult(null);
    setStage13Result(null);
  };

  const changeRegistrationField = (field: keyof RegistrationDraft, value: string) => {
    setRegistrationDraft((current) => ({ ...current, [field]: value }));
    setRegistrationResult(null);
  };

  const saveRegistrationReadiness = async () => {
    if (
      !selectedRegistrationStore
      || !selectedRegistrationStore.billing_registration_write_allowed
      || !liveRegistrationReadiness.ready
    ) return;
    setRegistrationBusy(true);
    setRegistrationResult(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada. Entre novamente.');
      const response = await fetch('/api/master/billing/readiness', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'save-readiness',
          store_id: selectedRegistrationStore.id,
          request_id: crypto.randomUUID(),
          legal_name: registrationDraft.legalName,
          cnpj: registrationDraft.cnpj,
          financial_email: registrationDraft.financialEmail,
          financial_phone: registrationDraft.financialPhone
        })
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar o cadastro sintético.');
      setRegistrationResult(body as RegistrationResult);
      await load(true);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível salvar o cadastro sintético.');
    } finally {
      setRegistrationBusy(false);
    }
  };

  const activateStage13Sandbox = async () => {
    if (!selectedRegistrationStore?.billing_stage13_activation_allowed) return;
    setStage13Busy(true);
    setStage13Result(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sessão Master expirada. Entre novamente.');
      const response = await fetch('/api/master/billing', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'activate-stage13-sandbox',
          store_id: selectedRegistrationStore.id,
          request_id: crypto.randomUUID()
        })
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || 'Não foi possível executar o ensaio sintético.');
      setStage13Result(body as Stage13ActivationResult);
      setMessage(body.message || 'Ensaio sintético concluído.');
      await load(true);
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível executar o ensaio sintético.');
    } finally {
      setStage13Busy(false);
    }
  };
  return (
    <main className="premium-page">
      <section className="premium-shell flex min-h-screen">
        <MasterSidebar active="/master/billing" />
        <div className="premium-canvas master-mobile-navigation-anchor min-w-0 flex-1 p-4 md:p-7">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-600">
                <CreditCard size={18} />
                <span className="premium-eyebrow">SaaS · etapa 15B · {overview?.safety.runtime_environment || 'ambiente seguro'}</span>
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
            <SafetyCard icon={CreditCard} label="Mutações gerais" value={overview?.safety.mutations_enabled ? 'Habilitadas' : 'Somente leitura'} safe={!overview?.safety.mutations_enabled} />
            <SafetyCard icon={CreditCard} label="Asaas" value={overview?.asaas.sandbox_enabled ? 'Sandbox habilitado' : 'Aguardando configuração'} safe={Boolean(overview?.asaas.sandbox_enabled)} />
            <SafetyCard
              icon={FileCheck2}
              label="Ativação sintética"
              value={overview?.safety.stage13_activation_enabled ? 'Etapa 13 habilitada' : 'Encerrada e bloqueada'}
              safe={!overview?.safety.stage13_activation_enabled}
            />
          </section>

          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-800">
            Etapa 15B: pacote de entrada em Production separado dos seeds sintéticos, permissões server-only, rollback versionado e claims de webhook atômicos. Eventos duplicados, concorrentes, atrasados ou fora de ordem não podem reabrir uma assinatura cancelada; toda decisão continua em observe. As mutações gerais permanecem somente para leitura.
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Histórico preservado: SaaS · etapa 13 concluída exclusivamente no Sandbox, sem confirmação de pagamento.
          </p>
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            Entitlement em observação: o sistema calcula o estado comercial de cada loja, registra o diagnóstico sem dados pessoais e preserva integralmente o acesso.
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
                <h2 className="text-lg font-black text-zinc-950">Experiência da loja habilitada</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Gestores podem consultar plano, trial, vencimento, cartão e situação da cobrança em “Plano & Assinatura”. Equipes comerciais não recebem acesso aos dados financeiros.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <ReadOnlyFeature title="Login existente" text="A sessão atual continua sendo validada pelo Supabase Auth." />
                  <ReadOnlyFeature title="Entitlement" text="O resultado é calculado e observado sem bloquear rotas." />
                  <ReadOnlyFeature title="Financeiro" text="Somente a ativação da terceira loja sintética é liberada." />
                </div>
              </div>
            </div>
          </section>

          <section className="premium-card mt-6 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-red-600">
                  <FileCheck2 size={18} />
                  <p className="premium-eyebrow">Preparação cadastral</p>
                </div>
                <h2 className="mt-2 text-2xl font-black text-zinc-950">Checklist para futura ativação</h2>
                <p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-zinc-500">
                  O cadastro validado permanece separado de stores e auditado sem duplicar dados pessoais. A terceira loja sintética usa esse perfil para preencher o Checkout recorrente sem confirmar cobrança.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:min-w-80">
                <RegistrationMetric label="Prontas" value={readyRegistrations} tone="success" />
                <RegistrationMetric label="Incompletas" value={incompleteRegistrations} tone="warning" />
              </div>
            </div>

            {overview?.safety.registration_simulation_enabled && registrationStores.length ? (
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Loja sintética
                    <select
                      className="premium-input mt-2"
                      value={registrationStoreId}
                      onChange={(event) => selectRegistrationStore(event.target.value)}
                    >
                      {registrationStores.map((store) => (
                        <option key={store.id} value={store.id}>{store.store_name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <RegistrationField
                      icon={Building2}
                      label="Razão social"
                      value={registrationDraft.legalName}
                      placeholder="Loja Sintética Automóveis Ltda"
                      onChange={(value) => changeRegistrationField('legalName', value)}
                    />
                    <RegistrationField
                      icon={IdCard}
                      label="CNPJ"
                      value={registrationDraft.cnpj}
                      placeholder="00.000.000/0000-00"
                      inputMode="numeric"
                      onChange={(value) => changeRegistrationField('cnpj', value)}
                    />
                    <RegistrationField
                      icon={Mail}
                      label="E-mail financeiro"
                      value={registrationDraft.financialEmail}
                      placeholder="financeiro@empresa.com.br"
                      inputMode="email"
                      onChange={(value) => changeRegistrationField('financialEmail', value)}
                    />
                    <RegistrationField
                      icon={Phone}
                      label="Telefone financeiro"
                      value={registrationDraft.financialPhone}
                      placeholder="(61) 99999-1234"
                      inputMode="tel"
                      onChange={(value) => changeRegistrationField('financialPhone', value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="premium-button-primary mt-5 w-full justify-center"
                    disabled={
                      !selectedRegistrationStore?.billing_registration_write_allowed
                      || !overview?.safety.registration_persistence_enabled
                      || !liveRegistrationReadiness.ready
                      || registrationBusy
                    }
                    onClick={() => void saveRegistrationReadiness()}
                  >
                    {registrationBusy ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
                    Salvar cadastro sintético validado
                  </button>
                  {!selectedRegistrationStore?.billing_registration_write_allowed ? (
                    <p className="mt-3 text-center text-[10px] font-black uppercase tracking-wider text-amber-700">
                      Cadastro já persistido ou gravação restrita ao ensaio autorizado
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Estado atual do formulário</p>
                      <h3 className="mt-1 text-lg font-black text-zinc-950">
                        {liveRegistrationReadiness.ready ? 'Pronto para ativação' : 'Cadastro incompleto'}
                      </h3>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase ${liveRegistrationReadiness.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {liveRegistrationReadiness.ready ? 'Pronto' : 'Incompleto'}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {liveRegistrationReadiness.checklist.map((item) => (
                      <RegistrationCheck
                        key={item.key}
                        label={item.label}
                        valid={item.valid}
                        message={item.message}
                      />
                    ))}
                  </div>
                  {registrationResult ? (
                    <div className={`mt-4 rounded-xl border p-3 text-xs font-bold leading-5 ${registrationResult.readiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      {registrationResult.message}
                      <p className="mt-1 text-[10px] uppercase tracking-wider opacity-75">
                        Persistência cadastral: {registrationResult.persisted ? 'sim' : 'já existente'} · Trial: não · Asaas: não · Acesso: observe
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl bg-sky-50 p-3 text-[11px] font-bold leading-5 text-sky-800">
                      A validação local é instantânea. O servidor só aceita salvar dados válidos da loja sintética autorizada e registra uma auditoria sem CNPJ, e-mail, telefone ou razão social.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm font-bold text-zinc-500">
                Cadastro sintético indisponível: este ambiente não corresponde ao Preview isolado do saas-dev ou não possui seeds autorizados.
              </div>
            )}

            {selectedRegistrationStore?.billing_stage13_activation_allowed ? (
              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sky-700">
                      <CreditCard size={17} />
                      <p className="text-[10px] font-black uppercase tracking-wider">Ensaio completo da ativação</p>
                    </div>
                    <h3 className="mt-2 text-lg font-black text-zinc-950">Trial único + Checkout recorrente Sandbox</h3>
                    <p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-zinc-600">
                      O Master inicia exatamente 7 dias, reutiliza a mesma assinatura em novas tentativas e envia razão social, CNPJ, e-mail e telefone já preenchidos ao Asaas Sandbox. Nenhuma cobrança será confirmada.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="premium-button-primary shrink-0 justify-center"
                    disabled={stage13Busy || !overview?.safety.stage13_activation_enabled}
                    onClick={() => void activateStage13Sandbox()}
                  >
                    {stage13Busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                    {selectedRegistrationSubscription?.provider_checkout_id
                      ? 'Revalidar sem duplicar'
                      : 'Iniciar trial e gerar Checkout'}
                  </button>
                </div>

                {selectedRegistrationSubscription?.status === 'trialing' ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <ReadOnlyFeature title="Contagem regressiva" text={trialRemaining(selectedRegistrationSubscription.trial_ends_at, nowMs)} />
                    <ReadOnlyFeature title="Modo de acesso" text="Observe — acesso preservado" />
                    <ReadOnlyFeature title="Pagamento" text="Não confirmado" />
                  </div>
                ) : null}

                {stage13Result ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-xs font-bold leading-5 text-emerald-800">
                    <p>{stage13Result.message}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-emerald-700">
                      Trial: 7 dias · Cadastro pré-preenchido: {stage13Result.customer_data_prefilled ? 'sim' : 'não'} · Idempotente: {stage13Result.reused ? 'reutilizado' : 'primeira execução'} · Cobrança: não confirmada
                    </p>
                  </div>
                ) : null}

                {stage13CheckoutUrl ? (
                  <a
                    className="premium-button-secondary mt-4 inline-flex"
                    href={stage13CheckoutUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <CreditCard size={16} /> Abrir Checkout Sandbox — não concluir pagamento
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center gap-2">
                <History size={16} className="text-violet-700" />
                <h3 className="text-sm font-black text-zinc-900">Auditoria cadastral sintética</h3>
              </div>
              <p className="mt-1 text-[10px] font-bold leading-4 text-zinc-500">
                O histórico registra somente estado e nomes dos campos alterados, sem repetir os dados financeiros.
              </p>
              <div className="mt-3 space-y-2">
                {(overview?.registration_audit_log || []).slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black text-zinc-800">{registrationAuditLabels[entry.action]}</p>
                      <p className="mt-1 text-[10px] font-bold text-zinc-500">
                        {entry.previous_status || 'sem cadastro'} → {entry.new_status} · {entry.changed_fields.length} campo(s) alterado(s)
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-zinc-400">{dateTime(entry.created_at)}</p>
                  </div>
                ))}
                {!overview?.registration_audit_log?.length ? (
                  <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs font-bold text-zinc-400">
                    Nenhuma auditoria cadastral registrada.
                  </p>
                ) : null}
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
                const isFailureStore = store.store_name === 'Loja DEV Billing Falhas';
                const storedReadiness = storedReadinessByStore.get(store.id) || null;
                return (
                  <article key={store.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-black text-zinc-950">{store.store_name}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${store.portal_enabled ? 'bg-violet-50 text-violet-700' : 'bg-zinc-200 text-zinc-600'}`}>Portal {store.portal_enabled ? 'ativo' : 'desligado'}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${store.billing_eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{store.billing_eligible ? 'Acesso SaaS identificado' : 'Somente portal/sem usuário ativo'}</span>
                          {storedReadiness ? (
                            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${storedReadiness.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {storedReadiness.ready ? 'Pronto para ativação' : 'Cadastro incompleto'}
                            </span>
                          ) : null}
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
                            ) : subscription.provider_checkout_id ? (
                              <span className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">
                                <CreditCard size={14} /> Checkout Sandbox registrado
                              </span>
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
                            <span className="text-xs font-bold text-zinc-500">Acesso preservado em observação</span>
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

function RegistrationMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning';
}) {
  return (
    <div className={`rounded-xl p-3 ${tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      <p className="text-[9px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function RegistrationField({
  icon: Icon,
  label,
  value,
  placeholder,
  inputMode = 'text',
  onChange
}: {
  icon: typeof Store;
  label: string;
  value: string;
  placeholder: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
      <span className="flex items-center gap-2"><Icon size={14} /> {label}</span>
      <input
        className="premium-input mt-2 normal-case tracking-normal"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function RegistrationCheck({
  label,
  valid,
  message
}: {
  label: string;
  valid: boolean;
  message: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${valid ? 'border-emerald-100 bg-emerald-50' : 'border-zinc-200 bg-zinc-50'}`}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${valid ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-500'}`}>
        {valid ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
      </span>
      <div>
        <p className={`text-xs font-black ${valid ? 'text-emerald-800' : 'text-zinc-700'}`}>{label}</p>
        <p className="mt-1 text-[10px] font-bold leading-4 text-zinc-500">{message}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="premium-card p-5"><p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p><p className="mt-2 text-3xl font-black text-zinc-950">{value}</p></div>;
}

function ReadOnlyFeature({ title, text }: { title: string; text: string }) {
  return <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><p className="text-xs font-black text-zinc-900">{title}</p><p className="mt-1 text-[11px] font-bold leading-4 text-zinc-500">{text}</p></article>;
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
