type SupabaseError = {
  code?: string | null;
  message?: string | null;
};

type SupabaseLike = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: SupabaseError | null }>;
  from(table: string): any;
};

export type WhatsappNumberChannel = {
  id?: string | null;
  phone_number_id?: string | null;
  settings?: Record<string, unknown> | null;
};

function text(value: unknown) {
  return String(value || '').trim();
}

export function isEvolutionWhatsappNumber(number: WhatsappNumberChannel, integration?: unknown) {
  const configuredProvider = text(number?.settings?.provider).toLowerCase();
  return Boolean(
    integration ||
    configuredProvider === 'evolution' ||
    text(number?.phone_number_id).startsWith('evolution:')
  );
}

export function isMissingWhatsappVaultRpc(error: SupabaseError | null | undefined) {
  const code = text(error?.code).toUpperCase();
  const message = text(error?.message).toLowerCase();
  return code === 'PGRST202' || code === '42883' || (
    message.includes('function') &&
    (message.includes('not found') || message.includes('schema cache') || message.includes('does not exist'))
  );
}

export async function resolveMetaWhatsappAccessToken(
  supabase: SupabaseLike,
  number: WhatsappNumberChannel,
  integration?: unknown
) {
  if (isEvolutionWhatsappNumber(number, integration)) return '';

  const numberId = text(number?.id);
  if (!numberId) return '';

  const { data, error } = await supabase.rpc('get_whatsapp_access_token', {
    p_whatsapp_number_id: numberId
  });

  if (!error) return text(data);
  if (!isMissingWhatsappVaultRpc(error)) throw new Error('Não foi possível acessar a credencial segura do WhatsApp.');

  // Compatibilidade temporária para deploys em que a migration aditiva ainda
  // não existe. A consulta é estreita e só ocorre para o canal Meta Cloud.
  const { data: legacy, error: legacyError } = await supabase
    .from('whatsapp_numbers')
    .select('access_token')
    .eq('id', numberId)
    .maybeSingle();

  if (legacyError) throw new Error('Não foi possível acessar a credencial do WhatsApp.');
  return text(legacy?.access_token);
}

export async function hasMetaWhatsappAccessToken(
  supabase: SupabaseLike,
  number: WhatsappNumberChannel,
  integration?: unknown
) {
  if (isEvolutionWhatsappNumber(number, integration)) return false;

  const numberId = text(number?.id);
  if (!numberId) return false;

  const { data, error } = await supabase.rpc('has_whatsapp_access_token', {
    p_whatsapp_number_id: numberId
  });

  if (!error) return data === true;
  if (!isMissingWhatsappVaultRpc(error)) throw new Error('Não foi possível conferir a credencial segura do WhatsApp.');

  const { data: legacy, error: legacyError } = await supabase
    .from('whatsapp_numbers')
    .select('access_token')
    .eq('id', numberId)
    .maybeSingle();

  if (legacyError) throw new Error('Não foi possível conferir a credencial do WhatsApp.');
  return Boolean(text(legacy?.access_token));
}
