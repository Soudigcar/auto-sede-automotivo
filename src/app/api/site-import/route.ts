import { NextResponse } from 'next/server';
import {
  importDistinctVehicleImages,
  inspectVehiclePage
} from '@/lib/server/siteVehicleImporter';

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

    if (action === 'preview') {
      return NextResponse.json(page);
    }

    if (action === 'import') {
      const selectedImages = Array.isArray(body.images) && body.images.length
        ? body.images.map((value: unknown) => String(value || '')).filter(Boolean)
        : page.images;

      const imageResult = await importDistinctVehicleImages(selectedImages.slice(0, 20), 8);

      return NextResponse.json({
        title: page.title,
        description: page.description,
        evidence: page.evidence,
        price: page.price,
        images: page.images,
        uploadedImages: imageResult.uploadedImages,
        imageDeduplication: {
          source_count: imageResult.sourceCount,
          unique_count: imageResult.uniqueCount
        },
        vehicle: {
          ...page.vehicle,
          description: page.description,
          image_url: imageResult.uploadedImages[0] || page.images[0] || ''
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
