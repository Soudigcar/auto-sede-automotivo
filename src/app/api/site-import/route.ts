import { NextResponse } from 'next/server';
import {
  importDistinctVehicleImages,
  inspectVehiclePage
} from '@/lib/server/siteVehicleImporter';
import { autoFillVehicleImport } from '@/lib/server/vehicleImportAutoFill';
import { createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { publicError, readJsonBody } from '@/lib/server/requestSecurity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2048);
}

async function requireImporterSession(request: Request) {
  const token = readBearerToken(request);
  if (!token) return null;
  const profile = await getProfileFromToken(createAdminClient(), token);
  if (!profile || profile.status !== 'active') return null;
  if (!['master', 'store', 'pre_sales', 'seller', 'prospector'].includes(String(profile.role || ''))) return null;
  return profile;
}

export async function POST(request: Request) {
  try {
    const profile = await requireImporterSession(request);
    if (!profile) {
      return NextResponse.json({ error: 'Sessão autorizada obrigatória.' }, { status: 401 });
    }

    const body = await readJsonBody<any>(request, 24 * 1024);
    const action = cleanText(body.action || 'preview');
    const url = cleanText(body.url);

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });
    }

    const page = await inspectVehiclePage(url);
    const autoFilled = await autoFillVehicleImport({
      title: page.title,
      description: page.description,
      vehicle: page.vehicle,
      evidence: page.evidence
    });
    const enrichedPage = {
      ...page,
      evidence: autoFilled.evidence,
      vehicle: autoFilled.vehicle
    };

    if (action === 'preview') {
      return NextResponse.json(enrichedPage);
    }

    if (action === 'import') {
      const selectedImages = Array.isArray(body.images) && body.images.length
        ? body.images.map((value: unknown) => cleanText(value)).filter(Boolean)
        : enrichedPage.images;

      const imageResult = await importDistinctVehicleImages(selectedImages.slice(0, 20), 8);

      return NextResponse.json({
        title: enrichedPage.title,
        description: enrichedPage.description,
        evidence: enrichedPage.evidence,
        price: enrichedPage.price,
        images: enrichedPage.images,
        uploadedImages: imageResult.uploadedImages,
        imageDeduplication: {
          source_count: imageResult.sourceCount,
          unique_count: imageResult.uniqueCount
        },
        vehicle: {
          ...enrichedPage.vehicle,
          description: enrichedPage.description,
          image_url: imageResult.uploadedImages[0] || enrichedPage.images[0] || ''
        }
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: unknown) {
    const safe = publicError(error, 'Não foi possível importar o link.');
    return NextResponse.json({ error: safe.message }, { status: safe.status });
  }
}
