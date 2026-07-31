import type { Box, ContentKey, Device, DeviceLayout, Draft } from './CampaignVisualEditorModel';
import { clamp, contentKeys } from './CampaignVisualEditorModel';

export type ResponsiveTarget = 'tablet' | 'mobile';

export type ResponsiveSettings = {
  enabled: boolean;
  linked: Record<ResponsiveTarget, boolean>;
  version: 1;
};

export type ResponsiveDeviceLayout = DeviceLayout & {
  textScale?: number;
};

export type ResponsiveDraft = Draft & {
  responsive?: ResponsiveSettings;
  devices: Record<Device, ResponsiveDeviceLayout>;
};

const DEFAULT_SETTINGS: ResponsiveSettings = {
  enabled: true,
  linked: { tablet: true, mobile: true },
  version: 1
};

function copyBox(source: Box, patch: Partial<Box>): Box {
  const width = clamp(Number(patch.width ?? source.width), 4, 100);
  return {
    ...source,
    ...patch,
    width,
    x: clamp(Number(patch.x ?? source.x), 0, Math.max(0, 100 - width)),
    y: clamp(Number(patch.y ?? source.y), 0, 98),
    visible: source.visible,
    locked: source.locked
  };
}

export function responsiveSettings(draft: ResponsiveDraft): ResponsiveSettings {
  const incoming = draft.responsive;
  return {
    enabled: incoming?.enabled !== false,
    linked: {
      tablet: incoming?.linked?.tablet !== false,
      mobile: incoming?.linked?.mobile !== false
    },
    version: 1
  };
}

export function ensureResponsive(draft: Draft): ResponsiveDraft {
  const next = draft as ResponsiveDraft;
  return {
    ...next,
    responsive: responsiveSettings(next),
    devices: {
      desktop: { ...next.devices.desktop, textScale: next.devices.desktop.textScale ?? 1 },
      tablet: { ...next.devices.tablet, textScale: next.devices.tablet.textScale ?? 0.78 },
      mobile: { ...next.devices.mobile, textScale: next.devices.mobile.textScale ?? 0.52 }
    }
  };
}

function contentHeightStep(key: ContentKey, target: ResponsiveTarget, draft: ResponsiveDraft): number {
  const visual = draft.content[key];
  const textLength = Math.max(visual.text?.trim().length || 0, key === 'title' ? 48 : key === 'description' ? 90 : 12);
  const scale = target === 'mobile' ? 0.52 : 0.78;
  const effectiveSize = Math.max(8, visual.fontSize * scale);
  const approximateWidthPx = target === 'mobile' ? 340 : 670;
  const charactersPerLine = Math.max(8, Math.floor(approximateWidthPx / Math.max(5, effectiveSize * 0.55)));
  const lines = Math.max(1, Math.ceil(textLength / charactersPerLine));
  const linePixels = effectiveSize * Math.max(0.8, visual.lineHeight || 1.1) * lines;
  const paddingPixels = (visual.paddingY || 0) * 2 * scale;
  const heroHeight = target === 'mobile' ? 3000 : 2350;
  const minimum: Record<ContentKey, number> = {
    eyebrow: target === 'mobile' ? 4.2 : 3.5,
    title: target === 'mobile' ? 9.5 : 8,
    description: target === 'mobile' ? 7.5 : 6.5,
    date: 4,
    location: 4,
    stores: 4,
    primaryButton: 5.5,
    secondaryButton: 5.5
  };
  return Math.max(minimum[key], ((linePixels + paddingPixels + 34) / heroHeight) * 100);
}

function buildContentLayout(draft: ResponsiveDraft, target: ResponsiveTarget): Record<ContentKey, Box> {
  const desktop = draft.devices.desktop.content;
  const result = {} as Record<ContentKey, Box>;
  let cursor = target === 'mobile' ? 15 : 14;
  const x = 6;
  const fullWidth = 88;

  for (const key of contentKeys) {
    const source = desktop[key];
    const isButton = key === 'primaryButton' || key === 'secondaryButton';
    const width = isButton && target === 'tablet' ? 42 : fullWidth;
    const buttonX = key === 'secondaryButton' && target === 'tablet' ? 52 : x;

    result[key] = copyBox(source, {
      x: buttonX,
      y: cursor,
      width
    });

    if (target === 'tablet' && key === 'primaryButton') continue;

    if (target === 'tablet' && key === 'secondaryButton') {
      cursor += Math.max(
        contentHeightStep('primaryButton', target, draft),
        contentHeightStep('secondaryButton', target, draft)
      ) + 1.3;
      continue;
    }

    cursor += contentHeightStep(key, target, draft) + (target === 'mobile' ? 0.8 : 0.65);
  }

  return result;
}

export function deriveResponsiveLayout(draftInput: Draft, target: ResponsiveTarget): ResponsiveDeviceLayout {
  const draft = ensureResponsive(draftInput);
  const desktop = draft.devices.desktop;
  const current = draft.devices[target];
  const content = buildContentLayout(draft, target);

  const lastContentBottom = Math.max(
    ...contentKeys.map((key) => content[key].y + contentHeightStep(key, target, draft))
  );

  if (target === 'mobile') {
    return {
      ...current,
      heroHeight: 3000,
      textScale: 0.52,
      backgroundScale: current.backgroundScale,
      backgroundX: current.backgroundX,
      backgroundY: current.backgroundY,
      header: copyBox(desktop.header, { x: 6, y: 2.2, width: clamp(desktop.header.width * 2.65, 42, 68) }),
      logo: copyBox(desktop.logo, { x: 6, y: 7.2, width: clamp(desktop.logo.width * 2.2, 42, 72) }),
      content,
      simulator: copyBox(desktop.simulator, {
        x: 5,
        y: clamp(lastContentBottom + 1.8, 55, 65),
        width: 90
      })
    };
  }

  return {
    ...current,
    heroHeight: Math.max(2250, Math.min(2600, Math.round(desktop.heroHeight * 1.9))),
    textScale: 0.78,
    backgroundScale: current.backgroundScale,
    backgroundX: current.backgroundX,
    backgroundY: current.backgroundY,
    header: copyBox(desktop.header, { x: 4, y: 2.4, width: clamp(desktop.header.width * 1.75, 24, 40) }),
    logo: copyBox(desktop.logo, { x: 6, y: 7.5, width: clamp(desktop.logo.width * 1.45, 28, 46) }),
    content,
    simulator: copyBox(desktop.simulator, {
      x: 6,
      y: clamp(lastContentBottom + 2, 50, 59),
      width: 88
    })
  };
}

export function synchronizeResponsive(
  draftInput: Draft,
  options: { force?: ResponsiveTarget[]; onlyLinked?: boolean } = {}
): ResponsiveDraft {
  let draft = ensureResponsive(draftInput);
  const settings = responsiveSettings(draft);
  const force = new Set(options.force || []);
  const targets: ResponsiveTarget[] = ['tablet', 'mobile'];
  const nextDevices = { ...draft.devices };

  for (const target of targets) {
    const shouldApply = force.has(target) || (settings.enabled && settings.linked[target]);
    if (shouldApply) nextDevices[target] = deriveResponsiveLayout(draft, target);
  }

  draft = {
    ...draft,
    responsive: settings,
    devices: nextDevices
  };
  return draft;
}

export function setResponsiveEnabled(draftInput: Draft, enabled: boolean): ResponsiveDraft {
  const draft = ensureResponsive(draftInput);
  const settings = responsiveSettings(draft);
  const next = { ...draft, responsive: { ...settings, enabled } };
  return enabled ? synchronizeResponsive(next, { onlyLinked: true }) : next;
}

export function setDeviceLinked(draftInput: Draft, target: ResponsiveTarget, linked: boolean): ResponsiveDraft {
  const draft = ensureResponsive(draftInput);
  const settings = responsiveSettings(draft);
  const next: ResponsiveDraft = {
    ...draft,
    responsive: {
      ...settings,
      linked: { ...settings.linked, [target]: linked }
    }
  };
  return linked ? synchronizeResponsive(next, { force: [target] }) : next;
}

export function markDeviceManual(draftInput: Draft, device: Device): ResponsiveDraft {
  const draft = ensureResponsive(draftInput);
  if (device === 'desktop') return draft;
  const settings = responsiveSettings(draft);
  return {
    ...draft,
    responsive: {
      ...settings,
      linked: { ...settings.linked, [device]: false }
    }
  };
}

export function forceResponsiveBoth(draftInput: Draft): ResponsiveDraft {
  const draft = ensureResponsive(draftInput);
  const settings = responsiveSettings(draft);
  const linkedDraft: ResponsiveDraft = {
    ...draft,
    responsive: {
      ...settings,
      enabled: true,
      linked: { tablet: true, mobile: true }
    }
  };
  return synchronizeResponsive(linkedDraft, { force: ['tablet', 'mobile'] });
}
