import { MasterSidebar } from '@/components/MasterSidebar';
import { LeadRoutingRulesManager } from '@/components/LeadRoutingRulesManager';

export default function MasterLeadRoutingPage(){
  return <main className="flex min-h-screen bg-zinc-50"><MasterSidebar active="/master/lead-routing"/><div className="min-w-0 flex-1"><LeadRoutingRulesManager scope="master"/></div></main>;
}
