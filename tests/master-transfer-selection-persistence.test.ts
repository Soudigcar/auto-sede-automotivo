import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/app/master/transferencia-leads/page.tsx', 'utf8');

test('transfer selection is persisted independently from search visibility', () => {
  assert.doesNotMatch(page, /selectAllVisible/);
  assert.match(page, /const effectiveIds = selectedIds;/);
  assert.match(page, /const checked = selectedSet\.has\(lead\.id\);/);
  assert.match(page, /onChange=\{\(event\) => \{ setQuery\(event\.target\.value\); resetValidation\(\); \}\}/);
});

test('select all visible adds to the existing selection instead of replacing it', () => {
  assert.match(page, /const next = new Set\(current\);/);
  assert.match(page, /filtered\.forEach\(\(lead\) => next\.add\(lead\.id\)\);/);
  assert.match(page, /return Array\.from\(next\);/);
});

test('individual toggle changes only the requested lead and keeps a persistent counter', () => {
  assert.match(page, /current\.includes\(id\) \? current\.filter\(\(item\) => item !== id\) : \[\.\.\.current, id\]/);
  assert.match(page, /\{selectedIds\.length\} selecionado\(s\)/);
});
