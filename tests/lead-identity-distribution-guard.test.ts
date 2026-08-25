import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guard = fs.readFileSync('supabase/migrations/20260825150000_lead_identity_distribution_guard.sql', 'utf8');
const officialWebhook = fs.readFileSync('src/app/api/webhooks/whatsapp/route.ts', 'utf8');
const evolutionWebhook = fs.readFileSync('src/app/api/webhooks/evolution/route.ts', 'utf8');
const multistoreApi = fs.readFileSync('src/app/api/master/base-lead-multistore/route.ts', 'utf8');
const masterBasePage = fs.readFileSync('src/app/master/base/page.tsx', 'utf8');
const multistoreCore = fs.readFileSync('supabase/migrations/20260825133000_master_lead_multistore_v1.sql', 'utf8');

test('phone identity normalization accepts Brazilian country-code variants', () => {
  assert.match(guard, /create or replace function public\.normalize_lead_phone/);
  assert.match(guard, /length\(regexp_replace\(p_phone/);
  assert.match(guard, /like '55%'/);
});

test('official and Evolution webhooks use transactional find-or-create RPCs', () => {
  for (const webhook of [officialWebhook, evolutionWebhook]) {
    assert.match(webhook, /find_or_create_store_lead_by_phone/);
    assert.match(webhook, /find_or_create_base_lead_by_phone/);
  }
  assert.doesNotMatch(officialWebhook, /\.from\('leads'\)\s*\.insert\(/);
});

test('concurrent phone ingestion is serialized inside the database transaction', () => {
  assert.match(guard, /pg_advisory_xact_lock/);
  assert.match(guard, /store_lead_phone:/);
  assert.match(guard, /base_lead_phone:/);
  assert.match(guard, /'idempotent',true/);
});

test('multistore distribution fails closed when destination already has the phone', () => {
  assert.match(guard, /trg_guard_master_transfer_duplicate_phone/);
  assert.match(guard, /new\.origin <> 'master_transfer'/);
  assert.match(guard, /Cliente ja possui atendimento nesta loja/);
  assert.match(multistoreApi, /Cliente já possui atendimento nesta loja/);
  assert.match(multistoreApi, /find_store_lead_phone_conflicts/);
  assert.match(multistoreApi, /destinationLeadByPhone/);
});

test('paused and non-receiving members remain ineligible', () => {
  assert.match(multistoreCore, /u\.status = 'active'/);
  assert.match(multistoreCore, /u\.receives_leads = true/);
  assert.match(multistoreApi, /Membro inválido, pausado ou fora da loja selecionada/);
});

test('guard migration does not rewrite or merge existing lead history', () => {
  assert.doesNotMatch(guard, /delete\s+from\s+public\.leads/i);
  assert.doesNotMatch(guard, /update\s+public\.leads\b\s+set\s+status/i);
  assert.doesNotMatch(guard, /A4|7hs/i);
});

test('Master Base consolidates identity while preserving store operations', () => {
  assert.match(masterBasePage, /consolidateMasterBaseLeads/);
  assert.match(masterBasePage, /_base_record_ids/);
  assert.match(masterBasePage, /_linked_store_names/);
  assert.match(masterBasePage, /Presente nas lojas/);
  assert.match(masterBasePage, /Cada loja mantém atendimento, responsável e histórico independentes/);
});

test('phone fallback does not collapse different customer names sharing one number', () => {
  assert.match(masterBasePage, /phone:\$\{phone\}:name:\$\{name/);
  assert.match(masterBasePage, /normalize\('NFD'\)/);
});

test('Master filters and export use every linked store without exposing them in store pages', () => {
  assert.match(masterBasePage, /linkedStoreNames\(lead\)\.includes\(storeFilter\)/);
  assert.match(masterBasePage, /Lojas: linkedStoreNames\(lead\)\.join/);
  assert.doesNotMatch(masterBasePage, /src\/app\/store/);
});
