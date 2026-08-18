import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { RequestSecurityError } from './requestSecurity';

function clientFingerprint(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = request.headers.get('x-real-ip') || forwarded || 'unknown';
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret) throw new RequestSecurityError('Proteção de tráfego indisponível.', 503);
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export async function enforceRateLimit(request: Request, scope: string, maxHits: number, windowSeconds: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new RequestSecurityError('Proteção de tráfego indisponível.', 503);

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc('consume_api_rate_limit', {
    p_scope: scope,
    p_key_hash: clientFingerprint(request),
    p_window_seconds: windowSeconds,
    p_max_hits: maxHits
  });
  if (error) throw new RequestSecurityError('Proteção de tráfego indisponível.', 503);
  if (data !== true) throw new RequestSecurityError('Muitas solicitações. Aguarde e tente novamente.', 429);
}
