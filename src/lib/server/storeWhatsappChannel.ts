import { evolutionConnectionStatus } from '@/lib/server/managedWhatsappEvolution';
import { cleanText } from '@/lib/server/storeTeam';

export function whatsappProvider(number: any) {
  const configuredProvider = cleanText(number?.settings?.provider, 40).toLowerCase();
  if (configuredProvider === 'evolution') return 'evolution';

  return cleanText(number?.phone_number_id, 200).toLowerCase().startsWith('evolution:')
    ? 'evolution'
    : 'meta_cloud';
}

export function resolveEvolutionAvailability(integration: any, liveState?: any) {
  if (!integration) {
    return {
      connected: false,
      status: 'disconnected',
      last_known_status: 'disconnected',
      temporarily_unavailable: false,
      source: 'missing_integration'
    } as const;
  }

  if (liveState && !liveState.live_error) {
    const status = evolutionConnectionStatus(liveState.status);
    return {
      connected: status === 'connected',
      status,
      last_known_status: status,
      temporarily_unavailable: false,
      source: 'evolution_live'
    } as const;
  }

  const storedStatus = evolutionConnectionStatus(integration.status);
  if (storedStatus === 'connected') {
    return {
      connected: true,
      status: 'temporarily_unavailable',
      last_known_status: 'connected',
      temporarily_unavailable: true,
      source: 'stored_degraded'
    } as const;
  }

  return {
    connected: false,
    status: storedStatus,
    last_known_status: storedStatus,
    temporarily_unavailable: Boolean(liveState?.live_error),
    source: liveState?.live_error ? 'stored_unverified' : 'stored_status'
  } as const;
}

export function publicWhatsappNumber(number: any, integration: any, liveState?: any) {
  const provider = whatsappProvider(number);
  const availability = provider === 'evolution'
    ? resolveEvolutionAvailability(integration, liveState)
    : {
        connected: Boolean(number.is_active),
        status: number.status,
        last_known_status: number.status,
        temporarily_unavailable: false,
        source: 'meta_cloud'
      };

  return {
    id: number.id,
    label: number.label,
    phone_number: number.phone_number,
    phone_number_id: number.phone_number_id,
    status: number.status,
    is_active: number.is_active,
    provider,
    integration_status: availability.status,
    integration_last_known_status: availability.last_known_status,
    integration_temporarily_unavailable: availability.temporarily_unavailable,
    integration_status_source: availability.source,
    integration_live_error: provider === 'evolution'
      ? cleanText(liveState?.live_error, 300) || null
      : null,
    instance_name: provider === 'evolution'
      ? integration?.instance_name || cleanText(number?.settings?.instance_name, 200) || null
      : null
  };
}
