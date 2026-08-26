import { MasterSidebar } from '@/components/MasterSidebar';
import { MasterAutocarFollowUpV2 } from '@/components/MasterAutocarFollowUpV2';

export default function MasterAutocarFollowUpV2Page() {
  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7"><header><div className="premium-eyebrow text-red-600">I.A AUTOCAR · SMART FOLLOW-UP</div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Configurações e Jornadas V2</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Protótipo governado em dry-run. Configura timing, limites e jornadas sem ativar scheduler, envio externo ou create_follow_up.</p></header><MasterAutocarFollowUpV2 /></div></section></main>;
}
