import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseExplicitCallbackRequest, simulateSmartFollowUp } from '../src/lib/server/autocar/smartFollowUp';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260823042000_autocar_smart_follow_up_v1.sql'), 'utf8');
const cron = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/autocar-follow-up/route.ts'), 'utf8');
const vercel = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');

describe('AUTOCAR Smart Follow-up V1', () => {
  it('permanece dry-run sem caminho de envio externo', () => {
    expect(cron).not.toContain('sendEvolution');
    expect(cron).toContain('AUTOCAR_SMART_FOLLOW_UP_DRY_RUN_ENABLED');
  });

  it('executa o endpoint de cron somente em Vercel Preview antes do acesso ao banco', () => {
    expect(cron).toContain("process.env.VERCEL_ENV !== 'preview'");
    const envGuardIndex = cron.indexOf("process.env.VERCEL_ENV !== 'preview'");
    expect(envGuardIndex).toBeGreaterThanOrEqual(0);
    expect(cron.indexOf('getAdminClient()', envGuardIndex)).toBeGreaterThan(envGuardIndex);
    expect(cron.indexOf('getAutocarDevClient()', envGuardIndex)).toBeGreaterThan(envGuardIndex);
  });

  it('não agenda Smart Follow-up no Vercel e preserva o cron de LGPD', () => {
    expect(vercel).not.toContain('/api/cron/autocar-follow-up');
    expect(vercel).toContain('/api/cron/privacy-retention');
    expect(vercel).toContain('17 3 * * *');
  });

  it('usa lease idempotente com SKIP LOCKED', () => {
    expect(migration).toContain('idempotency_key text not null unique');
    expect(migration.toLowerCase()).toContain('for update skip locked');
    expect(migration).toContain('lease_until');
  });

  it('exige liberação explícita do Master e da loja', () => {
    expect(simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'default', store_policy: 'allow', autopilot: true, human_active: true }).decision).toBe('blocked');
    expect(simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'default', autopilot: true, human_active: true }).decision).toBe('blocked');
    expect(simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true }).decision).toBe('would_send');
  });

  it('simula confirmação quando todos os gates passam sem execução externa', () => {
    const result = simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'scheduled' });
    expect(result.decision).toBe('would_send');
    expect(result.external_execution).toBe(false);
  });

  it('usa data e hora quando fornecidas e fallback gramatical seguro quando ausentes', () => {
    const withDate = simulateSmartFollowUp({
      trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true,
      appointment_status: 'scheduled', lead_status: 'scheduled', scheduled_at: '2026-08-24T17:00:00.000Z', customer_name: 'João'
    });
    expect(withDate.proposed_text).toContain('no dia 24/08/2026 às 14:00');
    const fallback = simulateSmartFollowUp({
      trigger_type: 'visit_confirmation', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true,
      appointment_status: 'scheduled', lead_status: 'scheduled', customer_name: 'João'
    });
    expect(fallback.proposed_text).toContain('no horário combinado');
    expect(fallback.proposed_text).not.toContain('em o horário');
  });

  it('usa mensagem neutra no no-show sem afirmar ausência como fato', () => {
    const result = simulateSmartFollowUp({
      trigger_type: 'no_show', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true,
      appointment_status: 'scheduled', lead_status: 'scheduled', customer_name: 'João'
    });
    expect(result.proposed_text).toContain('Conseguiu passar na loja como combinado?');
    expect(result.proposed_text).not.toContain('Vi que não conseguimos concluir sua visita');
  });

  it('cancela pós-visita sem comparecimento', () => {
    const result = simulateSmartFollowUp({ trigger_type: 'post_visit', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'scheduled' });
    expect(result.decision).toBe('cancelled');
  });

  it('permite pós-visita com comparecimento e cancela no-show quando compareceu', () => {
    expect(simulateSmartFollowUp({ trigger_type: 'post_visit', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'showed_up' }).decision).toBe('would_send');
    expect(simulateSmartFollowUp({ trigger_type: 'no_show', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'showed_up' }).decision).toBe('cancelled');
  });

  it('cancela por venda, nova mensagem ou takeover humano', () => {
    expect(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, sale_confirmed: true }).decision).toBe('cancelled');
    expect(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: true, new_message: true }).decision).toBe('cancelled');
    expect(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', store_policy: 'allow', autopilot: true, human_active: false }).decision).toBe('blocked');
  });

  it('interpreta callback explícito e não adivinha horário ambíguo', () => {
    const now = new Date('2026-08-23T12:00:00-03:00');
    const explicit = parseExplicitCallbackRequest('me chama às 18h', now);
    expect(explicit.matched).toBe(true);
    expect(explicit.due_at).toBe('2026-08-23T21:00:00.000Z');
    expect(parseExplicitCallbackRequest('fala comigo mais tarde', now).matched).toBe(false);
    expect(parseExplicitCallbackRequest('me chama amanhã às 10h', now).matched).toBe(true);
  });
});
