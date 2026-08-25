import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/app/master/transferencia-leads/page.tsx', 'utf8');

test('transfer selection is persisted independently from search visibility', () => {
  assert.doesNotMatch(page, /selectAllVisible/);
  assert.match(page, /const checked = selectedSet\.has\(lead\.id\);/);
  assert.match(page, /onChange=\{\(event\) => \{ setQuery\(event\.target\.value\); resetValidation\(\); \}\}/);
});

test('select all visible adds to the existing selection instead of replacing it', () => {
  assert.match(page, /const next = new Set\(current\);/);
  assert.match(page, /filtered\.forEach\(\(lead\) => next\.add\(lead\.id\)\);/);
  assert.match(page, /return Array\.from\(next\);/);
});

test('individual toggle changes only the requested lead', () => {
  assert.match(page, /current\.includes\(id\) \? current\.filter\(\(item\) => item !== id\) : \[\.\.\.current, id\]/);
});

test('destination store changes keep selection and exclude only leads already in that store', () => {
  assert.match(page, /const sameStoreSelectedIds = useMemo/);
  assert.match(page, /lead\.assigned_store_id === destinationStoreId/);
  assert.match(page, /const effectiveIds = useMemo\(/);
  assert.match(page, /selectedIds\.filter\(\(id\) => !sameStoreSelectedIds\.has\(id\)\)/);
  assert.match(page, /onChange=\{\(event\) => \{ setDestinationStoreId\(event\.target\.value\); resetValidation\(\); \}\}/);
  assert.doesNotMatch(page, /setDestinationStoreId\(event\.target\.value\); setSelectedIds\(\[\]\)/);
});

test('persistent counter follows the effective transfer selection', () => {
  assert.match(page, /\{effectiveIds\.length\} selecionado\(s\)/);
  assert.match(page, /Pré-validar \{effectiveIds\.length \|\| ''\}/);
});
