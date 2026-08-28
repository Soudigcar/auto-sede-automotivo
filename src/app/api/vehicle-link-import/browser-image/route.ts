import { NextResponse } from 'next/server';
import { asStorePortalRole, authorizeStoreEntitlement } from '@/lib/server/storePortal';
import { cleanText, createAdminClient, getProfileFromToken, readBearerToken } from '@/lib/server/storeTeam';
import { extractOlxAdId } from '@/lib/olxSharedUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase: any = createAdminClient();
    const profile = await getProfileFromToken(supabase, readBearerToken(request));
    const role = asStorePortalRole(profile?.role);

    if (!profile || profile.status !== 'active' || !role) {
      return NextResponse.json({ error: 'Usuário sem perfil ativo para importar imagens.' }, { status: 403 });
    }

    const storeId = role === 'master' ? cleanText(body.store_id, 80) : cleanText(profile.store_id, 80);
    if (!storeId || (role !== 'master' && profile.store_id !== storeId)) {
      return NextResponse.json({ error: 'Loja inválida para esta imagem.' }, { status: 403 });
    }
    const entitlement = await authorizeStoreEntitlement(supabase, {
      role,
      storeId,
      profileStoreId: profile.store_id
    });
    if ('error' in entitlement) return entitlement.error;

    const match = String(body.data_url || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return NextResponse.json({ error: 'Formato de imagem inválido.' }, { status: 400 });
    const mime = match[1].toLowerCase();
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 3 * 1024 * 1024) {
      return NextResponse.json({ error: 'A imagem deve ter no máximo 3 MB após compressão.' }, { status: 413 });
    }

    const adId = extractOlxAdId(body.source_url) || 'sem-id';
    const index = Math.max(1, Math.min(30, Number(body.index || 1)));
    const extension = MIME_EXTENSIONS[mime] || 'jpg';
    const filePath = `olx-browser/${storeId}/${adId}/${Date.now()}-${index}.${extension}`;
    const { error } = await supabase.storage.from('vehicle-images').upload(filePath, bytes, {
      contentType: mime,
      upsert: false
    });
    if (error) throw error;
    const { data } = supabase.storage.from('vehicle-images').getPublicUrl(filePath);
    return NextResponse.json({ success: true, url: data.publicUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao salvar imagem importada pelo navegador.' }, { status: 500 });
  }
}
