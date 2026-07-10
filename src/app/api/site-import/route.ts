import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function cleanText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function absoluteUrl(url: string, baseUrl: string) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return '';
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function extractMeta(html: string, property: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }

  return '';
}

function extractTitle(html: string) {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle) return ogTitle;

  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1];
  return cleanText(title || '');
}

function extractPrice(text: string) {
  const match = text.match(/R\$\s?[\d.]+(?:,\d{2})?/i);
  if (!match) return 0;

  return Number(
    match[0]
      .replace(/[^\d,]/g, '')
      .replace(',', '.')
  );
}

function parseVehicleFromTitle(title: string) {
  const clean = cleanText(title)
    .replace(/\s+-\s+.*$/g, '')
    .replace(/\|.*$/g, '')
    .replace(/Brasília.*$/i, '')
    .replace(/Distrito Federal.*$/i, '')
    .trim();

  const year = clean.match(/\b(19|20)\d{2}\b/)?.[0] || '';
  const withoutYear = clean.replace(year, '').replace(/\s+/g, ' ').trim();
  const parts = withoutYear.split(' ').filter(Boolean);

  const brand = parts[0] || '';
  const model = parts[1] || '';
  const version = parts.slice(2).join(' ');

  return { brand, model, version, year };
}

function extractImages(html: string, baseUrl: string) {
  const images: string[] = [];

  const ogImage = extractMeta(html, 'og:image');
  if (ogImage) images.push(absoluteUrl(ogImage, baseUrl));

  const imageRegexes = [
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi,
    /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi,
    /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi
  ];

  for (const regex of imageRegexes) {
    let match;

    while ((match = regex.exec(html))) {
      const raw = String(match[1] || '').split(',')[0].trim().split(' ')[0];
      const url = absoluteUrl(raw, baseUrl);

      if (!url) continue;

      const lower = url.toLowerCase();

      if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)) continue;
      if (lower.includes('logo')) continue;
      if (lower.includes('icon')) continue;
      if (lower.includes('favicon')) continue;
      if (lower.includes('whatsapp')) continue;
      if (lower.includes('facebook')) continue;
      if (lower.includes('instagram')) continue;
      if (lower.includes('placeholder')) continue;

      images.push(url);
    }
  }

  return unique(images).slice(0, 12);
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; AutoControleAutomotivo/1.0)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Não foi possível acessar o link. Status ${response.status}`);
  }

  return response.text();
}

async function uploadImageToSupabase(imageUrl: string, folder: string, index: number) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceKey,
    { auth: { persistSession: false } }
  );

  const response = await fetch(imageUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; AutoControleAutomotivo/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao baixar imagem.');
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const arrayBuffer = await response.arrayBuffer();

  const filePath = `${folder}/${Date.now()}-${index}.${extension}`;

  const { error } = await supabase.storage
    .from('vehicle-images')
    .upload(filePath, arrayBuffer, {
      contentType,
      upsert: true
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from('vehicle-images').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = cleanText(body.action || 'preview');
    const url = cleanText(body.url);

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Informe um link válido.' }, { status: 400 });
    }

    const html = await fetchHtml(url);
    const title = extractTitle(html);
    const price = extractPrice(html);
    const images = extractImages(html, url);
    const parsed = parseVehicleFromTitle(title);

    if (action === 'preview') {
      return NextResponse.json({
        title,
        price,
        images,
        vehicle: {
          brand: parsed.brand,
          model: parsed.model,
          version: parsed.version,
          year: parsed.year,
          source_url: url
        }
      });
    }

    if (action === 'import') {
      const selectedImages = Array.isArray(body.images) && body.images.length ? body.images : images.slice(0, 5);
      const folder = `imported-${Date.now()}`;

      const uploadedImages: string[] = [];

      for (let index = 0; index < selectedImages.slice(0, 8).length; index++) {
        try {
          const uploaded = await uploadImageToSupabase(String(selectedImages[index]), folder, index + 1);
          uploadedImages.push(uploaded);
        } catch {
          // Continua importando as próximas imagens.
        }
      }

      return NextResponse.json({
        title,
        price,
        images,
        uploadedImages,
        vehicle: {
          brand: parsed.brand,
          model: parsed.model,
          version: parsed.version,
          year: parsed.year,
          image_url: uploadedImages[0] || images[0] || '',
          source_url: url
        }
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao importar link.' }, { status: 500 });
  }
}
