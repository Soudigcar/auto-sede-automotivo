import type { Device, Draft } from './CampaignVisualEditorModel';
import {
  applyFlowMeasurement,
  ensureFlowResponsive,
  flowResponsiveSettings,
  forceFlowBoth,
  getCachedFlowMeasurement,
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
      Math.abs(layout.backgroundRotation - desktop.backgroundRotation) > 0.01 ||
      layout.backgroundFlipX !== desktop.backgroundFlipX ||
      layout.backgroundFlipY !== desktop.backgroundFlipY ||
      Math.abs(layout.cropX - desktop.cropX) > 0.01 ||
      Math.abs(layout.cropY - desktop.cropY) > 0.01 ||
      Math.abs(layout.cropWidth - desktop.cropWidth) > 0.01 ||
      Math.abs(layout.cropHeight - desktop.cropHeight) > 0.01 ||
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
  const normalized = ensureResponsive(draft);
  const settings = flowResponsiveSettings(normalized);
  if (!linked) {
    if (!settings.linked[target] || normalized.devices[target].flowMode === false) return normalized;
    const measurement = getCachedFlowMeasurement(target);
    return measurement ? applyFlowMeasurement(normalized, target, measurement) : markFlowDeviceManual(normalized, target);
  }
  return setFlowDeviceLinked(normalized, target, true);
}

export function markDeviceManual(draft: Draft, device: Device): ResponsiveDraft {
  if (device === 'desktop') return ensureResponsive(draft);
  const normalized = ensureResponsive(draft);
  const settings = flowResponsiveSettings(normalized);
  if (!settings.linked[device] || normalized.devices[device].flowMode === false) return normalized;
  const measurement = getCachedFlowMeasurement(device);
  return measurement ? applyFlowMeasurement(normalized, device, measurement) : markFlowDeviceManual(normalized, device);
}

export function forceResponsiveBoth(draft: Draft): ResponsiveDraft {
  const normalized = ensureFlowResponsive(draft);
  const configured: ResponsiveDraft = {
    ...normalized,
    responsive: {
      ...flowResponsiveSettings(normalized),
      enabled: true,
      linked: { tablet: true, mobile: true },
      syncBackground: { tablet: true, mobile: true },
      version: 2
    }
  };
  return forceFlowBoth(configured);
}