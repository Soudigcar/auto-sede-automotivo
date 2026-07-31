import fs from 'node:fs';

const marketplacePath = 'src/app/master/marketplace/page.tsx';
const workflowPath = '.github/workflows/apply-marketplace-catalog-separation.yml';
const scriptPath = 'scripts/apply-marketplace-catalog-separation.mjs';

let source = fs.readFileSync(marketplacePath, 'utf8');

if (!source.includes('href="/master/site"')) {
  throw new Error('Legacy marketplace link was not found. Refusing to apply an incomplete patch.');
}

source = source
  .replace('href="/master/site"', 'href="/master/marketplace/catalog"')
  .replace('Edição completa', 'Gerenciar catálogo');

if (!source.includes('href="/master/marketplace/catalog"') || !source.includes('Gerenciar catálogo')) {
  throw new Error('Catalog navigation replacement failed.');
}

fs.writeFileSync(marketplacePath, source);
fs.rmSync(workflowPath, { force: true });
fs.rmSync(scriptPath, { force: true });
