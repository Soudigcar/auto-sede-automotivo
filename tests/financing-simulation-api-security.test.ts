import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe,it } from 'node:test';
const root=process.cwd();
const api=fs.readFileSync(path.join(root,'src/app/api/store/portal/pipeline/lead-financing/route.ts'),'utf8');
const commercial=fs.readFileSync(path.join(root,'src/app/api/store/portal/pipeline/lead-commercial/route.ts'),'utf8');
const projection=fs.readFileSync(path.join(root,'src/lib/server/autocar/financingProjectionV1.ts'),'utf8');
const draft=fs.readFileSync(path.join(root,'src/lib/server/autocar/financingStrategyDraftV1.ts'),'utf8');
describe('segurança Financiamento V1',()=>{
  it('autoriza loja e carteira e usa RPC idempotente',()=>{
    assert.match(api,/authorizeStorePortal/); assert.match(api,/canAccessStoreLead/);
    assert.match(api,/apply_lead_financing_simulation_command_v1/); assert.match(api,/request_id/);
  });
  it('bloqueia qualquer escrita no Preview',()=>{
    assert.match(api,/VERCEL_ENV === 'preview'/); assert.match(api,/FINANCING_PREVIEW_READ_ONLY/);
  });
  it('corrige payment_type de forma compatível',()=>{
    assert.match(commercial,/normalizeFinancingPaymentType/); assert.match(commercial,/credit_letter/); assert.match(commercial,/consortium/);
  });
  it('mantém PII fora da projeção e estratégia fora do runtime',()=>{
    assert.match(projection,/customerDataReady/); assert.doesNotMatch(projection,/cpf:\s*commercial/);
    assert.match(draft,/status: 'draft'/); assert.match(draft,/publication_status: 'unpublished'/);
  });
});
