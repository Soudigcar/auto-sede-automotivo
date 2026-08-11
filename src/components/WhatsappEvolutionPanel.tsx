'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
  WifiOff
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

type IntegrationStatus = 'pending' | 'qrcode' | 'connecting' | 'connected' | 'disconnected' | 'error';

type WhatsappIntegration = {
  configured: boolean;
  scope: 'master' | 'store' | null;
  status: IntegrationStatus;
  phone_number: string | null;
  profile_name: string | null;
  profile_picture_url: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  last_webhook_at: string | null;
  last_error: string | null;
  live_error?: string | null;
  qr_code?: string | null;
};

type WhatsappEvolutionPanelProps = {
  scope: 'master' | 'store';
  storeName?: string;
  storeSlug?: string;
};

const statusLabels: Record<IntegrationStatus, string> = {
  pending: 'Aguardando configuração',
  qrcode: 'Aguardando leitura do QR Code',
  connecting: 'Conectando',
  connected: 'Conectado',
  disconnected: 'Desconectado',
  error: 'Atenção necessária'
};

function formatPhone(value: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return 'Número ainda não identificado';
  if (digits.length >= 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, -4)}-${digits.slice(-4)}`;
  }
  return digits;
}

function formatDate(value: string | null) {
  if (!value) return 'Ainda não registrado';

  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return 'Data indisponível';
  }
}

function statusTone(status: IntegrationStatus) {
  if (status === 'connected') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'qrcode' || status === 'connecting') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-zinc-200 bg-zinc-50 text-zinc-600';
}

export function WhatsappEvolutionPanel({ scope, storeName, storeSlug }: WhatsappEvolutionPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const [integration, setIntegration] = useState<WhatsappIntegration | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('Carregando integração WhatsApp...');
  const status = integration?.status || 'pending';
  const hasIntegration = integration !== null;
  const isMaster = scope === 'master';
  const endpoint = isMaster
    ? '/api/master/integrations/whatsapp/evolution'
    : '/api/store/integrations/whatsapp';
  const inboxHref = isMaster ? '/master/whatsapp/inbox' : storeSlug ? `/loja/${storeSlug}/whatsapp` : '';

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    return data.session.access_token;
  }, [supabase]);

  const loadIntegration = useCallback(async (silent = false) => {
    try {
      const token = await getToken();
      const url = !isMaster && storeSlug
        ? `${endpoint}?${new URLSearchParams({ slug: storeSlug }).toString()}`
        : endpoint;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar a integração.');

      setIntegration(result.integration);
      if (result.integration?.status === 'connected') setQrCode('');
      if (!silent) setMessage('');
    } catch (error: any) {
      if (!silent) setMessage(error?.message || 'Erro ao carregar integração WhatsApp.');
    }
  }, [endpoint, getToken, isMaster, storeSlug]);

  useEffect(() => {
    void loadIntegration();
  }, [loadIntegration]);

  useEffect(() => {
    if (!hasIntegration) return;
    const intervalMs = status === 'qrcode' || status === 'connecting' ? 5_000 : 30_000;
    const timer = window.setInterval(() => void loadIntegration(true), intervalMs);
    return () => window.clearInterval(timer);
  }, [hasIntegration, loadIntegration, status]);

  async function runAction(action: 'connect' | 'refresh-qr' | 'reconnect' | 'disconnect' | 'adopt-pilot') {
    const ownerLabel = isMaster ? 'da Master' : 'desta loja';
    if (action === 'disconnect' && !window.confirm(`Deseja desconectar o WhatsApp ${ownerLabel}?`)) return;
    if (
      action === 'adopt-pilot' &&
      !window.confirm('Reaproveitar o número piloto já conectado como WhatsApp central da Master? O número não será desconectado.')
    ) return;

    setBusy(action);
    setMessage(
      action === 'disconnect'
        ? 'Desconectando WhatsApp...'
        : action === 'adopt-pilot'
          ? 'Validando e vinculando o número piloto com segurança...'
          : 'Preparando conexão segura...'
    );

    try {
      const token = await getToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...(storeSlug ? { slug: storeSlug } : {}) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a ação.');

      setIntegration(result.integration);
      setQrCode(result.integration?.qr_code || '');
      setMessage(
        action === 'disconnect'
          ? 'WhatsApp desconectado com segurança.'
          : action === 'adopt-pilot'
            ? 'Número piloto conectado à Master e webhook assinado configurado.'
          : result.integration?.status === 'connected'
            ? 'WhatsApp conectado e pronto para uso.'
            : 'Leia o QR Code no WhatsApp do celular.'
      );
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao administrar a conexão WhatsApp.');
    } finally {
      setBusy('');
    }
  }

  const connected = status === 'connected';
  const qrCodeSource = qrCode
    ? (qrCode.startsWith('data:image/') ? qrCode : `data:image/png;base64,${qrCode}`)
    : '';
  const title = isMaster ? 'WhatsApp central da Master' : 'WhatsApp da loja';
  const description = isMaster
    ? 'Conecte o número central e receba novos contatos diretamente na Inbox WhatsApp da Master, antes de distribuí-los para as lojas.'
    : `Conecte o WhatsApp da ${storeName || 'loja'} e use o mesmo número no celular e no WhatsApp CRM.`;

  return (
    <section className="space-y-6">
      <header className="premium-card overflow-hidden p-0">
        <div className="bg-gradient-to-br from-[#071020] via-[#0d1a2a] to-[#13243a] p-6 text-white md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-emerald-400">
                <ShieldCheck size={16} /> {isMaster ? 'Integração central' : 'Integrações da loja'}
              </div>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">WhatsApp por QR Code</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">{description}</p>
            </div>
            <div className={`inline-flex items-center gap-2 self-start rounded-2xl border px-4 py-3 text-sm font-black ${connected ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-zinc-300'}`}>
              {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
              {statusLabels[status]}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="premium-card p-6 md:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <MessageCircle size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-zinc-950">{title}</h3>
                <p className="mt-1 text-sm text-zinc-500">Evolution API · conexão individual e isolada</p>
              </div>
            </div>
            <span className={`inline-flex self-start rounded-full border px-3 py-1.5 text-xs font-black ${statusTone(status)}`}>
              {statusLabels[status]}
            </span>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Perfil conectado</p>
              <p className="mt-2 font-black text-zinc-900">{integration?.profile_name || 'Aguardando conexão'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Número</p>
              <p className="mt-2 font-black text-zinc-900">{formatPhone(integration?.phone_number || null)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Última conexão</p>
              <p className="mt-2 text-sm font-bold text-zinc-700">{formatDate(integration?.last_connected_at || null)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Última sincronização</p>
              <p className="mt-2 text-sm font-bold text-zinc-700">{formatDate(integration?.last_webhook_at || null)}</p>
            </div>
          </div>

          {(integration?.last_error || integration?.live_error) ? (
            <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <span>{integration.last_error || integration.live_error}</span>
            </div>
          ) : null}

          {message ? <p className="mt-5 text-sm font-bold text-zinc-600">{message}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {!integration?.configured ? (
              <button type="button" onClick={() => void runAction('connect')} disabled={Boolean(busy)} className="premium-button-primary disabled:opacity-50">
                {busy ? <Loader2 size={17} className="animate-spin" /> : <QrCode size={17} />} Conectar WhatsApp
              </button>
            ) : connected ? (
              <>
                {inboxHref ? (
                  <Link href={inboxHref} className="premium-button-primary">
                    <Inbox size={17} /> Abrir Inbox
                  </Link>
                ) : null}
                <button type="button" onClick={() => void loadIntegration()} disabled={Boolean(busy)} className="premium-button-secondary disabled:opacity-50">
                  <RefreshCw size={17} /> Atualizar status
                </button>
                <button type="button" onClick={() => void runAction('disconnect')} disabled={Boolean(busy)} className="premium-button-secondary text-red-600 disabled:opacity-50">
                  {busy === 'disconnect' ? <Loader2 size={17} className="animate-spin" /> : <Unplug size={17} />} Desconectar
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void runAction(status === 'qrcode' ? 'refresh-qr' : 'reconnect')} disabled={Boolean(busy)} className="premium-button-primary disabled:opacity-50">
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <QrCode size={17} />} {status === 'qrcode' ? 'Gerar novo QR Code' : 'Reconectar'}
                </button>
                <button type="button" onClick={() => void loadIntegration()} disabled={Boolean(busy)} className="premium-button-secondary disabled:opacity-50">
                  <RefreshCw size={17} /> Atualizar status
                </button>
                {isMaster ? (
                  <button type="button" onClick={() => void runAction('adopt-pilot')} disabled={Boolean(busy)} className="premium-button-secondary disabled:opacity-50">
                    {busy === 'adopt-pilot' ? <Loader2 size={17} className="animate-spin" /> : <Smartphone size={17} />} Usar número piloto conectado
                  </button>
                ) : null}
              </>
            )}
          </div>
        </article>

        <aside className="premium-card p-6 md:p-7">
          {qrCodeSource ? (
            <div className="text-center">
              <div className="mx-auto inline-flex rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                <Image src={qrCodeSource} alt="QR Code temporário para conectar o WhatsApp" width={272} height={272} unoptimized />
              </div>
              <h3 className="mt-5 text-lg font-black text-zinc-950">Leia no celular {isMaster ? 'da Master' : 'da loja'}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">WhatsApp → Dispositivos conectados → Conectar dispositivo.</p>
            </div>
          ) : connected ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={38} /></div>
              <h3 className="mt-5 text-xl font-black text-zinc-950">Tudo conectado</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">As mensagens desse número já podem aparecer na {isMaster ? 'Inbox WhatsApp da Master' : 'WhatsApp CRM da loja'}.</p>
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"><Smartphone size={38} /></div>
              <h3 className="mt-5 text-xl font-black text-zinc-950">Conecte em poucos segundos</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">O QR Code temporário será mostrado aqui e nunca ficará salvo no navegador.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
