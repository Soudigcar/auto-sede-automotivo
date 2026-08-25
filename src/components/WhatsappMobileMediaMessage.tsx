'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2, Pause, Play, RefreshCw, Video } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Props = {
  message: any;
  outbound?: boolean;
};

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function isMediaType(type: string) {
  return ['image', 'video', 'audio', 'document'].includes(type);
}

function labelForType(type: string) {
  if (type === 'image') return 'imagem';
  if (type === 'video') return 'vídeo';
  if (type === 'audio') return 'áudio';
  return 'documento';
}

function MobileAudioPlayer({ src, outbound }: { src: string; outbound: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = value;
    setCurrent(value);
  }

  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progressMax = Math.max(duration, 1);
  return (
    <div className={`flex min-w-[220px] max-w-[76vw] items-center gap-2 rounded-xl px-1 py-0.5 ${outbound ? 'text-white' : 'text-zinc-800'}`}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button type="button" onClick={() => void toggle()} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${outbound ? 'bg-white/20 text-white' : 'bg-red-50 text-red-600'}`} aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
      <div className="min-w-0 flex-1">
        <input
          aria-label="Posição do áudio"
          type="range"
          min={0}
          max={progressMax}
          step={0.1}
          value={Math.min(current, progressMax)}
          onChange={(event) => seek(Number(event.target.value))}
          className="h-1 w-full cursor-pointer accent-current"
        />
        <div className={`mt-1 flex items-center justify-between text-[9px] font-bold ${outbound ? 'text-white/70' : 'text-zinc-400'}`}><span>{formatDuration(current)}</span><span>{formatDuration(duration)}</span></div>
      </div>
      <button type="button" onClick={cycleRate} className={`shrink-0 rounded-lg px-1.5 py-1 text-[9px] font-black ${outbound ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-600'}`} aria-label="Alterar velocidade do áudio">{rate}x</button>
    </div>
  );
}

export function WhatsappMobileMediaMessage({ message, outbound = false }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const type = String(message?.message_type || '').toLowerCase();
  const supported = isMediaType(type);
  const body = String(message?.body || '').trim();
  const [mediaUrl, setMediaUrl] = useState('');
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState('');

  async function loadMedia() {
    if (!supported || !message?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      if (!token) throw new Error('Sessão expirada.');
      const response = await fetch(`/api/whatsapp/messages/media?message_id=${encodeURIComponent(message.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || `Não foi possível carregar ${labelForType(type)}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setMediaUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch (loadError: any) {
      setError(loadError?.message || `Não foi possível carregar ${labelForType(type)}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supported) return;
    void loadMedia();
    return () => {
      setMediaUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return '';
      });
    };
  }, [message?.id, supported]);

  if (!supported) return <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-[1.35]">{body || '[Mensagem sem texto]'}</p>;

  if (loading) return <div className={`flex min-w-[190px] items-center gap-2 rounded-xl px-2 py-2 text-xs font-bold ${outbound ? 'bg-white/10 text-white' : 'bg-zinc-50 text-zinc-600'}`}><Loader2 size={16} className="animate-spin" /> Carregando {labelForType(type)}...</div>;

  if (error || !mediaUrl) return (
    <div className={`min-w-[190px] rounded-xl p-2 ${outbound ? 'bg-white/10 text-white' : 'bg-zinc-50 text-zinc-700'}`}>
      <div className="flex items-center gap-2 text-xs font-black"><FileText size={16} /> Mídia indisponível</div>
      <button type="button" onClick={() => void loadMedia()} className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black ${outbound ? 'bg-white/15 text-white' : 'bg-white text-red-600 shadow-sm'}`}><RefreshCw size={12} /> Tentar novamente</button>
    </div>
  );

  const placeholder = /^\[(Imagem|Vídeo|Áudio|Documento)\]$/i.test(body);

  return (
    <div className="max-w-full space-y-1.5">
      {type === 'image' ? <a href={mediaUrl} target="_blank" rel="noreferrer" className="block max-w-full overflow-hidden rounded-xl"><img src={mediaUrl} alt={body && !placeholder ? body : 'Imagem do WhatsApp'} className="max-h-[52dvh] w-auto max-w-full rounded-xl object-contain" /></a> : null}
      {type === 'video' ? <div className="max-w-full overflow-hidden rounded-xl bg-black"><video src={mediaUrl} controls preload="metadata" playsInline className="max-h-[52dvh] w-full max-w-full rounded-xl bg-black" /></div> : null}
      {type === 'audio' ? <MobileAudioPlayer src={mediaUrl} outbound={outbound} /> : null}
      {type === 'document' ? <a href={mediaUrl} target="_blank" rel="noreferrer" className={`flex min-w-0 max-w-[76vw] items-center gap-2 rounded-xl border p-2.5 ${outbound ? 'border-white/20 bg-white/10 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-800'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${outbound ? 'bg-white/15' : 'bg-white text-red-600'}`}><FileText size={18} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{body || 'Documento'}</strong><span className={`mt-0.5 block text-[9px] font-bold ${outbound ? 'text-white/65' : 'text-zinc-400'}`}>Abrir documento</span></span><Download size={15} className="shrink-0" /></a> : null}
      {body && !placeholder && type !== 'document' && type !== 'audio' ? <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-[1.35]">{body}</p> : null}
    </div>
  );
}
