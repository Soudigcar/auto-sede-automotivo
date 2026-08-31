import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  clean,
  commitWasExplicitlyRequested,
  resolveBackfillConfig,
  safeSecretEqual,
  signMetaPayload
} from '../_shared/metaBackfillSafety.ts';

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' }
});

const digits = (value: unknown) => clean(value).replace(/\D/g, '');

function graphVersion(value: unknown) {
  const candidate = clean(value);
  return /^v\d+\.\d+$/.test(candidate) ? candidate : 'v20.0';
}

function positiveLimit(request: Request) {
  const value = Number(new URL(request.url).searchParams.get('limit') || '1');
  return Math.max(1, Math.min(10, Number.isFinite(value) ? Math.trunc(value) : 1));
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const config = resolveBackfillConfig((name) => Deno.env.get(name));
    const providedSecret = clean(request.headers.get('x-backfill-key'));
    if (!providedSecret || !(await safeSecretEqual(providedSecret, config.sharedSecret))) {
      return json({ error: 'unauthorized' }, 401);
    }

    const supabaseUrl = clean(Deno.env.get('SUPABASE_URL'));
    const serviceRoleKey = clean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!serviceRoleKey) return json({ error: 'service_unavailable' }, 503);

    const database = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: integration, error: integrationError } = await database
      .from('marketing_integrations')
      .select('is_active,settings')
      .eq('integration_type', 'meta_leads')
      .maybeSingle();

    if (integrationError || !integration) {
      console.error('[Meta backfill] integration lookup failed', { error: integrationError?.message || 'not_found' });
      return json({ error: 'integration_unavailable' }, 503);
    }
    if (!integration.is_active) return json({ error: 'integration_inactive' }, 409);

    const settings: any = integration.settings || {};
    const pageId = digits(settings.page_id);
    const token = clean(Deno.env.get('META_PAGE_ACCESS_TOKEN')) || clean(settings.page_access_token);
    const version = graphVersion(settings.graph_version);
    const mappings = Array.isArray(settings.form_mappings)
      ? settings.form_mappings.filter((mapping: any) => mapping?.is_active && digits(mapping?.form_id))
      : [];

    if (!pageId || !token || !mappings.length) {
      return json({ error: 'integration_incomplete' }, 409);
    }

    const { data: existingRows, error: existingError } = await database
      .from('leads_base')
      .select('metadata')
      .not('metadata', 'is', null)
      .limit(5_000);
    if (existingError) {
      console.error('[Meta backfill] existing lead lookup failed', { error: existingError.message });
      return json({ error: 'existing_leads_unavailable' }, 503);
    }

    const existingIds = new Set(
      (existingRows || []).map((row: any) => clean(row?.metadata?.meta_leadgen_id)).filter(Boolean)
    );
    const fetchedLeads: any[] = [];

    for (const mapping of mappings) {
      const formId = digits(mapping.form_id);
      let next = new URL(`https://graph.facebook.com/${version}/${formId}/leads`);
      next.searchParams.set('limit', '100');
      next.searchParams.set('fields', 'id,created_time,form_id');
      let pageGuard = 0;

      while (next && pageGuard < 20) {
        pageGuard += 1;
        const response = await fetch(next, {
          cache: 'no-store',
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000)
        });
        const raw = await response.text();
        let payload: any = {};
        try { payload = JSON.parse(raw); } catch { /* response is sanitized below */ }
        if (!response.ok) {
          console.error('[Meta backfill] Graph request failed', { status: response.status, form_id: formId });
          return json({ error: 'meta_request_failed', status: response.status }, 502);
        }
        for (const lead of Array.isArray(payload?.data) ? payload.data : []) {
          fetchedLeads.push({ ...lead, form_id: clean(lead?.form_id || formId) });
        }
        const nextUrl = clean(payload?.paging?.next);
        if (!nextUrl) break;
        next = new URL(nextUrl);
        if (next.protocol !== 'https:' || next.hostname !== 'graph.facebook.com') {
          return json({ error: 'unsafe_meta_pagination' }, 502);
        }
      }
    }

    const uniqueLeads = new Map<string, any>();
    for (const lead of fetchedLeads) {
      const id = clean(lead?.id);
      if (id) uniqueLeads.set(id, lead);
    }
    const missingLeads = Array.from(uniqueLeads.values())
      .filter((lead) => !existingIds.has(clean(lead.id)))
      .sort((left, right) => clean(left.created_time).localeCompare(clean(right.created_time)));
    const batch = missingLeads.slice(0, positiveLimit(request));
    const commit = commitWasExplicitlyRequested(request);

    if (!commit) {
      return json({
        dry_run: true,
        environment: config.environment,
        total_meta: uniqueLeads.size,
        existing_before: existingIds.size,
        missing_before: missingLeads.length,
        would_attempt: batch.length
      });
    }

    const results: Array<{ http: number; accepted: boolean }> = [];
    for (const lead of batch) {
      const payload = {
        object: 'page',
        entry: [{
          id: pageId,
          changes: [{
            field: 'leadgen',
            value: { leadgen_id: clean(lead.id), form_id: clean(lead.form_id), page_id: pageId }
          }]
        }]
      };
      const rawBody = JSON.stringify(payload);
      const signature = await signMetaPayload(rawBody, config.appSecret);
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
          'x-auto-controle-backfill': config.environment
        },
        body: rawBody,
        signal: AbortSignal.timeout(20_000)
      });
      const accepted = response.ok;
      results.push({ http: response.status, accepted });
      if (!accepted) break;
    }

    return json({
      dry_run: false,
      environment: config.environment,
      missing_before: missingLeads.length,
      attempted: results.length,
      accepted: results.filter((result) => result.accepted).length,
      results
    });
  } catch (error) {
    console.error('[Meta backfill] request failed', {
      error_type: error instanceof Error ? error.name : 'unknown',
      reason: error instanceof Error ? error.message : 'unknown'
    });
    return json({ error: 'backfill_unavailable' }, 503);
  }
});
