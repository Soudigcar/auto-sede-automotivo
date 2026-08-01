import type { Device, Draft } from './CampaignVisualEditorModel';
import {
  ensureFlowResponsive,
  flowResponsiveSettings,
  forceFlowBoth,
  markFlowDeviceManual,
  setFlowDeviceLinked,
  setFlowResponsiveEnabled,
  synchronizeFlow,
  type FlowDeviceLayout,
  type FlowDraft,
  type FlowResponsiveSettings,
  type ResponsiveTarget
} from './CampaignVisualEditorFlow';

export type { ResponsiveTarget };
export type ResponsiveSettings = FlowResponsiveSettings;
export type ResponsiveDeviceLayout = FlowDeviceLayout;
export type ResponsiveDraft = FlowDraft;

function detectManualBackground(draft: FlowDraft): FlowDraft {
  const settings = flowResponsiveSettings(draft);
  const desktop = draft.devices.desktop;
  const syncBackground = { ...settings.syncBackground };

  for (const target of ['tablet', 'mobile'] as ResponsiveTarget[]) {
    const layout = draft.devices[target];
    const differs =
      Math.abs(layout.backgroundScale - desktop.backgroundScale) > 0.01 ||
      Math.abs(layout.backgroundX - desktop.backgroundX) > 0.01 ||
      Math.abs(layout.backgroundY - desktop.backgroundY) > 0.01 ||
      draft.backgroundMode[target] !== draft.backgroundMode.desktop ||
      (draft.backgroundMode.desktop === 'custom' && draft.backgroundData[target] !== draft.backgroundData.desktop);
    if (differs && syncBackground[target]) syncBackground[target] = false;
  }

  return {
    ...draft,
    responsive: { ...settings, syncBackground }
  };
}

export function responsiveSettings(draft: ResponsiveDraft): ResponsiveSettings {
  return flowResponsiveSettings(draft);
}

export function ensureResponsive(draft: Draft): ResponsiveDraft {
  return detectManualBackground(ensureFlowResponsive(draft));
}

export function deriveResponsiveLayout(draft: Draft, target: ResponsiveTarget): ResponsiveDeviceLayout {
  return synchronizeFlow(ensureResponsive(draft), { force: [target] }).devices[target];
}

export function synchronizeResponsive(
  draft: Draft,
  options: { force?: ResponsiveTarget[]; onlyLinked?: boolean } = {}
): ResponsiveDraft {
  return synchronizeFlow(ensureResponsive(draft), options);
}

export function setResponsiveEnabled(draft: Draft, enabled: boolean): ResponsiveDraft {
  return setFlowResponsiveEnabled(ensureResponsive(draft), enabled);
}

export function setDeviceLinked(draft: Draft, target: ResponsiveTarget, linked: boolean): ResponsiveDraft {
  return setFlowDeviceLinked(ensureResponsive(draft), target, linked);
}

export function markDeviceManual(draft: Draft, device: Device): ResponsiveDraft {
  if (device === 'desktop') return ensureResponsive(draft);
  return markFlowDeviceManual(ensureResponsive(draft), device);
}

export function forceResponsiveBoth(draft: Draft): ResponsiveDraft {
  const normalized = ensureFlowResponsive(draft);
  return forceFlowBoth({
    ...normalized,
    responsive: {
      ...flowResponsiveSettings(normalized),
      enabled: true,
      linked: { tablet: true, mobile: true },
      syncBackground: { tablet: true, mobile: true },
      version: 2
    }
  });
}
