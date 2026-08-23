import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260823101351_master_base_lead_import.sql', 'utf8');
const route = readFileSync('src/app/api/master/base-lead-import/route.ts', 'utf8');
const modal = readFileSync('src/components/MasterLeadImportModal.tsx', 'utf8');
const page = readFileSync('src/app/master/base/page.tsx', 'utf8');

test('RPC de importação é transacional, invoker e exclusiva do service role', () => {
  assert.match(migration, /language plpgsql\s+security invoker/i);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /revoke all on function public\.master_import_leads_batch[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.master_import_leads_batch[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test('auditoria não replica dados pessoais do arquivo', () => {
  const itemTable = migration.match(/create table if not exists public\.lead_import_batch_items \([\s\S]*?\n\);/)?.[0] || '';
  assert.match(migration, /lead_import_batch_items/);
  assert.match(migration, /sem armazenar novamente os dados pessoais/i);
  assert.doesNotMatch(itemTable, /customer_name|customer_phone|cpf|email/i);
  assert.match(migration, /master_lead_import_completed/);
});

test('deduplicação usa CPF, telefone e e-mail normalizados e bloqueia conflito', () => {
  assert.match(migration, /leads_base_normalized_phone_import_idx/);
  assert.match(migration, /leads_base_normalized_cpf_import_idx/);
  assert.match(migration, /leads_base_normalized_email_import_idx/);
  assert.match(migration, /cardinality\(v_match_ids\) > 1/);
  assert.match(migration, /Nenhum dado foi alterado/);
});

test('endpoint exige Master, limita lotes e não expõe erro interno do banco', () => {
  assert.match(route, /requireMaster\(request, supabase\)/);
  assert.match(route, /const BATCH_MAX_ROWS = 500/);
  assert.match(route, /content-length/);
  assert.match(route, /Não foi possível concluir o lote de importação/);
  assert.doesNotMatch(route, /error\.message\s*\|\|\s*'Não foi possível concluir o lote/);
});

test('Base exibe Importar ao lado de Exportar e aceita os três formatos autorizados', () => {
  assert.match(page, /<MasterLeadImportModal onImported=\{loadLeads\} \/>/);
  assert.match(page, /<MasterLeadImportModal[\s\S]{0,500}exportExcel/);
  assert.match(modal, /accept="\.xlsx,\.xls,\.csv"/);
  assert.match(modal, /Distribuir igualmente/);
  assert.match(modal, /Por membros/);
  assert.match(modal, /Por cargos/);
});
