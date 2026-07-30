import { createAdminClient } from '@/lib/server/storeTeam';
import { defaultPortalSettings, normalizePortalSettings, type PortalSettings } from '@/lib/portalSettings';

function isMissingPortalTable(error: any) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes('portal_settings') && message.includes('schema cache');
}

export async function loadPortalSettings(options: { publishedOnly?: boolean } = {}): Promise<PortalSettings> {
  const publishedOnly = options.publishedOnly !== false;

  try {
    const supabase: any = createAdminClient();
    const { data, error } = await supabase
      .from('portal_settings')
      .select('*')
      .eq('key', 'official')
      .maybeSingle();

    if (error) {
      if (isMissingPortalTable(error)) return defaultPortalSettings;
      throw error;
    }

    if (!data) return defaultPortalSettings;
    const settings = normalizePortalSettings(data);
    if (publishedOnly && !settings.is_published) return defaultPortalSettings;
    return settings;
  } catch {
    return defaultPortalSettings;
  }
}

export { isMissingPortalTable };
