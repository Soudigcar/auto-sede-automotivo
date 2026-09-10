import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { secureFetchHtmlPage, secureFetchImage } from '@/lib/server/secureRemoteFetch';
import { uniqueVehicleImages } from '@/lib/vehicleCatalogOptions';
import { extractTargetVehicle } from '@/lib/server/vehicleTargetExtraction';

export type ImportedVehiclePage = ReturnType<typeof extractTargetVehicle>;

type DownloadedImage = {
  sourceUrl: string;
  buffer: Buffer;
  contentType: string;
  exactHash: string;
  visualHash: string;
  width: number;
  height: number;
  order: number;
};

function hammingDistance(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (xor) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

async function visualHash(buffer: Buffer) {
  const pixels = await sharp(buffer).rotate().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const offset = row * 9 + column;
      hash = (hash << 1n) | BigInt(pixels[offset] > pixels[offset + 1] ? 1 : 0);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

async function downloadImage(sourceUrl: string, order: number): Promise<DownloadedImage> {
  const remote = await secureFetchImage(sourceUrl);
  const contentType = remote.contentType;
  const buffer = remote.body;
  if (buffer.length < 1_500) throw new Error('Imagem fora do tamanho permitido.');
  const metadata = await sharp(buffer).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (width && height && (width < 160 || height < 120)) throw new Error('Miniatura muito pequena.');
  return {
    sourceUrl,
    buffer,
    contentType,
    exactHash: createHash('sha256').update(buffer).digest('hex'),
    visualHash: await visualHash(buffer),
    width,
    height,
    order
  };
}

function isDuplicateImage(left: DownloadedImage, right: DownloadedImage) {
  if (left.exactHash === right.exactHash) return true;
  const leftRatio = left.height ? left.width / left.height : 0;
  const rightRatio = right.height ? right.width / right.height : 0;
  if (leftRatio && rightRatio && Math.abs(leftRatio - rightRatio) > 0.08) return false;
  return hammingDistance(left.visualHash, right.visualHash) <= 7;
}

async function downloadDistinctImages(urls: string[], limit = 8) {
  const candidates = uniqueVehicleImages(urls, 20);
  const unique: DownloadedImage[] = [];

  for (let start = 0; start < candidates.length; start += 4) {
    const batch = candidates.slice(start, start + 4);
    const results = await Promise.allSettled(batch.map((url, index) => downloadImage(url, start + index)));
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const image = result.value;
      const duplicateIndex = unique.findIndex((existing) => isDuplicateImage(existing, image));
      if (duplicateIndex < 0) unique.push(image);
      else {
        const existing = unique[duplicateIndex];
        const existingArea = existing.width * existing.height;
        const newArea = image.width * image.height;
        if (newArea > existingArea * 1.15) unique[duplicateIndex] = { ...image, order: existing.order };
      }
    }
    if (unique.length >= limit) break;
  }

  return unique.sort((a, b) => a.order - b.order).slice(0, limit);
}

async function uploadImages(images: DownloadedImage[]) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!serviceKey || !supabaseUrl) throw new Error('Supabase Storage não configurado.');
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const folder = `imported-${Date.now()}`;
  const uploaded: string[] = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const extension = image.contentType.includes('png') ? 'png' : image.contentType.includes('webp') ? 'webp' : 'jpg';
    const filePath = `${folder}/${Date.now()}-${index + 1}.${extension}`;
    const { error } = await supabase.storage.from('vehicle-images').upload(filePath, image.buffer, {
      contentType: image.contentType,
      upsert: true
    });
    if (error) continue;
    uploaded.push(supabase.storage.from('vehicle-images').getPublicUrl(filePath).data.publicUrl);
  }
  return uploaded;
}

export async function inspectVehiclePage(url: string): Promise<ImportedVehiclePage> {
  const page = await secureFetchHtmlPage(url);
  return extractTargetVehicle(page.html, page.finalUrl);
}

export async function importDistinctVehicleImages(values: string[], limit = 8) {
  const downloaded = await downloadDistinctImages(values, limit);
  const uploadedImages = await uploadImages(downloaded);
  return {
    uploadedImages,
    sourceCount: uniqueVehicleImages(values, 20).length,
    uniqueCount: downloaded.length
  };
}
