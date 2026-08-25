'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useParams } from 'next/navigation';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, Sparkles, Video, Volume2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import AutocarCopilotInline from '@/components/AutocarCopilotInline';
import { WhatsappAudioRecorder } from '@/components/WhatsappAudioRecorder';

const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

function mediaKind(file: File) {
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'document';
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaIcon({ file }: { file: File }) {
  const kind = mediaKind(file);
  if (kind === 'image') return <ImageIcon size={18} />;
  if (kind === 'video') return <Video size={18} />;
  if (kind === 'audio') return <Volume2 size={18} />;
  return <FileText size={18} />;
}

function fillWhatsappDraft(text: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Digite sua mensagem..."]');
  if (!textarea) throw new Error('Campo de mensagem do Inbox não encontrado.');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Não foi possível preparar o campo de mensagem.');
  setter.call(textarea, text);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  textarea.focus();
}

export function WhatsappAttachmentButton({
  conversationId,
  onRefresh,
  onStatus
}: {
  conversationId: string;
  onRefresh: () => Promise<void> | void;
  onStatus: (message: string) => void;
}) {
  const supabase = createClient();
  const params = useParams();
  const slug = String(params?.slug || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [open, setOpen] = useState(false);
  const [autocarOpen, setAutocarOpen] = useState(false);
  const [sending, setSending] = useState(false);

  function reset() {
    setFile(null);
    setCaption('');
    setOpen(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    if (selected.size > MAX_MEDIA_BYTES) {
      onStatus('O anexo excede o limite de 4 MB desta etapa.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setCaption('');
    setOpen(true);
    onStatus('');
  }

  async function sendAttachment() {
    if (!file || !conversationId || sending) return;
    setSending(true);
    onStatus('Enviando anexo...');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const form = new FormData();
      form.set('conversation_id', conversationId);
      form.set('file', file);
      if (caption.trim()) form.set('caption', caption.trim());

      const response = await fetch('/api/whatsapp/messages/send-attachment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o anexo.');

      onStatus('Anexo enviado com sucesso.');
      reset();
      await onRefresh();
    } catch (error: any) {
      onStatus(error?.message || 'Erro ao enviar anexo pelo WhatsApp.');
    } finally {
      setSending(false);
    }
  }

  function useAutocarReply(text: string) {
    try {
      fillWhatsappDraft(text);
      onStatus('Resposta da AUTOCAR inserida como rascunho. Revise antes de enviar.');
      setAutocarOpen(false);
    } catch (error: any) {
      onStatus(error?.message || 'Não foi possível inserir a resposta no campo de mensagem.');
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={chooseFile} disabled={sending} />
      <button
        type="button"
        onClick={() => setAutocarOpen(true)}
        disabled={!conversationId}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-[10px] font-black uppercase text-red-700 transition hover:bg-red-100 disabled:opacity-50"
        title="Analisar conversa ativa com a I.A AUTOCAR"
      >
        <Sparkles size={14} /> AUTOCAR
      </button>
      <WhatsappAudioRecorder conversationId={conversationId} onRefresh={onRefresh} onStatus={onStatus} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={sending || !conversationId}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[10px] font-black uppercase text-zinc-700 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50"
        title="Anexar foto, vídeo, áudio ou documento"
      >
        <Paperclip size={14} /> Anexar
      </button>

      {autocarOpen ? (
        <div className="fixed inset-0 z-[555] flex items-end justify-center bg-black/25 p-3 backdrop-blur-[1px] lg:items-center" onMouseDown={(event) => { if (event.currentTarget === event.target) setAutocarOpen(false); }}>
          <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.15em] text-red-600">Inbox WhatsApp · conversa ativa</p><h3 className="mt-1 text-base font-black text-zinc-950">I.A AUTOCAR COPILOT V2</h3></div>
              <button type="button" onClick={() => setAutocarOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500"><X size={17} /></button>
            </div>
            <AutocarCopilotInline slug={slug} conversationId={conversationId} onUseReply={useAutocarReply} />
            <div className="px-4 pb-4 pt-2 text-center text-[9px] font-bold text-zinc-400">Nenhuma mensagem é enviada por esta janela. O vendedor continua responsável pelo botão Enviar do Inbox.</div>
          </div>
        </div>
      ) : null}

      {open && file ? (
        <div className="fixed inset-0 z-[560] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target && !sending) reset(); }}>
          <div className="w-full max-w-md rounded-[24px] border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-red-600">WhatsApp</p><h3 className="mt-1 text-lg font-black text-zinc-950">Enviar anexo</h3></div>
              <button type="button" onClick={reset} disabled={sending} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500"><X size={17} /></button>
            </div>
            <div className="p-5">
              <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-red-600"><MediaIcon file={file} /></span>
                <div className="min-w-0"><p className="truncate text-sm font-black text-zinc-900">{file.name}</p><p className="mt-1 text-[10px] font-black uppercase text-zinc-400">{mediaKind(file)} · {formatBytes(file.size)}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">Limite atual: 4 MB por arquivo.</p></div>
              </div>
              {mediaKind(file) !== 'audio' ? <label className="mt-4 block text-xs font-black text-zinc-600">Legenda opcional<textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={2000} placeholder="Digite uma legenda..." className="mt-2 min-h-20 w-full resize-none rounded-xl border border-zinc-200 p-3 text-sm outline-none focus:border-red-300" disabled={sending} /></label> : null}
              <button type="button" onClick={() => void sendAttachment()} disabled={sending} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-black uppercase text-white transition hover:bg-red-700 disabled:opacity-50">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sending ? 'Enviando...' : 'Enviar anexo'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
