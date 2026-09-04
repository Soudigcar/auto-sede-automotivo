'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { apiErrorMessage } from '@/lib/client/apiErrorMessage';

type Props = {
  message: any;
  outbound?: boolean;
  compact?: boolean;
};

export function WhatsappEditedMessage({ message, outbound = false, compact = false }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [body, setBody] = useState('Recuperando mensagem editada...');
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolveEdit() {
      setLoading(true);
      setUnavailable(false);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token || '';
        if (!token) throw new Error('Sessão expirada.');

        const response = await fetch(`/api/whatsapp/messages/resolve-edit?message_id=${encodeURIComponent(String(message?.id || ''))}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(result, 'Não foi possível recuperar a edição.'));
        if (!active) return;

        setBody(String(result.body || 'Mensagem editada — conteúdo atualizado não pôde ser recuperado.'));
        setUnavailable(result.content_unavailable === true);
      } catch (error: any) {
        if (!active) return;
        setBody(apiErrorMessage(error, 'Mensagem editada — conteúdo atualizado não pôde ser recuperado.'));
        setUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (message?.id) void resolveEdit();
    return () => {
      active = false;
    };
  }, [message?.id, supabase]);

  return (
    <div className="space-y-1">
      <p className={`whitespace-pre-wrap break-words font-semibold ${compact ? 'text-[13px] leading-snug' : 'text-sm leading-relaxed'} ${loading ? (outbound ? 'text-white/70' : 'text-zinc-500') : ''}`}>{body}</p>
      <p className={`text-[9px] font-black uppercase tracking-wide ${outbound ? 'text-white/60' : unavailable ? 'text-amber-600' : 'text-zinc-400'}`}>
        {loading ? 'Edição do WhatsApp' : unavailable ? 'Editada · conteúdo atualizado indisponível' : 'Editada'}
      </p>
    </div>
  );
}
