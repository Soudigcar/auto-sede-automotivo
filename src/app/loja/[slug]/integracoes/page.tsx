'use client';

import { useStorePortal } from '@/components/StorePortalShell';
import { WhatsappEvolutionPanel } from '@/components/WhatsappEvolutionPanel';

export default function StoreIntegrationsPage() {
  const portal = useStorePortal();

  return (
    <WhatsappEvolutionPanel
      scope="store"
      storeName={portal.store.store_name}
      storeSlug={portal.store.slug}
    />
  );
}
