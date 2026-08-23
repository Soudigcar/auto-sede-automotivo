import assert from 'node:assert/strict';
import test from 'node:test';
import {
  distributeLeadImportRows,
  mapLeadImportRows,
  normalizeLeadBirthDate,
  normalizeLeadCpf,
  normalizeLeadEmail,
  normalizeLeadPhone,
  suggestLeadImportMapping,
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
  assert.equal(normalizeLeadPhone('+55 (61) 99999-0000'), '5561999990000');
  assert.equal(normalizeLeadCpf('123.456.789-01'), '12345678901');
  assert.equal(normalizeLeadEmail(' CLIENTE@EXEMPLO.COM '), 'cliente@exemplo.com');
  assert.equal(normalizeLeadBirthDate('23/08/1990'), '1990-08-23');
  assert.equal(normalizeLeadBirthDate('31/02/1990'), '');
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
