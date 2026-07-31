import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function clean(value: unknown, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  return clean(value, 180).toLowerCase();
}

function digits(value: unknown) {
  return clean(value, 40).replace(/\D/g, '');
}

function normalizeUrl(value: unknown) {
  const text = clean(value, 500);
  if (!text) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) throw new Error('Configuração do servidor incompleta.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Honeypot: bots costumam preencher campos invisíveis.
    if (clean(body.company_fax, 100)) {
      return NextResponse.json({ success: true });
    }

    const storeName = clean(body.store_name, 160);
    const legalName = clean(body.legal_name, 200) || null;
    const cnpj = digits(body.cnpj) || null;
    const responsibleName = clean(body.responsible_name, 160);
    const phone = clean(body.responsible_phone, 40);
    const email = normalizeEmail(body.responsible_email);
    const state = clean(body.state, 80) || null;
    const city = clean(body.city, 120) || null;
    const addressText = clean(body.address_text, 300) || null;
    const websiteUrl = normalizeUrl(body.website_url);
    const instagramUrl = normalizeUrl(body.instagram_url);
    const notes = clean(body.notes, 1500) || null;
    const vehicleCount = body.approximate_vehicle_count === '' || body.approximate_vehicle_count == null
      ? null
      : Math.max(0, Math.min(10000, Number(body.approximate_vehicle_count) || 0));

    if (!storeName || !responsibleName || !phone || !email.includes('@')) {
      return NextResponse.json({ error: 'Preencha loja, responsável, WhatsApp e e-mail válido.' }, { status: 400 });
    }

    if (cnpj && cnpj.length !== 14) {
      return NextResponse.json({ error: 'Informe um CNPJ com 14 dígitos ou deixe o campo vazio.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id,responsible_email,cnpj,status')
      .neq('status', 'deleted');

    if (storesError) throw storesError;

    const existingStore = (stores || []).find((store: any) => {
      const sameEmail = normalizeEmail(store.responsible_email) === email;
      const sameCnpj = Boolean(cnpj && digits(store.cnpj) === cnpj);
      return sameEmail || sameCnpj;
    });

    if (existingStore) {
      return NextResponse.json(
        { error: 'Esta loja já possui cadastro. Use o acesso da loja ou fale com a equipe Auto Sede.' },
        { status: 409 }
      );
    }

    const { data: openApplication } = await supabase
      .from('store_portal_applications')
      .select('id')
      .ilike('responsible_email', email)
      .in('status', ['pending', 'reviewing'])
      .maybeSingle();

    if (openApplication) {
      return NextResponse.json(
        { error: 'Já existe uma solicitação em análise para este e-mail.' },
        { status: 409 }
      );
    }

    const { error } = await supabase.from('store_portal_applications').insert({
      store_name: storeName,
      legal_name: legalName,
      cnpj,
      responsible_name: responsibleName,
      responsible_phone: phone,
      responsible_email: email,
      state,
      city,
      address_text: addressText,
      website_url: websiteUrl,
      instagram_url: instagramUrl,
      approximate_vehicle_count: vehicleCount,
      interested_in_events: body.interested_in_events !== false,
      notes,
      status: 'pending'
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Já existe uma solicitação em análise para estes dados.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível enviar a solicitação.' }, { status: 500 });
  }
}
