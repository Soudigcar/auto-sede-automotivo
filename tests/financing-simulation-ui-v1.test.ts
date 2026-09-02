import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe,it } from 'node:test';
const root=process.cwd();
const panel=fs.readFileSync(path.join(root,'src/components/FinancingSimulationPanel.tsx'),'utf8');
const bridge=fs.readFileSync(path.join(root,'src/components/FinancingSimulationWorkspaceBridge.tsx'),'utf8');
const layout=fs.readFileSync(path.join(root,'src/app/loja/[slug]/layout.tsx'),'utf8');
describe('UI Financiamento V1',()=>{
  it('acopla o painel sem substituir a Pipeline',()=>{
    assert.match(layout,/FinancingSimulationWorkspaceBridge/);
    assert.match(bridge,/Qualificação pessoal e comercial/);
  });
  it('mostra estado seguro sem migration',()=>{
    assert.match(panel,/FINANCING_SCHEMA_PENDING/);
    assert.match(panel,/Preview seguro: migration não aplicada/);
  });
  it('não coleta PII nem escreve diretamente no Supabase',()=>{
    assert.doesNotMatch(panel,/label="CPF"/); assert.doesNotMatch(panel,/label="CNH"/);
    assert.doesNotMatch(panel,/\.from\(/); assert.doesNotMatch(panel,/\.rpc\(/);
  });
  it('identifica estratégia como Draft não publicado',()=>{
    assert.match(panel,/Draft não publicado/); assert.match(panel,/não entra no runtime/);
  });
});
