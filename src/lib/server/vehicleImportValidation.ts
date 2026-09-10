import type { extractTargetVehicle } from './vehicleTargetExtraction';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Pure presentation of real parser output. No providers, scripts or persistence. */
export function renderVehicleImportValidation(result: ReturnType<typeof extractTargetVehicle>) {
  const rows = [
    ['Marca', 'TOYOTA', result.vehicle.brand], ['Modelo', 'YARIS', result.vehicle.model],
    ['Versão', 'HA XLS15', result.vehicle.version], ['Fabricação', '2024', result.vehicle.manufacture_year],
    ['Ano modelo', '2025', result.vehicle.model_year], ['Preço (R$)', '106900', String(result.price)],
    ['Quilometragem', '33.444 Km', result.vehicle.mileage], ['Câmbio', 'CVT', result.vehicle.transmission],
    ['Cor', 'Branco', result.vehicle.color], ['Combustível', 'Flex', result.vehicle.fuel]
  ];
  const safe = result.evidence.target.matched && result.price !== 89900 && result.vehicle.mileage !== '242.145 Km';
  const passed = safe && rows.every(([, expected, actual]) => expected === actual);
  const sourceTypes: Record<string, string> = { target_dom: 'Bloco do veículo principal', target_description: 'Descrição original', target_json: 'Dados estruturados do veículo', target_url: 'Endereço do veículo' };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Validação do importador — Auto Controle</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f5f8;color:#172033;font:16px/1.5 system-ui,sans-serif}header{background:#101827;color:white;padding:28px max(20px,calc((100vw - 1040px)/2))}header p{color:#c5cedd;margin:6px 0}main{max-width:1080px;margin:auto;padding:28px 20px 60px}h1{font-size:clamp(25px,4vw,36px);margin:6px 0}h2{font-size:21px;margin:0 0 14px}.tag{font-size:12px;font-weight:800;letter-spacing:.12em;color:#ff8b8b}.notice,section{background:white;border:1px solid #dfe5ed;border-radius:16px;padding:24px;margin-bottom:22px}.notice{border-left:5px solid #2563eb}.status{display:inline-block;padding:6px 12px;border-radius:20px;background:${passed ? '#d9f7e6' : '#ffead4'};color:${passed ? '#11653a' : '#873d00'};font-weight:750}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0}.metric{background:white;padding:22px;border:1px solid #dfe5ed;border-radius:16px}.metric span{display:block;color:#627084;font-size:14px}.metric strong{font-size:clamp(20px,3vw,28px)}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:460px}th,td{padding:12px;text-align:left;border-bottom:1px solid #e5eaf0}th{font-size:13px;color:#627084}td:last-child{font-weight:700}.source{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f9fc;padding:20px;border-radius:12px}.muted{color:#627084}summary{cursor:pointer;font-weight:700}details p{overflow-wrap:anywhere}footer{color:#627084;font-size:14px}@media(max-width:600px){.summary{grid-template-columns:1fr}.metric{padding:16px}section,.notice{padding:18px}}
</style></head><body><header><span class="tag">AUTO CONTROLE · PREVIEW</span><h1>Validação do importador</h1><p>Toyota Yaris G3 Premium · HTML enviado para o teste</p></header><main>
<div class="notice"><strong>Esta tela é isolada do estoque real.</strong><br>O resultado abaixo é calculado pelo extrator corrigido a partir do arquivo salvo. Não acessa o site da loja, o banco, o Storage ou a OpenAI. Nenhum veículo é salvo ou publicado.</div>
<span class="status">${passed ? 'Resultado esperado confirmado' : 'Divergência encontrada — revisar'}</span>
<div class="summary"><div class="metric"><span>Preço extraído</span><strong>${escape(result.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}</strong></div><div class="metric"><span>Quilometragem extraída</span><strong>${escape(result.vehicle.mileage || 'Ausente')}</strong></div><div class="metric"><span>Câmbio extraído</span><strong>${escape(result.vehicle.transmission || 'Ausente')}</strong></div></div>
<section><h2>Confira os campos</h2><div class="table-wrap"><table><thead><tr><th>Campo</th><th>Esperado</th><th>Extraído do HTML</th><th>Resultado</th></tr></thead><tbody>${rows.map(([label, expected, actual]) => `<tr><td>${escape(label)}</td><td>${escape(expected)}</td><td>${escape(actual || 'Ausente')}</td><td>${expected === actual ? '✓ Confere' : 'Divergente'}</td></tr>`).join('')}</tbody></table></div></section>
<section><h2>Proteção contra veículos relacionados</h2><p>${safe ? '✓' : '✗'} O preço de R$ 89.900 da Strada e os 242.145 Km da Outlander não foram aceitos como dados do Yaris.</p><p class="muted">A comparação usa os valores retornados pelo extrator. Os veículos relacionados continuam presentes no arquivo de teste.</p></section>
<section><h2>Descrição original preservada</h2><p class="muted">Bloco “Detalhes do Veículo” do arquivo enviado. Dados de contato foram removidos na preparação da fixture de teste.</p><div class="source">${escape(result.source_description)}</div></section>
<section><h2>Descrição otimizada · separada</h2><p>Não gerada nesta demonstração: a OpenAI está fora desta validação. A descrição original acima permanece preservada.</p></section>
<section><details><summary>Ver a origem dos campos</summary>${Object.values(result.evidence.provenance).map(proof => `<p><strong>${escape(proof.field)}</strong>: ${escape(proof.value)}<br><span class="muted">${escape(sourceTypes[proof.source_type] || proof.source_type)} · vínculo com o veículo principal confirmado</span></p>`).join('')}</details></section>
<footer>Validação somente de leitura. Atualizar esta página repete a extração do mesmo arquivo, sem alterar registros. Os fluxos Master e Loja foram verificados separadamente por testes com serviços simulados.</footer>
</main></body></html>`;
}
