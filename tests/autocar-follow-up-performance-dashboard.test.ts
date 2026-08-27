import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const service = fs.readFileSync(path.join(root, 'src/lib/server/autocar/followUpV2Performance.ts'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/components/FollowUpPerformanceDashboard.tsx'), 'utf8');
const masterApi = fs.readFileSync(path.join(root, 'src/app/api/master/autocar/follow-up-v2/route.ts'), 'utf8');
const storeApi = fs.readFileSync(path.join(root, 'src/app/api/store/portal/autocar/follow-up-v2/route.ts'), 'utf8');
const masterPage = fs.readFileSync(path.join(root, 'src/app/master/autocar/follow-up-v2/page.tsx'), 'utf8');
const storePage = fs.readFileSync(path.join(root, 'src/app/loja/[slug]/autocar/follow-up/page.tsx'), 'utf8');

describe('Smart Follow-up performance dashboard', () => {
  it('usa eventos reais do AUTOCAR e consequências comerciais do CRM', () => {
    assert.match(service, /ai_follow_up_performance_events/);
    assert.match(service, /ai_follow_up_autopilot_executions/);
    assert.match(service, /whatsapp_messages/);
    assert.match(service, /lead_activity_logs/);
    assert.match(service, /sale_confirmed/);
    assert.match(service, /schedule_created/);
  });

  it('atribui somente eventos posteriores ao Follow-up e dentro da janela da jornada', () => {
    assert.match(service, /at > sentAt\.getTime\(\) && at <= deadline/);
    assert.match(service, /attribution_window_minutes/);
    assert.match(service, /firstInbound/);
    assert.match(service, /hadCommercialContinuation/);
  });

  it('é somente leitura e não cria caminho de envio', () => {
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    assert.doesNotMatch(service, /sendEvolutionText|messages\/send|runA4FollowUpAutopilot|CRON_SECRET/);
    assert.doesNotMatch(dashboard, /sendEvolutionText|messages\/send|runA4FollowUpAutopilot/);
  });

  it('expõe métricas no Master e na Loja com janelas 7, 30 e 90 dias', () => {
    assert.match(masterApi, /readFollowUpV2Performance/);
    assert.match(storeApi, /readFollowUpV2Performance/);
    assert.match(masterPage, /FollowUpPerformanceDashboard scope="master"/);
    assert.match(storePage, /FollowUpPerformanceDashboard scope="store"/);
    assert.match(dashboard, /7 dias/);
    assert.match(dashboard, /30 dias/);
    assert.match(dashboard, /90 dias/);
  });

  it('mostra funil e segurança sem esconder fallbacks, bloqueios e falhas', () => {
    for (const label of ['Enviados', 'Responderam', 'Recuperados', 'Agendamentos', 'Vendas', 'Fallback COPILOT', 'Bloqueios / falhas']) {
      assert.ok(dashboard.includes(label), `métrica ausente: ${label}`);
    }
    assert.match(dashboard, /Performance por jornada/);
  });
});
