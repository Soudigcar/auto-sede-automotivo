import { permanentRedirect } from 'next/navigation';

type SearchValue = string | string[] | undefined;

export default async function LegacyCampaignLandingPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const [{ slug }, currentSearchParams] = await Promise.all([params, searchParams]);
  const target = new URLSearchParams();

  target.set('campanha', slug);

  for (const [key, value] of Object.entries(currentSearchParams)) {
    if (key === 'campanha' || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => target.append(key, item));
    else target.set(key, value);
  }

  permanentRedirect(`/campanha/simulador?${target.toString()}`);
}
