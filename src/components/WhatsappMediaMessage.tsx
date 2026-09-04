'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, RefreshCw, Video, Volume2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { WhatsappEditedMessage } from '@/components/WhatsappEditedMessage';
import { WhatsappLocationMessage } from '@/components/WhatsappLocationMessage';
import { apiErrorMessage } from '@/lib/client/apiErrorMessage';

type WhatsappMediaMessageProps = {
  message: any;
  outbound?: boolean;
  compact?: boolean;
};

function mediaLabel(type: string) {
  if (type === 'image') return 'Imagem';
  if (type === 'video') return 'Vídeo';
  if (type === 'audio') return 'Áudio';
  if (type === 'document') return 'Documento';
  return 'Mídia';
}

function MediaIcon({ type, size = 18 }: { type: string; size?: number }) {
  if (type === 'image') return <ImageIcon size={size} />;
  if (type === 'video') return <Video size={size} />;
  if (type === 'audio') return <Volume2 size={size} />;
  return <FileText size={size} />;
}

export function WhatsappMediaMessage({ message, outbound = false, compact = false }: WhatsappMediaMessageProps) {
  const supabase = useMemo(() => createClient(), []);
  const type = String(message?.message_type || '').toLowerCase();
  const supported = ['image', 'video', 'audio', 'document'].includes(type);
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
      if (!token) throw new Error('Sessão expirada. Atualize a página e entre novamente.');

      const downloadQuery = type === 'document' ? '&download=1' : '';
      const response = await fetch(`/api/whatsapp/messages/media?message_id=${encodeURIComponent(message.id)}${downloadQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(apiErrorMessage(result, 'Não foi possível carregar esta mídia.'));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setMediaUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch (loadError: any) {
      setError(apiErrorMessage(loadError, 'Não foi possível carregar esta mídia.'));
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

  if (type === 'location') return <WhatsappLocationMessage message={message} outbound={outbound} compact={compact} />;
  if (type === 'secretencrypted') return <WhatsappEditedMessage message={message} outbound={outbound} compact={compact} />;

  if (!supported) {
    return <p className={`whitespace-pre-wrap font-semibold ${compact ? 'text-[13px] leading-snug' : 'text-sm leading-relaxed'}`}>{message?.body || '[Mensagem sem texto]'}</p>;
  }

  const label = mediaLabel(type);
  const body = String(message?.body || '').trim();
  const isPlaceholder = /^\[(Imagem|Vídeo|Áudio|Documento)\]$/i.test(body);

  if (loading) {
    return (
      <div className={`flex items-center rounded-xl border ${compact ? 'min-w-[180px] gap-2 p-2' : 'min-w-[210px] gap-3 p-3'} ${outbound ? 'border-white/20 bg-white/10 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
        <Loader2 size={18} className="animate-spin" />
        <div><p className="text-xs font-black">Carregando {label.toLowerCase()}...</p><p className={`mt-0.5 text-[10px] font-bold ${outbound ? 'text-white/65' : 'text-zinc-400'}`}>Conteúdo protegido do WhatsApp</p></div>
      </div>
    );
  }

  if (error || !mediaUrl) {
    return (
      <div className={`rounded-xl border ${compact ? 'min-w-[190px] p-2' : 'min-w-[220px] p-3'} ${outbound ? 'border-white/20 bg-white/10 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
        <div className="flex items-center gap-2"><MediaIcon type={type} /><p className="text-xs font-black">{label} indisponível</p></div>
        <p className={`mt-2 max-w-sm text-[10px] font-bold leading-relaxed ${outbound ? 'text-white/70' : 'text-zinc-500'}`}>{error || 'Não foi possível recuperar esta mídia.'}</p>
        <button type="button" onClick={() => void loadMedia()} className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black ${outbound ? 'bg-white/15 text-white hover:bg-white/20' : 'border border-zinc-200 bg-white text-zinc-700 hover:border-red-200 hover:text-red-600'}`}>
          <RefreshCw size={12} /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {type === 'image' ? (
        <a href={mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
          <img src={mediaUrl} alt={body && !isPlaceholder ? body : 'Imagem recebida no WhatsApp'} className={compact ? 'max-h-[280px] w-auto max-w-[320px] rounded-lg object-contain' : 'max-h-[420px] w-auto max-w-full rounded-xl object-contain'} />
        </a>
      ) : null}

      {type === 'video' ? (
        <video src={mediaUrl} controls preload="metadata" className={compact ? 'max-h-[280px] w-full min-w-[210px] max-w-[360px] rounded-lg bg-black' : 'max-h-[420px] w-full min-w-[240px] max-w-[520px] rounded-xl bg-black'} />
      ) : null}

      {type === 'audio' ? (
        <div className={`rounded-xl ${compact ? 'p-1' : 'p-2'} ${outbound ? 'bg-white/10' : 'bg-zinc-50'}`}>
          <audio src={mediaUrl} controls preload="metadata" className={compact ? 'h-8 w-[260px] min-w-0 max-w-[58vw]' : 'h-10 w-full min-w-[250px] max-w-[420px]'} />
        </div>
      ) : null}

      {type === 'document' ? (
        <a href={mediaUrl} download={body || 'documento-whatsapp'} className={`flex items-center rounded-xl border transition ${compact ? 'min-w-[210px] max-w-[340px] gap-2 p-2' : 'min-w-[250px] max-w-[460px] gap-3 p-3'} ${outbound ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' : 'border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-red-200'}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${outbound ? 'bg-white/15' : 'bg-white text-red-600'}`}><FileText size={20} /></span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-xs">{body || 'Documento do WhatsApp'}</strong><span className={`mt-1 block text-[9px] font-black uppercase ${outbound ? 'text-white/60' : 'text-zinc-400'}`}>Baixar documento</span></span>
          <Download size={16} className="shrink-0" />
        </a>
      ) : null}

      {body && !isPlaceholder && type !== 'document' && !(compact && type === 'audio') ? <p className={`whitespace-pre-wrap font-semibold ${compact ? 'text-[13px] leading-snug' : 'text-sm leading-relaxed'}`}>{body}</p> : null}
    </div>
  );
}
