import type { Device, Draft } from './CampaignVisualEditorModel';

const DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i;

function isDataImage(value: string) {
  return DATA_URL_PATTERN.test(String(value || ''));
}

function extensionFromDataUrl(value: string) {
  const match = value.match(/^data:image\/(png|jpe?g|webp);base64,/i);
  const type = String(match?.[1] || 'jpg').toLowerCase();
  return type === 'jpeg' ? 'jpg' : type;
}

function dataUrlToFile(value: string, name: string) {
  const [metadata, payload] = value.split(',');
  const mime = metadata.match(/^data:([^;]+);base64$/i)?.[1] || 'image/jpeg';
  const bytes = atob(payload || '');
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new File([array], `${name}.${extensionFromDataUrl(value)}`, { type: mime });
}

async function uploadDataImage(
  value: string,
  kind: string,
  slug: string,
  headers: Record<string, string>
) {
  if (!isDataImage(value)) return value;
  const formData = new FormData();
  formData.append('file', dataUrlToFile(value, kind));
  formData.append('kind', kind);
  formData.append('slug', slug || 'landing');

  const response = await fetch('/api/master/campaign-assets', {
    method: 'POST',
    headers,
    body: formData
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Falha ao enviar ${kind}.`);
  return String(result.public_url || '');
}

export async function persistCampaignDraftAssets(
  source: Draft,
  campaign: any,
  headers: Record<string, string>
): Promise<Draft> {
  const draft = JSON.parse(JSON.stringify(source)) as Draft & { sections?: Array<{ blocks?: Array<{ id?: string; image?: string }> }> };
  const slug = String(campaign?.slug || campaign?.id || 'landing');
  const backgroundKinds: Record<Device, string> = {
    desktop: 'hero',
    tablet: 'tablet-hero',
    mobile: 'mobile-hero'
  };

  for (const device of ['desktop', 'tablet', 'mobile'] as Device[]) {
    if (draft.backgroundMode[device] === 'custom' && draft.backgroundData[device]) {
      draft.backgroundData[device] = await uploadDataImage(
        draft.backgroundData[device],
        backgroundKinds[device],
        slug,
        headers
      );
    }
  }

  if (draft.headerLogo) draft.headerLogo = await uploadDataImage(draft.headerLogo, 'header', slug, headers);
  if (draft.eventLogo) draft.eventLogo = await uploadDataImage(draft.eventLogo, 'logo', slug, headers);
  if (draft.mediaImage) draft.mediaImage = await uploadDataImage(draft.mediaImage, 'media', slug, headers);

  for (const section of draft.sections || []) {
    for (const block of section.blocks || []) {
      if (block.image) block.image = await uploadDataImage(block.image, 'media', slug, headers);
    }
  }

  return draft as Draft;
}

export function publicCampaignUrl(slug: string) {
  const path = `/campanha/simulador?campanha=${encodeURIComponent(slug)}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}
