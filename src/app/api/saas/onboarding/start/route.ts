import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';
import { evaluateSaasWriteEnvironment } from '@/lib/server/saasEnvironment';

export const runtime = 'nodejs';

function clean(value: unknown, maxLength = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  return clean(value, 180).toLowerCase();
}

function digits(value: unknown) {
  return clean(value, 40).replace(/\D/g, '');
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Supabase não configurado no servidor.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const environment = evaluateSaasWriteEnvironment();
  if (!environment.enabled) {
    return NextResponse.json(
      {
        error: 'Cadastro SaaS ainda está em modo de validação segura neste ambiente.',
        code: 'SAAS_WRITE_DISABLED'
      },
      { status: 503 }
    );
  }

  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Origem não autorizada.' }, { status: 403 });
    }

    await enforceRateLimit(request, 'saas-onboarding-start', 5, 60 * 60);
    const body = await readJsonBody<any>(request, 16 * 1024);

    const storeName = clean(body.store_name, 160);
    const responsibleName = clean(body.responsible_name, 160);
    const responsiblePhone = clean(body.responsible_phone, 40);
    const email = normalizeEmail(body.email);
    const cnpj = digits(body.cnpj) || null;

    if (!storeName || !responsibleName || !email.includes('@')) {
      return NextResponse.json({ error: 'Preencha nome da loja, responsável e e-mail válido.' }, { status: 400 });
    }

    if (cnpj && cnpj.length !== 14) {
      return NextResponse.json({ error: 'Informe um CNPJ com 14 dígitos ou deixe o campo vazio.' }, { status: 400 });
    }

    if (body.privacy_acknowledged !== true || body.terms_acknowledged !== true) {
      return NextResponse.json({ error: 'Confirme os Termos de Uso e a Política de Privacidade.' }, { status: 400 });
    }

    const supabase = adminClient();

    const { data: existingStoreByEmail, error: emailLookupError } = await supabase
      .from('stores')
      .select('id')
      .ilike('responsible_email', email)
      .neq('status', 'deleted')
      .limit(1)
      .maybeSingle();
    if (emailLookupError) throw emailLookupError;

    let existingStoreByCnpj: { id: string } | null = null;
    if (cnpj) {
      const { data, error: cnpjLookupError } = await supabase
        .from('stores')
        .select('id')
        .eq('cnpj', cnpj)
        .neq('status', 'deleted')
        .limit(1)
        .maybeSingle();
      if (cnpjLookupError) throw cnpjLookupError;
      existingStoreByCnpj = data;
    }

    if (existingStoreByEmail || existingStoreByCnpj) {
      return NextResponse.json({ error: 'Já existe uma loja cadastrada com estes dados. Use o login existente ou fale com o suporte.' }, { status: 409 });
    }

    const { data: openOnboarding, error: onboardingLookupError } = await supabase
      .from('saas_onboarding')
      .select('id,status')
      .eq('normalized_email', email)
      .not('status', 'in', '(active,canceled,expired)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (onboardingLookupError) throw onboardingLookupError;

    if (openOnboarding) {
      return NextResponse.json({
        success: true,
        onboarding_id: openOnboarding.id,
        status: openOnboarding.status,
        resumed: true
      });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { data: onboarding, error } = await supabase
      .from('saas_onboarding')
      .insert({
        normalized_email: email,
        responsible_name: responsibleName,
        responsible_phone: responsiblePhone || null,
        store_name: storeName,
        cnpj,
        status: 'email_verification_pending',
        privacy_notice_version: '2026-08-18',
        privacy_acknowledged_at: now.toISOString(),
        terms_version: '2026-08-19-saas-draft',
        terms_accepted_at: now.toISOString(),
        expires_at: expires.toISOString(),
        metadata: { source: 'saas_self_service' }
      })
      .select('id,status')
      .single();

    if (error || !onboarding) throw error || new Error('Não foi possível iniciar o cadastro.');

    return NextResponse.json({
      success: true,
      onboarding_id: onboarding.id,
      status: onboarding.status,
      resumed: false
    });
  } catch (error: unknown) {
    const failure = publicError(error, 'Não foi possível iniciar o cadastro SaaS.');
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
