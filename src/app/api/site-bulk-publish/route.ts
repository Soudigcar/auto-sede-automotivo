import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function text(value: unknown) {
  return String(value || '').trim();
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase Service Role não configurada.');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function assertMaster(request: Request, supabase: any) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    throw new Error('Sessão não encontrada.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    throw new Error('Sessão inválida.');
  }

  let profile: any = null;

  const { data: byAuth } = await supabase
    .from('users')
    .select('id,email,role,status')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  profile = byAuth;

  if (!profile && authData.user.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id,email,role,status')
      .ilike('email', authData.user.email)
      .maybeSingle();

    profile = byEmail;
  }

  if (!profile || profile.role !== 'master' || profile.status !== 'active') {
    throw new Error('Acesso restrito ao Master.');
  }

  return profile;
}

async function saveAttributeOptions(supabase: any, payload: any) {
  const options = [
    { option_type: 'brand', option_value: payload.brand },
    { option_type: 'model', option_value: payload.model },
    { option_type: 'version', option_value: payload.version },
    { option_type: 'transmission', option_value: payload.transmission },
    { option_type: 'fuel', option_value: payload.fuel }
  ]
    .map((item) => ({
      ...item,
      option_value: text(item.option_value)
    }))
    .filter((item) => item.option_value);

  for (const item of options) {
    const { data: existing } = await supabase
      .from('vehicle_attribute_options')
      .select('id,usage_count')
      .eq('option_type', item.option_type)
      .ilike('option_value', item.option_value)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('vehicle_attribute_options')
        .update({
          usage_count: Number(existing.usage_count || 1) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('vehicle_attribute_options')
        .insert({
          option_type: item.option_type,
          option_value: item.option_value,
          is_active: true
        });
    }
  }
}

async function getCampaign(supabase: any, campaignId?: string) {
  if (campaignId) {
    const { data } = await supabase
      .from('site_campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();

    if (data) return data;
  }

  const { data } = await supabase
    .from('site_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

async function importVehicleFromSubmission(origin: string, submission: any) {
  const previewResponse = await fetch(`${origin}/api/site-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'preview',
      url: submission.vehicle_url
    })
  });

  const preview = await previewResponse.json();

  if (!previewResponse.ok) {
    throw new Error(preview.error || 'Falha ao buscar dados do anúncio.');
  }

  const images = Array.isArray(preview.images) ? preview.images.slice(0, 8) : [];

  const importResponse = await fetch(`${origin}/api/site-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'import',
      url: submission.vehicle_url,
      images
    })
  });

  const imported = await importResponse.json();

  if (!importResponse.ok) {
    throw new Error(imported.error || 'Falha ao importar fotos do anúncio.');
  }

  return {
    preview,
    imported
  };
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    await assertMaster(request, supabase);

    const body = await request.json();
    const submissionIds = Array.isArray(body.submission_ids) ? body.submission_ids.slice(0, 5) : [];
    const campaign = await getCampaign(supabase, text(body.campaign_id));

    if (!campaign?.id) {
      return NextResponse.json({ error: 'Campanha da landing não encontrada.' }, { status: 400 });
    }

    if (!submissionIds.length) {
      return NextResponse.json({ error: 'Nenhum link selecionado.' }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const results: any[] = [];

    for (const submissionId of submissionIds) {
      try {
        const { data: submission } = await supabase
          .from('store_vehicle_link_submissions')
          .select('*')
          .eq('id', submissionId)
          .maybeSingle();

        if (!submission) {
          throw new Error('Link não encontrado.');
        }

        if (['published', 'rejected', 'duplicate'].includes(submission.status)) {
          results.push({
            id: submissionId,
            success: false,
            skipped: true,
            error: 'Link já finalizado.'
          });
          continue;
        }

        const { data: store } = await supabase
          .from('stores')
          .select('id,store_name')
          .eq('id', submission.store_id)
          .maybeSingle();

        const importedResult = await importVehicleFromSubmission(origin, submission);
        const vehicleData = importedResult.imported?.vehicle || importedResult.preview?.vehicle || {};
        const uploadedImages = Array.isArray(importedResult.imported?.uploadedImages)
          ? importedResult.imported.uploadedImages
          : [];

        const imageUrl =
          vehicleData.image_url ||
          uploadedImages[0] ||
          importedResult.preview?.images?.[0] ||
          '';

        const imageUrls = Array.from(
          new Set([
            ...uploadedImages,
            ...(Array.isArray(importedResult.preview?.images) ? importedResult.preview.images : []),
            imageUrl
          ].filter(Boolean))
        );

        const payload = {
          campaign_id: campaign.id,
          brand: text(vehicleData.brand) || text(importedResult.preview?.vehicle?.brand) || 'Veículo',
          model: text(vehicleData.model) || text(importedResult.preview?.vehicle?.model) || 'A conferir',
          version: text(vehicleData.version) || text(importedResult.preview?.vehicle?.version),
          year: text(vehicleData.year) || text(importedResult.preview?.vehicle?.year),
          mileage: text(vehicleData.mileage) || '',
          color: text(vehicleData.color) || '',
          transmission: text(vehicleData.transmission) || '',
          fuel: text(vehicleData.fuel) || '',
          price: Number(importedResult.imported?.price || importedResult.preview?.price || 0),
          image_url: imageUrl,
          image_urls: imageUrls,
          store_name: store?.store_name || '',
          status: 'disponivel',
          show_on_landing: true,
          is_featured: false,
          updated_at: new Date().toISOString()
        };

        const { data: vehicle, error: vehicleError } = await supabase
          .from('site_vehicles')
          .insert(payload)
          .select('*')
          .single();

        if (vehicleError || !vehicle) {
          throw new Error(vehicleError?.message || 'Erro ao publicar veículo.');
        }

        await saveAttributeOptions(supabase, payload);

        await supabase
          .from('store_vehicle_link_submissions')
          .update({
            status: 'published',
            imported_vehicle_id: vehicle.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', submission.id);

        results.push({
          id: submission.id,
          success: true,
          vehicle_id: vehicle.id,
          vehicle_name: `${payload.brand} ${payload.model}`.trim()
        });
      } catch (error: any) {
        results.push({
          id: submissionId,
          success: false,
          error: error?.message || 'Falha ao publicar este link.'
        });
      }
    }

    const published = results.filter((item) => item.success).length;
    const failed = results.filter((item) => !item.success && !item.skipped).length;
    const skipped = results.filter((item) => item.skipped).length;

    return NextResponse.json({
      success: true,
      published,
      failed,
      skipped,
      results
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao publicar em lote.' },
      { status: 500 }
    );
  }
}
