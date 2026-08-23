import assert from 'node:assert/strict';
import test from 'node:test';
import {
  distributeLeadImportRows,
  isBlankLeadImportValue,
  mapLeadImportRows,
  normalizeLeadBirthDate,
  normalizeLeadCpf,
  normalizeLeadEmail,
  normalizeLeadPhone,
  suggestLeadImportMapping,
  suggestLeadImportMappingDetailed,
  validateLeadImportPayloadRows
} from '../src/lib/leadImport.ts';

test('mapeia cabeçalhos comuns de XLSX, XLS e CSV sem depender da ordem', () => {
  const headers = ['E-mail', 'Nome Completo', 'WhatsApp', 'Data de Nascimento', 'Veículo'];
  assert.deepEqual(suggestLeadImportMapping(headers), {
    name: 1,
    phone: 2,
    email: 0,
    birth_date: 3,
    vehicle_name: 4
  });
});

test('normaliza identificadores antes da deduplicação', () => {
  assert.equal(normalizeLeadPhone('+55 (61) 99999-0000'), '61999990000');
  assert.equal(normalizeLeadPhone('0055 61 99999-0000'), '61999990000');
  assert.equal(normalizeLeadPhone('061999990000'), '61999990000');
  assert.equal(normalizeLeadCpf('123.456.789-01'), '12345678901');
  assert.equal(normalizeLeadEmail(' CLIENTE@EXEMPLO.COM '), 'cliente@exemplo.com');
  assert.equal(normalizeLeadBirthDate('23/08/1990'), '1990-08-23');
  assert.equal(normalizeLeadBirthDate('31/02/1990'), '');
});

test('trata marcadores usados por outros sistemas como campos vazios', () => {
  for (const marker of ['', '-', '--', 'N/A', 'null', 'Não informado', 'Sem informação']) {
    assert.equal(isBlankLeadImportValue(marker), true);
  }

  const mapping = suggestLeadImportMapping(['Nome', 'Telefone', 'Data de nascimento']);
  const parsed = mapLeadImportRows([
    ['Nome', 'Telefone', 'Data de nascimento'],
    ['Cliente WhatsApp', '+55 61 99999-0000', '-']
  ], mapping);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows[0].birth_date, '');
  assert.equal(parsed.rows[0].phone, '61999990000');
});

test('reconhece colunas desconhecidas pelo formato dos dados sem enviar conteúdo para IA', () => {
  const headers = ['Nome do contato', 'Campo externo A', 'Campo externo B', 'Nascimento cliente'];
  const sampleRows = [
    ['Ana Souza', 'ana@example.com', '+55 (61) 99999-0000', '10/05/1990'],
    ['Bruno Lima', 'bruno@example.com', '61988887777', '21/11/1985']
  ];
  const result = suggestLeadImportMappingDetailed(headers, sampleRows);

  assert.deepEqual(result.mapping, { name: 0, phone: 2, email: 1, birth_date: 3 });
  assert.equal(result.suggestions.find((item) => item.field === 'email')?.method, 'content');
  assert.equal(result.suggestions.find((item) => item.field === 'phone')?.method, 'content');
});

test('estrutura exportada pela Base é organizada sem confundir ID do lead com nome', () => {
  const headers = [
    'ID do lead', 'Nome', 'Telefone', 'CPF', 'Data de nascimento', 'Cidade', 'Email',
    'Origem', 'Categoria de origem', 'Campanha', 'Evento', 'Loja', 'Status', 'Veículo', 'Criado em'
  ];
  assert.deepEqual(suggestLeadImportMapping(headers), {
    name: 1,
    phone: 2,
    cpf: 3,
    email: 6,
    birth_date: 4,
    city: 5,
    source: 7,
    campaign_name: 9,
    vehicle_name: 13
  });
});

test('valida linhas, exige identidade e preserva número original da planilha', () => {
  const mapping = suggestLeadImportMapping(['Nome', 'Telefone', 'CPF', 'E-mail']);
  const parsed = mapLeadImportRows([
    ['Nome', 'Telefone', 'CPF', 'E-mail'],
    ['Maria', '(61) 99999-0000', '', ''],
    ['Sem contato', '', '', ''],
    ['', '61988887777', '', '']
  ], mapping);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].row_number, 2);
  assert.equal(parsed.rows[0].phone, '61999990000');
  assert.deepEqual(parsed.errors.map((error) => error.row_number), [3, 4]);
});

test('servidor volta a validar o JSON enviado pelo navegador', () => {
  const rows = validateLeadImportPayloadRows([{ row_number: 18, name: 'Ana', phone: '61999990000' }], 500);
  assert.equal(rows[0].row_number, 18);
  assert.throws(
    () => validateLeadImportPayloadRows([{ row_number: 2, name: 'Ana', phone: '123' }], 500),
    /Telefone inválido/
  );
});

test('rodízio distribui de igual para igual entre pessoas de lojas diferentes', () => {
  const distribution = distributeLeadImportRows([1, 2, 3, 4, 5], ['pessoa-a', 'pessoa-b']);
  assert.deepEqual(distribution.map((item) => item.assignee_id), [
    'pessoa-a', 'pessoa-b', 'pessoa-a', 'pessoa-b', 'pessoa-a'
  ]);
});
