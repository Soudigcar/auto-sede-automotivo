'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PROFILE_PICTURE_PRELOAD_LIMIT = 20;
const PROFILE_PICTURE_MAX_CONCURRENCY = 3;
const PROFILE_PICTURE_SESSION_CACHE_LIMIT = 200;

type SessionEntry = {
  status: 'available' | 'missing';
  url: string;
};

type QueueItem<T> = {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type HookInput = {
  enabled: boolean;
  slug: string;
  conversations: any[];
  selectedId: string;
  selectedConversation?: any | null;
  getAccessToken: () => Promise<string>;
};

const sessionPictures = new Map<string, SessionEntry>();
const pictureRequests = new Map<string, Promise<SessionEntry>>();
const decodeFailures = new Map<string, number>();
const queue: Array<QueueItem<SessionEntry>> = [];
let activeRequests = 0;

function isEvolutionConversation(conversation: any) {
  return conversation?.number?.provider === 'evolution';
}

function legacyConversationPicture(conversation: any) {
  const contact = conversation?.contact || {};
  const metadata = contact?.metadata || {};
  const conversationMetadata = conversation?.metadata || {};
  return String(
    contact?.profile_picture_url ||
    contact?.profile_picture ||
    contact?.avatar_url ||
    contact?.photo_url ||
    metadata?.profile_picture_url ||
    metadata?.profilePictureUrl ||
    metadata?.avatar_url ||
    metadata?.photo_url ||
    conversationMetadata?.profile_picture_url ||
    conversationMetadata?.profilePictureUrl ||
    ''
  ).trim();
}

function pictureKey(slug: string, conversation: any) {
  const contactId = String(conversation?.contact?.id || '').trim();
  return contactId ? `${slug}:${contactId}` : '';
}

function evictOldestSessionPicture() {
  if (sessionPictures.size < PROFILE_PICTURE_SESSION_CACHE_LIMIT) return;
  const oldestKey = sessionPictures.keys().next().value;
  if (!oldestKey) return;
  const entry = sessionPictures.get(oldestKey);
  if (entry?.url) URL.revokeObjectURL(entry.url);
  sessionPictures.delete(oldestKey);
  decodeFailures.delete(oldestKey);
}

function pumpQueue() {
  while (activeRequests < PROFILE_PICTURE_MAX_CONCURRENCY && queue.length) {
    const item = queue.shift();
    if (!item) return;
    activeRequests += 1;
    void item.task()
      .then(item.resolve, item.reject)
      .finally(() => {
        activeRequests -= 1;
        pumpQueue();
      });
  }
}

function enqueue(task: () => Promise<SessionEntry>) {
  return new Promise<SessionEntry>((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pumpQueue();
  });
}

function loadPicture(slug: string, conversation: any, accessToken: string) {
  const key = pictureKey(slug, conversation);
  if (!key || !isEvolutionConversation(conversation)) {
    return Promise.resolve({ status: 'missing', url: '' } satisfies SessionEntry);
  }

  const cached = sessionPictures.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = pictureRequests.get(key);
  if (pending) return pending;

  const request = enqueue(async () => {
    const query = new URLSearchParams({
      slug,
      conversation_id: String(conversation.id || '')
    });
    const response = await fetch(`/api/store-whatsapp/profile-picture?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });

    if (response.status === 204) {
      const missing = { status: 'missing', url: '' } satisfies SessionEntry;
      sessionPictures.set(key, missing);
      return missing;
    }
    if (!response.ok) throw new Error(`Foto do WhatsApp indisponível (${response.status}).`);

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const blob = await response.blob();
    if (!contentType.startsWith('image/') || !blob.size) {
      throw new Error('O proxy não retornou uma imagem válida.');
    }

    evictOldestSessionPicture();
    const available = {
      status: 'available',
      url: URL.createObjectURL(blob)
    } satisfies SessionEntry;
    sessionPictures.set(key, available);
    return available;
  }).finally(() => {
    pictureRequests.delete(key);
  });

  pictureRequests.set(key, request);
  return request;
}

export function useStoreWhatsappProfilePictures(input: HookInput) {
  const [renderVersion, setRenderVersion] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const getAccessTokenRef = useRef(input.getAccessToken);
  const accessTokenRequestRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    getAccessTokenRef.current = input.getAccessToken;
  }, [input.getAccessToken]);

  const getAccessToken = useCallback(() => {
    if (accessTokenRequestRef.current) return accessTokenRequestRef.current;
    const pending = getAccessTokenRef.current();
    accessTokenRequestRef.current = pending;
    const clearPending = () => {
      if (accessTokenRequestRef.current === pending) accessTokenRequestRef.current = null;
    };
    void pending.then(clearPending, clearPending);
    return pending;
  }, []);

  useEffect(() => {
    if (!input.enabled || !input.slug || !input.conversations.length) return;

    const selected = input.selectedConversation ||
      input.conversations.find((conversation) => conversation.id === input.selectedId);
    const candidates = [selected, ...input.conversations]
      .filter((conversation): conversation is any => Boolean(conversation && isEvolutionConversation(conversation)))
      .filter((conversation, index, items) => {
        const key = pictureKey(input.slug, conversation);
        return Boolean(key) && items.findIndex((item) => pictureKey(input.slug, item) === key) === index;
      })
      .slice(0, PROFILE_PICTURE_PRELOAD_LIMIT);

    if (!candidates.length) return;
    let cancelled = false;

    async function preload() {
      const accessToken = await getAccessToken();
      if (!accessToken || cancelled) return;

      await Promise.allSettled(candidates.map(async (conversation) => {
        await loadPicture(input.slug, conversation, accessToken);
        if (!cancelled) setRenderVersion((current) => current + 1);
      }));
    }

    void preload();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, input.conversations, input.enabled, input.selectedConversation, input.selectedId, input.slug, retryNonce]);

  const ensureProfilePicture = useCallback(async (conversation: any) => {
    if (!input.enabled || !input.slug || !isEvolutionConversation(conversation)) return;
    const key = pictureKey(input.slug, conversation);
    if (!key || sessionPictures.has(key)) return;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      await loadPicture(input.slug, conversation, accessToken);
      setRenderVersion((current) => current + 1);
    } catch {
      // A ausência ou indisponibilidade temporária mantém o fallback de iniciais.
      // Uma nova montagem visível pode tentar novamente, respeitando o retry do backend.
    }
  }, [getAccessToken, input.enabled, input.slug]);

  const getProfilePicture = useCallback((conversation: any) => {
    if (!isEvolutionConversation(conversation)) return legacyConversationPicture(conversation);
    const key = pictureKey(input.slug, conversation);
    return key ? sessionPictures.get(key)?.url || '' : '';
  }, [input.slug, renderVersion]);

  const handleProfilePictureError = useCallback((conversation: any) => {
    const key = pictureKey(input.slug, conversation);
    if (!key) return;
    const current = sessionPictures.get(key);
    if (current?.url) URL.revokeObjectURL(current.url);

    const failures = (decodeFailures.get(key) || 0) + 1;
    decodeFailures.set(key, failures);
    if (failures < 2) {
      sessionPictures.delete(key);
    } else {
      sessionPictures.set(key, { status: 'missing', url: '' });
    }
    setRenderVersion((value) => value + 1);
    if (failures < 2) setRetryNonce((value) => value + 1);
  }, [input.slug]);

  return { getProfilePicture, ensureProfilePicture, handleProfilePictureError };
}
