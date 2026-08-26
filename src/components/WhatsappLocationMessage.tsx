'use client';

import { ExternalLink, MapPin } from 'lucide-react';

type LocationData = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

function coordinate(value: unknown, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function locationCandidates(message: any) {
  const raw = message?.raw_payload || {};
  return [
    raw.location,
    raw.message?.locationMessage,
    raw.message?.liveLocationMessage,
    raw.data?.message?.locationMessage,
    raw.data?.message?.liveLocationMessage,
    raw.data?.message?.message?.locationMessage,
    raw.data?.message?.message?.liveLocationMessage
  ];
}

function readLocation(message: any): LocationData | null {
  for (const candidate of locationCandidates(message)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const latitude = coordinate(candidate.latitude ?? candidate.degreesLatitude, -90, 90);
    const longitude = coordinate(candidate.longitude ?? candidate.degreesLongitude, -180, 180);
    if (latitude === null || longitude === null) continue;
    return {
      name: String(candidate.name || candidate.caption || 'Localização compartilhada').trim(),
      address: String(candidate.address || '').trim(),
      latitude,
      longitude
    };
  }
  return null;
}

export function WhatsappLocationMessage({ message, outbound = false, compact = false }: { message: any; outbound?: boolean; compact?: boolean }) {
  const location = readLocation(message);
  const body = String(message?.body || '').trim();
  if (!location) return <p className={`whitespace-pre-wrap break-words font-semibold ${compact ? 'text-[13px] leading-snug' : 'text-sm leading-relaxed'}`}>{body || '[Localização]'}</p>;

  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
  return (
    <a
      href={mapUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Abrir localização no mapa"
      className={`block overflow-hidden rounded-xl border transition ${compact ? 'min-w-[210px] max-w-[320px]' : 'min-w-[240px] max-w-[390px]'} ${outbound ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' : 'border-zinc-200 bg-white text-zinc-800 hover:border-emerald-300'}`}
    >
      <span className={`flex items-center justify-center ${compact ? 'min-h-24' : 'min-h-32'} ${outbound ? 'bg-white/10' : 'bg-emerald-50 text-emerald-700'}`}>
        <span className="text-center"><MapPin size={compact ? 30 : 36} className="mx-auto" /><span className="mt-1 block text-[9px] font-black uppercase tracking-wide">Ver no mapa</span></span>
      </span>
      <span className="flex items-start gap-2 p-3">
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-xs">{location.name}</strong>
          <span className={`mt-1 block text-[10px] font-bold leading-relaxed ${outbound ? 'text-white/70' : 'text-zinc-500'}`}>{location.address || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}</span>
        </span>
        <ExternalLink size={14} className="mt-0.5 shrink-0" />
      </span>
    </a>
  );
}
