import { evolutionInstanceName } from '@/lib/server/evolution';

export type EvolutionChannelType = 'primary' | 'employee';

export type EvolutionChannelIdentity = {
  scope: 'master' | 'store';
  storeId: string | null;
  channelType: EvolutionChannelType;
  ownerUserId: string | null;
};

function normalizedKey(value: string, label: string) {
  const normalized = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!normalized) throw new Error(`${label} inválido para criar a instância WhatsApp.`);
  return normalized;
}

export function evolutionPrimaryInstanceName(scope: 'master' | 'store', storeId: string | null) {
  if (scope === 'master') return evolutionInstanceName('master');
  if (!storeId) throw new Error('Loja inválida para criar a instância WhatsApp principal.');

  // Mantém exatamente o padrão legado do WhatsApp principal da loja.
  return evolutionInstanceName(storeId);
}

export function evolutionEmployeeInstanceName(storeId: string, ownerUserId: string) {
  const storeKey = normalizedKey(storeId, 'Loja');
  const ownerKey = normalizedKey(ownerUserId, 'Colaborador');

  // Prefixo diferente impede colisão com a instância principal existente.
  return evolutionInstanceName(`${storeKey}_employee_${ownerKey}`);
}

export function validateEvolutionChannelIdentity(identity: EvolutionChannelIdentity) {
  if (identity.scope === 'master') {
    if (identity.storeId !== null || identity.channelType !== 'primary' || identity.ownerUserId !== null) {
      throw new Error('Canal Master inválido. A Master aceita somente o canal principal sem colaborador proprietário.');
    }
    return identity;
  }

  if (!identity.storeId) throw new Error('Canal de loja sem store_id.');

  if (identity.channelType === 'primary') {
    if (identity.ownerUserId !== null) throw new Error('O WhatsApp principal da loja não pode possuir colaborador proprietário.');
    return identity;
  }

  if (!identity.ownerUserId) throw new Error('Canal de colaborador sem owner_user_id.');
  return identity;
}
