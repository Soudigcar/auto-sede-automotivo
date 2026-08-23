import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateSmartFollowUp } from '../src/lib/server/autocar/smartFollowUp';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260823042000_autocar_smart_follow_up_v1.sql'), 'utf8');
const cron = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/autocar-follow-up/route.ts'), 'utf8');

describe('AUTOCAR Smart Follow-up V1', () => {
  it('permanece dry-run sem caminho de envio externo', () => {
    expect(cron).not.toContain('sendEvolution');
    expect(cron).toContain('AUTOCAR_SMART_FOLLOW_UP_DRY_RUN_ENABLED');
  });

  it('usa lease idempotente com SKIP LOCKED', () => {
    expect(migration).toContain('idempotency_key text not null unique');
    expect(migration.toLowerCase()).toContain('for update skip locked');
    expect(migration).toContain('lease_until');
  });

  it('bloqueia follow-up por padrão', () => {
    const result = simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'default', autopilot: true, human_active: true });
    expect(result.decision).toBe('blocked');
  });

  it('simula confirmação quando todos os gates passam', () => {
    const result = simulateSmartFollowUp({ trigger_type: 'visit_confirmation', global_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'scheduled' });
    expect(result.decision).toBe('would_send');
    expect(result.external_execution).toBe(false);
  });

  it('cancela pós-visita sem comparecimento', () => {
    const result = simulateSmartFollowUp({ trigger_type: 'post_visit', global_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'scheduled' });
    expect(result.decision).toBe('cancelled');
  });

  it('permite pós-visita com comparecimento e cancela no-show quando compareceu', () => {
    expect(simulateSmartFollowUp({ trigger_type: 'post_visit', global_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'showed_up' }).decision).toBe('would_send');
    expect(simulateSmartFollowUp({ trigger_type: 'no_show', global_policy: 'allow', autopilot: true, human_active: true, appointment_status: 'scheduled', lead_status: 'showed_up' }).decision).toBe('cancelled');
  });

  it('cancela por venda, nova mensagem ou takeover humano', () => {
    expect(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', autopilot: true, human_active: true, sale_confirmed: true }).decision).toBe('cancelled');
    expect(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', autopilot: true, human_active: true, new_message: true }).decision).toBe('cancelled');
    expect(simulateSmartFollowUp({ trigger_type: 'callback_requested', global_policy: 'allow', autopilot: true, human_active: false }).decision).toBe('blocked');
  });
});
