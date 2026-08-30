import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  FOLLOW_UP_V2_LIVE_AUTOMATIC_SCENARIOS,
  defaultFollowUpConfigV2,
  followUpScenarioRollout,
  followUpStepDescription,
  validateFollowUpScenarioSteps,
  type FollowUpScenario
} from '../src/lib/server/autocar/smartFollowUpV2';

const root = process.cwd();
const storeComponent = fs.readFileSync(path.join(root, 'src/components/StoreAutocarFollowUpV2.tsx'), 'utf8');
const configStore = fs.readFileSync(path.join(root, 'src/lib/server/autocar/followUpV2ConfigStore.ts'), 'utf8');
const storeRoute = fs.readFileSync(path.join(root, 'src/app/api/store/portal/autocar/follow-up-v2/route.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260828230000_autocar_follow_up_v2_transactional_store_save.sql'), 'utf8');
const masterDefaultsMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260830170000_autocar_follow_up_v2_master_scenario_defaults.sql'), 'utf8');

function scenario(key: FollowUpScenario['key'], delays: number[]): FollowUpScenario {
  const base = defaultFollowUpConfigV2.scenarios.find((item) => item.key === key)!;
  return {
    ...structuredClone(base),
    enabled: true,
    steps: delays.map((delayMinutes, index) => ({
      id: `${key}-${index}`,
      delayMinutes,
      label: String(delayMinutes),
      enabled: true
    }))
  };
}

describe('Smart Follow-up da loja com configuração clara e segura', () => {
  it('explica explicitamente que a confirmação ocorre antes da visita', () => {
    assert.equal(followUpStepDescription('visit_confirmation', -1440), 'Enviar 1 dia antes da visita agendada.');
    assert.equal(followUpStepDescription('post_visit', 120), 'Enviar 2 horas depois que o CRM confirmar o comparecimento.');
    assert.equal(followUpStepDescription('no_show', 30), 'Enviar 30 minutos depois que o CRM comprovar a ausência.');
  });

  it('aceita etapas em ordem cronológica crescente', () => {
    assert.deepEqual(validateFollowUpScenarioSteps(scenario('silent_lead', [30, 240, 1440])), []);
    assert.deepEqual(validateFollowUpScenarioSteps(scenario('visit_confirmation', [-1440, -120])), []);
  });

  it('rejeita etapas invertidas e direção temporal incorreta', () => {
    assert.match(validateFollowUpScenarioSteps(scenario('silent_lead', [240, 30])).join(' '), /depois da etapa anterior/);
    assert.match(validateFollowUpScenarioSteps(scenario('visit_confirmation', [-120, -1440])).join(' '), /ordem cronológica/);
    assert.match(validateFollowUpScenarioSteps(scenario('visit_confirmation', [120])).join(' '), /antes do horário agendado/);
  });

  it('identifica a mesma superfície LIVE usada pelo executor', () => {
    assert.deepEqual([...FOLLOW_UP_V2_LIVE_AUTOMATIC_SCENARIOS], ['silent_lead', 'simulation_pending', 'vehicle_interest']);
    for (const key of FOLLOW_UP_V2_LIVE_AUTOMATIC_SCENARIOS) assert.equal(followUpScenarioRollout(key), 'live');
    for (const key of ['visit_confirmation', 'post_visit', 'no_show', 'callback_requested'] as const) {
      assert.equal(followUpScenarioRollout(key), 'preparation');
    }
  });

  it('separa salvo, Master, efetivo e prévia não salva na interface', () => {
    for (const label of ['Loja salva', 'Teto Master', 'Efetivo agora', 'Prévia depois de salvar', 'Existem alterações não salvas']) {
      assert.ok(storeComponent.includes(label), `informação ausente: ${label}`);
    }
    assert.match(storeComponent, /beforeunload/);
    assert.match(storeComponent, /Descartar alterações/);
  });

  it('mostra rollout real, descrições completas e performance real por jornada', () => {
    assert.match(storeComponent, /Em preparação · não envia/);
    assert.match(storeComponent, /LIVE · envio automático/);
    assert.match(storeComponent, /followUpStepDescription/);
    assert.match(storeComponent, /performance\?\.scenarios\?\.\[scenario\.key\]/);
    assert.match(storeComponent, /nenhum número é simulado/);
    assert.doesNotMatch(storeComponent, /Respostas<\/p><strong>0/);
  });

  it('salva a configuração da loja por uma única RPC transacional', () => {
    const storeSave = configStore.slice(configStore.indexOf('export async function saveStoreFollowUpV2'));
    assert.match(storeSave, /client\.rpc\('save_autocar_follow_up_store_config_v2'/);
    assert.doesNotMatch(storeSave, /\.from\('ai_follow_up_store_settings'\).*\.(?:upsert|insert|update)/s);
    assert.match(storeSave, /p_scenarios: requested\.scenarios/);
    assert.match(storeSave, /p_new_value: requested/);
    assert.match(storeSave, /title: authoritative\?\.title/);
    assert.match(storeSave, /description: authoritative\?\.description/);
    assert.match(storeRoute, /etapa\|sequência\|jornada\|janela/);
  });

  it('mantém a RPC restrita ao service role e sem caminho de envio', () => {
    assert.match(migration, /security definer/);
    assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
    assert.match(migration, /grant execute on function[\s\S]*to service_role/);
    assert.match(migration, /As sete jornadas do Follow-up devem ser enviadas uma única vez/);
    assert.match(migration, /Etapas fora de ordem/);
    assert.doesNotMatch(migration, /sendEvolutionText|messages\/send|cron\.schedule|pg_cron/i);
  });

  it('persiste o fallback Master sem habilitar nenhuma jornada', () => {
    const seededScenarios = masterDefaultsMigration.match(/\('global', null,/g) || [];
    assert.equal(seededScenarios.length, 7);
    assert.equal((masterDefaultsMigration.match(/, false, \d+, 1\)/g) || []).length, 7);
    assert.match(masterDefaultsMigration, /on conflict do nothing/);
    assert.doesNotMatch(masterDefaultsMigration, /sendEvolutionText|messages\/send|cron\.schedule|pg_cron/i);
  });
});
