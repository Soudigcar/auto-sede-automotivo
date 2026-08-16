import { getAutocarDevClient } from '@/lib/server/autocar/devAdmin';
import { evaluateAutocarPolicy } from '@/lib/server/autocar/policyEngine';

const LIVE_PURPOSE = 'live_vehicle_interest';
const LIVE_VERSION = 'autocar-vehicle-state-v1';

function liveKey(storeId: string, inboundMessageId: string) {
  return `autocar:${storeId}:${inboundMessageId}:${LIVE_PURPOSE}`;
}

function shadowFrom(result: any) {
  return result?.result?.shadow || result?.shadow || null;
}

function isLiveRuntimeEnvironment() {
  return ['preview', 'production'].includes(String(process.env.VERCEL_ENV || '').trim());
}

function vehicleName(vehicle: any) {
  return [vehicle?.brand, vehicle?.model, vehicle?.version, vehicle?.year]
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

function semanticVehicleId(shadow: any) {
  const guard = shadow?.booking_guard || {};
  if (String(guard?.state || 'NOT_APPLICABLE') === 'NOT_APPLICABLE') return '';
  if (String(guard?.booking_type || 'visit') === 'test_drive') return '';

  const referenced = Array.isArray(shadow?.referenced_vehicles)
    ? shadow.referenced_vehicles.filter((vehicle: any) => vehicle?.id)
    : [];
  const resolution = shadow?.active_vehicle_resolution || null;
  const resolvedId = String(resolution?.vehicle_id || '').trim();

  if (
    resolvedId &&
    String(resolution?.source || '') === 'semantic_booking_continuity_validated_inventory' &&
    referenced.some((vehicle: any) => String(vehicle.id) === resolvedId)
  ) {
    return resolvedId;
  }

  if (String(guard?.state || '') === 'READY_TO_SCHEDULE' && referenced.length === 1) {
    return String(referenced[0].id || '').trim();
  }

  return '';
}

async function liveEligibility(storeId: string, conversationId: string) {
  const autocar = getAutocarDevClient();
  const [agentResult, runtimeResult] = await Promise.all([
    autocar.from('ai_store_agents')
      .select('mode,status,master_enabled,master_autopilot_allowed,store_selected_mode')
      .eq('store_id', storeId)
      .maybeSingle(),
    autocar.from('ai_runtime_conversations')
      .select('effective_mode,human_state,pause_reason')
      .eq('store_id', storeId)
      .eq('production_conversation_id', conversationId)
      .maybeSingle()
  ]);
  if (agentResult.error) throw agentResult.error;
  if (runtimeResult.error) throw runtimeResult.error;

  const agent = agentResult.data;
  const runtime = runtimeResult.data;
  const policy = evaluateAutocarPolicy({ mode: 'autopilot', capability: 'set_active_vehicle_interest' });

  if (!agent?.master_enabled || !agent?.master_autopilot_allowed || agent?.store_selected_mode !== 'autopilot' || agent?.mode !== 'autopilot' || agent?.status !== 'active') {
    return { allowed: false, reason: 'Master + loja não estão efetivamente liberados para AUTOPILOT.', runtime, policy };
  }
  if (!runtime || runtime.effective_mode !== 'autopilot') {
    return { allowed: false, reason: 'Runtime da conversa não está em AUTOPILOT.', runtime, policy };
  }
  if (runtime.human_state !== 'autocar_active') {
    return { allowed: false, reason: `Conversa em takeover humano: ${runtime.pause_reason || runtime.human_state}.`, runtime, policy };
  }
  if (policy.effect !== 'allow') {
    return { allowed: false, reason: policy.reason, runtime, policy };
  }
  return { allowed: true, reason: 'Vehicle State V1 elegível no AUTOPILOT.', runtime, policy };
}

async function createClaim(input: {
  storeId: string;
  conversationId: string;
  inboundMessageId: string;
  effectiveMode: string;
  leadId: string;
  vehicleId: string;
  shadowClaimId?: string | null;
  gateReason?: string | null;
}) {
  const autocar = getAutocarDevClient();
  const now = new Date().toISOString();
  const blocked = Boolean(input.gateReason);
  const key = liveKey(input.storeId, input.inboundMessageId);
  const { data, error } = await autocar.from('ai_runtime_message_claims').insert({
    store_id: input.storeId,
    production_conversation_id: input.conversationId,
    production_message_id: input.inboundMessageId,
    purpose: LIVE_PURPOSE,
    idempotency_key: key,
    direction: 'outbound',
    message_type: 'crm_action',
    effective_mode: input.effectiveMode,
    status: blocked ? 'skipped' : 'ready',
    policy_capability: 'set_active_vehicle_interest',
    policy_effect: blocked ? 'deny' : 'allow',
    policy_source: 'vehicle_state_v1_gate',
    policy_reason: input.gateReason || 'Vehicle State V1: veículo principal semanticamente inequívoco e sujeito à revalidação do backend.',
    result: {
      live_pilot_version: LIVE_VERSION,
      lead_id: input.leadId,
      planned_vehicle_id: input.vehicleId || null,
      shadow_claim_id: input.shadowClaimId || null,
      db_execution: false,
      gate_reason: input.gateReason || null
    },
    completed_at: blocked ? now : null,
    updated_at: now
  }).select('*').single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: existingError } = await autocar.from('ai_runtime_message_claims')
        .select('*').eq('idempotency_key', key).maybeSingle();
      if (existingError) throw existingError;
      return { created: false, duplicate: true, claim: existing };
    }
    throw error;
  }
  return { created: true, duplicate: false, claim: data };
}

async function updateClaim(claimId: string, patch: Record<string, unknown>) {
  const autocar = getAutocarDevClient();
  const { data: current, error: readError } = await autocar.from('ai_runtime_message_claims')
    .select('result').eq('id', claimId).eq('purpose', LIVE_PURPOSE).maybeSingle();
  if (readError) throw readError;

  const { data, error } = await autocar.from('ai_runtime_message_claims')
    .update({
      ...patch,
      result: { ...(current?.result || {}), ...((patch as any).result || {}) },
      updated_at: new Date().toISOString()
    })
    .eq('id', claimId).eq('purpose', LIVE_PURPOSE).select('*').single();
  if (error) throw error;
  return data;
}

export async function attemptAutocarVehicleStatePilot(input: {
  productionSupabase: any;
  storeId: string;
  conversationId: string;
  leadId?: string | null;
  inboundMessageId: string;
  shadowResult: any;
}) {
  if (!isLiveRuntimeEnvironment()) return { updated: false, skipped: true, reason: 'Vehicle State V1 é bloqueado fora de Preview/Production.' };
  if (!input.leadId) return { updated: false, skipped: true, reason: 'Conversa sem lead canônico.' };

  const shadow = shadowFrom(input.shadowResult);
  if (!shadow) return { updated: false, skipped: true, reason: 'AUTO-SHADOW não produziu contexto concluído.' };

  const vehicleId = semanticVehicleId(shadow);
  const shadowClaimId = input.shadowResult?.result?.claim?.id || null;
  const effectiveMode = String(input.shadowResult?.result?.effectiveMode || input.shadowResult?.result?.claim?.effective_mode || 'autopilot');
  const gateReason = vehicleId ? null : 'Nenhum veículo principal semanticamente inequívoco foi validado no contexto de visita.';

  const claimResult = await createClaim({
    storeId: input.storeId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    effectiveMode,
    leadId: input.leadId,
    vehicleId,
    shadowClaimId,
    gateReason
  });

  if (claimResult.duplicate) {
    return { updated: false, duplicate: true, claim: claimResult.claim, reason: 'Claim Vehicle State já existe; nenhuma nova alteração será executada.' };
  }
  if (!vehicleId || !claimResult.claim?.id) {
    return { updated: false, skipped: true, claim: claimResult.claim, reason: gateReason || 'Vehicle State não ficou elegível.' };
  }

  const eligibility = await liveEligibility(input.storeId, input.conversationId);
  if (!eligibility.allowed) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped',
      policy_effect: 'deny',
      policy_reason: eligibility.reason,
      completed_at: new Date().toISOString(),
      result: { db_execution: false, eligibility_reason: eligibility.reason }
    });
    return { updated: false, skipped: true, claim: skipped, reason: eligibility.reason };
  }

  const [{ data: conversation, error: conversationError }, { data: store, error: storeError }] = await Promise.all([
    input.productionSupabase.from('whatsapp_conversations')
      .select('id,store_id,lead_id')
      .eq('id', input.conversationId)
      .eq('store_id', input.storeId)
      .maybeSingle(),
    input.productionSupabase.from('stores')
      .select('id,store_name,event_id')
      .eq('id', input.storeId)
      .maybeSingle()
  ]);
  if (conversationError) throw conversationError;
  if (storeError) throw storeError;
  if (!conversation || conversation.lead_id !== input.leadId) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: 'Lead canônico da conversa mudou.', completed_at: new Date().toISOString(),
      result: { db_execution: false, canonical_lead_mismatch: true }
    });
    return { updated: false, skipped: true, claim: skipped, reason: 'Lead canônico da conversa mudou.' };
  }

  const [{ data: lead, error: leadError }, { data: vehicle, error: vehicleError }] = await Promise.all([
    input.productionSupabase.from('leads')
      .select('id,event_id,assigned_store_id,customer_name,customer_phone,status,interested_vehicle_id,interested_vehicle,interested_vehicle_price,last_activity_at,last_activity_type,last_activity_label,last_activity_by_name,updated_at')
      .eq('id', input.leadId)
      .eq('assigned_store_id', input.storeId)
      .maybeSingle(),
    input.productionSupabase.from('site_vehicles')
      .select('id,store_id,brand,model,version,year,price,status,sold_at')
      .eq('id', vehicleId)
      .eq('store_id', input.storeId)
      .eq('status', 'disponivel')
      .is('sold_at', null)
      .maybeSingle()
  ]);
  if (leadError) throw leadError;
  if (vehicleError) throw vehicleError;

  if (!lead || !vehicle) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: 'Lead ou veículo disponível não passou na revalidação do backend.', completed_at: new Date().toISOString(),
      result: { db_execution: false, inventory_revalidation: false }
    });
    return { updated: false, skipped: true, claim: skipped, reason: 'Lead ou veículo não passou na revalidação.' };
  }

  const nextVehicleName = vehicleName(vehicle);
  const previousVehicleId = lead.interested_vehicle_id ? String(lead.interested_vehicle_id) : null;
  const previousVehicleName = lead.interested_vehicle || null;
  const previousVehiclePrice = lead.interested_vehicle_price == null ? null : Number(lead.interested_vehicle_price);

  if (previousVehicleId === vehicleId) {
    const completed = await updateClaim(claimResult.claim.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: {
        db_execution: false,
        noop: true,
        previous_vehicle_id: previousVehicleId,
        active_vehicle_id: vehicleId,
        active_vehicle_name: nextVehicleName
      }
    });
    return { updated: false, noop: true, claim: completed, vehicle, reason: 'O veículo já era o interesse principal do lead.' };
  }

  const eligibilityBeforeWrite = await liveEligibility(input.storeId, input.conversationId);
  if (!eligibilityBeforeWrite.allowed) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: eligibilityBeforeWrite.reason, completed_at: new Date().toISOString(),
      result: { db_execution: false, eligibility_reason: eligibilityBeforeWrite.reason }
    });
    return { updated: false, skipped: true, claim: skipped, reason: eligibilityBeforeWrite.reason };
  }

  const now = new Date().toISOString();
  const activityLabel = `Veículo principal atualizado pela AUTOCAR: ${nextVehicleName}`;
  let updateQuery = input.productionSupabase.from('leads')
    .update({
      interested_vehicle_id: vehicle.id,
      interested_vehicle: nextVehicleName,
      interested_vehicle_price: vehicle.price || null,
      updated_at: now,
      last_activity_at: now,
      last_activity_type: 'vehicle_interest_updated',
      last_activity_label: activityLabel,
      last_activity_by_name: 'AUTOCAR'
    })
    .eq('id', lead.id)
    .eq('assigned_store_id', input.storeId);

  updateQuery = previousVehicleId
    ? updateQuery.eq('interested_vehicle_id', previousVehicleId)
    : updateQuery.is('interested_vehicle_id', null);

  const { data: updatedLead, error: updateError } = await updateQuery
    .select('id,interested_vehicle_id,interested_vehicle,interested_vehicle_price,status,updated_at')
    .maybeSingle();
  if (updateError) throw updateError;

  if (!updatedLead) {
    const skipped = await updateClaim(claimResult.claim.id, {
      status: 'skipped', policy_effect: 'deny', policy_reason: 'O veículo principal mudou concorrentemente; a AUTOCAR não sobrescreveu a alteração.', completed_at: new Date().toISOString(),
      result: { db_execution: false, concurrent_change: true }
    });
    return { updated: false, skipped: true, claim: skipped, reason: 'Mudança concorrente detectada no veículo principal.' };
  }

  const metadata = {
    previous_vehicle: previousVehicleName,
    previous_vehicle_id: previousVehicleId,
    vehicle_id: vehicle.id,
    vehicle_name: nextVehicleName,
    vehicle_price: vehicle.price || null,
    actor_role: 'autocar',
    registered_from: 'autocar_vehicle_state_v1',
    source_inbound_message_id: input.inboundMessageId,
    shadow_claim_id: shadowClaimId
  };

  const { error: historyError } = await input.productionSupabase.from('lead_activity_logs').insert({
    lead_id: lead.id,
    store_id: input.storeId,
    store_name: store?.store_name || 'Loja',
    user_id: null,
    user_name: 'AUTOCAR',
    activity_type: 'vehicle_interest_updated',
    activity_label: activityLabel,
    from_status: lead.status,
    to_status: lead.status,
    customer_name: lead.customer_name,
    customer_phone: lead.customer_phone,
    vehicle_name: nextVehicleName,
    notes: previousVehicleName ? `Interesse anterior preservado: ${previousVehicleName}.` : 'Primeiro veículo principal definido pela AUTOCAR.',
    metadata
  });

  if (historyError) {
    const rollbackNow = new Date().toISOString();
    const { error: rollbackError } = await input.productionSupabase.from('leads')
      .update({
        interested_vehicle_id: previousVehicleId,
        interested_vehicle: previousVehicleName,
        interested_vehicle_price: previousVehiclePrice,
        updated_at: rollbackNow,
        last_activity_at: lead.last_activity_at,
        last_activity_type: lead.last_activity_type,
        last_activity_label: lead.last_activity_label,
        last_activity_by_name: lead.last_activity_by_name
      })
      .eq('id', lead.id)
      .eq('assigned_store_id', input.storeId)
      .eq('interested_vehicle_id', vehicle.id);

    const failed = await updateClaim(claimResult.claim.id, {
      status: 'failed',
      policy_reason: 'Falha ao registrar histórico obrigatório do Vehicle State.',
      completed_at: new Date().toISOString(),
      result: {
        db_execution: !rollbackError,
        rolled_back: !rollbackError,
        history_error: String(historyError.message || historyError).slice(0, 500),
        rollback_error: rollbackError ? String(rollbackError.message || rollbackError).slice(0, 500) : null
      }
    });
    return { updated: false, failed: true, claim: failed, reason: 'Histórico obrigatório falhou; alteração foi compensada quando possível.' };
  }

  const secondaryResults = await Promise.allSettled([
    input.productionSupabase.from('lead_activities').insert({
      event_id: lead.event_id || store?.event_id || null,
      lead_id: lead.id,
      user_id: null,
      activity_type: 'vehicle_interest_updated',
      description: activityLabel,
      metadata
    }),
    input.productionSupabase.from('audit_logs').insert({
      event_id: lead.event_id || store?.event_id || null,
      user_id: null,
      user_role: 'autocar',
      action_type: 'vehicle_interest_updated',
      entity_type: 'leads',
      entity_id: lead.id,
      old_value: {
        interested_vehicle_id: previousVehicleId,
        interested_vehicle: previousVehicleName,
        interested_vehicle_price: previousVehiclePrice
      },
      new_value: {
        interested_vehicle_id: vehicle.id,
        interested_vehicle: nextVehicleName,
        interested_vehicle_price: vehicle.price || null,
        actor: 'AUTOCAR',
        source_inbound_message_id: input.inboundMessageId
      }
    })
  ]);

  const auditWarnings = secondaryResults
    .filter((result) => result.status === 'rejected')
    .map((result: any) => String(result.reason?.message || result.reason || 'Falha secundária').slice(0, 300));

  const completed = await updateClaim(claimResult.claim.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    result: {
      db_execution: true,
      noop: false,
      previous_vehicle_id: previousVehicleId,
      previous_vehicle_name: previousVehicleName,
      active_vehicle_id: vehicle.id,
      active_vehicle_name: nextVehicleName,
      active_vehicle_price: vehicle.price || null,
      history_recorded: true,
      audit_warnings: auditWarnings
    }
  });

  return {
    updated: true,
    claim: completed,
    lead: updatedLead,
    vehicle,
    previous_vehicle_id: previousVehicleId,
    previous_vehicle_name: previousVehicleName,
    audit_warnings: auditWarnings
  };
}
