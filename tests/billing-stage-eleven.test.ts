import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import {
  evaluateBillingRegistrationReadiness,
  formatBillingPhone,
  formatCnpj,
  isValidBillingEmail,
  isValidBillingPhone,
  isValidCnpj
} from '../src/lib/billingRegistrationReadiness.ts';

const route = readFileSync('src/app/api/master/billing/readiness/route.ts', 'utf8');
const masterUi = readFileSync('src/components/MasterBillingCenter.tsx', 'utf8');
const runbook = readFileSync('docs/billing-registration-readiness-stage-11.md', 'utf8');

test('etapa 11 valida e normaliza cadastro completo sem persistir', () => {
  const readiness = evaluateBillingRegistrationReadiness({
    legalName: 'Loja Sintética Automóveis Ltda',
    cnpj: '11.222.333/0001-81',
    financialEmail: 'FINANCEIRO@EXEMPLO.COM.BR',
    financialPhone: '+55 (61) 99999-1234',
    storeStatus: 'active',
    activeSystemUsers: 2
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, 'ready_for_activation');
  assert.equal(readiness.normalized.cnpj, '11.222.333/0001-81');
  assert.equal(readiness.normalized.financial_email, 'financeiro@exemplo.com.br');
  assert.equal(readiness.normalized.financial_phone, '(61) 99999-1234');
  assert.ok(readiness.checklist.every((item) => item.valid));
});

test('CNPJ, e-mail reservado, telefone e elegibilidade inválidos mantêm cadastro incompleto', () => {
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(isValidBillingEmail('financeiro@synthetic.invalid'), false);
  assert.equal(isValidBillingEmail('financeiro@empresa.com.br'), true);
  assert.equal(isValidBillingPhone('+55 61 99999-1234'), true);
  assert.equal(isValidBillingPhone('+55 00 00000-0000'), false);
  assert.equal(formatBillingPhone('61999991234'), '(61) 99999-1234');

  const readiness = evaluateBillingRegistrationReadiness({
    legalName: '',
    cnpj: '123',
    financialEmail: 'responsavel@dev-routing.local',
    financialPhone: '+5500000000000',
    storeStatus: 'inactive',
    activeSystemUsers: 0
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, 'incomplete');
  assert.equal(readiness.checklist.filter((item) => !item.valid).length, 5);
});

test('API de simulação falha fechada fora do Preview saas-dev e aceita somente seeds sintéticos', () => {
  assert.match(route, /BILLING_STAGE11_DEV_PROJECT_REF = 'hfzmzfhuhukmxkxbkxay'/);
  assert.match(route, /safety\.previewEnvironment/);
  assert.match(route, /safety\.environmentName === 'saas-dev'/);
  assert.match(route, /billing_stage11_environment_forbidden/);
  assert.match(route, /billing_stage11_store_forbidden/);
  assert.match(route, /dev_routing_seed/);
  assert.match(route, /billing_stage5_seed/);
  assert.match(route, /requireMaster/);
});

test('simulação não possui escrita, trial, Asaas ou cobrança', () => {
  assert.doesNotMatch(route, /\.(?:insert|update|upsert|delete|rpc)\s*\(/);
  assert.doesNotMatch(route, /createStoreAsaas|startStoreBillingTrial|confirmStoreAsaas|fetch\s*\(/);
  assert.match(route, /persisted: false/);
  assert.match(route, /would_start_trial: false/);
  assert.match(route, /would_create_asaas_customer: false/);
  assert.match(route, /would_charge: false/);
  assert.match(route, /access_enforcement_mode: 'observe'/);
});

test('interface exibe checklist, estados e aviso explícito de não persistência', () => {
  assert.match(masterUi, /SaaS · etapa 11/);
  assert.match(masterUi, /Preparação cadastral/);
  assert.match(masterUi, /Razão social/);
  assert.match(masterUi, /CNPJ/);
  assert.match(masterUi, /E-mail financeiro/);
  assert.match(masterUi, /Telefone financeiro/);
  assert.match(masterUi, /Simular futura ativação/);
  assert.match(masterUi, /não salva/i);
  assert.match(masterUi, /Pronto para ativação/);
  assert.match(masterUi, /Cadastro incompleto/);
});

test('etapa 11 não adiciona migration e documenta campos financeiros próprios no futuro', () => {
  const billingMigrations = readdirSync('supabase/migrations')
    .filter((name) => /billing|asaas/i.test(name));
  assert.deepEqual(billingMigrations, ['20260827044014_billing_foundation_asaas.sql']);
  assert.match(runbook, /nenhuma migration nova/);
  assert.match(runbook, /nenhum dado cadastral é persistido/);
  assert.match(runbook, /campos financeiros próprios/);
});
