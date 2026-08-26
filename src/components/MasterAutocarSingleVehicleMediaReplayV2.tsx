'use client';

import { useMemo, useState } from 'react';
import { Bot, Images, Loader2, Play, ShieldCheck } from 'lucide-react';
import { MasterSidebar } from '@/components/MasterSidebar';
import { createClient } from '@/lib/supabase';

const A4_STORE_ID = '239755c3-a2d4-4cdd-9502-f1595031c924';

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 500) }; }
}

export function MasterAutocarSingleVehicleMediaReplayV2() {
  const supabase = useMemo(() => createClient(), []);
  const [conversationId, setConversationId] = useState('');
  const [messageId, setMessageId] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function replay() {
    const cleanConversation = conversationId.trim();
    const cleanMessage = messageId.trim();
    if (!cleanConversation) return;
    setBusy(true);
    setResult(null);
    setMessage('Executando Replay V2 read-only com mídia de veículo único...');
    try {
      const { data } = await supabase.auth.getSession();
      const access = data.session?.access_token || '';
      if (!access) throw new Error('Sessão Master expirada.');
      const response = await fetch('/api/master/autocar/replay-v2', {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: A4_STORE_ID, conversation_id: cleanConversation, message_id: cleanMessage || null }),
        cache: 'no-store'
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error || 'Falha ao executar replay.');
      setResult(body);
      setMessage('Replay concluído. Nenhuma foto ou mensagem foi enviada ao WhatsApp.');
    } catch (error: any) {
      setMessage(error?.message || 'Falha ao executar replay.');
    } finally {
      setBusy(false);
    }
  }

  const shadow = result?.shadow || null;
  const media = shadow?.single_vehicle_media || null;
  const evaluation = result?.evaluation || null;
  const photos = Array.isArray(media?.photos) ? media.photos : [];

  return <main className="premium-page"><section className="premium-shell flex min-h-screen"><MasterSidebar active="/master/autocar/replay-v2"/><div className="premium-canvas min-w-0 flex-1 p-4 md:p-7"><header><div className="flex items-center gap-2 text-red-600"><Bot size={18}/><span className="premium-eyebrow">AUTOCAR · INTELLIGENCE V2 · PREVIEW READ-ONLY</span></div><h1 className="premium-title mt-2 text-4xl md:text-5xl">Replay V2 · fotos do veículo escolhido</h1><p className="premium-muted mt-3 max-w-4xl text-sm">Quando a IA escolhe um único veículo e propõe enviar fotos, o backend apresenta até 3 imagens reais desse carro antes da continuidade comercial. Nada é enviado de verdade.</p></header><section className="premium-card mt-6 p-5 md:p-6"><div className="grid gap-4 lg:grid-cols-2"><label className="text-xs font-black">ID da conversa da A4<input className="premium-input mt-1.5" value={conversationId} onChange={(event) => setConversationId(event.target.value)} placeholder="Cole o conversation_id"/></label><label className="text-xs font-black">ID da mensagem inbound histórica <span className="font-semibold text-zinc-500">(opcional)</span><input className="premium-input mt-1.5" value={messageId} onChange={(event) => setMessageId(event.target.value)} placeholder="Cole o message_id"/></label></div><button type="button" onClick={() => void replay()} disabled={busy || !conversationId.trim()} className="premium-button-primary mt-3 w-full justify-center"><Play size={16}/>{busy ? 'Executando...' : 'Executar Replay com Fotos'}</button></section>{message ? <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-bold text-zinc-700">{busy ? <Loader2 size={16} className="mr-2 inline animate-spin text-red-600"/> : null}{message}</div> : null}{result ? <div className="mt-5 space-y-5"><section className="premium-card p-5"><div className="flex items-center gap-2"><Images size={18} className="text-red-600"/><h2 className="text-lg font-black">Apresentação do veículo</h2></div>{media?.ready ? <><div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700"><p><strong>{media.vehicle?.title || 'Veículo'}</strong></p><p className="mt-1">{[media.vehicle?.year, media.vehicle?.mileage, media.vehicle?.fuel, media.vehicle?.transmission, media.vehicle?.price_brl].filter(Boolean).join(' · ')}</p></div><div className="mt-5 grid gap-4 md:grid-cols-3">{photos.map((photo: string, index: number) => <figure key={`${photo}-${index}`} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><img src={photo} alt={`${media.vehicle?.title || 'Veículo'} · foto ${index + 1}`} className="h-64 w-full object-cover"/><figcaption className="p-3 text-xs font-bold text-zinc-500">Foto real {index + 1} de {photos.length}</figcaption></figure>)}</div><p className="mt-5 text-base font-bold leading-7 text-zinc-900">{media.closing_message || shadow?.response || '—'}</p></> : <p className="mt-4 text-sm font-semibold text-zinc-500">A IA não propôs envio de fotos grounded para exatamente um veículo neste replay.</p>}</section><section className="grid gap-5 lg:grid-cols-2"><div className="premium-card p-5"><h2 className="text-lg font-black">Decisão da IA</h2><p className="mt-3 text-sm text-zinc-700"><strong>Mensagem atual:</strong> {result?.current_inbound?.body || '—'}</p><p className="mt-3 text-sm text-zinc-700"><strong>Resposta:</strong> {shadow?.response || '—'}</p><p className="mt-3 text-sm text-zinc-700"><strong>Próxima ação:</strong> {shadow?.next_best_action || '—'}</p><p className="mt-3 text-sm text-zinc-700"><strong>Fotos grounded:</strong> {media?.photo_count ?? 0} / {media?.max_photos ?? 3}</p><p className="mt-3 text-sm text-zinc-700"><strong>Fonte:</strong> {media?.source || '—'}</p></div><div className="premium-card p-5"><div className="flex items-center gap-2 text-red-600"><ShieldCheck size={18}/><h2 className="text-lg font-black">Governança</h2></div><div className={`mt-4 rounded-xl px-4 py-3 text-center text-xs font-black uppercase ${evaluation?.pass ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'}`}>{evaluation?.pass ? 'REPLAY PASSOU' : 'REGRESSÃO DETECTADA'}</div><div className="mt-4 space-y-2 text-sm text-zinc-700"><p><strong>Referência ambígua:</strong> {evaluation?.regression_flags?.invalid_single_vehicle_reference_count ? 'SIM' : 'NÃO'}</p><p><strong>Sem fotos grounded:</strong> {evaluation?.regression_flags?.missing_single_vehicle_grounded_photos ? 'SIM' : 'NÃO'}</p><p><strong>Afirmou fotos já enviadas:</strong> {evaluation?.regression_flags?.premature_photo_sent_claim ? 'SIM' : 'NÃO'}</p><p><strong>Transfer indevido:</strong> {evaluation?.regression_flags?.transfer_action_without_customer_request ? 'SIM' : 'NÃO'}</p><p className="text-emerald-700"><strong>Execução externa:</strong> NÃO</p></div></div></section></div> : null}</div></section></main>;
}
