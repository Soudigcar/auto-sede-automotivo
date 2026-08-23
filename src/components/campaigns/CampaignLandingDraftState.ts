import { upgradeLandingDraft, type LandingDraftV3 } from './CampaignLandingSectionModel';
import type { Draft } from './CampaignVisualEditorModel';

const landingDrafts = new Map<string, LandingDraftV3>();

function keyFor(campaign: any) {
  return String(campaign?.id || campaign?.slug || 'landing');
}

/**
 * Consolida o estado visual tradicional com as seções v3 sem mutar nenhum
 * objeto recebido por props. As propriedades visuais mais recentes sempre
 * vêm do fallback; as seções editadas vêm do estado canônico compartilhado.
 */
export function getCanonicalLandingDraft(source: Draft, campaign: any): LandingDraftV3 {
  const fallback = upgradeLandingDraft(source, campaign);
  const stored = landingDrafts.get(keyFor(campaign));
  if (!stored) {
    landingDrafts.set(keyFor(campaign), fallback);
    return fallback;
  }
  const merged = upgradeLandingDraft({ ...fallback, sections: stored.sections }, campaign);
  landingDrafts.set(keyFor(campaign), merged);
  return merged;
}

export function setCanonicalLandingDraft(next: LandingDraftV3, campaign: any): LandingDraftV3 {
  const normalized = upgradeLandingDraft(next, campaign);
  landingDrafts.set(keyFor(campaign), normalized);
  return normalized;
}

export function resetCanonicalLandingDraft(source: Draft, campaign: any): LandingDraftV3 {
  const normalized = upgradeLandingDraft(source, campaign);
  landingDrafts.set(keyFor(campaign), normalized);
  return normalized;
}
