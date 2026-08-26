import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { clipAutocarReplayRowsV2 } from '../src/lib/server/autocar/replayMessageHistoryV2';

const helperSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/replayMessageHistoryV2.ts'), 'utf8');
const routeSource = fs.readFileSync(path.join(process.cwd(), 'src/app/api/master/autocar/replay-v2/route.ts'), 'utf8');
const replaySource = fs.readFileSync(path.join(process.cwd(), 'src/lib/server/autocar/intelligenceReplayV2.ts'), 'utf8');
const uiSource = fs.readFileSync(path.join(process.cwd(), 'src/components/MasterAutocarReplayV2.tsx'), 'utf8');

describe('AUTOCAR Intelligence V2 historical replay', () => {
  it('recorta o histórico exatamente até o message_id e exclui mensagens futuras', () => {
    const rowsDescending = [
      { id: 'future', direction: 'outbound', message_type: 'text', body: 'mensagem futura', sent_at: '2026-08-22T00:18:14Z', created_at: '2026-08-22T00:18:14Z' },
      { id: 'target', direction: 'inbound', message_type: 'text', body: 'quero simular', sent_at: '2026-08-22T00:17:56Z', created_at: '2026-08-22T00:17:56Z' },
      { id: 'before', direction: 'outbound', message_type: 'text', body: 'me diga entrada e parcelas', sent_at: '2026-08-21T22:57:52Z', created_at: '2026-08-21T22:57:52Z' }
    ];
    const clipped = clipAutocarReplayRowsV2(rowsDescending, 'target', 24);
    assert.deepEqual(clipped.map((message) => message.id), ['before', 'target']);
  });

  it('helper valida inbound e bloqueia métodos de escrita no cliente histórico', () => {
    assert.equal(helperSource.includes("message_id deve identificar uma mensagem inbound"), true);
    assert.equal(helperSource.includes("new Set(['insert', 'update', 'upsert', 'delete'])"), true);
    assert.equal(helperSource.includes('Replay histórico é estritamente read-only.'), true);
    assert.equal(helperSource.includes("table === 'whatsapp_messages'"), true);
    assert.equal(helperSource.includes("query.lte('sent_at'"), true);
    assert.equal(helperSource.includes("query.lte('created_at'"), true);
  });

  it('rota recebe message_id e preserva Preview-only, Master-only e A4-only', () => {
    assert.equal(routeSource.includes('body?.message_id'), true);
    assert.equal(routeSource.includes('messageId: messageId || null'), true);
    assert.equal(routeSource.includes("env !== 'preview'"), true);
    assert.equal(routeSource.includes("branch !== ALLOWED_BRANCH"), true);
    assert.equal(routeSource.includes('requireMaster(request, production)'), true);
    assert.equal(routeSource.includes("const PILOT_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924'"), true);
    assert.equal(routeSource.includes('external_execution: false'), true);
  });

  it('replay usa cliente histórico read-only e marca exclusão de mensagens futuras', () => {
    assert.equal(replaySource.includes('createAutocarHistoricalReadClientV2'), true);
    assert.equal(replaySource.includes('future_messages_excluded: replayMessages.historical'), true);
    assert.equal(replaySource.includes("mode: replayMessages.historical ? 'historical_message' : 'latest_inbound'"), true);
    assert.equal(replaySource.includes("inventory_snapshot: 'current_read_only'"), true);
    assert.equal(replaySource.includes("crm_snapshot: 'current_read_only'"), true);
  });

  it('interface Master permite message_id opcional e identifica replay histórico', () => {
    assert.equal(uiSource.includes('ID da mensagem inbound histórica'), true);
    assert.equal(uiSource.includes('message_id: cleanMessage || null'), true);
    assert.equal(uiSource.includes('Executar Replay Histórico V2'), true);
    assert.equal(uiSource.includes('Mensagens futuras excluídas'), true);
  });
});
