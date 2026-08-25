'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, RotateCcw, Send, Square, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 5 * 60;

type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview' | 'sending';

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function extensionFor(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg')) return 'mp3';
  return 'webm';
}

export function WhatsappAudioRecorderButton({
  conversationId,
  onRefresh,
  onStatus,
  disabled = false,
  compact = false
}: {
  conversationId: string;
  onRefresh: () => Promise<void> | void;
  onStatus: (message: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const previewUrlRef = useRef('');
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function revokePreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPreviewUrl('');
  }

  function reset() {
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
    stopTracks();
    clearTimer();
    chunksRef.current = [];
    secondsRef.current = 0;
    setSeconds(0);
    setAudioFile(null);
    revokePreview();
    setState('idle');
  }

  useEffect(() => reset, [conversationId]);

  async function startRecording() {
    if (disabled || !conversationId || state !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onStatus('Este navegador não oferece gravação de áudio. Atualize o navegador ou anexe um áudio pronto.');
      return;
    }

    setState('requesting');
    onStatus('Aguardando permissão para usar o microfone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      chunksRef.current = [];
      discardRef.current = false;
      secondsRef.current = 0;
      setSeconds(0);

      const mimeType = preferredMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64_000 });
      } catch {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      }
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        onStatus('A gravação foi interrompida pelo navegador. Tente novamente.');
        reset();
      };
      recorder.onstop = () => {
        stopTracks();
        clearTimer();
        recorderRef.current = null;
        if (discardRef.current) {
          chunksRef.current = [];
          return;
        }
        const actualMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        chunksRef.current = [];
        if (!blob.size) {
          onStatus('Nenhum áudio foi capturado. Verifique o microfone e tente novamente.');
          setState('idle');
          return;
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          onStatus('O áudio excedeu 4 MB. Grave uma mensagem mais curta.');
          setState('idle');
          return;
        }
        const file = new File([blob], `audio-whatsapp-${Date.now()}.${extensionFor(actualMime)}`, { type: actualMime });
        const url = URL.createObjectURL(blob);
        revokePreview();
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setAudioFile(file);
        setState('preview');
        onStatus('Áudio pronto. Ouça antes de enviar.');
      };
      recorder.start(1000);
      setState('recording');
      onStatus('Gravando áudio...');
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_RECORDING_SECONDS && recorder.state !== 'inactive') recorder.stop();
      }, 1000);
    } catch (error: any) {
      stopTracks();
      clearTimer();
      setState('idle');
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      onStatus(denied ? 'Permissão do microfone negada. Libere o microfone nas configurações do navegador.' : 'Não foi possível acessar o microfone. Verifique se ele está disponível.');
    }
  }

  function pauseOrResume() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      clearTimer();
      setState('paused');
      onStatus('Gravação pausada.');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      setState('recording');
      onStatus('Gravando áudio...');
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_RECORDING_SECONDS && recorder.state !== 'inactive') recorder.stop();
      }, 1000);
    }
  }

  function finishRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    discardRef.current = false;
    recorder.stop();
  }

  async function sendAudio() {
    if (!audioFile || !conversationId || state === 'sending') return;
    setState('sending');
    onStatus('Enviando áudio para o WhatsApp...');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');
      const form = new FormData();
      form.set('conversation_id', conversationId);
      form.set('file', audioFile);
      const response = await fetch('/api/whatsapp/messages/send-attachment', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o áudio.');
      reset();
      onStatus('Áudio enviado com sucesso.');
      await onRefresh();
    } catch (error: any) {
      setState('preview');
      onStatus(error?.message || 'Erro ao enviar áudio pelo WhatsApp.');
    }
  }

  const recording = state === 'recording' || state === 'paused';
  const open = recording || state === 'requesting' || state === 'preview' || state === 'sending';

  return (
    <>
      <button
        type="button"
        onClick={() => void startRecording()}
        disabled={disabled || !conversationId || state !== 'idle'}
        className={compact ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm disabled:bg-zinc-300' : 'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-[10px] font-black uppercase text-red-700 transition hover:bg-red-100 disabled:opacity-50'}
        aria-label="Gravar áudio"
        title="Gravar e enviar áudio"
      >
        <Mic size={compact ? 18 : 14} />{compact ? null : ' Áudio'}
      </button>

      {open ? (
        <div className={`fixed inset-0 z-[650] flex justify-center bg-black/45 p-3 backdrop-blur-[2px] ${compact ? 'items-end' : 'items-center'}`} onMouseDown={(event) => { if (event.currentTarget === event.target && state !== 'sending') reset(); }}>
          <div className={`w-full max-w-md bg-white shadow-2xl ${compact ? 'rounded-[24px]' : 'rounded-[24px] border border-zinc-200'}`}>
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.15em] text-red-600">WhatsApp</p><h3 className="mt-1 text-base font-black text-zinc-950">{state === 'preview' || state === 'sending' ? 'Revisar áudio' : 'Gravando mensagem'}</h3></div>
              <button type="button" onClick={reset} disabled={state === 'sending'} aria-label="Cancelar gravação" className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 disabled:opacity-50"><X size={17} /></button>
            </div>
            <div className="p-5">
              {state === 'requesting' ? <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-zinc-600"><Loader2 className="animate-spin text-red-600" size={28} /><p className="text-sm font-black">Liberando o microfone...</p></div> : null}
              {recording ? (
                <div>
                  <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl bg-zinc-50">
                    <span className="flex items-center gap-2 text-3xl font-black tabular-nums text-zinc-950"><span className={`h-3 w-3 rounded-full bg-red-600 ${state === 'recording' ? 'animate-pulse' : ''}`} />{formatDuration(seconds)}</span>
                    <p className="mt-2 text-xs font-bold text-zinc-500">{state === 'paused' ? 'Gravação pausada' : 'Fale próximo ao microfone'}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button type="button" onClick={reset} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-xs font-black text-zinc-600"><Trash2 size={16} /> Cancelar</button>
                    <button type="button" onClick={pauseOrResume} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-xs font-black text-zinc-700">{state === 'paused' ? <Play size={16} /> : <Pause size={16} />}{state === 'paused' ? 'Continuar' : 'Pausar'}</button>
                    <button type="button" onClick={finishRecording} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-black text-white"><Square size={15} /> Concluir</button>
                  </div>
                </div>
              ) : null}
              {(state === 'preview' || state === 'sending') && previewUrl ? (
                <div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-black text-zinc-900"><Mic size={17} className="text-red-600" /> Áudio gravado</span><span className="text-xs font-black tabular-nums text-zinc-500">{formatDuration(seconds)}</span></div>
                    <audio src={previewUrl} controls preload="metadata" className="h-10 w-full" />
                  </div>
                  <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
                    <button type="button" onClick={reset} disabled={state === 'sending'} aria-label="Gravar novamente" title="Descartar e gravar novamente" className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 disabled:opacity-50"><RotateCcw size={17} /></button>
                    <button type="button" onClick={() => void sendAudio()} disabled={state === 'sending'} aria-busy={state === 'sending'} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black uppercase text-white disabled:opacity-50">{state === 'sending' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{state === 'sending' ? 'Enviando para o WhatsApp...' : 'Enviar áudio'}</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
