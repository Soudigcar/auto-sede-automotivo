import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedKinds = new Set(['logo', 'header', 'hero', 'tablet-hero', 'mobile-hero', 'media', 'sponsor']);

function safeName(value: string) {
  return cleanText(value, 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'imagem';
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao usuário master.' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const kind = cleanText(formData.get('kind'), 30);
    const slug = safeName(cleanText(formData.get('slug'), 180) || 'evento');

    if (!file || file.size <= 0) return NextResponse.json({ error: 'Selecione uma imagem.' }, { status: 400 });
    if (!allowedKinds.has(kind)) return NextResponse.json({ error: 'Tipo de imagem inválido.' }, { status: 400 });
    if (!allowedMimeTypes.has(file.type)) return NextResponse.json({ error: 'Envie uma imagem JPG, PNG ou WEBP.' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'A imagem deve ter no máximo 10 MB.' }, { status: 400 });

    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `${slug}/${kind}/${Date.now()}-${safeName(file.name).replace(/\.[^.]+$/, '')}.${extension}`;
    const bytes = await file.arrayBuffer();

    const { error } = await supabase.storage.from('campaign-assets').upload(filePath, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: '31536000'
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data } = supabase.storage.from('campaign-assets').getPublicUrl(filePath);
    return NextResponse.json({ success: true, public_url: data.publicUrl, path: filePath });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao enviar imagem.' }, { status: 500 });
  }
}
