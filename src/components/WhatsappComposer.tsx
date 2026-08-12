'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Send, Video, Volume2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaKind(file: File) {
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'document';
}

function MediaIcon({ file }: { file: File }) {
  const kind = mediaKind(file);
  if (kind === 'image') return <ImageIcon size={17} />;
  if (kind === 'video') return <Video size={17} />;
  if (kind === 'audio') return <Volume2 size={17} />;
  return <FileText size={17} />;
}

export function WhatsappComposer({
  conversationId,
  onSent,
  setStatusMessage
}: {
  conversationId: string;
  onSent: () => Promise<void> | void;
  setStatusMessage: (message: string) => void;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [messageText, setMessageText] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl('');
      return;
    }

    const kind = mediaKind(attachment);
    if (kind !== 'image' && kind !== 'video') {
      setPreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  useEffect(() => {
    setMessageText('');
    setAttachment(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [conversationId]);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  function clearAttachment() {
    setAttachment(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function selectAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    if (file.size > MAX_MEDIA_BYTES) {
      setStatusMessage('O anexo excede o limite de 4 MB desta etapa.');
      event.target.value = '';
      return;
    }

    setAttachment(file);
    setStatusMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversationId || sending) return;

    const body = messageText.trim();
    if (!body && !attachment) return;

    setSending(true);
    setStatusMessage(attachment ? 'Enviando anexo...' : 'Enviando mensagem...');

    try {
      const token = await authToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      let response: Response;
      if (attachment) {
        const form = new FormData();
        form.set('conversation_id', conversationId);
        form.set('file', attachment);
        if (body) form.set('caption', body);

        response = await fetch('/api/whatsapp/messages/send-media', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form
        });
      } else {
        response = await fetch('/api/whatsapp/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ conversation_id: conversationId, body })
        });
      }

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar pelo WhatsApp.');

      setMessageText('');
      clearAttachment();
      setStatusMessage(attachment ? 'Anexo enviado.' : 'Mensagem enviada.');
      await onSent();
    } catch (error: any) {
      setStatusMessage(error?.message || 'Erro ao enviar pelo WhatsApp.');
    } finally {
      setSending(false);
    }
  }

  const kind = attachment ? mediaKind(attachment) : '';

  return (
    <form onSubmit={submit} className="shrink-0 border-t border-zinc-200 bg-white p-3.5">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2 transition focus-within:border-red-300 focus-within:bg-white">
        {attachment ? (
          <div className="mb-2 rounded-xl border border-zinc-200 bg-white p-2.5">
            <div className="flex items-start gap-3">
              {kind === 'image' && previewUrl ? (
                <img src={previewUrl} alt="Prévia do anexo" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              ) : kind === 'video' && previewUrl ? (
                <video src={previewUrl} className="h-20 w-24 shrink-0 rounded-lg bg-black object-cover" muted />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                  <MediaIcon file={attachment} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-zinc-800">{attachment.name}</p>
                <p className="mt-1 text-[10px] font-bold uppercase text-zinc-400">{kind} · {formatBytes(attachment.size)}</p>
                <p className="mt-1 text-[10px] font-semibold text-zinc-400">Máximo nesta etapa: 4 MB por arquivo.</p>
              </div>

              <button type="button" onClick={clearAttachment} disabled={sending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 transition hover:text-red-600" aria-label="Remover anexo" title="Remover anexo">
                <X size={15} />
              </button>
            </div>
          </div>
        ) : null}

        <textarea
          className="min-h-16 w-full resize-none bg-transparent px-2 py-2 text-sm font-semibold text-zinc-800 outline-none placeholder:text-zinc-400"
          placeholder={attachment ? 'Adicione uma legenda opcional...' : 'Digite sua mensagem...'}
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          disabled={sending}
        />

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <input ref={inputRef} type="file" className="hidden" onChange={selectAttachment} disabled={sending} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={sending} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-[10px] font-black uppercase text-zinc-600 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50">
              <Paperclip size={15} /> Anexar
            </button>
            <p className="truncate text-[10px] font-bold leading-relaxed text-zinc-400">Imagem, vídeo, áudio ou documento.</p>
          </div>

          <button
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black text-white shadow-md shadow-red-600/15 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={sending || (!messageText.trim() && !attachment)}
          >
            <Send size={16} /> {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </form>
  );
}
