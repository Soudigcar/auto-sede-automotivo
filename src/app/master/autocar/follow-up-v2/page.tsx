import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { MasterAutocarFollowUpPersistedV2 } from '@/components/MasterAutocarFollowUpPersistedV2';

export default function MasterAutocarFollowUpV2Page() {
  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar/follow-up-v2"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7"><header><Link href="/master/autocar" prefetch={false} className="premium-button-secondary mb-4 inline-flex"><ArrowLeft size={15}/>Voltar para AUTOCAR</Link><div className="premium-eyebrow text-red-600">I.A AUTOCAR · SMART FOLLOW-UP</div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Follow-up V2 Integrado</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Configurações persistidas de Master, jornadas e lojas usando a mesma fonte de verdade da Intelligence V2. O AUTOPILOT inicial é um canário restrito à A4, com SAFE CORE, revalidação antes do envio e fallback para COPILOT quando houver dúvida.</p></header><MasterAutocarFollowUpPersistedV2 /></div></section></main>;
}
