'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

function dateText(value?: string) { return value ? value.split('-').reverse().join('/') : '-'; }

export function EventListManager({ refreshKey = 0 }: { refreshKey?: number }) {
  const supabase = createClient();
  const [events, setEvents] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function loadData() {
    const { data } = await supabase.from('events').select('*').neq('status', 'deleted').order('created_at', { ascending: false });
    setEvents(data || []);
  }

  useEffect(() => { loadData().catch(() => null); }, [refreshKey]);

  async function removeEvent(item: any) {
    const confirmation = window.prompt(`Para excluir ${item.event_name} e seus dados vinculados, digite EXCLUIR.`);
    if (confirmation !== 'EXCLUIR') return;
    const response = await fetch('/api/master/events/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: item.id, confirmation }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(result.error || 'Erro ao excluir evento.'); return; }
    setMessage('Evento excluído com os dados vinculados.');
    await loadData();
  }

  return (
    <section className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Eventos cadastrados</h2>
      <div className="mt-5 space-y-3">
        {events.map((item) => (
          <div key={item.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <h3 className="font-black text-zinc-950">{item.event_name}</h3>
            <p className="mt-1 text-sm text-zinc-500">{item.state || '-'} | {item.city || '-'} | {dateText(item.start_date)} até {dateText(item.end_date)}</p>
            <button className="premium-button-secondary mt-3 text-xs" type="button" onClick={() => removeEvent(item)}><Trash2 size={14} /> Excluir</button>
          </div>
        ))}
        {events.length === 0 ? <p className="text-sm text-zinc-500">Nenhum evento cadastrado.</p> : null}
      </div>
      {message ? <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-sm font-bold text-zinc-600">{message}</p> : null}
    </section>
  );
}
