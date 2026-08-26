import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMetaServerConfig, redactMetaSecrets, stripStoredMetaSecrets } from '@/lib/server/metaServerConfig';
import { effectiveMetaGraphVersion, FALLBACK_META_GRAPH_VERSION } from '@/lib/server/metaGraphVersion';

export const runtime = 'nodejs';
export const maxDuration = 60;

const defaultSettings = {
  app_id: '',
  page_id: '',
  form_id: '',
  form_mappings: [] as any[],
  graph_version: FALLBACK_META_GRAPH_VERSION,
  routing_mode: 'round_robin'
};

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function digits(value: unknown) {
  return cleanText(value).replace(/\D/g, '');
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanText(value));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada no servidor.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getMasterProfile(supabase: any, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (byAuth?.status === 'active' && byAuth?.role === 'master') return byAuth;

  if (authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('*')
      .ilike('email', authData.user.email)
      .maybeSingle();

    if (byEmail?.status === 'active' && byEmail?.role === 'master') return byEmail;
  }

  return null;
}

async function getIntegration(supabase: any) {
  const { data } = await supabase
    .from('marketing_integrations')
    .select('*')
    .eq('integration_type', 'meta_leads')
    .maybeSingle();

  return {
    ...(data || {}),
    settings: { ...defaultSettings, ...stripStoredMetaSecrets(data?.settings) }
  };
}

function normalizeMappings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      name: cleanText(item?.name),
      form_id: digits(item?.form_id),
      event_id: cleanText(item?.event_id),
      event_name: cleanText(item?.event_name),
      is_active: Boolean(item?.is_active)
    }))
    .filter((item: any) => item.form_id);
}

async function graphGetWithToken(
  path: string,
  token: string,
  graphVersion: string,
  params: Record<string, string> = {}
) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\//, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

async function resolvePageAccessToken(settings: any, serverToken: string) {
  const graphVersion = effectiveMetaGraphVersion(settings.graph_version);
  const savedToken = cleanText(serverToken);
  const pageId = cleanText(settings.page_id);

  if (!savedToken || !pageId) {
    return { token: savedToken, resolved: false, page: null, error: null };
  }

  const pageCheck = await graphGetWithToken(`/${pageId}`, savedToken, graphVersion, {
    fields: 'id,name,access_token'
  });

  if (pageCheck.ok && pageCheck.data?.access_token) {
    return {
      token: cleanText(pageCheck.data.access_token),
      resolved: true,
      page: pageCheck.data,
      error: null
    };
  }

  return {
    token: savedToken,
    resolved: false,
    page: pageCheck.ok ? pageCheck.data : null,
    error: pageCheck.ok ? null : pageCheck.data?.error
  };
}

function pushCheck(checks: any[], name: string, ok: boolean, message: string, details?: any) {
  checks.push({ name, ok, message, ...(details === undefined ? {} : { details }) });
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!token) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 401 });

    const masterProfile = await getMasterProfile(supabase, token);
    if (!masterProfile) {
      return NextResponse.json({ error: 'Apenas usuário Master pode testar esta integração.' }, { status: 403 });
    }

    const integration = await getIntegration(supabase);
    const settings = integration.settings || {};
    const pageId = cleanText(settings.page_id);
    const fallbackFormId = digits(settings.form_id);
    const serverConfig = getMetaServerConfig();
    const pageAccessToken = serverConfig.pageAccessToken;
    const graphVersion = effectiveMetaGraphVersion(settings.graph_version);
    const verifyToken = serverConfig.verifyToken;
    const mappings = normalizeMappings(settings.form_mappings);
    const activeMappings = mappings.filter((item: any) => item.is_active);
    const checks: any[] = [];

    pushCheck(
      checks,
      'Integração ativa',
      Boolean(integration?.is_active),
      integration?.is_active
        ? 'Recebimento de Facebook Lead Forms está ativo.'
        : 'A integração está inativa; novos webhooks serão ignorados.'
    );

    pushCheck(checks, 'Page ID configurado', Boolean(pageId), pageId ? `Page ID ${pageId}.` : 'Page ID não informado.');
    pushCheck(
      checks,
      'Page Access Token configurado',
      Boolean(pageAccessToken),
      pageAccessToken ? 'Token configurado somente no ambiente server-side.' : 'META_PAGE_ACCESS_TOKEN não configurado no servidor.'
    );

    pushCheck(
      checks,
      'Verify Token configurado',
      Boolean(verifyToken),
      verifyToken ? 'Token configurado somente no ambiente server-side.' : 'META_LEADS_VERIFY_TOKEN não configurado no servidor.'
    );

    if (!pageId || !pageAccessToken || !verifyToken) {
      return NextResponse.json(redactMetaSecrets({
        success: false,
        dry_run: true,
        checks,
        summary: 'Diagnóstico interrompido: configure Page ID e os segredos Meta server-side.'
      }, serverConfig));
    }

    const resolvedToken = await resolvePageAccessToken(settings, pageAccessToken);
    const tokenToUse = resolvedToken.token || pageAccessToken;

    pushCheck(
      checks,
      'Resolver Page Access Token',
      Boolean(tokenToUse),
      resolvedToken.resolved
        ? `Token da Página resolvido para ${resolvedToken.page?.name || pageId}.`
        : resolvedToken.error
          ? `Falha ao resolver token da Página: ${resolvedToken.error?.message || 'erro desconhecido'}`
          : 'Usando o token salvo diretamente.',
      resolvedToken.error || { resolved: resolvedToken.resolved, page_id: resolvedToken.page?.id || pageId }
    );

    const pageCheck = await graphGetWithToken(`/${pageId}`, tokenToUse, graphVersion, { fields: 'id,name' });
    pushCheck(
      checks,
      'Meta API: consultar página',
      pageCheck.ok,
      pageCheck.ok
        ? `Página encontrada: ${pageCheck.data?.name || pageCheck.data?.id}.`
        : pageCheck.data?.error?.message || 'Não foi possível consultar a página.',
      pageCheck.ok ? { id: pageCheck.data?.id, name: pageCheck.data?.name } : pageCheck.data?.error
    );

    const subscriptionCheck = await graphGetWithToken(`/${pageId}/subscribed_apps`, tokenToUse, graphVersion);
    const subscribedApps = Array.isArray(subscriptionCheck.data?.data) ? subscriptionCheck.data.data : [];
    const currentAppId = cleanText(settings.app_id);
    const matchingApp = subscribedApps.find((app: any) => {
      const sameApp = currentAppId ? String(app.id) === currentAppId : true;
      const fields = Array.isArray(app.subscribed_fields) ? app.subscribed_fields : [];
      return sameApp && fields.includes('leadgen');
    });

    pushCheck(
      checks,
      'Meta Webhooks: página inscrita em leadgen',
      Boolean(matchingApp),
      matchingApp
        ? `Página inscrita no campo leadgen pelo app ${matchingApp.name || matchingApp.id}.`
        : subscriptionCheck.ok
          ? 'A página não aparece inscrita no campo leadgen para este App ID.'
          : subscriptionCheck.data?.error?.message || 'Não foi possível consultar subscribed_apps.',
      subscriptionCheck.ok
        ? subscribedApps.map((app: any) => ({ id: app.id, name: app.name, subscribed_fields: app.subscribed_fields }))
        : subscriptionCheck.data?.error
    );

    const effectiveMappings = activeMappings.length
      ? activeMappings
      : fallbackFormId
        ? [{ name: 'Form ID principal', form_id: fallbackFormId, event_id: '', event_name: '', is_active: true }]
        : [];

    pushCheck(
      checks,
      'Formulários ativos mapeados',
      effectiveMappings.length > 0,
      effectiveMappings.length > 0
        ? `${effectiveMappings.length} formulário(s) serão validados de ponta a ponta.`
        : 'Nenhum Form ID ativo foi encontrado em form_mappings nem no Form ID principal.',
      effectiveMappings.map((item: any) => ({ name: item.name, form_id: item.form_id, event_id: item.event_id || null }))
    );

    const { error: leadsSchemaError } = await supabase
      .from('leads')
      .select('id,event_id,customer_name,customer_phone,customer_bank,interested_vehicle,vehicle_category_interest,origin,assigned_store_id,status,notes')
      .limit(1);

    pushCheck(
      checks,
      'Schema: tabela leads compatível',
      !leadsSchemaError,
      leadsSchemaError ? `Schema de leads incompatível: ${leadsSchemaError.message}` : 'Todas as colunas usadas pelo webhook existem em leads.'
    );

    const { error: baseSchemaError } = await supabase
      .from('leads_base')
      .select('id,event_id,name,phone,cpf,email,source,campaign_id,campaign_name,vehicle_id,vehicle_name,vehicle_price,down_payment,financed_amount,installments,estimated_installment,interest_rate,status,assigned_store_id,assigned_store_name,assigned_at,routed_lead_id,routing_strategy,notes,metadata,created_at,updated_at')
      .limit(1);

    pushCheck(
      checks,
      'Schema: tabela leads_base compatível',
      !baseSchemaError,
      baseSchemaError ? `Schema de leads_base incompatível: ${baseSchemaError.message}` : 'Todas as colunas usadas pelo webhook existem em leads_base.'
    );

    let latestMetaLead: any = null;

    for (const mapping of effectiveMappings) {
      const formId = digits(mapping.form_id);
      const formCheck = await graphGetWithToken(`/${formId}`, tokenToUse, graphVersion, { fields: 'id,name,status' });
      pushCheck(
        checks,
        `Form ${formId}: acesso na Meta`,
        formCheck.ok,
        formCheck.ok
          ? `Formulário encontrado: ${formCheck.data?.name || formId} (${formCheck.data?.status || 'status não informado'}).`
          : formCheck.data?.error?.message || 'Não foi possível consultar o formulário.',
        formCheck.ok ? { id: formCheck.data?.id, name: formCheck.data?.name, status: formCheck.data?.status } : formCheck.data?.error
      );

      const leadsCheck = await graphGetWithToken(`/${formId}/leads`, tokenToUse, graphVersion, {
        limit: '1',
        fields: 'id,created_time,form_id,campaign_id,campaign_name,field_data'
      });
      const sampleLead = Array.isArray(leadsCheck.data?.data) ? leadsCheck.data.data[0] : null;
      if (!latestMetaLead && sampleLead) latestMetaLead = sampleLead;

      pushCheck(
        checks,
        `Form ${formId}: permissão leads_retrieval`,
        leadsCheck.ok,
        leadsCheck.ok
          ? sampleLead
            ? 'Token conseguiu consultar um lead real para validar o contrato sem gravá-lo.'
            : 'Token tem acesso ao endpoint de leads; nenhum lead foi retornado na amostra.'
          : leadsCheck.data?.error?.message || 'Token não conseguiu consultar leads do formulário.',
        leadsCheck.ok
          ? { sample_lead_id: sampleLead?.id || null, sample_created_time: sampleLead?.created_time || null }
          : leadsCheck.data?.error
      );

      const eventId = cleanText(mapping.event_id);
      const mappingHasEvent = isUuid(eventId);
      pushCheck(
        checks,
        `Form ${formId}: vínculo com evento`,
        mappingHasEvent,
        mappingHasEvent
          ? `Evento vinculado: ${mapping.event_name || eventId}.`
          : 'Este formulário não possui event_id UUID válido no mapeamento.'
      );

      if (!mappingHasEvent) continue;

      const { data: eventRecord, error: eventError } = await supabase
        .from('events')
        .select('id,event_name,status,start_date,end_date')
        .eq('id', eventId)
        .maybeSingle();

      pushCheck(
        checks,
        `Form ${formId}: contrato da tabela events`,
        !eventError && Boolean(eventRecord),
        eventError
          ? `Falha ao consultar events com as colunas reais do webhook: ${eventError.message}`
          : eventRecord
            ? `Evento lido pela coluna event_name: ${eventRecord.event_name}.`
            : 'Evento mapeado não foi encontrado.',
        eventRecord || eventError
      );

      if (!eventRecord) continue;

      const eventActive = eventRecord.status === 'active' && (!eventRecord.end_date || eventRecord.end_date >= todayIsoDate());
      pushCheck(
        checks,
        `Form ${formId}: evento apto a receber lead`,
        eventActive,
        eventActive
          ? `Evento ativo e dentro da validade (${eventRecord.start_date || '-'} a ${eventRecord.end_date || '-'}).`
          : `Evento não está apto: status=${eventRecord.status}, fim=${eventRecord.end_date || 'sem data'}.`
      );

      const { data: stores, error: storesError } = await supabase
        .from('stores')
        .select('id,store_name,event_id,status,portal_enabled')
        .eq('event_id', eventId)
        .eq('status', 'active')
        .or('portal_enabled.is.null,portal_enabled.eq.true')
        .order('store_name', { ascending: true });

      const eligibleStores = Array.isArray(stores) ? stores : [];
      pushCheck(
        checks,
        `Form ${formId}: lojas elegíveis ao rodízio`,
        !storesError && eligibleStores.length > 0,
        storesError
          ? `Falha ao consultar lojas do evento: ${storesError.message}`
          : eligibleStores.length
            ? `${eligibleStores.length} loja(s) ativa(s) e habilitada(s) participam do rodízio.`
            : 'Nenhuma loja ativa/habilitada está disponível para este evento.',
        eligibleStores.map((store: any) => ({ id: store.id, store_name: store.store_name }))
      );

      if (sampleLead?.id) {
        const { data: duplicate } = await supabase
          .from('leads_base')
          .select('id,routed_lead_id')
          .contains('metadata', { meta_leadgen_id: cleanText(sampleLead.id) })
          .limit(1);

        pushCheck(
          checks,
          `Form ${formId}: deduplicação por meta_leadgen_id`,
          true,
          duplicate?.length
            ? 'A amostra já existe na Base e seria reconhecida como duplicada.'
            : 'A consulta de deduplicação executou corretamente; a amostra ainda não existe na Base.',
          { meta_leadgen_id: cleanText(sampleLead.id), existing: Boolean(duplicate?.length) }
        );
      }
    }

    if (latestMetaLead?.campaign_id) {
      const metaCampaignId = cleanText(latestMetaLead.campaign_id);
      pushCheck(
        checks,
        'Contrato de Campaign ID',
        !isUuid(metaCampaignId),
        !isUuid(metaCampaignId)
          ? 'Campaign ID da Meta é externo/não UUID e deve permanecer em metadata.meta_campaign_id; leads_base.campaign_id é reservado para UUID interno.'
          : 'Campaign ID retornado pela Meta tem formato UUID; revise o contrato antes de mapear para campaign_id.',
        { meta_campaign_id: metaCampaignId, leads_base_campaign_id_policy: 'null/interno UUID' }
      );
    } else {
      pushCheck(
        checks,
        'Contrato de Campaign ID',
        true,
        'Nenhum Campaign ID veio na amostra; leads_base.campaign_id continua reservado para UUID interno.'
      );
    }

    const callbackUrl = new URL('/api/webhooks/meta-leads', request.url);
    const challenge = `diag-${Date.now()}`;
    callbackUrl.searchParams.set('hub.mode', 'subscribe');
    callbackUrl.searchParams.set('hub.verify_token', verifyToken);
    callbackUrl.searchParams.set('hub.challenge', challenge);

    try {
      const verifyResponse = await fetch(callbackUrl.toString(), { cache: 'no-store' });
      const verifyBody = await verifyResponse.text();
      pushCheck(
        checks,
        'Webhook publicado: verificação GET',
        verifyResponse.ok && verifyBody === challenge,
        verifyResponse.ok && verifyBody === challenge
          ? 'Callback publicado respondeu corretamente ao handshake da Meta.'
          : `Handshake falhou: HTTP ${verifyResponse.status}.`
      );
    } catch (error: any) {
      pushCheck(checks, 'Webhook publicado: verificação GET', false, `Não foi possível chamar o callback publicado: ${error?.message || 'erro de rede'}.`);
    }

    try {
      const emptyPostResponse = await fetch(new URL('/api/webhooks/meta-leads', request.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object: 'page', entry: [] }),
        cache: 'no-store'
      });
      const emptyPostBody = await emptyPostResponse.json().catch(() => null);
      const postOk = emptyPostResponse.ok && emptyPostBody?.success === true && Number(emptyPostBody?.processed || 0) === 0;
      pushCheck(
        checks,
        'Webhook publicado: POST seguro sem lead',
        postOk,
        postOk
          ? 'Endpoint POST está ativo e processou payload vazio sem criar lead nem avançar rodízio.'
          : `POST de diagnóstico não retornou o contrato esperado (HTTP ${emptyPostResponse.status}).`,
        emptyPostBody
      );
    } catch (error: any) {
      pushCheck(checks, 'Webhook publicado: POST seguro sem lead', false, `Não foi possível testar o POST do webhook: ${error?.message || 'erro de rede'}.`);
    }

    const failedChecks = checks.filter((check) => !check.ok);
    const success = failedChecks.length === 0;

    return NextResponse.json(redactMetaSecrets({
      success,
      dry_run: true,
      tested_at: new Date().toISOString(),
      checks,
      summary: success
        ? `Diagnóstico completo aprovado: ${checks.length} verificações passaram. Nenhum lead foi criado e o rodízio não foi alterado.`
        : `Diagnóstico reprovado: ${failedChecks.length} de ${checks.length} verificações falharam. Nenhum lead foi criado e o rodízio não foi alterado.`,
      failed_checks: failedChecks.map((check) => check.name)
    }, serverConfig));
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao executar diagnóstico completo da Meta.', dry_run: true },
      { status: 500 }
    );
  }
}
