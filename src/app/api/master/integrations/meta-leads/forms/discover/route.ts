import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMetaServerConfig, redactMetaSecrets, stripStoredMetaSecrets } from '@/lib/server/metaServerConfig';
import { effectiveMetaGraphVersion } from '@/lib/server/metaGraphVersion';

export const runtime = 'nodejs';

const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase Service Role não configurada no servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function masterProfile(supabase: any, request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: authData } = await supabase.auth.getUser(token);
  if (!authData.user) return null;

  const { data: byAuth } = await supabase.from('users').select('id,role,status').eq('auth_user_id', authData.user.id).maybeSingle();
  if (byAuth?.role === 'master' && byAuth?.status === 'active') return byAuth;
  if (!authData.user.email) return null;

  const { data: byEmail } = await supabase.from('users').select('id,role,status').ilike('email', authData.user.email).maybeSingle();
  return byEmail?.role === 'master' && byEmail?.status === 'active' ? byEmail : null;
}

async function pageToken(pageId: string, version: string) {
  const saved = getMetaServerConfig().pageAccessToken;
  if (!saved) throw new Error('Configure META_PAGE_ACCESS_TOKEN na Vercel para importar os formulários.');

  const url = new URL(`https://graph.facebook.com/${version}/${pageId}`);
  url.searchParams.set('fields', 'id,access_token');
  const response = await fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${saved}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || 'A Meta recusou o token da página.');
  return clean(result?.access_token) || saved;
}

export async function GET(request: Request) {
  try {
    const supabase = admin();
    if (!await masterProfile(supabase, request)) {
      return NextResponse.json({ error: 'Apenas usuário Master pode importar formulários.' }, { status: 403 });
    }

    const { data: integration, error } = await supabase
      .from('marketing_integrations')
      .select('settings')
      .eq('integration_type', 'meta_leads')
      .maybeSingle();
    if (error) throw error;

    const settings = stripStoredMetaSecrets(integration?.settings);
    const pageId = clean(settings.page_id);
    const version = effectiveMetaGraphVersion(settings.graph_version);
    if (!pageId) return NextResponse.json({ error: 'Configure primeiro o Page ID.' }, { status: 400 });

    const token = await pageToken(pageId, version);
    const forms: any[] = [];
    let next: string | null = `https://graph.facebook.com/${version}/${pageId}/leadgen_forms?fields=id,name,status,created_time,locale&limit=100`;

    for (let page = 0; next && page < 10; page += 1) {
      const response: Response = await fetch(next, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível listar os formulários da página.');
      for (const form of Array.isArray(result?.data) ? result.data : []) {
        forms.push({
          id: clean(form?.id),
          name: clean(form?.name) || `Formulário ${clean(form?.id)}`,
          status: clean(form?.status).toUpperCase() || 'UNKNOWN',
          created_time: clean(form?.created_time) || null,
          locale: clean(form?.locale) || null
        });
      }
      next = clean(result?.paging?.next) || null;
    }

    return NextResponse.json({ success: true, forms });
  } catch (error: any) {
    const safe = redactMetaSecrets({ error: error?.message || 'Erro ao importar formulários da Meta.' });
    return NextResponse.json(safe, { status: 500 });
  }
}
