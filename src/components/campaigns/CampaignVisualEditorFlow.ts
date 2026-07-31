import type { Box, ContentKey, Device, DeviceLayout, Draft } from './CampaignVisualEditorModel';
import { clamp, contentKeys } from './CampaignVisualEditorModel';

export type ResponsiveTarget = 'tablet' | 'mobile';

export type FlowResponsiveSettings = {
  enabled: boolean;
  linked: Record<ResponsiveTarget, boolean>;
  syncBackground: Record<ResponsiveTarget, boolean>;
  version: 2;
};

export type FlowDeviceLayout = DeviceLayout & {
  textScale?: number;
  flowMode?: boolean;
};

export type FlowDraft = Draft & {
  responsive?: FlowResponsiveSettings;
  devices: Record<Device, FlowDeviceLayout>;
};

export type FlowMeasurement = {
  heroHeight: number;
  header?: Box;
  logo?: Box;
  simulator?: Box;
  content: Partial<Record<ContentKey, Box>>;
};

const DEFAULT_SETTINGS: FlowResponsiveSettings = {
  enabled: true,
  linked: { tablet: true, mobile: true },
  syncBackground: { tablet: true, mobile: true },
  version: 2
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

export function flowResponsiveSettings(draft: FlowDraft): FlowResponsiveSettings {
  const incoming: any = draft.responsive;
  const legacySync = typeof incoming?.syncBackground === 'boolean' ? incoming.syncBackground : undefined;
  return {
    enabled: incoming?.enabled !== false,
    linked: {
      tablet: incoming?.linked?.tablet !== false,
      mobile: incoming?.linked?.mobile !== false
    },
    syncBackground: {
      tablet: incoming?.syncBackground?.tablet ?? legacySync ?? true,
      mobile: incoming?.syncBackground?.mobile ?? legacySync ?? true
    },
    version: 2
  };
}

export function ensureFlowResponsive(draft: Draft): FlowDraft {
  const next = draft as FlowDraft;
  const settings = flowResponsiveSettings(next);
  return {
    ...next,
    responsive: settings,
    devices: {
      desktop: { ...next.devices.desktop, textScale: 1, flowMode: false },
      tablet: {
        ...next.devices.tablet,
        textScale: Number(next.devices.tablet.textScale ?? 0.84),
        flowMode: settings.enabled && settings.linked.tablet
      },
      mobile: {
        ...next.devices.mobile,
        textScale: Number(next.devices.mobile.textScale ?? 0.72),
        flowMode: settings.enabled && settings.linked.mobile
      }
    }
  };
}

const MINIMUM_FONT: Record<ResponsiveTarget, Record<ContentKey, number>> = {
  tablet: {
    eyebrow: 11,
    title: 40,
    description: 16,
    date: 11,
    location: 11,
    stores: 11,
    primaryButton: 14,
    secondaryButton: 14
  },
  mobile: {
    eyebrow: 10,
    title: 30,
    description: 15,
    date: 10,
    location: 10,
    stores: 10,
    primaryButton: 14,
    secondaryButton: 14
  }
};

export function responsiveFontSize(draftInput: Draft, key: ContentKey, target: ResponsiveTarget): number {
  const draft = ensureFlowResponsive(draftInput);
  const ratio = target === 'mobile' ? 0.7 : 0.84;
  return Math.max(MINIMUM_FONT[target][key], Math.round(draft.content[key].fontSize * ratio * 10) / 10);
}

function fallbackContent(draft: FlowDraft, target: ResponsiveTarget): Record<ContentKey, Box> {
  const desktop = draft.devices.desktop.content;
  const content = {} as Record<ContentKey, Box>;
  const x = target === 'mobile' ? 5 : 6;
  const width = target === 'mobile' ? 90 : 88;
  let cursor = target === 'mobile' ? 31 : 28;

  for (const key of contentKeys) {
    const isButton = key === 'primaryButton' || key === 'secondaryButton';
    if (target === 'tablet' && isButton) {
      const isSecondary = key === 'secondaryButton';
      content[key] = copyBox(desktop[key], { x: isSecondary ? 52 : 6, y: cursor, width: 42 });
      if (isSecondary) cursor += 7;
      continue;
    }

    content[key] = copyBox(desktop[key], { x, y: cursor, width });
    const font = responsiveFontSize(draft, key, target);
    const estimatedLines = key === 'title' ? (target === 'mobile' ? 3 : 2) : key === 'description' ? 3 : 1;
    const pixelHeight = font * Math.max(0.9, draft.content[key].lineHeight || 1.1) * estimatedLines + draft.content[key].paddingY * 2 + 24;
    const heroHeight = target === 'mobile' ? 2200 : 1800;
    cursor += Math.max(isButton ? 5.5 : 4, (pixelHeight / heroHeight) * 100) + 1;
  }

  return content;
}

export function deriveFlowLayout(draftInput: Draft, target: ResponsiveTarget): FlowDeviceLayout {
  const draft = ensureFlowResponsive(draftInput);
  const desktop = draft.devices.desktop;
  const current = draft.devices[target];
  const settings = flowResponsiveSettings(draft);
  const syncBackground = settings.syncBackground[target];
  const backgroundScale = syncBackground ? clamp(desktop.backgroundScale, 15, 100) : current.backgroundScale;
  const backgroundX = syncBackground ? desktop.backgroundX : current.backgroundX;
  const backgroundY = syncBackground ? desktop.backgroundY : current.backgroundY;

  if (target === 'mobile') {
    return {
      ...current,
      flowMode: true,
      textScale: 0.72,
      heroHeight: Math.max(1500, Math.round(desktop.heroHeight * 1.35)),
      backgroundScale,
      backgroundX,
      backgroundY,
      header: copyBox(desktop.header, { x: 6, y: 2.5, width: clamp(desktop.header.width * 2.4, 42, 68) }),
      logo: copyBox(desktop.logo, { x: 6, y: 8, width: clamp(desktop.logo.width * 2.2, 48, 76) }),
      content: fallbackContent(draft, target),
      simulator: copyBox(desktop.simulator, { x: 5, y: 64, width: 90 })
    };
  }

  return {
    ...current,
    flowMode: true,
    textScale: 0.84,
    heroHeight: Math.max(1300, Math.round(desktop.heroHeight * 1.18)),
    backgroundScale,
    backgroundX,
    backgroundY,
    header: copyBox(desktop.header, { x: 5, y: 2.5, width: clamp(desktop.header.width * 1.55, 24, 42) }),
    logo: copyBox(desktop.logo, { x: 6, y: 8, width: clamp(desktop.logo.width * 1.45, 30, 50) }),
    content: fallbackContent(draft, target),
    simulator: copyBox(desktop.simulator, { x: 6, y: 58, width: 88 })
  };
}

export function synchronizeFlow(
  draftInput: Draft,
  options: { force?: ResponsiveTarget[]; onlyLinked?: boolean } = {}
): FlowDraft {
  const draft = ensureFlowResponsive(draftInput);
  const settings = flowResponsiveSettings(draft);
  const force = new Set(options.force || []);
  const devices = { ...draft.devices };

  for (const target of ['tablet', 'mobile'] as ResponsiveTarget[]) {
    if (force.has(target) || (settings.enabled && settings.linked[target])) {
      devices[target] = deriveFlowLayout(draft, target);
    }
  }

  return {
    ...draft,
    responsive: settings,
    devices
  };
}

export function setFlowResponsiveEnabled(draftInput: Draft, enabled: boolean): FlowDraft {
  const draft = ensureFlowResponsive(draftInput);
  const settings = flowResponsiveSettings(draft);
  const next: FlowDraft = {
    ...draft,
    responsive: { ...settings, enabled },
    devices: {
      ...draft.devices,
      tablet: { ...draft.devices.tablet, flowMode: enabled && settings.linked.tablet },
      mobile: { ...draft.devices.mobile, flowMode: enabled && settings.linked.mobile }
    }
  };
  return enabled ? synchronizeFlow(next) : next;
}

export function setFlowDeviceLinked(draftInput: Draft, target: ResponsiveTarget, linked: boolean): FlowDraft {
  const draft = ensureFlowResponsive(draftInput);
  const settings = flowResponsiveSettings(draft);
  const next: FlowDraft = {
    ...draft,
    responsive: {
      ...settings,
      linked: { ...settings.linked, [target]: linked }
    },
    devices: {
      ...draft.devices,
      [target]: { ...draft.devices[target], flowMode: linked && settings.enabled }
    }
  };
  return linked ? synchronizeFlow(next, { force: [target] }) : next;
}

export function setFlowBackgroundSync(draftInput: Draft, target: ResponsiveTarget, enabled: boolean): FlowDraft {
  const draft = ensureFlowResponsive(draftInput);
  const settings = flowResponsiveSettings(draft);
  const next: FlowDraft = {
    ...draft,
    responsive: {
      ...settings,
      syncBackground: { ...settings.syncBackground, [target]: enabled }
    }
  };
  return enabled && settings.linked[target] ? synchronizeFlow(next, { force: [target] }) : next;
}

export function markFlowDeviceManual(draftInput: Draft, target: ResponsiveTarget): FlowDraft {
  const draft = ensureFlowResponsive(draftInput);
  const settings = flowResponsiveSettings(draft);
  return {
    ...draft,
    responsive: {
      ...settings,
      linked: { ...settings.linked, [target]: false }
    },
    devices: {
      ...draft.devices,
      [target]: { ...draft.devices[target], flowMode: false }
    }
  };
}

function measuredBox(measured: Box | undefined, fallback: Box): Box {
  if (!measured) return fallback;
  return {
    x: clamp(measured.x, 0, Math.max(0, 100 - measured.width)),
    y: clamp(measured.y, 0, 98),
    width: clamp(measured.width, 4, 100),
    visible: fallback.visible,
    locked: fallback.locked
  };
}

export function applyFlowMeasurement(draftInput: Draft, target: ResponsiveTarget, measurement?: FlowMeasurement | null): FlowDraft {
  const draft = ensureFlowResponsive(draftInput);
  if (!measurement) return markFlowDeviceManual(draft, target);
  const current = draft.devices[target];
  const content = { ...current.content };
  for (const key of contentKeys) content[key] = measuredBox(measurement.content[key], current.content[key]);
  const next: FlowDraft = {
    ...draft,
    devices: {
      ...draft.devices,
      [target]: {
        ...current,
        flowMode: false,
        heroHeight: clamp(Math.round(measurement.heroHeight), 600, 5000),
        header: measuredBox(measurement.header, current.header),
        logo: measuredBox(measurement.logo, current.logo),
        simulator: measuredBox(measurement.simulator, current.simulator),
        content
      }
    }
  };
  return markFlowDeviceManual(next, target);
}

export function forceFlowBoth(draftInput: Draft): FlowDraft {
  const draft = ensureFlowResponsive(draftInput);
  const settings = flowResponsiveSettings(draft);
  const next: FlowDraft = {
    ...draft,
    responsive: {
      ...settings,
      enabled: true,
      linked: { tablet: true, mobile: true }
    }
  };
  return synchronizeFlow(next, { force: ['tablet', 'mobile'] });
}

export function isFlowAuto(draftInput: Draft, device: Device): boolean {
  if (device === 'desktop') return false;
  const draft = ensureFlowResponsive(draftInput);
  const settings = flowResponsiveSettings(draft);
  return settings.enabled && settings.linked[device] && draft.devices[device].flowMode !== false;
}
