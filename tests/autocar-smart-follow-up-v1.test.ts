import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseExplicitCallbackRequest, simulateSmartFollowUp } from '../src/lib/server/autocar/smartFollowUp';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260823042000_autocar_smart_follow_up_v1.sql'), 'utf8');
const cron = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/autocar-follow-up/route.ts'), 'utf8');
const canaryCron = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/autocar-follow-up-v2/route.ts'), 'utf8');
const vercel = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');

describe('AUTOCAR Smart Follow-up V1', () => {
  it('permanece dry-run sem caminho de envio externo', () => {
    assert.equal(cron.includes('sendEvolution'), false);
    assert.equal(cron.includes('AUTOCAR_SMART_FOLLOW_UP_DRY_RUN_ENABLED'), true);
  });

  it('executa o endpoint V1 somente em Vercel Preview antes do acesso ao banco', () => {
    assert.equal(cron.includes("process.env.VERCEL_ENV !== 'preview'"), true);
    const envGuardIndex = cron.indexOf("process.env.VERCEL_ENV !== 'preview'");
    assert.ok(envGuardIndex >= 0);
    assert.ok(cron.indexOf('getAdminClient()', envGuardIndex) > envGuardIndex);
    assert.ok(cron.indexOf('getAutocarDevClient()', envGuardIndex) > envGuardIndex);
  });

  it('mantém V1 sem agendamento e agenda somente o canário V2 protegido, preservando LGPD', () => {
    const parsed = JSON.parse(vercel);
    const crons = Array.isArray(parsed.crons) ? parsed.crons : [];
    assert.equal(crons.some((item: any) => item.path === '/api/cron/autocar-follow-up'), false);
    assert.equal(crons.some((item: any) => item.path === '/api/cron/autocar-follow-up-v2' && item.schedule === '*/5 * * * *'), true);
    assert.equal(crons.some((item: any) => item.path === '/api/cron/privacy-retention' && item.schedule === '17 3 * * *'), true);
    assert.equal(canaryCron.includes('CRON_SECRET'), true);
    assert.equal(canaryCron.includes("process.env.VERCEL_ENV !== 'production'"), true);
  });

  it('usa lease idempotente com SKIP LOCKED', () => {
    assert.equal(migration.includes('idempotency_key text not null unique'), true);
    assert.equal(migration.toLowerCase().includes('for update skip locked'), true);
    assert.equal(migration.includes('lease_until'), true);
  });

  it('exige liberação explícita do Master e da loja', () => {
    assert.equal(simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'default', store_policy: 'allow', autopilot: true, human_active: true }).decision, 'blocked');
    assert.equal(simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'default', autopilot: true, human_active: true }).decision, 'blocked');
    assert.equal(simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true }).decision, 'would_send');
  });

  it('simula confirmação quando todos os gates passam sem execução externa', () => {
    const result = simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'scheduled' });
    assert.equal(result.decision, 'would_send');
    assert.equal(result.external_execution, false);
  });

  it('usa data e hora quando fornecidas e fallback gramatical seguro quando ausentes', () => {
    const withDate = simulateSmartFollowUp({
      trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true,
      appointment_status: 'scheduled', lead_status: 'scheduled', scheduled_at: '2026-08-24T17:00:00.000Z', customer_name: 'João'
    });
    assert.equal(withDate.proposed_text.includes('no dia 24/08/2026 às 14:00'), true);
    const fallback = simulateSmartFollowUp({
      trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true,
      appointment_status: 'scheduled', lead_status: 'scheduled', customer_name: 'João'
    });
    assert.equal(fallback.proposed_text.includes('no horário combinado'), true);
    assert.equal(fallback.proposed_text.includes('em o horário'), false);
  });

  it('usa mensagem neutra no no-show sem afirmar ausência como fato', () => {
    const result = simulateSmartFollowUp({
      trigger_type: 'no_show', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true,
      appointment_status: 'scheduled', lead_status: 'scheduled', customer_name: 'João'
    });
    assert.equal(result.proposed_text.includes('Conseguiu passar na loja como combinado?'), true);
    assert.equal(result.proposed_text.includes('Vi que não conseguimos concluir sua visita'), false);
  });

  it('cancela pós-visita sem comparecimento', () => {
    const result = simulateSmartFollowUp({ trigger_type: 'post_visit', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'scheduled' });
    assert.equal(result.decision, 'cancelled');
  });

  it('permite pós-visita com comparecimento e cancela no-show quando compareceu', () => {
    assert.equal(simulateSmartFollowUp({ trigger_type: 'post_visit', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'showed_up' }).decision, 'would_send');
    assert.equal(simulateSmartFollowUp({ trigger_type: 'no_show', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'showed_up' }).decision, 'cancelled');
  });

  it('cancela por venda, nova mensagem ou takeover humano', () => {
    assert.equal(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, sale_confirmed: true }).decision, 'cancelled');
    assert.equal(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, new_message: true }).decision, 'cancelled');
    assert.equal(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: false }).decision, 'blocked');
  });

  it('interpreta callback explícito e não adivinha horário ambíguo', () => {
    const now = new Date('2026-08-23T12:00:00-03:00');
    const explicit = parseExplicitCallbackRequest('me chama às 18h', now);
    assert.equal(explicit.matched, true);
    assert.equal(explicit.due_at, '2026-08-23T21:00:00.000Z');
    assert.equal(parseExplicitCallbackRequest('fala comigo mais tarde', now).matched, false);
    assert.equal(parseExplicitCallbackRequest('me chama amanhã às 10h', now).matched, true);
  });
});
