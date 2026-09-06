const fs = require('node:fs');
const path = require('node:path');

const pagePath = path.join(process.cwd(), 'src/app/loja/[slug]/pipeline/page.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

function replaceOnce(oldText, newText, label) {
  const first = page.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: source fragment not found`);
  if (page.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  page = page.slice(0, first) + newText + page.slice(first + oldText.length);
}

replaceOnce(
  "import { createClient } from '@/lib/supabase';\n",
  "import { createClient } from '@/lib/supabase';\nimport {\n  classifyPipelineRealtimeEvent,\n  pipelineStatusPatchFromServerLead,\n  transitionPipelineMetrics,\n  type PipelineRealtimeGuard,\n  type PipelineRealtimeRow\n} from '@/lib/pipelineOptimisticState';\n",
  'optimistic helper import'
);

replaceOnce(
  "type PipelineCustomAssignment = {\n  stageId: string;\n  sourceStatus: string;\n};\n",
  "type PipelineCustomAssignment = {\n  stageId: string;\n  sourceStatus: string;\n};\n\ntype PipelineCommandTransition = {\n  targetStatus: string;\n  optimistic?: boolean;\n};\n",
  'transition type'
);

replaceOnce(
  "  const loadInFlight = useRef<Promise<PipelinePayload> | null>(null);\n  const realtimeRefreshTimer = useRef<number | null>(null);\n  const hiddenAt = useRef<number | null>(null);\n",
  "  const loadInFlight = useRef<Promise<PipelinePayload> | null>(null);\n  const realtimeRefreshTimer = useRef<number | null>(null);\n  const localRealtimeGuards = useRef<Map<string, PipelineRealtimeGuard>>(new Map());\n  const hiddenAt = useRef<number | null>(null);\n",
  'realtime guard ref'
);

replaceOnce(
`  async function runCommand(command: string, lead: PipelineLead, extra: Record<string, any> = {}, loadingMessage = 'Atualizando lead...') {
    if (!requireOperable(lead)) throw new Error(historicalSaleReadonlyMessage);
    setBusy(true);
    setMessage(loadingMessage);
    try {
      const result = await request('/api/store/portal/pipeline/actions', {
        method: 'POST',
        body: JSON.stringify({ command, slug, lead_id: lead.id, ...extra })
      });
      await loadData(true);
      setMessage(result.message || 'Ação concluída.');
      return result;
    } catch (error: any) {
      setMessage(error?.message || 'Não foi possível concluir a ação.');
      throw error;
    } finally {
      setBusy(false);
    }
  }
`,
`  function patchLoadedLead(leadId: string, patch: Partial<PipelineLead>) {
    setLeads((current) => current.map((item) => item.id === leadId ? { ...item, ...patch } : item));
  }

  function applyMetricTransition(fromStatus: string, toStatus: string) {
    if (fromStatus === toStatus) return;
    setPayload((current) => current ? {
      ...current,
      metrics: transitionPipelineMetrics(current.metrics, fromStatus, toStatus)
    } : current);
  }

  function beginLocalRealtimeGuard(leadId: string, targetStatus: string) {
    localRealtimeGuards.current.set(leadId, {
      leadId,
      expectedStatus: targetStatus,
      serverUpdatedAt: null,
      serverLastActivityAt: null,
      expiresAt: Date.now() + 10_000,
      pendingRows: []
    });
  }

  function clearLocalRealtimeGuard(leadId: string) {
    localRealtimeGuards.current.delete(leadId);
  }

  function settleLocalRealtimeGuard(leadId: string, serverLead: Record<string, any>) {
    const guard = localRealtimeGuards.current.get(leadId);
    if (!guard) return false;

    guard.expectedStatus = String(serverLead.status || guard.expectedStatus);
    guard.serverUpdatedAt = String(serverLead.updated_at || '') || null;
    guard.serverLastActivityAt = String(serverLead.last_activity_at || '') || null;
    guard.expiresAt = Date.now() + 5_000;

    if (!guard.serverUpdatedAt) {
      localRealtimeGuards.current.delete(leadId);
      return true;
    }

    const needsRefresh = guard.pendingRows.some((row) => classifyPipelineRealtimeEvent(guard, row) === 'refresh');
    guard.pendingRows = [];
    if (needsRefresh) {
      localRealtimeGuards.current.delete(leadId);
      return true;
    }

    const settledGuard = guard;
    window.setTimeout(() => {
      if (localRealtimeGuards.current.get(leadId) === settledGuard) localRealtimeGuards.current.delete(leadId);
    }, 5_200);
    return false;
  }

  async function runCommand(
    command: string,
    lead: PipelineLead,
    extra: Record<string, any> = {},
    loadingMessage = 'Atualizando lead...',
    transition: PipelineCommandTransition | null = null
  ) {
    if (!requireOperable(lead)) throw new Error(historicalSaleReadonlyMessage);

    const targetStatus = transition?.targetStatus || lead.status;
    const optimistic = Boolean(transition?.optimistic && targetStatus !== lead.status);

    if (transition) {
      beginLocalRealtimeGuard(lead.id, targetStatus);
      if (optimistic) {
        patchLoadedLead(lead.id, { status: targetStatus });
        applyMetricTransition(lead.status, targetStatus);
      }
    }

    setBusy(true);
    setMessage(loadingMessage);
    try {
      const result = await request('/api/store/portal/pipeline/actions', {
        method: 'POST',
        body: JSON.stringify({ command, slug, lead_id: lead.id, ...extra })
      });

      if (transition && result?.lead?.id === lead.id) {
        const serverLead = result.lead as Record<string, any>;
        const serverStatus = String(serverLead.status || targetStatus);
        const safePatch = pipelineStatusPatchFromServerLead(serverLead) as Partial<PipelineLead>;
        patchLoadedLead(lead.id, safePatch);
        applyMetricTransition(optimistic ? targetStatus : lead.status, serverStatus);

        if (settleLocalRealtimeGuard(lead.id, serverLead)) await loadData(true);
      } else {
        if (transition) clearLocalRealtimeGuard(lead.id);
        await loadData(true);
      }

      setMessage(result.message || 'Ação concluída.');
      return result;
    } catch (error: any) {
      if (transition) clearLocalRealtimeGuard(lead.id);
      if (optimistic) {
        patchLoadedLead(lead.id, { status: lead.status });
        applyMetricTransition(targetStatus, lead.status);
      }
      setMessage(error?.message || 'Não foi possível concluir a ação.');
      throw error;
    } finally {
      setBusy(false);
    }
  }
`,
  'runCommand'
);

replaceOnce(
`  useEffect(() => {
    const storeId = payload?.store.id;
    if (!storeId) return;

    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (realtimeRefreshTimer.current !== null) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = window.setTimeout(() => {
        realtimeRefreshTimer.current = null;
        void loadData(true).catch(() => undefined);
      }, 750);
    };

    const channel = supabase
      .channel(\`pipeline-leads-\${storeId}\`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: \`assigned_store_id=eq.\${storeId}\`
      }, scheduleRefresh)
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const wasHiddenFor = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (wasHiddenFor >= 60_000) scheduleRefresh();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (realtimeRefreshTimer.current !== null) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [payload?.store.id, slug, supabase]);
`,
`  useEffect(() => {
    const storeId = payload?.store.id;
    if (!storeId) return;

    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (realtimeRefreshTimer.current !== null) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = window.setTimeout(() => {
        realtimeRefreshTimer.current = null;
        void loadData(true).catch(() => undefined);
      }, 750);
    };

    const handleRealtimeLeadChange = (event: any) => {
      const candidate = event?.new && Object.keys(event.new).length ? event.new : event?.old;
      const row = (candidate || {}) as PipelineRealtimeRow;
      const leadId = String(row.id || '');
      const guard = leadId ? localRealtimeGuards.current.get(leadId) : null;

      if (guard) {
        const decision = classifyPipelineRealtimeEvent(guard, row);
        if (decision === 'defer') {
          guard.pendingRows.push(row);
          return;
        }
        if (decision === 'ignore') return;
        localRealtimeGuards.current.delete(leadId);
      }

      scheduleRefresh();
    };

    const channel = supabase
      .channel(\`pipeline-leads-\${storeId}\`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: \`assigned_store_id=eq.\${storeId}\`
      }, handleRealtimeLeadChange)
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const wasHiddenFor = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (wasHiddenFor >= 60_000) scheduleRefresh();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (realtimeRefreshTimer.current !== null) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = null;
      localRealtimeGuards.current.clear();
      void supabase.removeChannel(channel);
    };
  }, [payload?.store.id, slug, supabase]);
`,
  'Realtime subscription'
);

const replacements = [
  ["      await runCommand('schedule', scheduleLead, { date: scheduleDate, time: scheduleTime, notes: scheduleNotes }, 'Salvando agendamento...');", "      await runCommand('schedule', scheduleLead, { date: scheduleDate, time: scheduleTime, notes: scheduleNotes }, 'Salvando agendamento...', { targetStatus: 'scheduled' });", 'schedule local reconcile'],
  ["      await runCommand('cancel_schedule', cancelLead, { reason: cancelReason }, 'Registrando cancelamento...');", "      await runCommand('cancel_schedule', cancelLead, { reason: cancelReason }, 'Registrando cancelamento...', { targetStatus: 'appointment_cancelled' });", 'cancel local reconcile'],
  ["      await runCommand('register_loss', lostLead, { reason: lostReason }, 'Registrando perda...');", "      await runCommand('register_loss', lostLead, { reason: lostReason }, 'Registrando perda...', { targetStatus: 'lost' });", 'loss local reconcile'],
  ["      await runCommand('reopen_lead', lead, {}, 'Reabrindo lead...');", "      await runCommand('reopen_lead', lead, {}, 'Reabrindo lead...', { targetStatus: 'in_service', optimistic: true });", 'reopen optimistic reconcile'],
  ["      await runCommand(command, lead, command === 'change_stage' ? { target_status: target } : {}, 'Movendo lead...');", "      await runCommand(command, lead, command === 'change_stage' ? { target_status: target } : {}, 'Movendo lead...', { targetStatus: target, optimistic: true });", 'drag optimistic reconcile']
];

for (const [oldText, newText, label] of replacements) replaceOnce(oldText, newText, label);

fs.writeFileSync(pagePath, page);
console.log('Pipeline optimistic drag patch applied.');
