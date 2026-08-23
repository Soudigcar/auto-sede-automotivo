'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Loader2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type PolicyEffect = 'allow' | 'deny' | 'approval' | 'handoff';
type CapabilityRow = {
  capability: string;
  configurable: boolean;
  hard_policy?: { effect?: PolicyEffect; reason?: string } | null;
  default_effect?: PolicyEffect;
  effective_ceiling?: PolicyEffect;
  global_policy?: { effect?: PolicyEffect; reason?: string | null; is_active?: boolean; version?: number } | null;
};
type PricingEntry = {
  lane: string;
  model: string;
  role: string;
  pricing?: {
    input_brl_per_million?: number | null;
    output_brl_per_million?: number | null;
    audio_brl_per_minute?: number | null;
    image_brl_per_unit?: number | null;
    source_note?: string | null;
    is_active?: boolean;
    version?: number;
  } | null;
};
type ControlPlane = {
  schema_ready?: boolean;
  required_migration?: string | null;
  capabilities?: CapabilityRow[];
  model_pricing?: PricingEntry[];
};

const labels: Record<string, string> = {
  respond_first_contact: 'Responder primeiro contato', qualify_lead: 'Qualificar lead', consult_stock: 'Consultar estoque', send_vehicles: 'Enviar veículos',
  send_photos: 'Enviar fotos', send_location: 'Enviar localização', respond_audio_with_audio: 'Responder áudio com áudio', schedule_visit: 'Agendar visita',
  schedule_test_drive: 'Agendar test-drive', set_active_vehicle_interest: 'Definir veículo de interesse', create_follow_up: 'Criar follow-up', transfer_lead: 'Transferir para humano',
  alter_pipeline: 'Alterar pipeline', negotiate_price: 'Negociar preço', grant_discount: 'Conceder desconto', alter_stock_price: 'Alterar preço do estoque',
  confirm_sale: 'Confirmar venda', promise_credit_approval: 'Prometer aprovação de crédito', final_trade_appraisal: 'Avaliação definitiva de troca'
};

async function body(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
  return data;
}

function Effect({ value }: { value?: string | null }) {
  const text = String(value || 'default').toUpperCase();
  return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[9px] font-black text-zinc-700">{text}</span>;
}

export function MasterAutocarGlobalRules({ controlPlane, onReload }: { controlPlane?: ControlPlane | null; onReload: () => Promise<void> | void }) {
  const supabase = useMemo(() => createClient(), []);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, { effect: string; reason: string }>>({});
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, Record<string, string>>>({});
  const schemaReady = controlPlane?.schema_ready === true;

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }, [supabase]);

  async function savePolicy(row: CapabilityRow) {
    if (!schemaReady || !row.configurable) return;
    const draft = policyDrafts[row.capability] || { effect: row.global_policy?.is_active ? String(row.global_policy.effect || 'allow') : 'default', reason: row.global_policy?.reason || '' };
    setBusyKey(`policy:${row.capability}`);
    setMessage('');
    try {
      const access = await token();
      await body(await fetch('/api/master/autocar', {
        method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-global-policy', capability: row.capability, effect: draft.effect, reason: draft.reason, expected_version: Number(row.global_policy?.version || 0) })
      }));
      await onReload();
      setMessage(`Regra global de “${labels[row.capability] || row.capability}” salva.`);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível salvar a regra.'); }
    finally { setBusyKey(''); }
  }

  async function savePricing(entry: PricingEntry) {
    if (!schemaReady) return;
    const current = entry.pricing || {};
    const draft = pricingDrafts[entry.model] || {};
    setBusyKey(`price:${entry.model}`);
    setMessage('');
    try {
      const access = await token();
      await body(await fetch('/api/master/autocar', {
        method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-model-pricing', model: entry.model,
          input_brl_per_million: draft.input ?? current.input_brl_per_million ?? '',
          output_brl_per_million: draft.output ?? current.output_brl_per_million ?? '',
          audio_brl_per_minute: draft.audio ?? current.audio_brl_per_minute ?? '',
          image_brl_per_unit: draft.image ?? current.image_brl_per_unit ?? '',
          source_note: draft.note ?? current.source_note ?? '', is_active: true,
          expected_version: Number(current.version || 0)
        })
      }));
      await onReload();
      setMessage(`Tabela interna de custo de ${entry.model} atualizada.`);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível salvar o preço.'); }
    finally { setBusyKey(''); }
  }

  return <section className="mt-6 space-y-5">
    {!schemaReady ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center gap-2 text-amber-800"><AlertTriangle size={18}/><strong>Control Plane V2 ainda não provisionado neste ambiente</strong></div>
      <p className="mt-2 text-xs font-bold leading-5 text-amber-800">A interface está em Preview e permanece fail-closed para persistência. Migration necessária: <code>{controlPlane?.required_migration || '20260823040800_autocar_master_control_plane_v2'}</code>. Nenhuma migration é aplicada por esta tela.</p>
    </div> : null}

    <div className="premium-card p-5">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><ShieldCheck size={19}/></span><div><h2 className="text-xl font-black">Teto global de capacidades</h2><p className="mt-1 text-xs font-bold leading-5 text-zinc-500">SAFE CORE → teto global Master → modo → regra da loja → padrão. Uma loja nunca pode reduzir uma restrição definida acima dela.</p></div></div>
      <div className="mt-5 space-y-2">{(controlPlane?.capabilities || []).map((row) => {
        const draft = policyDrafts[row.capability];
        const effect = draft?.effect ?? (row.global_policy?.is_active ? row.global_policy.effect : 'default') ?? 'default';
        const reason = draft?.reason ?? row.global_policy?.reason ?? '';
        return <div key={row.capability} className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 xl:grid-cols-[1fr_150px_1.2fr_auto] xl:items-center">
          <div><p className="text-sm font-black text-zinc-950">{labels[row.capability] || row.capability}</p><div className="mt-1 flex flex-wrap gap-2"><Effect value={row.effective_ceiling}/>{row.hard_policy ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[9px] font-black text-red-700"><LockKeyhole size={10}/>SAFE CORE</span> : null}</div><p className="mt-2 text-[10px] font-bold leading-4 text-zinc-500">{row.hard_policy?.reason || `Padrão atual: ${String(row.default_effect || 'deny').toUpperCase()}`}</p></div>
          <select disabled={!schemaReady || !row.configurable || Boolean(busyKey)} value={effect} onChange={(event) => setPolicyDrafts((current) => ({ ...current, [row.capability]: { effect: event.target.value, reason } }))} className="premium-input text-xs font-black">
            <option value="default">PADRÃO</option><option value="allow">ALLOW</option><option value="approval">APROVAÇÃO</option><option value="handoff">HANDOFF</option><option value="deny">DENY</option>
          </select>
          <input disabled={!schemaReady || !row.configurable || Boolean(busyKey)} className="premium-input text-xs" value={reason} onChange={(event) => setPolicyDrafts((current) => ({ ...current, [row.capability]: { effect, reason: event.target.value } }))} placeholder="Motivo operacional da restrição global" />
          <button type="button" disabled={!schemaReady || !row.configurable || Boolean(busyKey)} onClick={() => void savePolicy(row)} className="premium-button-secondary justify-center">{busyKey === `policy:${row.capability}` ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}Salvar</button>
        </div>;
      })}</div>
    </div>

    <div className="premium-card p-5">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-zinc-950 p-2.5 text-white"><Calculator size={19}/></span><div><h2 className="text-xl font-black">Tabela interna de custos por modelo</h2><p className="mt-1 text-xs font-bold leading-5 text-zinc-500">Serve apenas para observabilidade interna da AUTOCAR. Billing, planos, créditos comerciais e cobrança continuam no CRM/SaaS.</p></div></div>
      <div className="mt-5 space-y-3">{(controlPlane?.model_pricing || []).map((entry) => {
        const current = entry.pricing || {};
        const draft = pricingDrafts[entry.model] || {};
        const field = (key: string, currentValue: unknown) => draft[key] ?? (currentValue === null || currentValue === undefined ? '' : String(currentValue));
        return <div key={`${entry.lane}:${entry.model}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-black">{entry.model}</p><p className="text-[10px] font-bold uppercase text-zinc-400">{entry.lane} · {entry.role}</p></div><Effect value={current.is_active === false ? 'inativo' : current.version ? `v${current.version}` : 'sem preço'}/></div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {[['input','Entrada / 1M tokens',current.input_brl_per_million],['output','Saída / 1M tokens',current.output_brl_per_million],['audio','Áudio / minuto',current.audio_brl_per_minute],['image','Imagem / unidade',current.image_brl_per_unit]].map(([key,label,value]) => <label key={String(key)} className="text-[10px] font-black text-zinc-500">{label}<input disabled={!schemaReady || Boolean(busyKey)} inputMode="decimal" className="premium-input mt-1 text-xs" value={field(String(key), value)} onChange={(event) => setPricingDrafts((all) => ({ ...all, [entry.model]: { ...draft, [String(key)]: event.target.value } }))} placeholder="R$ 0,00" /></label>)}
            <label className="text-[10px] font-black text-zinc-500">Fonte/observação<input disabled={!schemaReady || Boolean(busyKey)} className="premium-input mt-1 text-xs" value={field('note', current.source_note)} onChange={(event) => setPricingDrafts((all) => ({ ...all, [entry.model]: { ...draft, note: event.target.value } }))} placeholder="Fonte da tarifa" /></label>
          </div>
          <button type="button" disabled={!schemaReady || Boolean(busyKey)} onClick={() => void savePricing(entry)} className="premium-button-secondary mt-3">{busyKey === `price:${entry.model}` ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}Salvar custo interno</button>
        </div>;
      })}</div>
    </div>
    {message ? <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs font-bold text-zinc-700">{message}</div> : null}
  </section>;
}
