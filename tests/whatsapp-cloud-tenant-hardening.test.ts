import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260905221500_whatsapp_cloud_store_tenant_fk.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

test('hardening cria chave composta id/store_id na integração', () => {
  assert.match(
    sql,
    /store_whatsapp_cloud_integrations_id_store_key\s+unique\s*\(id,\s*store_id\)/i
  );
});

test('templates, flows, jornadas, webhooks e auditoria ficam presos ao mesmo tenant da integração', () => {
  for (const constraint of [
    'store_whatsapp_message_templates_integration_store_fk',
    'store_whatsapp_flows_integration_store_fk',
    'store_whatsapp_journeys_integration_store_fk',
    'whatsapp_cloud_webhook_events_integration_store_fk',
    'whatsapp_cloud_audit_events_integration_store_fk'
  ]) {
    assert.match(sql, new RegExp(`${constraint}\\s+foreign key \\(integration_id, store_id\\)`, 'i'));
  }
});

test('migration aborta se encontrar vínculo cruzado de loja', () => {
  for (const table of [
    'store_whatsapp_message_templates',
    'store_whatsapp_flows',
    'store_whatsapp_journeys',
    'whatsapp_cloud_webhook_events',
    'whatsapp_cloud_audit_events'
  ]) {
    assert.match(sql, new RegExp(`Tenant mismatch em ${table}`, 'i'));
  }
});

test('auditoria não aceita integration_id sem store_id', () => {
  assert.match(
    sql,
    /whatsapp_cloud_audit_events_store_required_with_integration[\s\S]*check\s*\(integration_id is null or store_id is not null\)/i
  );
});
