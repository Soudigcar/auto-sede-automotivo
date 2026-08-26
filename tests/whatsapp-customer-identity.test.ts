import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evolutionMessageIsFromMe,
  isReliableWhatsappCustomerName,
  whatsappCustomerDisplayName
} from '../src/lib/server/whatsappCustomerIdentity.ts';

const webhook = readFileSync('src/app/api/webhooks/evolution/route.ts', 'utf8');
const storeInbox = readFileSync('src/app/api/store-whatsapp/route.ts', 'utf8');
const storePipeline = readFileSync('src/app/api/store/portal/pipeline/route.ts', 'utf8');

test('the store or channel name is never accepted as a WhatsApp customer identity', () => {
  const businessNames = ['7hs Veiculos', '7hs Veiculos · WhatsApp Evolution'];

  assert.equal(isReliableWhatsappCustomerName('7HS VEÍCULOS', '5561999990000', businessNames), false);
  assert.equal(isReliableWhatsappCustomerName('João da Silva', '5561999990000', businessNames), true);
  assert.equal(isReliableWhatsappCustomerName('+55 61 99999-0000', '5561999990000', businessNames), false);
});

test('a valid existing customer wins over an ambiguous outbound push name', () => {
  assert.equal(
    whatsappCustomerDisplayName(
      ['Larissa', '7hs Veiculos'],
      '5561999992250',
      ['7hs Veiculos']
    ),
    'Larissa'
  );
});

test('contaminated historical names fall back to a distinct phone identifier', () => {
  assert.equal(
    whatsappCustomerDisplayName(
      ['7hs Veiculos', '7hs Veiculos'],
      '5561999993856',
      ['7hs Veiculos']
    ),
    'Contato final 3856'
  );
});

test('Evolution outbound detection accepts boolean and serialized flags', () => {
  assert.equal(evolutionMessageIsFromMe(true), true);
  assert.equal(evolutionMessageIsFromMe('true'), true);
  assert.equal(evolutionMessageIsFromMe(1), true);
  assert.equal(evolutionMessageIsFromMe(false), false);
  assert.equal(evolutionMessageIsFromMe('false'), false);
});

test('webhook and store read models preserve customer identity boundaries', () => {
  assert.match(webhook, /evolutionMessageIsFromMe\(key\.fromMe \?\? data\?\.fromMe\)/);
  assert.match(webhook, /select\('id, profile_name'\)[\s\S]*?\.eq\('phone', phone\)/);
  assert.match(webhook, /fromMe[\s\S]*?existingContact\?\.profile_name[\s\S]*?data\?\.pushName/);
  assert.doesNotMatch(webhook, /const profileName = fromMe \? phone : cleanText\(data\?\.pushName/);

  assert.match(storeInbox, /whatsappCustomerDisplayName/);
  assert.match(storeInbox, /store\.store_name, integration\?\.profile_name, number\?\.label/);
  assert.match(storePipeline, /conversation[\s\S]*?whatsappCustomerDisplayName/);
  assert.match(storePipeline, /contact\?\.profile_name, lead\.customer_name/);
});
