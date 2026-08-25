'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Send, Square, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 180;
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4'
];

type MicrophonePermissionState = PermissionState | 'unknown';

type PolicyDocument = Document & {
  permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
  featurePolicy?: { allowsFeature?: (feature: string) => boolean };
};

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function fileExtension(mime: string) {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

function recorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

function isMicrophonePermissionError(error: any) {
  const name = String(error?.name || '');
  return name === 'NotAllowedError' || name === 'PermissionDeniedError';
}

function microphoneAllowedByPolicy() {
  if (typeof document === 'undefined') return null;
  const policyDocument = document as PolicyDocument;
  const policy = policyDocument.permissionsPolicy || policyDocument.featurePolicy;
  if (!policy?.allowsFeature) return null;
  try {
    return policy.allowsFeature('microphone');
  } catch {
    return null;
  }
}

async function microphonePermissionState(): Promise<MicrophonePermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

async function microphoneErrorMessage(error: any) {
  const name = String(error?.name || '');
  const rawMessage = String(error?.message || '').trim();
  const policyAllowed = microphoneAllowedByPolicy();
  const permissionState = await microphonePermissionState();

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'O microfone foi bloqueado porque esta página não está em um contexto HTTPS seguro.';
  }

  if (policyAllowed === false) {
    return 'O microfone está autorizado no Chrome, mas foi bloqueado pela política de segurança da página. Código: POLICY_BLOCK.';
  }

  if (isMicrophonePermissionError(error) && permissionState === 'granted') {
    return 'O Chrome está autorizado neste site, mas o sistema operacional está impedindo o acesso ao microfone. No Mac: Ajustes do Sistema > Privacidade e Segurança > Microfone > ative Google Chrome. Código: OS_BLOCK.';
  }

  if (isMicrophonePermissionError(error)) {
    return `O navegador ainda está recusando o microfone. Permissão detectada: ${permissionState}. Código: BROWSER_BLOCK${rawMessage ? ` (${rawMessage})` : ''}.`;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhum microfone foi encontrado neste dispositivo. Código: DEVICE_NOT_FOUND.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'O microfone está ocupado ou indisponível. Feche outro aplicativo que possa estar usando o microfone e tente novamente. Código: DEVICE_BUSY.';
  }
  return `Não foi possível iniciar o microfone. Código: ${name || 'UNKNOWN'}${rawMessage ? ` (${rawMessage})` : ''}.`;
}

export function WhatsappAudioRecorder({
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
  const supabase = createClient();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const previousConversationRef = useRef(conversationId);
  const permissionErrorShownRef = useRef(false);
  const [state, setState] = useState<'idle' | 'recording' | 'ready' | 'sending'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearPreview() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setAudioFile(null);
    setSeconds(0);
  }

  function resetRecorder() {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // O cleanup precisa continuar mesmo se o browser já tiver encerrado o recorder.
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    clearPreview();
    setState('idle');
  }

  async function startRecording() {
    if (!conversationId || disabled || state !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onStatus('Este navegador não oferece suporte à gravação de áudio. Atualize o navegador ou use outro dispositivo.');
      return;
    }

    const policyAllowed = microphoneAllowedByPolicy();
    if (policyAllowed === false) {
      permissionErrorShownRef.current = true;
      onStatus('O microfone está autorizado no Chrome, mas foi bloqueado pela política de segurança da página. Código: POLICY_BLOCK.');
      return;
    }

    const mime = recorderMimeType();
    if (!mime) {
      onStatus('Não foi encontrado um formato de áudio compatível para gravação neste navegador.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      permissionErrorShownRef.current = false;
      streamRef.current = stream;
      chunksRef.current = [];
      setSeconds(0);
      onStatus('Gravando áudio...');

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stopTimer();
        stopTracks();
        setState('idle');
        onStatus('A gravação foi interrompida pelo navegador. Tente novamente.');
      };
      recorder.onstop = () => {
        stopTimer();
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime });
        chunksRef.current = [];
        recorderRef.current = null;
        if (!blob.size) {
          setState('idle');
          onStatus('O áudio ficou vazio. Grave novamente.');
          return;
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          setState('idle');
          onStatus('O áudio excedeu o limite seguro de 4 MB. Grave uma mensagem menor.');
          return;
        }
        const file = new File([blob], `audio-whatsapp-${Date.now()}.${fileExtension(blob.type)}`, { type: blob.type });
        const url = URL.createObjectURL(blob);
        setAudioFile(file);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
        setState('ready');
        onStatus('Áudio pronto. Ouça antes de enviar, se desejar.');
      };

      recorder.start(250);
      setState('recording');
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => {
          const next = current + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            const active = recorderRef.current;
            if (active?.state === 'recording') active.stop();
            return MAX_RECORDING_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (error: any) {
      stopTimer();
      stopTracks();
      setState('idle');
      permissionErrorShownRef.current = isMicrophonePermissionError(error) || microphoneAllowedByPolicy() === false;
      onStatus(await microphoneErrorMessage(error));
    }
  }

  function finishRecording() {
    if (state !== 'recording') return;
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }

  function cancelRecording() {
    stopTimer();
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* cleanup abaixo */ }
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
    clearPreview();
    setState('idle');
    onStatus('Gravação cancelada.');
  }

  async function sendAudio() {
    if (!audioFile || !conversationId || state !== 'ready') return;
    if (!audioFile.size || audioFile.size > MAX_AUDIO_BYTES) {
      onStatus('O áudio não pode ser enviado porque está vazio ou excede 4 MB.');
      return;
    }

    setState('sending');
    onStatus('Enviando áudio...');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || '';
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const form = new FormData();
      form.set('conversation_id', conversationId);
      form.set('file', audioFile);

      const response = await fetch('/api/whatsapp/messages/send-audio', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o áudio.');

      onStatus('Áudio enviado com sucesso.');
      clearPreview();
      setState('idle');
      await onRefresh();
    } catch (error: any) {
      setState('ready');
      onStatus(error?.message || 'Erro ao enviar áudio pelo WhatsApp. O áudio continua disponível para tentar novamente.');
    }
  }

  useEffect(() => {
    if (previousConversationRef.current !== conversationId) {
      previousConversationRef.current = conversationId;
      resetRecorder();
    }
  }, [conversationId]);

  useEffect(() => {
    let disposed = false;
    let permissionStatus: PermissionStatus | null = null;

    function clearPermissionWarningIfGranted(status: PermissionStatus) {
      if (status.state !== 'granted' || !permissionErrorShownRef.current) return;
      if (microphoneAllowedByPolicy() === false) return;
      permissionErrorShownRef.current = false;
      onStatus('');
    }

    async function syncMicrophonePermission() {
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (disposed) return;
        if (permissionStatus && permissionStatus !== status) permissionStatus.onchange = null;
        permissionStatus = status;
        status.onchange = () => clearPermissionWarningIfGranted(status);
        clearPermissionWarningIfGranted(status);
      } catch {
        // Alguns navegadores não expõem o estado do microfone via Permissions API.
      }
    }

    const handleFocus = () => void syncMicrophonePermission();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void syncMicrophonePermission();
    };

    void syncMicrophonePermission();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      if (permissionStatus) permissionStatus.onchange = null;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [onStatus]);

  useEffect(() => () => {
    stopTimer();
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try { recorderRef.current.stop(); } catch { /* cleanup abaixo */ }
    }
    stopTracks();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (state === 'recording') {
    return (
      <div className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-2" aria-label="Gravando áudio do WhatsApp">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
        <span className="min-w-[42px] text-[10px] font-black tabular-nums text-red-700">{formatDuration(seconds)}</span>
        <button type="button" onClick={cancelRecording} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-red-600" title="Cancelar gravação" aria-label="Cancelar gravação"><Trash2 size={14} /></button>
        <button type="button" onClick={finishRecording} className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white transition hover:bg-red-700" title="Parar gravação" aria-label="Parar gravação"><Square size={12} fill="currentColor" /></button>
      </div>
    );
  }

  if ((state === 'ready' || state === 'sending') && audioFile && previewUrl) {
    return (
      <div className="inline-flex h-10 max-w-[360px] shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2">
        <audio src={previewUrl} controls preload="metadata" className="h-8 w-[190px] max-w-[42vw]" />
        <button type="button" onClick={cancelRecording} disabled={state === 'sending'} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-red-600 disabled:opacity-40" title="Excluir áudio" aria-label="Excluir áudio"><Trash2 size={14} /></button>
        <button type="button" onClick={() => void sendAudio()} disabled={state === 'sending'} className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 disabled:opacity-60" title="Enviar áudio" aria-label="Enviar áudio">{state === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void startRecording()}
      disabled={disabled || !conversationId}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      title="Gravar áudio"
      aria-label="Gravar áudio do WhatsApp"
    >
      <Mic size={17} />
    </button>
  );
}
