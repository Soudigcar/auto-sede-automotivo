'use client';

export function EventSelectField({ events, value, onChange, label = 'Evento' }: { events: any[]; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="text-xs font-bold uppercase tracking-wide text-zinc-400">
      {label}
      <select className="premium-input mt-1" value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Selecione o evento</option>
        {events.map((item) => <option key={item.id} value={item.id}>{item.event_name}</option>)}
      </select>
    </label>
  );
}
