import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe,it } from 'node:test';
const sql=fs.readFileSync(path.join(process.cwd(),'supabase/migrations/20260902093000_financing_simulation_lifecycle_v1.sql'),'utf8');
describe('migration Financiamento V1',()=>{
  it('é transacional, idempotente e auditável',()=>{
    assert.match(sql,/\bbegin;/i); assert.match(sql,/\bcommit;/i);
    assert.match(sql,/lead_financing_simulation_commands/); assert.match(sql,/lead_financing_simulation_events/);
    assert.match(sql,/pg_advisory_xact_lock/); assert.match(sql,/idempotency_key_collision/);
  });
  it('não cria colunas de CPF, CNH ou nascimento na simulação',()=>{
    const body=sql.match(/create table if not exists public\.lead_financing_simulations \(([\s\S]*?)\n\);/i)?.[1] || '';
    assert.doesNotMatch(body,/^\s*(cpf|cnh|birth_date|driver_license_number)\s+/im);
  });
  it('restringe escrita à RPC service_role',()=>{
    assert.match(sql,/security definer/i);
    assert.match(sql,/grant execute on function public\.apply_lead_financing_simulation_command_v1[\s\S]*to service_role/i);
    assert.match(sql,/revoke all on public\.lead_financing_simulations from public,anon,authenticated/i);
  });
});
