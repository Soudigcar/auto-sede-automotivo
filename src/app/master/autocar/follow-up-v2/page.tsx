import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { MasterAutocarFollowUpV2 } from '@/components/MasterAutocarFollowUpV2';
import { MasterAutocarFollowUpStoreGovernanceV2 } from '@/components/MasterAutocarFollowUpStoreGovernanceV2';

export default function MasterAutocarFollowUpV2Page() {
  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar/follow-up-v2"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7"><header><Link href="/master/autocar" prefetch={false} className="premium-button-secondary mb-4 inline-flex"><ArrowLeft size={15}/>Voltar para AUTOCAR</Link><div className="premium-eyebrow text-red-600">I.A AUTOCAR · SMART FOLLOW-UP</div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Configurações e Jornadas V2</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Protótipo governado em dry-run. Configura timing, limites, jornadas, indicadores de performance e herança por loja sem ativar scheduler, envio externo ou create_follow_up.</p></header><MasterAutocarFollowUpV2 /><div className="mt-5"><MasterAutocarFollowUpStoreGovernanceV2 /></div></div></section></main>;
}
