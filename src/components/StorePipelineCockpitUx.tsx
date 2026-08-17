'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  Plus,
  RotateCcw,
  Settings2,
  Timer,
  Trash2,
  UserRound,
  UserRoundCheck,
  X
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type PipelineLead = {
  id: string;
  assigned_user_id?: string | null;
  seller_user_id?: string | null;
  pre_sales_user_id?: string | null;
  captured_by_user_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  first_viewed_at?: string | null;
  first_phone_viewed_at?: string | null;
  first_whatsapp_clicked_at?: string | null;
};

type TeamMember = {
  id: string;
  full_name: string;
  role: string;
  role_label: string;
};

type PipelineSummary = {
  team?: TeamMember[];
  leads?: PipelineLead[];
};

type StageConfig = {
  id: string;
  systemKey: string | null;
  name: string;
  color: string;
  visible: boolean;
  system: boolean;
  order: number;
};

type CustomAssignment = {
  stageId: string;
  sourceStatus: string;
  assignedAt: string;
};

type AssignmentMap = Record<string, CustomAssignment>;

const DEFAULT_STAGES: StageConfig[] = [
  { id: 'new_lead', systemKey: 'new_lead', name: 'Novo Lead Recebido', color: '#3b82f6', visible: true, system: true, order: 0 },
  { id: 'in_service', systemKey: 'in_service', name: 'Em Atendimento', color: '#8b5cf6', visible: true, system: true, order: 1 },
  { id: 'scheduled', systemKey: 'scheduled', name: 'Agendado', color: '#f59e0b', visible: true, system: true, order: 2 },
  { id: 'appointment_cancelled', systemKey: 'appointment_cancelled', name: 'Cancelou Agendamento', color: '#f97316', visible: true, system: true, order: 3 },
  { id: 'no_show', systemKey: 'no_show', name: 'Não Compareceu', color: '#71717a', visible: true, system: true, order: 4 },
  { id: 'showed_up', systemKey: 'showed_up', name: 'Compareceu', color: '#10b981', visible: true, system: true, order: 5 },
  { id: 'sale_confirmed', systemKey: 'sale_confirmed', name: 'Venda Confirmada', color: '#22c55e', visible: true, system: true, order: 6 },
  { id: 'lost', systemKey: 'lost', name: 'Perdido', color: '#ef4444', visible: true, system: true, order: 7 }
];

const COLOR_PRESETS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#06b6d4', '#10b981', '#22c55e', '#ef4444', '#ec4899', '#64748b'];
const FINAL_STATUSES = new Set(['sale_confirmed', 'lost', 'deleted']);
const MAX_CUSTOM_STAGES = 6;

function isPipeline(pathname: string) {
  return /^\/loja\/[^/]+\/pipeline\/?$/.test(pathname);
}

function slugFrom(pathname: string) {
  return pathname.match(/^\/loja\/([^/]+)\/pipeline\/?$/)?.[1] || '';
}

function responsibleId(lead: PipelineLead) {
  return lead.assigned_user_id || lead.seller_user_id || lead.pre_sales_user_id || lead.captured_by_user_id || '';
}

function percentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function firstResponseAt(lead: PipelineLead) {
  const candidates = [lead.first_whatsapp_clicked_at, lead.first_phone_viewed_at, lead.first_viewed_at]
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter((value) => Number.isFinite(value));
  return candidates.length ? Math.min(...candidates) : null;
}

function averageResponseMinutes(leads: PipelineLead[]) {
  const samples = leads.flatMap((lead) => {
    const createdAt = lead.created_at ? new Date(lead.created_at).getTime() : NaN;
    const responseAt = firstResponseAt(lead);
    if (!Number.isFinite(createdAt) || responseAt === null || responseAt < createdAt) return [];
    return [(responseAt - createdAt) / 60_000];
  });

  if (!samples.length) return { minutes: null as number | null, measured: 0 };
  return {
    minutes: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    measured: samples.length
  };
}

function formatResponseTime(minutes: number | null) {
  if (minutes === null) return '—';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function validColor(value: unknown, fallback: string) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function stageStorageKey(slug: string) {
  return `auto-controle-pipeline-stages:${slug}`;
}

function assignmentStorageKey(slug: string) {
  return `auto-controle-pipeline-custom-assignments:${slug}`;
}

function normalizeStages(value: unknown): StageConfig[] {
  const stored = Array.isArray(value) ? value as Array<Partial<StageConfig>> : [];
  const system = DEFAULT_STAGES.map((base) => {
    const candidate = stored.find((item) => item.id === base.id || item.systemKey === base.systemKey);
    return {
      ...base,
      name: String(candidate?.name || '').trim().slice(0, 48) || base.name,
      color: validColor(candidate?.color, base.color),
      visible: candidate?.visible !== false,
      order: Number.isFinite(Number(candidate?.order)) ? Number(candidate?.order) : base.order
    };
  });

  const custom = stored
    .filter((item) => item.system === false && String(item.id || '').startsWith('custom_'))
    .slice(0, MAX_CUSTOM_STAGES)
    .map((item, index) => ({
      id: String(item.id),
      systemKey: null,
      name: String(item.name || '').trim().slice(0, 48) || `Etapa personalizada ${index + 1}`,
      color: validColor(item.color, COLOR_PRESETS[(index + 4) % COLOR_PRESETS.length]),
      visible: item.visible !== false,
      system: false,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : DEFAULT_STAGES.length + index
    }));

  return [...system, ...custom]
    .sort((left, right) => left.order - right.order)
    .map((stage, order) => ({ ...stage, order }));
}

function normalizeAssignments(value: unknown): AssignmentMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, any>).flatMap(([leadId, raw]) => {
    const stageId = String(raw?.stageId || '');
    const sourceStatus = String(raw?.sourceStatus || '');
    if (!leadId || !stageId.startsWith('custom_') || !sourceStatus) return [];
    return [[leadId, {
      stageId,
      sourceStatus,
      assignedAt: String(raw?.assignedAt || new Date().toISOString())
    } as CustomAssignment] as const];
  });
  return Object.fromEntries(entries);
}

function createCustomColumn(stageId: string) {
  const column = document.createElement('div');
  column.dataset.pipelineCustomStage = stageId;
  column.className = 'pipeline-custom-column';

  const header = document.createElement('div');
  header.className = 'pipeline-custom-column-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'pipeline-custom-column-title';
  const dot = document.createElement('span');
  dot.className = 'pipeline-custom-column-dot';
  const title = document.createElement('h2');
  title.dataset.pipelineCustomTitle = 'true';
  titleWrap.append(dot, title);

  const count = document.createElement('span');
  count.dataset.pipelineCustomCount = 'true';
  count.className = 'pipeline-custom-column-count';
  header.append(titleWrap, count);

  const cards = document.createElement('div');
  cards.dataset.pipelineCustomCards = 'true';
  cards.className = 'pipeline-custom-column-cards';

  const empty = document.createElement('div');
  empty.dataset.pipelineCustomEmpty = 'true';
  empty.className = 'pipeline-custom-column-empty';
  empty.textContent = 'Solte o card aqui';
  cards.appendChild(empty);

  column.append(header, cards);
  column.addEventListener('dragover', (event) => {
    event.preventDefault();
    column.classList.add('is-drag-over');
  });
  column.addEventListener('dragleave', () => column.classList.remove('is-drag-over'));
  column.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    column.classList.remove('is-drag-over');
    const leadId = event.dataTransfer?.getData('text/plain') || '';
    if (!leadId) return;
    window.dispatchEvent(new CustomEvent('pipeline-assign-custom-stage', {
      detail: { leadId, stageId: column.dataset.pipelineCustomStage }
    }));
  });

  return column;
}

function systemCardsHost(column: HTMLElement) {
  return Array.from(column.children).find((child) => (child as HTMLElement).classList.contains('space-y-2')) as HTMLElement | undefined;
}

export function StorePipelineCockpitUx() {
  const pathname = usePathname() || '';
  const active = isPipeline(pathname);
  const slug = slugFrom(pathname);
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [heroHost, setHeroHost] = useState<HTMLElement | null>(null);
  const [selectedResponsible, setSelectedResponsible] = useState('all');
  const [stages, setStages] = useState<StageConfig[]>(DEFAULT_STAGES);
  const [assignments, setAssignments] = useState<AssignmentMap>({});
  const [storageReady, setStorageReady] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftStages, setDraftStages] = useState<StageConfig[]>(DEFAULT_STAGES);
  const [customizeMessage, setCustomizeMessage] = useState('');
  const [toast, setToast] = useState('');
  const summaryRef = useRef<PipelineSummary | null>(null);
  const stagesRef = useRef<StageConfig[]>(DEFAULT_STAGES);
  const assignmentsRef = useRef<AssignmentMap>({});

  useEffect(() => { summaryRef.current = summary; }, [summary]);
  useEffect(() => { stagesRef.current = stages; }, [stages]);
  useEffect(() => { assignmentsRef.current = assignments; }, [assignments]);

  useEffect(() => {
    if (!active || !slug) return;
    try {
      const savedStages = window.localStorage.getItem(stageStorageKey(slug));
      const savedAssignments = window.localStorage.getItem(assignmentStorageKey(slug));
      setStages(normalizeStages(savedStages ? JSON.parse(savedStages) : null));
      setAssignments(normalizeAssignments(savedAssignments ? JSON.parse(savedAssignments) : null));
    } catch {
      setStages(DEFAULT_STAGES);
      setAssignments({});
    } finally {
      setStorageReady(true);
    }
  }, [active, slug]);

  useEffect(() => {
    if (!active || !slug || !storageReady) return;
    window.localStorage.setItem(assignmentStorageKey(slug), JSON.stringify(assignments));
  }, [active, assignments, slug, storageReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!active) return;
    const onPipelineData = (event: Event) => {
      const payload = (event as CustomEvent<PipelineSummary>).detail;
      if (payload?.leads) setSummary(payload);
    };
    window.addEventListener('pipeline-data-updated', onPipelineData as EventListener);
    return () => window.removeEventListener('pipeline-data-updated', onPipelineData as EventListener);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onResponsibleChange = (event: Event) => {
      const value = (event as CustomEvent<{ value?: string }>).detail?.value || 'all';
      setSelectedResponsible(value);
    };
    window.addEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
    return () => window.removeEventListener('pipeline-responsible-change', onResponsibleChange as EventListener);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.dispatchEvent(new CustomEvent('pipeline-responsible-options', {
      detail: {
        team: (summary?.team || []).filter((member) => member.role !== 'store'),
        selected: selectedResponsible
      }
    }));
  }, [active, selectedResponsible, summary]);

  useEffect(() => {
    if (!active) return;

    const assign = (event: Event) => {
      const detail = (event as CustomEvent<{ leadId?: string; stageId?: string }>).detail || {};
      const lead = summaryRef.current?.leads?.find((item) => item.id === detail.leadId);
      const stage = stagesRef.current.find((item) => item.id === detail.stageId && !item.system);
      if (!lead || !stage) return;
      const status = String(lead.status || 'new_lead');
      if (FINAL_STATUSES.has(status)) {
        setToast('Etapas finais de venda, perda ou exclusão permanecem protegidas.');
        return;
      }
      setAssignments((current) => ({
        ...current,
        [lead.id]: { stageId: stage.id, sourceStatus: status, assignedAt: new Date().toISOString() }
      }));
      setToast(`Lead organizado em ${stage.name}.`);
    };

    const clearOne = (event: Event) => {
      const leadId = (event as CustomEvent<{ leadId?: string }>).detail?.leadId;
      if (!leadId) return;
      setAssignments((current) => {
        if (!current[leadId]) return current;
        const next = { ...current };
        delete next[leadId];
        return next;
      });
    };

    const clearMany = (event: Event) => {
      const leadIds = (event as CustomEvent<{ leadIds?: string[] }>).detail?.leadIds || [];
      if (!leadIds.length) return;
      setAssignments((current) => {
        const next = { ...current };
        leadIds.forEach((leadId) => delete next[leadId]);
        return next;
      });
    };

    window.addEventListener('pipeline-assign-custom-stage', assign as EventListener);
    window.addEventListener('pipeline-clear-custom-assignment', clearOne as EventListener);
    window.addEventListener('pipeline-clear-custom-assignments', clearMany as EventListener);
    return () => {
      window.removeEventListener('pipeline-assign-custom-stage', assign as EventListener);
      window.removeEventListener('pipeline-clear-custom-assignment', clearOne as EventListener);
      window.removeEventListener('pipeline-clear-custom-assignments', clearMany as EventListener);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;

    const decorate = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const pageMain = Array.from(document.querySelectorAll<HTMLElement>('main')).find((item) => item.querySelector('h1')?.textContent?.includes('Pipeline da Loja'));
        const hero = pageMain ? Array.from(pageMain.querySelectorAll<HTMLElement>('header')).find((item) => item.querySelector('h1')?.textContent?.includes('Pipeline da Loja')) || null : null;
        const board = Array.from(document.querySelectorAll<HTMLElement>('div.grid')).find((element) => element.className.includes('grid-cols-8') && element.children.length >= 6) || null;
        setHeroHost((current) => current === hero ? current : hero);
        hero?.classList.add('pipeline-cockpit-host');
        if (!board) return;

        board.classList.add('pipeline-cockpit-board');
        const currentStages = stagesRef.current;
        const currentAssignments = assignmentsRef.current;
        const leadList = summaryRef.current?.leads || [];
        const leadMap = new Map(leadList.map((lead) => [lead.id, lead]));
        const stageMap = new Map(currentStages.map((stage) => [stage.id, stage]));
        const baseColumns = Array.from(board.children).filter((child) => !(child as HTMLElement).dataset.pipelineCustomStage) as HTMLElement[];

        DEFAULT_STAGES.forEach((base, index) => {
          const column = baseColumns[index];
          if (!column) return;
          column.dataset.pipelineSystemStage = base.systemKey || base.id;
          column.classList.add('pipeline-native-stage-column');
          if (!column.dataset.pipelineClearAssignmentHook) {
            column.dataset.pipelineClearAssignmentHook = 'true';
            column.addEventListener('drop', (event) => {
              const leadId = event.dataTransfer?.getData('text/plain') || '';
              if (leadId) window.dispatchEvent(new CustomEvent('pipeline-clear-custom-assignment', { detail: { leadId } }));
            }, true);
          }
        });

        const validCustomIds = new Set(currentStages.filter((stage) => !stage.system).map((stage) => stage.id));
        Array.from(board.children).forEach((child) => {
          const node = child as HTMLElement;
          const customId = node.dataset.pipelineCustomStage;
          if (!customId || validCustomIds.has(customId)) return;
          node.querySelectorAll<HTMLElement>('[data-lead-id]').forEach((card) => {
            const lead = leadMap.get(card.dataset.leadId || '');
            const target = lead ? baseColumns.find((column) => column.dataset.pipelineSystemStage === lead.status) : null;
            const targetHost = target ? systemCardsHost(target) : null;
            if (targetHost) targetHost.appendChild(card);
          });
          node.remove();
        });

        currentStages.filter((stage) => !stage.system).forEach((stage) => {
          let column = Array.from(board.children).find((child) => (child as HTMLElement).dataset.pipelineCustomStage === stage.id) as HTMLElement | undefined;
          if (!column) {
            column = createCustomColumn(stage.id);
            board.appendChild(column);
          }
          column.dataset.pipelineCustomStage = stage.id;
          column.style.order = String(stage.order);
          column.style.display = stage.visible ? '' : 'none';
          column.style.setProperty('--pipeline-stage-color', stage.color);
          const title = column.querySelector<HTMLElement>('[data-pipeline-custom-title]');
          if (title && title.textContent !== stage.name) title.textContent = stage.name;
        });

        const visibleCount = Math.max(1, currentStages.filter((stage) => stage.visible).length);
        board.style.gridTemplateColumns = `repeat(${visibleCount}, minmax(208px, 1fr))`;
        board.style.minWidth = `${Math.max(visibleCount * 218, 880)}px`;

        const filteredLeads = leadList.filter((lead) => selectedResponsible === 'all' || responsibleId(lead) === selectedResponsible);
        const filteredIds = new Set(filteredLeads.map((lead) => lead.id));
        const staleAssignments: string[] = [];

        Object.entries(currentAssignments).forEach(([leadId, assignment]) => {
          const lead = leadMap.get(leadId);
          const stage = stageMap.get(assignment.stageId);
          if (!lead || !stage || stage.system || String(lead.status || '') !== assignment.sourceStatus || FINAL_STATUSES.has(String(lead.status || ''))) {
            staleAssignments.push(leadId);
          }
        });

        const staleSet = new Set(staleAssignments);
        const effectiveAssignments = Object.fromEntries(Object.entries(currentAssignments).filter(([leadId]) => !staleSet.has(leadId)));
        const cards = new Map(Array.from(document.querySelectorAll<HTMLElement>('[data-lead-id]')).map((card) => [card.dataset.leadId || '', card]));

        cards.forEach((card, leadId) => {
          card.style.display = filteredIds.has(leadId) ? '' : 'none';
        });

        Object.entries(effectiveAssignments).forEach(([leadId, assignment]) => {
          const card = cards.get(leadId);
          const customColumn = Array.from(board.children).find((child) => (child as HTMLElement).dataset.pipelineCustomStage === assignment.stageId) as HTMLElement | undefined;
          const cardsHost = customColumn?.querySelector<HTMLElement>('[data-pipeline-custom-cards]');
          if (card && cardsHost && card.parentElement !== cardsHost) cardsHost.appendChild(card);
        });

        currentStages.forEach((stage) => {
          if (!stage.system || !stage.systemKey) return;
          const column = baseColumns.find((item) => item.dataset.pipelineSystemStage === stage.systemKey);
          if (!column) return;
          column.style.order = String(stage.order);
          column.style.display = stage.visible ? '' : 'none';
          column.style.setProperty('--pipeline-stage-color', stage.color);
          const title = column.querySelector<HTMLElement>('h2');
          if (title && title.textContent !== stage.name) title.textContent = stage.name;

          const assignedIds = new Set(Object.entries(effectiveAssignments)
            .filter(([, assignment]) => assignment.sourceStatus === stage.systemKey)
            .map(([leadId]) => leadId));
          const count = filteredLeads.filter((lead) => lead.status === stage.systemKey && !assignedIds.has(lead.id)).length;
          const header = column.firstElementChild as HTMLElement | null;
          const badge = header ? Array.from(header.querySelectorAll<HTMLElement>('span')).find((item) => item.className.includes('rounded-full') && item !== header.querySelector('span')) : null;
          if (badge && badge.textContent !== String(count)) badge.textContent = String(count);

          const host = systemCardsHost(column);
          if (host) {
            let derivedEmpty = host.querySelector<HTMLElement>('[data-pipeline-derived-empty]');
            const hasVisibleCard = Array.from(host.querySelectorAll<HTMLElement>('[data-lead-id]')).some((card) => card.style.display !== 'none');
            const hasNativeEmpty = !host.querySelector('[data-lead-id]') && String(host.textContent || '').includes('Solte o card aqui');
            if (count === 0 && !hasVisibleCard && !hasNativeEmpty) {
              if (!derivedEmpty) {
                derivedEmpty = document.createElement('div');
                derivedEmpty.dataset.pipelineDerivedEmpty = 'true';
                derivedEmpty.className = 'pipeline-derived-empty';
                derivedEmpty.textContent = 'Solte o card aqui';
                host.appendChild(derivedEmpty);
              }
            } else if (derivedEmpty) {
              derivedEmpty.remove();
            }
          }
        });

        currentStages.filter((stage) => !stage.system).forEach((stage) => {
          const column = Array.from(board.children).find((child) => (child as HTMLElement).dataset.pipelineCustomStage === stage.id) as HTMLElement | undefined;
          if (!column) return;
          const count = filteredLeads.filter((lead) => effectiveAssignments[lead.id]?.stageId === stage.id).length;
          const countNode = column.querySelector<HTMLElement>('[data-pipeline-custom-count]');
          const emptyNode = column.querySelector<HTMLElement>('[data-pipeline-custom-empty]');
          if (countNode && countNode.textContent !== String(count)) countNode.textContent = String(count);
          if (emptyNode) emptyNode.style.display = count ? 'none' : '';
        });

        if (staleAssignments.length) {
          window.dispatchEvent(new CustomEvent('pipeline-clear-custom-assignments', { detail: { leadIds: staleAssignments } }));
        }
      });
    };

    decorate();
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [active, assignments, selectedResponsible, stages, summary]);

  if (!active) return null;

  const visibleLeads = (summary?.leads || []).filter((lead) => selectedResponsible === 'all' || responsibleId(lead) === selectedResponsible);
  const total = visibleLeads.length;
  const newLeads = visibleLeads.filter((lead) => lead.status === 'new_lead').length;
  const inService = visibleLeads.filter((lead) => lead.status === 'in_service').length;
  const scheduled = visibleLeads.filter((lead) => lead.status === 'scheduled').length;
  const showedUp = visibleLeads.filter((lead) => lead.status === 'showed_up').length;
  const closed = visibleLeads.filter((lead) => lead.status === 'sale_confirmed').length;
  const response = averageResponseMinutes(visibleLeads);

  const indicators = [
    { label: 'Novos', value: String(newLeads), detail: `${percentage(newLeads, total)}% do total`, icon: UserRound, tone: 'coral' },
    { label: 'Em atendimento', value: String(inService), detail: `${percentage(inService, total)}% do total`, icon: Headphones, tone: 'orange' },
    { label: 'Agendados', value: String(scheduled), detail: `${percentage(scheduled, total)}% do total`, icon: CalendarClock, tone: 'amber' },
    { label: 'Compareceram', value: String(showedUp), detail: `${percentage(showedUp, total)}% do total`, icon: UserRoundCheck, tone: 'cyan' },
    { label: 'Fechados', value: String(closed), detail: `${percentage(closed, total)}% do total`, icon: CircleCheckBig, tone: 'green' },
    { label: 'Tempo de resposta', value: formatResponseTime(response.minutes), detail: response.measured ? `média de ${response.measured} lead${response.measured === 1 ? '' : 's'}` : 'sem resposta medida', icon: Timer, tone: 'blue' }
  ];

  function openCustomization() {
    setDraftStages(stages.map((stage) => ({ ...stage })));
    setCustomizeMessage('');
    setCustomizeOpen(true);
  }

  function updateDraft(id: string, patch: Partial<StageConfig>) {
    setDraftStages((current) => current.map((stage) => stage.id === id ? { ...stage, ...patch } : stage));
  }

  function moveDraft(id: string, direction: -1 | 1) {
    setDraftStages((current) => {
      const ordered = [...current].sort((left, right) => left.order - right.order);
      const index = ordered.findIndex((stage) => stage.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return current;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered.map((stage, order) => ({ ...stage, order }));
    });
  }

  function addDraftStage() {
    const customCount = draftStages.filter((stage) => !stage.system).length;
    if (customCount >= MAX_CUSTOM_STAGES) {
      setCustomizeMessage(`O Preview permite até ${MAX_CUSTOM_STAGES} etapas personalizadas por loja.`);
      return;
    }
    const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const next: StageConfig = {
      id,
      systemKey: null,
      name: 'Nova etapa',
      color: COLOR_PRESETS[(draftStages.length + 2) % COLOR_PRESETS.length],
      visible: true,
      system: false,
      order: draftStages.length
    };
    setDraftStages((current) => [...current, next]);
    setCustomizeMessage('Nova etapa adicionada. Dê um nome e escolha a cor.');
  }

  function deleteDraftStage(stage: StageConfig) {
    if (stage.system) return;
    const mapped = Object.values(assignments).filter((assignment) => assignment.stageId === stage.id).length;
    if (mapped && !window.confirm(`Esta etapa organiza ${mapped} lead(s). Ao excluir, eles voltarão para a etapa técnica original. Continuar?`)) return;
    setDraftStages((current) => current.filter((item) => item.id !== stage.id).map((item, order) => ({ ...item, order })));
    setCustomizeMessage('Etapa removida do rascunho. Salve para aplicar.');
  }

  function restoreDefaults() {
    if (!window.confirm('Restaurar nomes, cores, ordem e visibilidade padrão e remover etapas personalizadas?')) return;
    setDraftStages(DEFAULT_STAGES.map((stage) => ({ ...stage })));
    setCustomizeMessage('Padrão restaurado no rascunho. Clique em Salvar personalização para aplicar.');
  }

  function saveCustomization() {
    const normalized = normalizeStages(draftStages);
    const names = normalized.map((stage) => stage.name.trim().toLocaleLowerCase('pt-BR'));
    if (names.some((name) => !name)) {
      setCustomizeMessage('Todas as etapas precisam ter um nome.');
      return;
    }
    if (new Set(names).size !== names.length) {
      setCustomizeMessage('Use nomes diferentes para cada etapa.');
      return;
    }
    if (!normalized.some((stage) => stage.visible)) {
      setCustomizeMessage('Mantenha pelo menos uma etapa visível.');
      return;
    }

    const validCustomIds = new Set(normalized.filter((stage) => !stage.system).map((stage) => stage.id));
    setAssignments((current) => Object.fromEntries(Object.entries(current).filter(([, assignment]) => validCustomIds.has(assignment.stageId))));
    setStages(normalized);
    window.localStorage.setItem(stageStorageKey(slug), JSON.stringify(normalized));
    setCustomizeOpen(false);
    setToast('Personalização da pipeline salva neste Preview.');
  }

  const dashboard = (
    <div className="pipeline-kpi-strip-shell" aria-label="Indicadores da pipeline">
      <div className="pipeline-kpi-strip">
        {indicators.map((indicator) => {
          const Icon = indicator.icon;
          return (
            <div key={indicator.label} className="pipeline-kpi-item">
              <span className={`pipeline-kpi-icon tone-${indicator.tone}`}><Icon size={23} /></span>
              <div className="pipeline-kpi-copy">
                <span className="pipeline-kpi-label">{indicator.label}</span>
                <strong className="pipeline-kpi-value">{indicator.value}</strong>
                <small className="pipeline-kpi-detail">{indicator.detail}</small>
              </div>
            </div>
          );
        })}
        <button type="button" className="pipeline-customize-trigger" onClick={openCustomization}>
          <Settings2 size={21} />
          <span><strong>Personalizar pipeline</strong><small>Etapas, ordem e cores</small></span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{styles}</style>
      {heroHost ? createPortal(dashboard, heroHost) : null}
      {toast ? <div className="pipeline-preview-toast">{toast}</div> : null}
      {customizeOpen && typeof document !== 'undefined' ? createPortal(
        <div className="pipeline-customize-overlay" role="dialog" aria-modal="true" aria-label="Personalizar pipeline" onMouseDown={() => setCustomizeOpen(false)}>
          <section className="pipeline-customize-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header className="pipeline-customize-header">
              <div>
                <p>Configuração da loja</p>
                <h2>Personalizar pipeline</h2>
                <span>Renomeie, ordene, oculte e altere cores. Etapas estruturais são protegidas; etapas personalizadas podem ser excluídas.</span>
              </div>
              <button type="button" onClick={() => setCustomizeOpen(false)} aria-label="Fechar"><X size={20} /></button>
            </header>

            <div className="pipeline-customize-note">
              <LockKeyhole size={17} />
              <span><strong>Proteção operacional:</strong> Venda, perda, agendamento e demais estados estruturais continuam auditados. As novas etapas do Preview organizam visualmente os cards sem alterar essas regras críticas.</span>
            </div>

            <div className="pipeline-customize-toolbar">
              <button type="button" onClick={addDraftStage}><Plus size={17} /> Adicionar etapa</button>
              <button type="button" onClick={restoreDefaults}><RotateCcw size={16} /> Restaurar padrão</button>
            </div>

            {customizeMessage ? <div className="pipeline-customize-message">{customizeMessage}</div> : null}

            <div className="pipeline-stage-editor-list">
              {[...draftStages].sort((left, right) => left.order - right.order).map((stage, index, ordered) => (
                <article key={stage.id} className="pipeline-stage-editor-row" style={{ '--editor-stage-color': stage.color } as React.CSSProperties}>
                  <div className="pipeline-stage-order-controls">
                    <button type="button" disabled={index === 0} onClick={() => moveDraft(stage.id, -1)} aria-label={`Subir ${stage.name}`}><ChevronUp size={16} /></button>
                    <button type="button" disabled={index === ordered.length - 1} onClick={() => moveDraft(stage.id, 1)} aria-label={`Descer ${stage.name}`}><ChevronDown size={16} /></button>
                  </div>

                  <span className="pipeline-stage-editor-dot" />

                  <label className="pipeline-stage-name-field">
                    <span>Nome</span>
                    <input value={stage.name} maxLength={48} onChange={(event) => updateDraft(stage.id, { name: event.target.value })} />
                  </label>

                  <label className="pipeline-stage-color-field">
                    <span>Cor</span>
                    <div><input type="color" value={stage.color} onChange={(event) => updateDraft(stage.id, { color: event.target.value })} /><code>{stage.color.toUpperCase()}</code></div>
                  </label>

                  <div className="pipeline-stage-presets" aria-label={`Cores rápidas para ${stage.name}`}>
                    {COLOR_PRESETS.slice(0, 6).map((color) => <button key={color} type="button" className={stage.color.toLowerCase() === color.toLowerCase() ? 'is-active' : ''} style={{ background: color }} onClick={() => updateDraft(stage.id, { color })} aria-label={`Usar cor ${color}`} />)}
                  </div>

                  <button type="button" className={`pipeline-stage-visibility ${stage.visible ? 'is-visible' : ''}`} onClick={() => updateDraft(stage.id, { visible: !stage.visible })}>
                    {stage.visible ? <Eye size={16} /> : <EyeOff size={16} />} {stage.visible ? 'Visível' : 'Oculta'}
                  </button>

                  <div className="pipeline-stage-kind">{stage.system ? <><LockKeyhole size={14} /> Estrutural</> : 'Personalizada'}</div>

                  <button type="button" className="pipeline-stage-delete" disabled={stage.system} onClick={() => deleteDraftStage(stage)} title={stage.system ? 'Etapas estruturais não podem ser excluídas' : 'Excluir etapa'}>
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
            </div>

            <footer className="pipeline-customize-footer">
              <button type="button" className="pipeline-customize-cancel" onClick={() => setCustomizeOpen(false)}>Cancelar</button>
              <button type="button" className="pipeline-customize-save" onClick={saveCustomization}>Salvar personalização</button>
            </footer>
          </section>
        </div>, document.body
      ) : null}
    </>
  );
}

const styles = `
  body.pipeline-aura-active .pipeline-cockpit-host {
    position:static!important;
    display:block!important;
    align-self:stretch!important;
    flex:1 1 100%!important;
    min-height:0!important;
    height:auto!important;
    width:100%!important;
    max-width:none!important;
    margin-left:0!important;
    margin-right:0!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    box-shadow:none!important;
  }
  body.pipeline-aura-active .pipeline-cockpit-host > :not(.pipeline-kpi-strip-shell) { display:none!important; }
  body.pipeline-aura-active .pipeline-aura-kpis,
  body.pipeline-aura-active .aura-hero-actions { display:none!important; }

  .pipeline-kpi-strip-shell {
    width:100%;
    max-width:none;
    overflow-x:auto;
    padding:0 1px 2px;
    scrollbar-width:none;
  }
  .pipeline-kpi-strip-shell::-webkit-scrollbar { display:none; }
  .pipeline-kpi-strip {
    display:flex;
    width:100%;
    min-width:1080px;
    min-height:86px;
    align-items:stretch;
    overflow:hidden;
    border:1px solid var(--aura-border);
    border-radius:16px;
    background:color-mix(in srgb,var(--aura-surface) 78%,transparent);
    color:var(--aura-text);
  }
  .pipeline-kpi-item {
    position:relative;
    display:flex;
    min-width:148px;
    flex:1 1 160px;
    align-items:center;
    gap:12px;
    padding:12px 14px;
  }
  .pipeline-kpi-item::after {
    content:'';
    position:absolute;
    top:15px;
    right:0;
    bottom:15px;
    width:1px;
    background:var(--aura-border);
  }
  .pipeline-kpi-icon {
    display:flex;
    width:46px;
    height:46px;
    flex:0 0 46px;
    align-items:center;
    justify-content:center;
    border-radius:13px;
    background:var(--aura-surface-2);
  }
  .tone-coral { color:#fb7185; }
  .tone-orange { color:#fb923c; }
  .tone-amber { color:#fbbf24; }
  .tone-cyan { color:#22d3ee; }
  .tone-green { color:#34d399; }
  .tone-blue { color:#60a5fa; }
  .pipeline-kpi-copy { display:grid; min-width:0; line-height:1; }
  .pipeline-kpi-label { color:var(--aura-soft); font-size:11px; font-weight:900; white-space:nowrap; }
  .pipeline-kpi-value { margin-top:5px; color:var(--aura-text); font-size:25px; font-weight:950; letter-spacing:-.035em; white-space:nowrap; }
  .pipeline-kpi-detail { margin-top:5px; color:var(--aura-muted); font-size:9px; font-weight:750; white-space:nowrap; }
  .pipeline-customize-trigger {
    display:flex;
    min-width:185px;
    flex:0 0 185px;
    align-items:center;
    justify-content:center;
    gap:10px;
    border:0;
    border-left:1px solid var(--aura-border);
    background:color-mix(in srgb,var(--aura-surface-2) 88%,transparent);
    color:var(--aura-soft);
    padding:0 14px;
    text-align:left;
  }
  .pipeline-customize-trigger:hover { background:color-mix(in srgb,#ef2d34 11%,var(--aura-surface-2)); color:var(--aura-text); }
  .pipeline-customize-trigger > span { display:grid; gap:4px; }
  .pipeline-customize-trigger strong { font-size:11px; font-weight:950; white-space:nowrap; }
  .pipeline-customize-trigger small { color:var(--aura-muted); font-size:9px; font-weight:750; white-space:nowrap; }

  body.pipeline-aura-active .pipeline-aura-board-scroll { margin-top:7px!important; padding-top:0!important; }
  body.pipeline-aura-active .pipeline-aura-board > div > div:first-child { top:0!important; }
  body.pipeline-aura-active .pipeline-aura-board > div { min-height:500px!important; }

  body.pipeline-aura-active .pipeline-native-stage-column {
    border-color:color-mix(in srgb,var(--pipeline-stage-color) 26%,var(--aura-border))!important;
    background:color-mix(in srgb,var(--pipeline-stage-color) 4%,var(--aura-surface))!important;
  }
  body.pipeline-aura-active .pipeline-native-stage-column > div:first-child {
    border-color:color-mix(in srgb,var(--pipeline-stage-color) 28%,var(--aura-border))!important;
    background:color-mix(in srgb,var(--pipeline-stage-color) 9%,var(--aura-surface-2))!important;
    color:var(--pipeline-stage-color)!important;
  }
  body.pipeline-aura-active .pipeline-native-stage-column > div:first-child h2 { color:var(--pipeline-stage-color)!important; }
  body.pipeline-aura-active .pipeline-native-stage-column > div:first-child span.h-2\\.5 { background:var(--pipeline-stage-color)!important; }

  .pipeline-custom-column {
    min-height:520px;
    border:1px solid color-mix(in srgb,var(--pipeline-stage-color) 26%,var(--aura-border));
    border-radius:24px;
    background:color-mix(in srgb,var(--pipeline-stage-color) 4%,var(--aura-surface));
    padding:12px;
    box-shadow:0 8px 28px rgba(0,0,0,.08);
    transition:box-shadow .15s ease,border-color .15s ease;
  }
  .pipeline-custom-column.is-drag-over { border-color:var(--pipeline-stage-color); box-shadow:0 0 0 2px color-mix(in srgb,var(--pipeline-stage-color) 30%,transparent); }
  .pipeline-custom-column-header {
    display:flex;
    min-height:52px;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    margin-bottom:12px;
    border:1px solid color-mix(in srgb,var(--pipeline-stage-color) 30%,var(--aura-border));
    border-radius:16px;
    background:color-mix(in srgb,var(--pipeline-stage-color) 10%,var(--aura-surface-2));
    padding:10px 12px;
    color:var(--pipeline-stage-color);
  }
  .pipeline-custom-column-title { display:flex; min-width:0; align-items:center; gap:8px; }
  .pipeline-custom-column-title h2 { overflow:hidden; margin:0; color:var(--pipeline-stage-color); font-size:14px; font-weight:950; line-height:1.15; text-overflow:ellipsis; white-space:nowrap; }
  .pipeline-custom-column-dot { width:10px; height:10px; flex:0 0 10px; border-radius:50%; background:var(--pipeline-stage-color); }
  .pipeline-custom-column-count { border-radius:999px; background:color-mix(in srgb,var(--pipeline-stage-color) 16%,var(--aura-surface)); padding:5px 11px; color:var(--pipeline-stage-color); font-size:12px; font-weight:950; }
  .pipeline-custom-column-cards { display:grid; gap:8px; }
  .pipeline-custom-column-empty,.pipeline-derived-empty { border:1px dashed var(--aura-border); border-radius:16px; background:color-mix(in srgb,var(--aura-surface) 70%,transparent); padding:20px; color:var(--aura-muted); text-align:center; font-size:11px; font-weight:800; }

  .pipeline-preview-toast { position:fixed; z-index:210; right:22px; bottom:88px; max-width:360px; border:1px solid var(--aura-border); border-radius:14px; background:var(--aura-surface); padding:12px 15px; color:var(--aura-soft); box-shadow:0 18px 55px rgba(0,0,0,.3); font-size:11px; font-weight:850; }

  .pipeline-customize-overlay { position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(3,7,18,.78); backdrop-filter:blur(8px); }
  .pipeline-customize-modal { width:min(980px,100%); max-height:88vh; overflow:hidden; border:1px solid var(--aura-border); border-radius:22px; background:var(--aura-surface); color:var(--aura-text); box-shadow:0 28px 90px rgba(0,0,0,.48); }
  .pipeline-customize-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 22px; border-bottom:1px solid var(--aura-border); }
  .pipeline-customize-header p { margin:0; color:#ef2d34; font-size:9px; font-weight:950; text-transform:uppercase; letter-spacing:.16em; }
  .pipeline-customize-header h2 { margin:4px 0 0; font-size:24px; font-weight:950; letter-spacing:-.02em; }
  .pipeline-customize-header span { display:block; margin-top:5px; color:var(--aura-muted); font-size:11px; line-height:1.45; }
  .pipeline-customize-header > button { display:flex; width:38px; height:38px; flex:0 0 38px; align-items:center; justify-content:center; border:1px solid var(--aura-border); border-radius:12px; background:var(--aura-surface-2); color:var(--aura-soft); }
  .pipeline-customize-note { display:flex; gap:10px; margin:14px 22px 0; border:1px solid color-mix(in srgb,#60a5fa 24%,var(--aura-border)); border-radius:13px; background:color-mix(in srgb,#60a5fa 7%,var(--aura-surface-2)); padding:11px 13px; color:var(--aura-muted); font-size:10px; line-height:1.45; }
  .pipeline-customize-note svg { flex:0 0 auto; color:#60a5fa; }
  .pipeline-customize-note strong { color:var(--aura-soft); }
  .pipeline-customize-toolbar { display:flex; justify-content:space-between; gap:10px; padding:14px 22px 8px; }
  .pipeline-customize-toolbar button { display:inline-flex; min-height:38px; align-items:center; gap:7px; border:1px solid var(--aura-border); border-radius:11px; background:var(--aura-surface-2); padding:0 12px; color:var(--aura-soft); font-size:10px; font-weight:900; }
  .pipeline-customize-message { margin:2px 22px 8px; border-radius:11px; background:color-mix(in srgb,#ef2d34 8%,var(--aura-surface-2)); padding:9px 12px; color:var(--aura-soft); font-size:10px; font-weight:800; }
  .pipeline-stage-editor-list { max-height:52vh; overflow:auto; display:grid; gap:8px; padding:8px 22px 18px; }
  .pipeline-stage-editor-row {
    display:grid;
    grid-template-columns:34px 12px minmax(170px,1.3fr) minmax(130px,.75fr) 118px 90px 104px 38px;
    align-items:center;
    gap:9px;
    border:1px solid color-mix(in srgb,var(--editor-stage-color) 18%,var(--aura-border));
    border-radius:14px;
    background:color-mix(in srgb,var(--editor-stage-color) 3%,var(--aura-surface-2));
    padding:9px 10px;
  }
  .pipeline-stage-order-controls { display:grid; gap:3px; }
  .pipeline-stage-order-controls button { display:flex; width:28px; height:22px; align-items:center; justify-content:center; border:1px solid var(--aura-border); border-radius:7px; background:var(--aura-surface); color:var(--aura-muted); }
  .pipeline-stage-order-controls button:disabled { opacity:.25; }
  .pipeline-stage-editor-dot { width:11px; height:11px; border-radius:50%; background:var(--editor-stage-color); box-shadow:0 0 12px color-mix(in srgb,var(--editor-stage-color) 48%,transparent); }
  .pipeline-stage-name-field,.pipeline-stage-color-field { display:grid; gap:4px; }
  .pipeline-stage-name-field > span,.pipeline-stage-color-field > span { color:var(--aura-muted); font-size:8px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
  .pipeline-stage-name-field input { width:100%; height:34px; border:1px solid var(--aura-border); border-radius:9px; background:var(--aura-surface); padding:0 10px; color:var(--aura-text); font-size:11px; font-weight:850; outline:0; }
  .pipeline-stage-color-field > div { display:flex; height:34px; align-items:center; gap:7px; border:1px solid var(--aura-border); border-radius:9px; background:var(--aura-surface); padding:0 7px; }
  .pipeline-stage-color-field input { width:28px; height:24px; border:0; background:transparent; padding:0; cursor:pointer; }
  .pipeline-stage-color-field code { color:var(--aura-muted); font-size:9px; }
  .pipeline-stage-presets { display:flex; align-items:center; gap:4px; }
  .pipeline-stage-presets button { width:15px; height:15px; border:2px solid transparent; border-radius:50%; box-shadow:0 0 0 1px var(--aura-border); }
  .pipeline-stage-presets button.is-active { border-color:white; box-shadow:0 0 0 2px var(--editor-stage-color); }
  .pipeline-stage-visibility { display:flex; min-height:34px; align-items:center; justify-content:center; gap:5px; border:1px solid var(--aura-border); border-radius:9px; background:var(--aura-surface); color:var(--aura-muted); font-size:9px; font-weight:900; }
  .pipeline-stage-visibility.is-visible { color:#34d399; }
  .pipeline-stage-kind { display:flex; align-items:center; justify-content:center; gap:5px; color:var(--aura-muted); font-size:8px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
  .pipeline-stage-delete { display:flex; width:34px; height:34px; align-items:center; justify-content:center; border:1px solid var(--aura-border); border-radius:9px; background:var(--aura-surface); color:#ef4444; }
  .pipeline-stage-delete:disabled { color:var(--aura-muted); opacity:.32; cursor:not-allowed; }
  .pipeline-customize-footer { display:flex; justify-content:flex-end; gap:10px; padding:15px 22px 20px; border-top:1px solid var(--aura-border); }
  .pipeline-customize-footer button { min-height:42px; border-radius:11px; padding:0 16px; font-size:11px; font-weight:950; }
  .pipeline-customize-cancel { border:1px solid var(--aura-border); background:transparent; color:var(--aura-muted); }
  .pipeline-customize-save { border:1px solid #ef2d34; background:#ef2d34; color:white; }

  @media (min-width:1024px) {
    body.pipeline-aura-active .pipeline-cockpit-host { margin-top:-58px!important; }
  }
  @media (max-width:1260px) {
    .pipeline-kpi-strip { min-width:1030px; }
    .pipeline-kpi-item { min-width:138px; padding-left:11px; padding-right:11px; }
    .pipeline-kpi-icon { width:42px; height:42px; flex-basis:42px; }
    .pipeline-kpi-value { font-size:23px; }
    .pipeline-customize-trigger { min-width:170px; flex-basis:170px; }
  }
  @media (max-width:1023px) {
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top:88px!important; }
    .pipeline-kpi-strip { min-width:1060px; }
  }
  @media (max-width:860px) {
    .pipeline-stage-editor-row { grid-template-columns:34px 12px minmax(170px,1fr) 120px 88px 38px; }
    .pipeline-stage-presets,.pipeline-stage-kind { display:none; }
  }
  @media (max-width:760px) {
    body.pipeline-aura-active .pipeline-aura-canvas { padding-top:82px!important; }
    .pipeline-kpi-strip { min-height:78px; }
    .pipeline-kpi-item { min-width:145px; padding:9px 11px; }
    .pipeline-kpi-icon { width:40px; height:40px; flex-basis:40px; }
    .pipeline-kpi-value { font-size:21px; }
    .pipeline-customize-modal { max-height:92vh; }
    .pipeline-customize-header { padding:16px; }
    .pipeline-customize-note { margin:12px 16px 0; }
    .pipeline-customize-toolbar { padding:12px 16px 6px; }
    .pipeline-customize-message { margin-left:16px; margin-right:16px; }
    .pipeline-stage-editor-list { padding:8px 16px 14px; }
    .pipeline-stage-editor-row { grid-template-columns:30px 10px minmax(150px,1fr) 105px 36px; gap:7px; }
    .pipeline-stage-visibility { display:none; }
    .pipeline-customize-footer { padding:13px 16px 16px; }
  }
`;
