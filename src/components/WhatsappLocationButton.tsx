'use client';

import { useState } from 'react';
import { Loader2, LocateFixed, MapPin, Navigation, Send, Store, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type LocationChoice = {
  source: 'store' | 'current';
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

function mapsUrl(location: LocationChoice) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
}

function geolocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'Permissão de localização negada. Libere o acesso nas configurações do navegador.';
  if (error.code === error.POSITION_UNAVAILABLE) return 'O aparelho não conseguiu determinar sua localização.';
  if (error.code === error.TIMEOUT) return 'A localização demorou demais. Tente novamente em um local com melhor sinal.';
  return 'Não foi possível obter sua localização atual.';
}

export function WhatsappLocationButton({
  conversationId,
  onRefresh,
  onStatus,
  disabled = false
}: {
  conversationId: string;
  onRefresh: () => Promise<void> | void;
  onStatus: (message: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [storeLocation, setStoreLocation] = useState<LocationChoice | null>(null);
  const [choice, setChoice] = useState<LocationChoice | null>(null);
  const [error, setError] = useState('');

  async function authToken() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || '';
    if (!token) throw new Error('Sessão expirada. Faça login novamente.');
    return token;
  }

  async function openPicker() {
    if (!conversationId || disabled) return;
    setOpen(true);
    setLoading(true);
    setError('');
    setChoice(null);
    try {
      const token = await authToken();
      const response = await fetch(`/api/whatsapp/messages/send-location?conversation_id=${encodeURIComponent(conversationId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar a localização da loja.');
      const nextStoreLocation = result.store_location as LocationChoice | null;
      setStoreLocation(nextStoreLocation);
      setChoice(nextStoreLocation);
    } catch (openError: any) {
      setError(openError?.message || 'Não foi possível preparar o envio de localização.');
      setStoreLocation(null);
    } finally {
      setLoading(false);
    }
  }

  function useCurrentLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError('Este navegador não oferece acesso à localização atual.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setChoice({
          source: 'current',
          name: 'Localização atual',
          address: 'Localização compartilhada pelo atendente',
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7))
        });
        setLocating(false);
      },
      (positionError) => {
        setError(geolocationError(positionError));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }
    );
  }

  async function sendLocation() {
    if (!choice || sending) return;
    setSending(true);
    setError('');
    onStatus('Enviando localização...');
    try {
      const token = await authToken();
      const response = await fetch('/api/whatsapp/messages/send-location', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, ...choice })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a localização.');
      setOpen(false);
      setChoice(null);
      onStatus('Localização enviada com sucesso.');
      await onRefresh();
    } catch (sendError: any) {
      const message = sendError?.message || 'Erro ao enviar localização pelo WhatsApp.';
      setError(message);
      onStatus(message);
    } finally {
      setSending(false);
    }
  }

  function close() {
    if (sending) return;
    setOpen(false);
    setChoice(null);
    setError('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPicker()}
        disabled={disabled || !conversationId}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
        aria-label="Enviar localização"
        title="Enviar localização"
      >
        <MapPin size={16} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[670] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:items-center" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
          <section className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[24px] border border-zinc-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="whatsapp-location-title">
            <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-600">WhatsApp</p><h2 id="whatsapp-location-title" className="mt-1 text-base font-black text-zinc-950">Enviar localização</h2></div>
              <button type="button" onClick={close} disabled={sending} aria-label="Fechar localização" className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 disabled:opacity-50"><X size={17} /></button>
            </header>

            <div className="space-y-3 p-4">
              <p className="text-xs font-bold leading-relaxed text-zinc-500">Escolha a localização e confira antes de enviar. Sua posição atual só será acessada com sua autorização.</p>

              {loading ? <div className="flex min-h-24 items-center justify-center gap-2 text-sm font-black text-zinc-500"><Loader2 size={18} className="animate-spin text-emerald-600" /> Consultando localização da loja...</div> : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => storeLocation && setChoice(storeLocation)} disabled={!storeLocation || sending} className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${choice?.source === 'store' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-white text-zinc-700'}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><Store size={16} /></span>
                    <span><strong className="block text-xs">Localização da loja</strong><span className="mt-0.5 block text-[9px] font-bold">{storeLocation ? 'Cadastrada no sistema' : 'Não configurada'}</span></span>
                  </button>
                  <button type="button" onClick={useCurrentLocation} disabled={locating || sending} className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-50 ${choice?.source === 'current' ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-zinc-200 bg-white text-zinc-700'}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">{locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}</span>
                    <span><strong className="block text-xs">Minha localização atual</strong><span className="mt-0.5 block text-[9px] font-bold">Solicita permissão do aparelho</span></span>
                  </button>
                </div>
              )}

              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-red-700">{error}</div> : null}

              {choice ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                  <div className="flex min-h-32 items-center justify-center bg-emerald-50 text-emerald-700"><div className="text-center"><MapPin size={34} className="mx-auto" /><p className="mt-2 text-[10px] font-black uppercase">Prévia da localização</p></div></div>
                  <div className="p-3"><p className="text-sm font-black text-zinc-900">{choice.name}</p><p className="mt-1 text-[11px] font-bold leading-relaxed text-zinc-500">{choice.address || 'Endereço não informado'}</p><a href={mapsUrl(choice)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600"><Navigation size={12} /> Conferir no mapa</a></div>
                </div>
              ) : null}

              {choice?.source === 'current' ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-800">Confirme com atenção: esta opção enviará a posição atual deste aparelho, que pode ser diferente da localização da loja.</p> : null}

              <button type="button" onClick={() => void sendLocation()} disabled={!choice || loading || locating || sending} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black uppercase text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sending ? 'Enviando...' : 'Enviar localização'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
