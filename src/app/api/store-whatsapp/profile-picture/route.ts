import { after } from 'next/server';
import { asStorePortalRole, authorizeStoreWhatsappPortal, canAccessStoreConversation } from '@/lib/server/storePortal';
import {
  readStoredWhatsappProfilePicture,
  refreshWhatsappProfilePicture,
  type WhatsappProfilePictureBinary
} from '@/lib/server/whatsappProfilePictureCache';
import {
  whatsappProfilePictureMetadata,
  whatsappProfilePictureNeedsRefresh,
  whatsappProfilePictureStoragePath
} from '@/lib/whatsappProfilePicture';

export const runtime = 'nodejs';
export const maxDuration = 60;

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function shortId(value: unknown) {
  return cleanText(value).slice(0, 8) || null;
}

function emptyPicture(status: string) {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Whatsapp-Profile-Picture': status
    }
  });
}

function pictureResponse(picture: WhatsappProfilePictureBinary, status: string) {
  const body = new Uint8Array(picture.bytes.byteLength);
  body.set(picture.bytes);
  return new Response(body.buffer, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': picture.contentType,
      'Content-Length': String(picture.bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'X-Whatsapp-Profile-Picture': status
    }
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = cleanText(url.searchParams.get('slug'));
  const conversationId = cleanText(url.searchParams.get('conversation_id'));

  if (!slug || !conversationId) {
    return Response.json({ error: 'Informe loja e conversa.' }, { status: 400 });
  }

  try {
    const context = await authorizeStoreWhatsappPortal(request, slug);
    if ('error' in context) return context.error;
    const { supabase, profile, store } = context;

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('id, store_id, lead_id, contact_id, whatsapp_number_id')
      .eq('id', conversationId)
      .eq('store_id', store.id)
      .maybeSingle();

    if (conversationError) {
      return Response.json({ error: conversationError.message }, { status: 400 });
    }

    let lead: any = null;
    if (conversation?.lead_id) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, assigned_store_id, assigned_user_id')
        .eq('id', conversation.lead_id)
        .maybeSingle();
      if (error) return Response.json({ error: error.message }, { status: 400 });
      lead = data;
    }

    const role = asStorePortalRole(profile?.role);
    if (!conversation || !role || !canAccessStoreConversation(profile, role, conversation, lead)) {
      return Response.json({ error: 'Conversa não encontrada nesta loja.' }, { status: 404 });
    }

    if (!conversation.contact_id || !conversation.whatsapp_number_id) {
      return emptyPicture('contact_unavailable');
    }

    const [{ data: contact, error: contactError }, { data: integration, error: integrationError }] = await Promise.all([
      supabase
        .from('whatsapp_contacts')
        .select('id, store_id, wa_id, phone, metadata')
        .eq('id', conversation.contact_id)
        .eq('store_id', store.id)
        .maybeSingle(),
      supabase
        .from('store_whatsapp_integrations')
        .select('instance_name')
        .eq('crm_number_id', conversation.whatsapp_number_id)
        .eq('store_id', store.id)
        .eq('scope', 'store')
        .maybeSingle()
    ]);

    const loadError = contactError || integrationError;
    if (loadError) return Response.json({ error: loadError.message }, { status: 400 });
    if (!contact) return Response.json({ error: 'Contato da conversa não encontrado.' }, { status: 404 });

    const expectedStoragePath = whatsappProfilePictureStoragePath(store.id, contact.id);
    const parsedCache = whatsappProfilePictureMetadata(contact.metadata);
    const cache = {
      ...parsedCache,
      storagePath: parsedCache.storagePath === expectedStoragePath ? parsedCache.storagePath : ''
    };
    const storedPicture = await readStoredWhatsappProfilePicture(supabase, store.id, contact.id);
    const needsRefresh = !storedPicture && cache.storagePath
      ? true
      : whatsappProfilePictureNeedsRefresh(cache);
    const refreshInput = {
      supabase,
      storeId: store.id,
      conversationId,
      contact,
      instanceName: cleanText(integration?.instance_name),
      persist: process.env.VERCEL_ENV === 'production'
    };

    if (storedPicture) {
      console.info('[WhatsApp Profile Picture]', {
        event: 'cache_hit',
        store: shortId(store.id),
        conversation: shortId(conversationId),
        contact: shortId(contact.id),
        stale: needsRefresh
      });

      if (needsRefresh && refreshInput.instanceName && refreshInput.persist) {
        after(async () => {
          await refreshWhatsappProfilePicture(refreshInput);
        });
      }

      return pictureResponse(storedPicture, needsRefresh ? 'stale_cache' : 'cache_hit');
    }

    if (!needsRefresh) {
      return emptyPicture(cache.lastStatus || 'refresh_deferred');
    }

    console.info('[WhatsApp Profile Picture]', {
      event: 'cache_miss',
      store: shortId(store.id),
      conversation: shortId(conversationId),
      contact: shortId(contact.id),
      previous_status: cache.lastStatus || null
    });

    if (!refreshInput.instanceName) {
      console.warn('[WhatsApp Profile Picture]', {
        event: 'integration_unavailable',
        store: shortId(store.id),
        conversation: shortId(conversationId),
        contact: shortId(contact.id)
      });
      return emptyPicture('integration_unavailable');
    }

    const refreshed = await refreshWhatsappProfilePicture(refreshInput);
    if (refreshed.picture) {
      return pictureResponse(refreshed.picture, refreshInput.persist ? 'refreshed_cache' : 'preview_transient');
    }

    return emptyPicture(refreshed.status);
  } catch (error) {
    console.error('[WhatsApp Profile Picture]', {
      event: 'proxy_failed',
      conversation: shortId(conversationId),
      error: error instanceof Error ? error.message.slice(0, 180) : 'unknown'
    });
    return emptyPicture('proxy_error');
  }
}
