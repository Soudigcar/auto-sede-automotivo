import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { contextualAutopilotQuality, hasFollowUpOptOut } from '../src/lib/server/autocar/followUpV2Autopilot';
import { evaluateFollowUpCopilotCandidate } from '../src/lib/server/autocar/followUpV2CopilotQueue';
import { defaultFollowUpConfigV2 } from '../src/lib/server/autocar/smartFollowUpV2';

const A4 = '239755c3-a2d4-4cdd-9502-f1595031c924';

function autopilotConfig() {
  return {
    ...structuredClone(defaultFollowUpConfigV2),
    global: {
      ...defaultFollowUpConfigV2.global,
      enabled: true,
      mode: 'autopilot' as const,
      allowedStart: '09:00',
      allowedEnd: '19:00',
      maxPerLeadPerDay: 1,
      maxPerSequence: 3,
      maxSequenceDays: 7,
      minIntervalMinutes: 60
    },
    scenarios: defaultFollowUpConfigV2.scenarios.map((scenario) => ({ ...structuredClone(scenario), enabled: true }))
  };
}

describe('Smart Follow-up V2 AUTOPILOT canary', () => {
  it('reutiliza elegibilidade fail-closed em modo AUTOPILOT', () => {
    const result = evaluateFollowUpCopilotCandidate({
      config: autopilotConfig(),
      conversation: { id: '11111111-1111-1111-1111-111111111111', status: 'open' },
      lead: { id: '22222222-2222-2222-2222-222222222222', status: 'in_service', interested_vehicle: 'HB20', interested_vehicle_id: null, scheduled_at: null },
      commercial: null,
      runtimeConversation: { human_state: 'autocar_active' },
      messages: [
        { direction: 'inbound', body: 'Me manda o anúncio do HB20', sent_at: '2026-08-27T09:00:00-03:00' },
        { direction: 'outbound', body: 'Enviei o anúncio completo para você.', sent_at: '2026-08-27T09:05:00-03:00' }
      ],
      requiredMode: 'autopilot',
      now: new Date('2026-08-27T14:00:00-03:00')
    });
    assert.ok(result.candidate);
    assert.match(result.reason, /AUTOPILOT/);
  });

  it('detecta opt-out explícito sem confundir objeção de produto', () => {
    assert.equal(hasFollowUpOptOut([{ direction: 'inbound', body: 'Não quero mais receber mensagens, por favor.' }]), true);
    assert.equal(hasFollowUpOptOut([{ direction: 'inbound', body: 'Não quero esse carro, tem outro?' }]), false);
    assert.equal(hasFollowUpOptOut([{ direction: 'inbound', body: 'STOP' }]), true);
  });

  it('rebaixa mensagem genérica ou promessa protegida para revisão humana', () => {
    const base = {
      is_commercial_conversation: true,
      block_reason: null,
      last_topic: 'HB20',
      pending_thread: 'Cliente não respondeu ao anúncio.',
      reopening_hook: 'Perguntar se viu o anúncio.',
      commercial_objective: 'Retomar interesse.',
      avoid_repeating: ['Não reenviar o link.']
    };
    assert.equal(contextualAutopilotQuality({ ...base, suggested_message: 'Como posso ajudar?' }).safe, false);
    assert.equal(contextualAutopilotQuality({ ...base, suggested_message: 'Seu crédito está aprovado garantido.' }).safe, false);
    assert.equal(contextualAutopilotQuality({ ...base, suggested_message: 'Conseguiu olhar o HB20 que te enviei? Se fizer sentido, combinamos uma visita.' }).safe, true);
  });

  it('migration restringe AUTOPILOT ao UUID da A4 e mantém tabelas service-only', () => {
    const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260827130000_autocar_follow_up_v2_autopilot_canary.sql'), 'utf8');
    assert.match(migration, /mode in \('off','copilot','autopilot'\)/);
    assert.match(migration, new RegExp(A4));
    assert.match(migration, /ai_follow_up_store_settings_autopilot_canary_check/);
    assert.match(migration, /ai_follow_up_autopilot_executions/);
    assert.match(migration, /service_only_deny_client_access/);
    assert.match(migration, /to anon, authenticated using \(false\)/);
    assert.doesNotMatch(migration, /cron\.schedule|pg_cron|net\.http/);
  });

  it('config store bloqueia AUTOPILOT fora da A4 em código', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/followUpV2ConfigStore.ts'), 'utf8');
    assert.match(source, new RegExp(`FOLLOW_UP_V2_AUTOPILOT_CANARY_STORE_ID = '${A4}'`));
    assert.match(source, /AUTOPILOT do Smart Follow-up está liberado somente para a A4/);
    assert.match(source, /master\.global\.mode !== 'autopilot'/);
  });

  it('executor exige SAFE CORE, capability, revalidação e claim LIVE antes da Evolution', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/followUpV2Autopilot.ts'), 'utf8');
    assert.match(source, /evaluateAutocarExternalExecutionGate/);
    assert.match(source, /create_follow_up/);
    assert.match(source, /immediateRevalidation/);
    assert.match(source, /hasFollowUpOptOut/);
    assert.match(source, /looksLikeNonLeadAutomation/);
    assert.match(source, /createLiveTextSendClaim/);
    assert.match(source, /purpose: 'live_text_send'/);
    assert.match(source, /sendEvolutionText/);
    assert.match(source, /FOLLOW_UP_AUTOPILOT_MAX_SENDS_PER_RUN = 3/);
    assert.doesNotMatch(source, /\/api\/whatsapp\/messages\/send|markAutocarHumanActive|sendWhatsApp/i);
  });

  it('cron é protegido, Production-only e varre somente o executor A4 governado', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/autocar-follow-up-v2/route.ts'), 'utf8');
    const vercel = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');
    assert.match(route, /CRON_SECRET/);
    assert.match(route, /safeEqual/);
    assert.match(route, /VERCEL_ENV !== 'production'/);
    assert.match(route, /runGovernedA4FollowUpAutopilot/);
    assert.doesNotMatch(route, /runA4FollowUpAutopilot\(/);
    assert.match(vercel, /\/api\/cron\/autocar-follow-up-v2/);
    assert.match(vercel, /\*\/5 \* \* \* \*/);
  });

  it('fila COPILOT vira somente fallback quando modo efetivo é AUTOPILOT', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/store/portal/autocar/follow-up-v2/copilot/route.ts'), 'utf8');
    assert.match(route, /config\.global\.mode === 'autopilot'/);
    assert.match(route, /metadata\?\.autopilot_fallback === true/);
    assert.match(route, /geração manual fica reservada aos casos rebaixados automaticamente para COPILOT/);
    assert.doesNotMatch(route, /sendEvolutionText|messages\/send/);
  });
});
