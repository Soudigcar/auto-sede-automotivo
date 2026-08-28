import { createClient } from '@/lib/supabase';

export type StorePortalContextResult =
  | {
      status: 'ok';
      profile: any;
      store: any;
      permissions: string[];
      menu: any[];
      scope_label: string;
      billing: {
        access_preserved: boolean;
        enforced: boolean;
        mode: 'observe';
        reason: string;
        observed_allowed: boolean;
        observed_reason: string;
        subscription_status: string | null;
      };
    }
  | {
      status: 'unauthenticated' | 'forbidden' | 'store_not_found' | 'error';
      profile: null;
      store: null;
      permissions: string[];
      menu: any[];
      scope_label: string;
      error: string;
    };

export async function getStorePortalContext(slug: string): Promise<StorePortalContextResult> {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    return {
      status: 'unauthenticated',
      profile: null,
      store: null,
      permissions: [],
      menu: [],
      scope_label: '',
      error: 'Sessão não encontrada.'
    };
  }

  try {
    const response = await fetch(`/api/store/portal/context?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const payload = await response.json();

    if (response.ok && payload.status === 'ok') return payload;

    const status = response.status === 401
      ? 'unauthenticated'
      : response.status === 404
        ? 'store_not_found'
        : response.status === 403
          ? 'forbidden'
          : 'error';

    return {
      status,
      profile: null,
      store: null,
      permissions: [],
      menu: [],
      scope_label: '',
      error: payload.error || 'Não foi possível validar o Portal da Loja.'
    };
  } catch {
    return {
      status: 'error',
      profile: null,
      store: null,
      permissions: [],
      menu: [],
      scope_label: '',
      error: 'Falha de comunicação ao validar o Portal da Loja.'
    };
  }
}
