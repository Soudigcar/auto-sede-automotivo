import fs from 'node:fs';

const marketplacePath = 'src/app/master/marketplace/page.tsx';
const workflowPath = '.github/workflows/normalize-marketplace-portal-copy.yml';
const scriptPath = 'scripts/normalize-marketplace-portal-copy.mjs';

let source = fs.readFileSync(marketplacePath, 'utf8');
const replacements = [
  ['Disponíveis e visíveis na landing', 'Disponíveis e visíveis no Portal Oficial'],
  ['Retirar este veículo da landing?', 'Ocultar este veículo do Portal Oficial?'],
  ['Publicar este veículo na landing?', 'Publicar este veículo no Portal Oficial?']
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`Expected marketplace copy not found: ${before}`);
  source = source.replaceAll(before, after);
}

fs.writeFileSync(marketplacePath, source);
fs.rmSync(workflowPath, { force: true });
fs.rmSync(scriptPath, { force: true });
