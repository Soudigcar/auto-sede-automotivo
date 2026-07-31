import fs from 'node:fs';

const apiPath = 'src/app/api/master/marketplace/catalog/route.ts';
const pagePath = 'src/app/master/marketplace/catalog/page.tsx';
const workflowPath = '.github/workflows/lock-sold-catalog-vehicles.yml';
const scriptPath = 'scripts/lock-sold-catalog-vehicles.mjs';

let api = fs.readFileSync(apiPath, 'utf8');
const apiMarker = "      if (!existing) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });\n    }\n\n    const requestedStatus";
const apiReplacement = "      if (!existing) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });\n      if (existing.status === 'vendido') {\n        return NextResponse.json({ error: 'Veículo vendido está bloqueado. Use o fluxo comercial da venda.' }, { status: 409 });\n      }\n    }\n\n    const requestedStatus";
if (!api.includes(apiMarker)) throw new Error('Catalog API sold-vehicle marker not found.');
api = api.replace(apiMarker, apiReplacement);
fs.writeFileSync(apiPath, api);

let page = fs.readFileSync(pagePath, 'utf8');
const editButton = '<button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(vehicle)}><Pencil size={14} /> Editar</button>';
const lockedEdit = "{vehicle.status !== 'vendido' ? <button className=\"premium-button-secondary text-xs\" type=\"button\" onClick={() => startEdit(vehicle)}><Pencil size={14} /> Editar</button> : <span className=\"rounded-2xl bg-zinc-100 px-3 py-2 text-xs font-black text-zinc-500\">Edição bloqueada pela venda</span>}";
if (!page.includes(editButton)) throw new Error('Catalog edit button marker not found.');
page = page.replace(editButton, lockedEdit);
fs.writeFileSync(pagePath, page);

fs.rmSync(workflowPath, { force: true });
fs.rmSync(scriptPath, { force: true });
