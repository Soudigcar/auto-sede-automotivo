'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export function StoreWhatsappWebhookButton({ storeSlug }: { storeSlug: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refreshWebhook() {
    setBusy(true);
    setMessage('');

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

      const response = await fetch('/api/store/integrations/whatsapp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'refresh-webhook', slug: storeSlug })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível reconfigurar o webhook.');
      setMessage('Webhook protegido atualizado sem desconectar o WhatsApp.');
    } catch (error: any) {
      setMessage(error?.message || 'Erro ao atualizar o webhook.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void refreshWebhook()}
        disabled={busy}
        className="premium-button-secondary disabled:opacity-50"
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
        Reconfigurar webhook
      </button>
      {message ? <span className="text-sm font-bold text-zinc-500">{message}</span> : null}
    </div>
  );
}
