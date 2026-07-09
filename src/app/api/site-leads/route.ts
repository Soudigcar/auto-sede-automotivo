import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function text(value: unknown) {
  return String(value || '').trim();
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = text(body.name);
    const phone = text(body.phone);

    if (!name || !phone) {
      return NextResponse.json({ error: 'Nome e telefone são obrigatórios.' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      { auth: { persistSession: false } }
    );

    const payload = {
      name,
      phone,
      cpf: text(body.cpf),
      email: text(body.email),
      source: text(body.source) || 'Landing Page Simulador',
      campaign_id: body.campaign_id || null,
      campaign_name: text(body.campaign_name),
      vehicle_id: body.vehicle_id || null,
      vehicle_name: text(body.vehicle_name),
      vehicle_price: number(body.vehicle_price),
      down_payment: number(body.down_payment),
      financed_amount: number(body.financed_amount),
      installments: Number(body.installments || 0),
      estimated_installment: number(body.estimated_installment),
      interest_rate: number(body.interest_rate) || 1.89,
      status: 'Novo lead',
      notes: text(body.notes),
      metadata: body.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('leads_base').insert(payload).select('*').single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lead: data });
  } catch {
    return NextResponse.json({ error: 'Erro ao salvar lead.' }, { status: 500 });
  }
}
