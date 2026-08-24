import sharp from 'sharp';

const ICONS: Record<string, { size: number; maskable?: boolean }> = {
  'icon-192.png': { size: 192 },
  'icon-512.png': { size: 512 },
  'icon-maskable-512.png': { size: 512, maskable: true },
  'apple-touch-icon.png': { size: 180 }
};

function iconSvg(size: number, maskable = false) {
  const outerPadding = maskable ? Math.round(size * 0.18) : Math.round(size * 0.1);
  const innerSize = size - outerPadding * 2;
  const radius = Math.round(size * 0.16);
  const bodyX = Math.round(outerPadding + innerSize * 0.15);
  const bodyWidth = Math.round(innerSize * 0.7);
  const bodyY = Math.round(outerPadding + innerSize * 0.56);
  const bodyHeight = Math.round(innerSize * 0.18);
  const roofLeft = Math.round(outerPadding + innerSize * 0.28);
  const roofRight = Math.round(outerPadding + innerSize * 0.72);
  const roofTopLeft = Math.round(outerPadding + innerSize * 0.38);
  const roofTopRight = Math.round(outerPadding + innerSize * 0.62);
  const roofY = Math.round(outerPadding + innerSize * 0.38);
  const wheelRadius = Math.max(3, Math.round(size * 0.045));
  const wheelY = bodyY + bodyHeight;
  const wheelLeftX = Math.round(outerPadding + innerSize * 0.3);
  const wheelRightX = Math.round(outerPadding + innerSize * 0.7);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${maskable ? 0 : Math.round(size * 0.2)}" fill="#070A12"/>
    <rect x="${outerPadding}" y="${outerPadding}" width="${innerSize}" height="${innerSize}" rx="${radius}" fill="#DC2626"/>
    <rect x="${bodyX}" y="${bodyY}" width="${bodyWidth}" height="${bodyHeight}" rx="${Math.round(size * 0.035)}" fill="#FFFFFF"/>
    <path d="M ${roofLeft} ${bodyY} L ${roofTopLeft} ${roofY} L ${roofTopRight} ${roofY} L ${roofRight} ${bodyY} Z" fill="#FFFFFF"/>
    <circle cx="${wheelLeftX}" cy="${wheelY}" r="${wheelRadius}" fill="#070A12"/>
    <circle cx="${wheelRightX}" cy="${wheelY}" r="${wheelRadius}" fill="#070A12"/>
  </svg>`;
}

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const spec = ICONS[name];

  if (!spec) {
    return new Response('Not found', { status: 404 });
  }

  const png = await sharp(Buffer.from(iconSvg(spec.size, spec.maskable))).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}
