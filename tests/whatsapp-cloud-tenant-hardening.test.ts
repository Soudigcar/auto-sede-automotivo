import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const tenantMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260905221500_whatsapp_cloud_store_tenant_fk.sql'
);
const auditMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260906120000_whatsapp_cloud_audit_append_only_hardening.sql'
);
const tenantSql = readFileSync(tenantMigrationPath, 'utf8');
const auditSql = readFileSync(auditMigrationPath, 'utf8');

test('hardening cria chave composta id/store_id na integração', () => {
  assert.match(
    tenantSql,
    /store_whatsapp_cloud_integrations_id_store_key\s+unique\s*\(id,\s*store_id\)/i
  );
});

test('templates, flows, jornadas e webhooks ficam presos ao mesmo tenant da integração', () => {
  for (const constraint of [
    'store_whatsapp_message_templates_integration_store_fk',
    'store_whatsapp_flows_integration_store_fk',
    'store_whatsapp_journeys_integration_store_fk',
    'whatsapp_cloud_webhook_events_integration_store_fk'
  ]) {
    assert.match(tenantSql, new RegExp(`${constraint}\\s+foreign key \\(integration_id, store_id\\)`, 'i'));
  }
});

test('migration tenant aborta se encontrar vínculo cruzado de loja', () => {
  for (const table of [
    'store_whatsapp_message_templates',
    'store_whatsapp_flows',
    'store_whatsapp_journeys',
    'whatsapp_cloud_webhook_events',
    'whatsapp_cloud_audit_events'
  ]) {
    assert.match(tenantSql, new RegExp(`Tenant mismatch em ${table}`, 'i'));
  }
});

test('migration incremental preserva ids historicos sem FK mutavel', () => {
  for (const constraint of [
    'whatsapp_cloud_audit_events_store_id_fkey',
    'whatsapp_cloud_audit_events_integration_id_fkey',
    'whatsapp_cloud_audit_events_actor_user_id_fkey',
    'whatsapp_cloud_audit_events_integration_store_fk'
  ]) {
    assert.match(auditSql, new RegExp(`drop constraint if exists ${constraint}`, 'i'));
  }
  assert.match(auditSql, /whatsapp_cloud_audit_validate_insert/i);
  assert.match(auditSql, /before insert on public\.whatsapp_cloud_audit_events/i);
  assert.doesNotMatch(auditSql, /add constraint whatsapp_cloud_audit_events_integration_store_fk/i);
});

test('migration incremental valida historico antes de remover FKs', () => {
  assert.match(auditSql, /Audit store not found in historical rows/i);
  assert.match(auditSql, /Audit actor not found in historical rows/i);
  assert.match(auditSql, /Tenant mismatch em whatsapp_cloud_audit_events historical rows/i);
});

test('auditoria valida loja, ator e tenant da integração no INSERT', () => {
  assert.match(auditSql, /Audit store not found/i);
  assert.match(auditSql, /Audit actor not found/i);
  assert.match(auditSql, /Audit integration not found/i);
  assert.match(auditSql, /Audit store_id is required when integration_id is present/i);
  assert.match(auditSql, /Tenant mismatch em whatsapp_cloud_audit_events/i);
});

test('migration tenant não aceita integration_id sem store_id', () => {
  assert.match(
    tenantSql,
    /whatsapp_cloud_audit_events_store_required_with_integration[\s\S]*check\s*\(integration_id is null or store_id is not null\)/i
  );
});
