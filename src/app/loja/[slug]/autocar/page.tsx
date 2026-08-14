'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, BrainCircuit, CheckCircle2, Database, Eye, KeyRound, Loader2, LockKeyhole, ShieldCheck, Sparkles, Wrench, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useStorePortal } from '@/components/StorePortalShell';
import { AutocarIntelligenceCenter } from '@/components/AutocarIntelligenceCenter';

type FoundationStatus = {
  phase: string;
  execution_mode: 'off';
  database_state: string;
  automatic_replies_enabled: boolean;
  webhook_hooked: boolean;
  openai: { configured: boolean; model_route: string };
  permissions: { view: boolean; manage: boolean; approve: boolean };
  store_scope: { store_id: string; store_name: string; slug: string };
  read_tools: Array<{ name: string; capability: string; accepts_store_id: boolean }>;
  hard_policy_examples: Record<string, { effect: string; source: string; reason: string }>;
};

const foundationTables = [
  'ai_store_agents',
  'ai_store_knowledge',
  'ai_store_policies',
  'ai_conversation_memory',
  'ai_agent_runs',
  'ai_agent_events',
  'ai_agent_approvals'
];

export default function AutocarFoundationPage() {
  const portal = useStorePortal();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<FoundationStatus | null>(null);
  const [message, setMessage] = useState('Validando a fundação da I.A AUTOCAR...');

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Sessão não encontrada.');
        const response = await fetch(`/api/store/portal/autocar/foundation-status?slug=${encodeURIComponent(portal.store.slug)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Falha ao validar a fundação AUTOCAR.');
        if (!cancelled) {
          setStatus(body);
          setMessage('');
        }
      } catch (error: any) {
        if (!cancelled) setMessage(error?.message || 'Falha ao validar a fundação AUTOCAR.');
      }
    }

    void loadStatus();
    return () => { cancelled = true; };
  }, [portal.store.slug, supabase]);

  return (
    <main className="premium-page">
      <div className="premium-canvas min-w-0 p-4 md:p-7">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-red-600"><Sparkles size={18} /><span className="premium-eyebrow">Agente comercial automotivo por loja</span></div>
            <h1 className="premium-title mt-2 text-4xl md:text-5xl">I.A AUTOCAR</h1>
            <p className="premium-muted mt-3 max-w-3xl text-sm">
              Central para ensinar a AUTOCAR a vender pelo Método Venda Mais, respeitando o contexto, as regras e o conhecimento exclusivo de cada loja.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Modo atual</p><p className="text-sm font-black text-zinc-900">COPILOT · Preview</p></div>
          </div>
        </header>

        {message ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-600">
            {!status ? <Loader2 size={18} className="animate-spin text-red-600" /> : null}{message}
          </div>
        ) : null}

        <AutocarIntelligenceCenter
          storeName={status?.store_scope.store_name || portal.store.store_name}
          slug={portal.store.slug}
          canManage={Boolean(status?.permissions.manage)}
        />

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={<Bot size={21} />} label="Atendimento automático" value={status?.automatic_replies_enabled ? 'Ativo' : 'Desligado'} ok={!status?.automatic_replies_enabled} helper="Nenhuma mensagem é enviada automaticamente nesta fase." />
          <StatusCard icon={<KeyRound size={21} />} label="OpenAI server-side" value={status?.openai.configured ? 'Configurada' : 'Não detectada'} ok={Boolean(status?.openai.configured)} helper={status?.openai.configured ? 'A chave permanece privada no servidor.' : 'OPENAI_API_KEY precisa existir no ambiente Preview.'} />
          <StatusCard icon={<Database size={21} />} label="Banco AUTOCAR" value="Somente versionado" ok helper="Migration criada, mas ainda não aplicada ao Supabase Production." />
          <StatusCard icon={<ShieldCheck size={21} />} label="Segurança" value="Hard Policy ativa" ok helper="Regras globais continuam acima das configurações da loja." />
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="premium-card p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="premium-eyebrow">Isolamento multi-loja</p><h2 className="mt-2 flex items-center gap-2 text-xl font-black text-zinc-950"><LockKeyhole size={20} className="text-red-600" /> Loja definida pelo backend</h2></div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">Obrigatório</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-600">As ferramentas da AUTOCAR não recebem <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-bold">store_id</code>. O contexto nasce da conversa WhatsApp e o backend reaplica a loja em toda consulta.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <SecurityPoint title="Contexto" text="Conversa, integração, lead e mensagem são validados contra a mesma loja." />
              <SecurityPoint title="Venda Mais" text="Método oficial herdado; a loja adiciona contexto sem remover regras essenciais." />
              <SecurityPoint title="Conhecimento" text="Informações comerciais e políticas permanecem isoladas por loja." />
            </div>
          </div>

          <div className="premium-card p-5 md:p-6">
            <p className="premium-eyebrow">Permissões</p>
            <h2 className="mt-2 text-xl font-black text-zinc-950">Acesso desta sessão</h2>
            <div className="mt-5 space-y-3">
              <PermissionRow label="Visualizar AUTOCAR" enabled={Boolean(status?.permissions.view)} />
              <PermissionRow label="Gerenciar AUTOCAR" enabled={Boolean(status?.permissions.manage)} />
              <PermissionRow label="Aprovar ações críticas" enabled={Boolean(status?.permissions.approve)} />
            </div>
          </div>
        </section>

        <details className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5 md:p-6">
          <summary className="cursor-pointer list-none text-sm font-black text-zinc-900">Detalhes técnicos da fundação AUTOCAR</summary>
          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 p-5">
              <p className="premium-eyebrow">Fundação de dados</p>
              <h2 className="mt-2 flex items-center gap-2 text-xl font-black text-zinc-950"><Database size={20} className="text-red-600" /> 7 estruturas versionadas</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {foundationTables.map((table) => <div key={table} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-bold text-zinc-700"><CheckCircle2 size={15} className="shrink-0 text-emerald-600" />{table}</div>)}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 p-5">
              <p className="premium-eyebrow">Tools de leitura</p>
              <h2 className="mt-2 flex items-center gap-2 text-xl font-black text-zinc-950"><Wrench size={20} className="text-red-600" /> Registry inicial</h2>
              <div className="mt-5 max-h-80 space-y-2 overflow-auto pr-1">
                {(status?.read_tools || []).map((tool) => (
                  <div key={tool.name} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2.5">
                    <div className="min-w-0"><p className="truncate text-xs font-black text-zinc-800">{tool.name}</p><p className="mt-0.5 text-[10px] font-bold uppercase text-zinc-400">{tool.capability}</p></div>
                    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${tool.accepts_store_id ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{tool.accepts_store_id ? <XCircle size={11} /> : <CheckCircle2 size={11} />}{tool.accepts_store_id ? 'store_id exposto' : 'sem store_id'}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-zinc-200 p-5">
            <p className="premium-eyebrow">Global Hard Policy</p>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-black text-zinc-950"><BrainCircuit size={20} className="text-red-600" /> Limites que a loja não pode ultrapassar</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {Object.entries(status?.hard_policy_examples || {}).map(([key, decision]) => (
                <div key={key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="break-words text-[10px] font-black uppercase tracking-wide text-zinc-500">{key}</p>
                  <div className="mt-2 flex items-center gap-1.5"><Eye size={14} className="text-red-600" /><strong className="text-sm uppercase text-zinc-900">{decision.effect}</strong></div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">{decision.reason}</p>
                </div>
              ))}
            </div>
          </section>
        </details>
      </div>
    </main>
  );
}

function StatusCard({ icon, label, value, helper, ok }: { icon: React.ReactNode; label: string; value: string; helper: string; ok: boolean }) {
  return <div className="premium-card p-5"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{icon}</div><p className="mt-4 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">{label}</p><p className="mt-1 text-lg font-black text-zinc-950">{value}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{helper}</p></div>;
}

function SecurityPoint({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><p className="text-xs font-black text-zinc-900">{title}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p></div>;
}

function PermissionRow({ label, enabled }: { label: string; enabled: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-3"><span className="text-sm font-bold text-zinc-700">{label}</span>{enabled ? <CheckCircle2 size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-zinc-300" />}</div>;
}
