import { NextResponse } from 'next/server';
import {
  importDistinctVehicleImages,
  inspectVehiclePage
} from '@/lib/server/siteVehicleImporter';
import { autoFillVehicleImport } from '@/lib/server/vehicleImportAutoFill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function cleanText(value: unknown) {
  return String(value || '').trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
        ? body.images.map((value: unknown) => String(value || '')).filter(Boolean)
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao importar link.' },
      { status: 500 }
    );
  }
}
