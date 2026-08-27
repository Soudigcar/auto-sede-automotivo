import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { evaluateFollowUpCopilotCandidate } from '../src/lib/server/autocar/followUpV2CopilotQueue';
import { looksLikeNonLeadAutomation } from '../src/lib/server/autocar/followUpV2ContextualReopening';
import { defaultFollowUpConfigV2 } from '../src/lib/server/autocar/smartFollowUpV2';

function activeConfig() {
  return {
    ...structuredClone(defaultFollowUpConfigV2),
    global: { ...defaultFollowUpConfigV2.global, enabled: true, mode: 'copilot' as const, allowedStart: '09:00', allowedEnd: '19:00' },
    scenarios: defaultFollowUpConfigV2.scenarios.map((scenario) => ({ ...structuredClone(scenario), enabled: true }))
  };
}

const base = {
  config: activeConfig(),
  conversation: { id: '11111111-1111-1111-1111-111111111111', status: 'open' },
  lead: { id: '22222222-2222-2222-2222-222222222222', status: 'in_service', customer_name: 'Cliente', interested_vehicle: 'HB20', interested_vehicle_id: '33333333-3333-3333-3333-333333333333', scheduled_at: null },
  commercial: null,
  runtimeConversation: { human_state: 'autocar_active' },
  messages: [
    { direction: 'inbound', body: 'Onde fica esse HB20?', sent_at: '2026-08-26T10:00:00-03:00' },
    { direction: 'outbound', body: 'Ele está na loja. Te enviei o link completo do HB20.', sent_at: '2026-08-26T10:05:00-03:00' }
  ],
  now: new Date('2026-08-26T17:30:00-03:00')
};

describe('Smart Follow-up V2 COPILOT queue', () => {
  it('gera candidato somente após a etapa configurada e sem envio externo', () => {
    const result = evaluateFollowUpCopilotCandidate(base);
    assert.ok(result.candidate);
    assert.equal(result.candidate?.scenario_key, 'vehicle_interest');
    assert.equal(result.candidate?.step_id, 'vehicle-4h');
    assert.equal(result.reason.includes('revisão humana'), true);
  });

  it('bloqueia conversa assumida por humano', () => {
    const result = evaluateFollowUpCopilotCandidate({ ...base, runtimeConversation: { human_state: 'human_active' } });
    assert.equal(result.candidate, null);
  });

  it('bloqueia quando a última mensagem é do cliente', () => {
    const result = evaluateFollowUpCopilotCandidate({
      ...base,
      messages: [
        { direction: 'outbound', body: 'Consegue vir hoje?', sent_at: '2026-08-26T10:05:00-03:00' },
        { direction: 'inbound', body: 'Consigo amanhã.', sent_at: '2026-08-26T16:00:00-03:00' }
      ]
    });
    assert.equal(result.candidate, null);
    assert.equal(result.reason.includes('última mensagem é do cliente'), true);
  });

  it('bloqueia fora da janela configurada', () => {
    const result = evaluateFollowUpCopilotCandidate({ ...base, now: new Date('2026-08-26T21:30:00-03:00') });
    assert.equal(result.candidate, null);
    assert.equal(result.reason.includes('Fora da janela'), true);
  });

  it('não tenta automatizar jornadas que exigem fato operacional ainda não comprovado', () => {
    const result = evaluateFollowUpCopilotCandidate({ ...base, lead: { ...base.lead, scheduled_at: '2026-08-27T14:00:00-03:00' } });
    assert.equal(result.candidate, null);
    assert.equal(result.reason.includes('fato operacional'), true);
  });

  it('bloqueia mensagens promocionais automatizadas de terceiros antes da geração', () => {
    const messages = [
      { direction: 'inbound', body: 'Oi! Aqui é a Bahira, Product Marketing na Wati. Webinar de Produto. Powered by wati.io. Garanta sua vaga!', sent_at: '2026-08-26T10:00:00-03:00' },
      { direction: 'outbound', body: 'Este canal é da A4 Multimarcas. Acredito que a mensagem foi enviada por engano.', sent_at: '2026-08-26T10:05:00-03:00' }
    ];
    assert.equal(looksLikeNonLeadAutomation(messages), true);
    const result = evaluateFollowUpCopilotCandidate({ ...base, lead: { ...base.lead, interested_vehicle: '', interested_vehicle_id: null }, messages });
    assert.equal(result.candidate, null);
    assert.equal(result.reason.includes('automação promocional'), true);
  });

  it('usa reabertura contextual e roteamento comercial, sem sender', () => {
    const contextual = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/followUpV2ContextualReopening.ts'), 'utf8');
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/store/portal/autocar/follow-up-v2/copilot/route.ts'), 'utf8');
    assert.match(contextual, /task: 'commercial_reply'/);
    assert.match(contextual, /último assunto concreto/i);
    assert.match(contextual, /Nunca repita semanticamente/i);
    assert.match(contextual, /recency_weight/);
    assert.match(route, /generateContextualFollowUpReopening/);
    assert.match(route, /contextual_reopening: true/);
    assert.doesNotMatch(route, /analyzeAutocarCopilot/);
    assert.doesNotMatch(route, /sendEvolution|sendWhatsApp|messages\/send|sendTextMessage|sendMedia/i);
  });

  it('fila permanece service-only e sem sender, cron ou AUTOPILOT', () => {
    const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260826205000_autocar_follow_up_v2_copilot_suggestions.sql'), 'utf8');
    const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/store/portal/autocar/follow-up-v2/copilot/route.ts'), 'utf8');
    const ui = fs.readFileSync(path.join(process.cwd(), 'src/components/StoreAutocarFollowUpCopilotQueue.tsx'), 'utf8');
    assert.match(migration, /service_only_deny_client_access/);
    assert.match(migration, /to anon, authenticated using \(false\)/);
    assert.doesNotMatch(migration, /cron\.schedule|pg_cron|net\.http|messages\/send|AUTOPILOT.*allowed/i);
    assert.doesNotMatch(route, /sendEvolution|sendWhatsApp|messages\/send|sendTextMessage|sendMedia/i);
    assert.equal(route.includes('external_send_available: false'), true);
    assert.equal(ui.includes('SEM ENVIO AUTOMÁTICO'), true);
    assert.equal(ui.includes('Copiar não envia mensagem'), true);
  });
});
