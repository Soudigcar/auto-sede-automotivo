import { EventCampaignLanding } from '@/components/campaigns/EventCampaignLanding';

type SearchValue = string | string[] | undefined;

export default async function PermanentCampaignSimulatorPage({
  searchParams
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const resolvedSearchParams = await searchParams;
  const campaignParam = resolvedSearchParams.campanha;
  const campaignIdParam = resolvedSearchParams.campanha_id;
  const campaignSlug = Array.isArray(campaignParam) ? campaignParam[0] : campaignParam;
  const campaignId = Array.isArray(campaignIdParam) ? campaignIdParam[0] : campaignIdParam;

  return <EventCampaignLanding campaignId={campaignId || ''} campaignSlug={campaignSlug || ''} />;
}
