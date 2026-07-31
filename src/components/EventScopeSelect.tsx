'use client';

type EventItem = {
  id: string;
  event_name?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  city?: string | null;
  state?: string | null;
};

function dateText(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function eventStatusLabel(status?: string | null) {
  if (status === 'active') return 'Ativo';
  if (status === 'inactive') return 'Encerrado';
  return 'Não ativado';
}

export function eventScopeLabel(events: EventItem[], value: string) {
  if (value === 'all') return 'Todos os leads';
  if (value === 'active') return 'Todos os eventos ativos';
  if (value === 'unassigned') return 'Sem evento / campanhas gerais';

  const event = events.find((item) => item.id === value);
  return event?.event_name || 'Evento selecionado';
}

export function EventScopeSelect({
  events,
  value,
  onChange,
  allLabel = 'Todos os leads',
  includeAll = true,
  includeActive = true,
  includeUnassigned = true,
  className = 'premium-input'
}: {
  events: EventItem[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  includeAll?: boolean;
  includeActive?: boolean;
  includeUnassigned?: boolean;
  className?: string;
}) {
  const activeEvents = events.filter((event) => event.status === 'active');
  const historicalEvents = events.filter((event) => event.status !== 'active');

  const optionLabel = (event: EventItem) => {
    const period = [dateText(event.start_date), dateText(event.end_date)].filter(Boolean).join(' a ');
    const place = [event.city, event.state].filter(Boolean).join(' / ');
    return [event.event_name || 'Evento sem nome', period, place, eventStatusLabel(event.status)].filter(Boolean).join(' — ');
  };

  return (
    <select className={className} value={value} onChange={(event) => onChange(event.target.value)}>
      {includeAll ? <option value="all">{allLabel}</option> : null}
      {includeActive ? <option value="active">Todos os eventos ativos ({activeEvents.length})</option> : null}

      {activeEvents.length ? (
        <optgroup label="Eventos ativos">
          {activeEvents.map((event) => <option key={event.id} value={event.id}>{optionLabel(event)}</option>)}
        </optgroup>
      ) : null}

      {historicalEvents.length ? (
        <optgroup label="Eventos encerrados e não ativados">
          {historicalEvents.map((event) => <option key={event.id} value={event.id}>{optionLabel(event)}</option>)}
        </optgroup>
      ) : null}

      {includeUnassigned ? <option value="unassigned">Sem evento / campanhas gerais</option> : null}
    </select>
  );
}
