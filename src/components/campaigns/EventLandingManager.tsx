'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, ExternalLink, ImagePlus, Megaphone, Plus, RefreshCw, Save, Sparkles, Star, Store, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const defaultBenefits = [
  { title: 'Simulação rápida', description: 'Faça uma estimativa inicial de financiamento.' },
  { title: 'Estoque das lojas participantes', description: 'Consulte veículos vinculados ao evento.' },
  { title: 'Atendimento direto', description: 'Seu interesse segue para a loja responsável pelo veículo.' }
];

const emptyForm: any = {
  id: '', event_id: '', name: '', slug: '', title: '', description: '', interest_rate: '1.89', whatsapp_number: '',
  is_active: false, logo_url: '', hero_image_url: '', mobile_hero_image_url: '', sponsor_logo_urls: [],
  hero_eyebrow: 'Evento automotivo', cta_label: 'Simular agora', primary_color: '#DC2626', secondary_color: '#071020',
  benefits: defaultBenefits, terms_text: '', auto_sync_inventory: true, published_at: null
};

function slugify(value: string) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function eventPeriod(event: any) {
  const date = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '';
  return [date(event?.start_date), date(event?.end_date)].filter(Boolean).join(' a ') || 'Datas não informadas';
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function EventLandingManager() {
  const supabase = useMemo(() => createClient(), []);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');

  async function authHeaders(json = true) {
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function load() {
    setLoading(true);
    const response = await fetch('/api/master/campaigns', { headers: await authHeaders(false), cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || 'Não foi possível carregar as landings.');
      setLoading(false);
      return;
    }
    setCampaigns(result.campaigns || []);
    setEvents(result.events || []);
    setLoading(false);
  }

  async function loadAssignments(eventId: string) {
    if (!eventId) {
      setAssignments([]);
      return;
    }
    const response = await fetch(`/api/master/event-vehicle-assignments?event_id=${encodeURIComponent(eventId)}`, {
      headers: await authHeaders(false), cache: 'no-store'
    });
    const result = await response.json();
    if (response.ok) setAssignments(result.assignments || []);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { void loadAssignments(form.event_id); }, [form.event_id]);

  function selectCampaign(campaign: any) {
    setForm({
      ...emptyForm,
      ...campaign,
      interest_rate: String(campaign.interest_rate || '1.89'),
      sponsor_logo_urls: Array.isArray(campaign.sponsor_logo_urls) ? campaign.sponsor_logo_urls : [],
      benefits: Array.isArray(campaign.benefits) && campaign.benefits.length ? campaign.benefits : defaultBenefits
    });
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNew() {
    setForm({ ...emptyForm, benefits: defaultBenefits.map((item) => ({ ...item })), sponsor_logo_urls: [] });
    setAssignments([]);
    setMessage('Nova landing iniciada. Selecione o evento.');
  }

  function selectEvent(eventId: string) {
    const event = events.find((item) => item.id === eventId);
    setForm((current: any) => ({
      ...current,
      event_id: eventId,
      name: current.id ? current.name : event?.event_name || '',
      slug: current.id ? current.slug : event?.slug || slugify(event?.event_name || ''),
      title: current.id ? current.title : event ? `Encontre seu próximo carro no ${event.event_name}` : '',
      description: current.id ? current.description : 'Escolha um veículo das lojas participantes e faça uma simulação inicial de financiamento.'
    }));
  }

  async function save() {
    if (!form.event_id) {
      setMessage('Selecione o evento que será vinculado à landing.');
      return;
    }
    setSaving(true);
    setMessage('Salvando landing...');
    const response = await fetch('/api/master/campaigns', {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify(form)
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(result.error || 'Não foi possível salvar a landing.');
      return;
    }
    setForm((current: any) => ({ ...current, ...result.campaign, interest_rate: String(result.campaign.interest_rate || '1.89') }));
    setMessage('Landing salva. As lojas e os estoques do evento foram sincronizados.');
    await load();
    await loadAssignments(form.event_id);
  }

  async function syncInventory() {
    if (!form.event_id) return;
    setSyncing(true);
    const response = await fetch('/api/master/campaigns/sync', {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify({ event_id: form.event_id })
    });
    const result = await response.json();
    setSyncing(false);
    if (!response.ok) {
      setMessage(result.error || 'Erro ao sincronizar estoque.');
      return;
    }
    setMessage(`Estoque sincronizado: ${result.inserted} novo(s) vínculo(s), ${result.total} veículo(s) no evento.`);
    await loadAssignments(form.event_id);
    await load();
  }

  async function uploadAsset(file: File | undefined, kind: 'logo' | 'hero' | 'mobile-hero' | 'sponsor') {
    if (!file) return;
    setUploading(kind);
    setMessage('Enviando imagem...');
    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    body.append('slug', form.slug || form.name || 'evento');
    const response = await fetch('/api/master/campaign-assets', { method: 'POST', headers: await authHeaders(false), body });
    const result = await response.json();
    setUploading('');
    if (!response.ok) {
      setMessage(result.error || 'Erro ao enviar imagem.');
      return;
    }
    setForm((current: any) => {
      if (kind === 'logo') return { ...current, logo_url: result.public_url };
      if (kind === 'hero') return { ...current, hero_image_url: result.public_url };
      if (kind === 'mobile-hero') return { ...current, mobile_hero_image_url: result.public_url };
      return { ...current, sponsor_logo_urls: Array.from(new Set([...(current.sponsor_logo_urls || []), result.public_url])) };
    });
    setMessage('Imagem enviada. Salve a landing para publicar a alteração.');
  }

  async function updateAssignment(assignmentId: string, patch: Record<string, unknown>) {
    const response = await fetch('/api/master/event-vehicle-assignments', {
      method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ assignment_id: assignmentId, ...patch })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || 'Erro ao atualizar veículo.');
      return;
    }
    setAssignments((current) => current.map((item) => item.id === assignmentId ? { ...item, ...result.assignment } : item));
  }

  const selectedEvent = events.find((item) => item.id === form.event_id);
  const filteredAssignments = assignments.filter((item) => {
    const term = vehicleSearch.toLowerCase().trim();
    if (!term) return true;
    return [item.vehicle?.brand, item.vehicle?.model, item.vehicle?.version, item.store?.store_name].some((value) => String(value || '').toLowerCase().includes(term));
  });
  const activeCampaigns = campaigns.filter((item) => item.is_active);
  const usedEventIds = new Set(campaigns.filter((item) => item.id !== form.id).map((item) => item.event_id).filter(Boolean));

  return (
    <div>
      <header className="rounded-[32px] bg-[#071020] p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-red-300"><Megaphone size={16} /> Landings por evento</span>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Uma identidade e um estoque para cada evento</h1>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-zinc-300 sm:text-base">Vincule a landing ao evento, envie logo e capas pelo painel e carregue automaticamente as lojas e os veículos participantes.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void load()} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-sm font-black"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
            <button type="button" onClick={startNew} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-red-600 px-5 text-sm font-black"><Plus size={17} /> Nova landing</button>
          </div>
        </div>
      </header>

      {message ? <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Landings</p><strong className="mt-2 block text-4xl font-black">{campaigns.length}</strong></div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Publicadas</p><strong className="mt-2 block text-4xl font-black text-emerald-950">{activeCampaigns.length}</strong></div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Veículos selecionados</p><strong className="mt-2 block text-4xl font-black">{assignments.filter((item) => item.status === 'active' && item.show_on_landing).length}</strong></div>
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[1fr_420px]">
        <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Configuração</p><h2 className="mt-1 text-2xl font-black">{form.id ? 'Editar landing' : 'Criar landing do evento'}</h2></div>{form.id && form.slug ? <a href={`/campanha/${form.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-xs font-black">Abrir <ExternalLink size={15} /></a> : null}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-black text-zinc-600 md:col-span-2">Evento vinculado<select className="premium-input mt-2" value={form.event_id} onChange={(e) => selectEvent(e.target.value)}><option value="">Selecione o evento</option>{events.map((event) => <option key={event.id} value={event.id} disabled={usedEventIds.has(event.id)}>{event.event_name} — {event.city || event.location || 'Local não informado'}{usedEventIds.has(event.id) ? ' (já possui landing)' : ''}</option>)}</select></label>
            {selectedEvent ? <div className="md:col-span-2 rounded-2xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-600"><strong className="block text-zinc-950">{selectedEvent.event_name}</strong><span>{eventPeriod(selectedEvent)} • {[selectedEvent.location, selectedEvent.city, selectedEvent.state].filter(Boolean).join(' • ')}</span></div> : null}
            <label className="text-xs font-black text-zinc-600">Nome interno<input className="premium-input mt-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600">Slug público<input className="premium-input mt-2" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} /></label>
            <label className="text-xs font-black text-zinc-600 md:col-span-2">Título principal<input className="premium-input mt-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600 md:col-span-2">Descrição<textarea className="premium-input mt-2 min-h-28 py-3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600">Chamada superior<input className="premium-input mt-2" value={form.hero_eyebrow} onChange={(e) => setForm({ ...form, hero_eyebrow: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600">Texto do botão<input className="premium-input mt-2" value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600">Taxa mensal (%)<input className="premium-input mt-2" type="number" min="0" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600">WhatsApp<input className="premium-input mt-2" value={form.whatsapp_number || ''} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600">Cor principal<input className="premium-input mt-2 h-12" type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} /></label>
            <label className="text-xs font-black text-zinc-600">Cor de fundo<input className="premium-input mt-2 h-12" type="color" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} /></label>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            <AssetField label="Logo do evento" value={form.logo_url} loading={uploading === 'logo'} onUpload={(file) => void uploadAsset(file, 'logo')} onRemove={() => setForm({ ...form, logo_url: '' })} />
            <AssetField label="Capa desktop" value={form.hero_image_url} loading={uploading === 'hero'} onUpload={(file) => void uploadAsset(file, 'hero')} onRemove={() => setForm({ ...form, hero_image_url: '' })} />
            <AssetField label="Capa celular" value={form.mobile_hero_image_url} loading={uploading === 'mobile-hero'} onUpload={(file) => void uploadAsset(file, 'mobile-hero')} onRemove={() => setForm({ ...form, mobile_hero_image_url: '' })} />
          </div>

          <div className="mt-7 rounded-3xl border border-zinc-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Patrocinadores</p><p className="mt-1 text-sm font-semibold text-zinc-500">Envie as logomarcas que aparecerão no rodapé da landing.</p></div><label className="premium-button-secondary cursor-pointer text-xs"><Upload size={15} /> {uploading === 'sponsor' ? 'Enviando...' : 'Adicionar logo'}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void uploadAsset(e.target.files?.[0], 'sponsor')} /></label></div>
            <div className="mt-4 flex flex-wrap gap-4">{(form.sponsor_logo_urls || []).map((url: string) => <div key={url} className="relative flex h-24 w-40 items-center justify-center rounded-2xl bg-zinc-50 p-3"><img src={url} alt="Patrocinador" className="max-h-full max-w-full object-contain" /><button type="button" onClick={() => setForm({ ...form, sponsor_logo_urls: form.sponsor_logo_urls.filter((item: string) => item !== url) })} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white"><X size={13} /></button></div>)}</div>
          </div>

          <div className="mt-7 rounded-3xl border border-zinc-200 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Benefícios da landing</p>
            <div className="mt-4 grid gap-3">{(form.benefits || []).map((benefit: any, index: number) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]"><input className="premium-input" placeholder="Título" value={benefit.title} onChange={(e) => setForm({ ...form, benefits: form.benefits.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, title: e.target.value } : item) })} /><input className="premium-input" placeholder="Descrição" value={benefit.description} onChange={(e) => setForm({ ...form, benefits: form.benefits.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, description: e.target.value } : item) })} /><button type="button" onClick={() => setForm({ ...form, benefits: form.benefits.filter((_: any, itemIndex: number) => itemIndex !== index) })} className="h-12 rounded-2xl bg-zinc-100 px-4 text-zinc-500"><X size={17} /></button></div>)}</div>
            <button type="button" onClick={() => setForm({ ...form, benefits: [...(form.benefits || []), { title: '', description: '' }] })} className="premium-button-secondary mt-3 text-xs"><Plus size={15} /> Adicionar benefício</button>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={form.auto_sync_inventory !== false} onChange={(e) => setForm({ ...form, auto_sync_inventory: e.target.checked })} /> Sincronizar estoque automaticamente</label>
            <label className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-4 text-sm font-black"><input type="checkbox" checked={form.is_active === true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Landing publicada</label>
            <button type="button" onClick={() => void save()} disabled={saving} className="premium-button-primary justify-center"><Save size={17} /> {saving ? 'Salvando...' : 'Salvar landing'}</button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-sm">
            <div className="relative min-h-80 p-6 text-white" style={{ backgroundColor: form.secondary_color || '#071020' }}>
              {form.hero_image_url ? <img src={form.hero_image_url} alt="Prévia da capa" className="absolute inset-0 h-full w-full object-cover" /> : null}<div className="absolute inset-0 bg-slate-950/70" />
              <div className="relative"><p className="text-xs font-black uppercase tracking-[0.18em]">{form.hero_eyebrow}</p>{form.logo_url ? <img src={form.logo_url} alt="Logo" className="mt-5 max-h-28 max-w-full object-contain object-left" /> : <h3 className="mt-5 text-3xl font-black">{form.name || 'Nome do evento'}</h3>}<h3 className="mt-6 text-3xl font-black leading-tight">{form.title || 'Título da landing'}</h3><p className="mt-3 line-clamp-4 text-sm text-zinc-200">{form.description}</p><span className="mt-5 inline-flex rounded-full px-5 py-3 text-xs font-black" style={{ backgroundColor: form.primary_color || '#DC2626' }}>{form.cta_label || 'Simular agora'}</span></div>
            </div>
            <div className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Prévia rápida</p><p className="mt-2 text-sm font-semibold text-zinc-500">A visualização pública final adapta a capa para desktop e celular.</p></div>
          </section>

          <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Sincronização</p><h3 className="mt-1 text-xl font-black">Lojas e estoque</h3></div><button type="button" onClick={() => void syncInventory()} disabled={!form.event_id || syncing} className="premium-button-secondary text-xs"><RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> Sincronizar</button></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-zinc-50 p-4"><Store size={18} className="text-red-600" /><strong className="mt-2 block text-2xl">{campaigns.find((item) => item.id === form.id)?.store_count || 0}</strong><p className="text-xs text-zinc-500">lojas participantes</p></div><div className="rounded-2xl bg-zinc-50 p-4"><Sparkles size={18} className="text-red-600" /><strong className="mt-2 block text-2xl">{assignments.length}</strong><p className="text-xs text-zinc-500">veículos vinculados</p></div></div>
          </section>

          <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Landings cadastradas</p>
            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">{campaigns.map((campaign) => <button key={campaign.id} type="button" onClick={() => selectCampaign(campaign)} className={`w-full rounded-2xl border p-4 text-left ${form.id === campaign.id ? 'border-red-300 bg-red-50' : 'border-zinc-200 bg-white'}`}><div className="flex items-center justify-between gap-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${campaign.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{campaign.is_active ? 'PUBLICADA' : 'INATIVA'}</span><span className="text-xs text-zinc-400">{campaign.vehicle_count || 0} veículos</span></div><strong className="mt-3 block text-sm text-zinc-950">{campaign.name}</strong><p className="mt-1 text-xs text-zinc-500">{campaign.event?.location || campaign.event?.city || 'Evento não vinculado'}</p></button>)}</div>
          </section>
        </aside>
      </div>

      {form.event_id ? <section className="mt-6 rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Estoque do evento</p><h2 className="mt-1 text-2xl font-black">Revisar veículos sincronizados</h2><p className="mt-1 text-sm text-zinc-500">O vínculo é automático. Aqui você pode ocultar, destacar ou definir um preço promocional somente para este evento.</p></div><input className="premium-input max-w-md" placeholder="Buscar veículo ou loja" value={vehicleSearch} onChange={(e) => setVehicleSearch(e.target.value)} /></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400"><th className="p-3">Veículo</th><th className="p-3">Loja</th><th className="p-3">Preço</th><th className="p-3">Exibir</th><th className="p-3">Destaque</th><th className="p-3">Status</th></tr></thead><tbody>{filteredAssignments.map((assignment) => <tr key={assignment.id} className="border-b border-zinc-100"><td className="p-3"><strong>{assignment.vehicle?.brand} {assignment.vehicle?.model}</strong><p className="text-xs text-zinc-500">{assignment.vehicle?.version} {assignment.vehicle?.year}</p></td><td className="p-3 font-semibold">{assignment.store?.store_name}</td><td className="p-3"><input className="premium-input w-40" type="number" min="0" placeholder={money(assignment.vehicle?.price)} defaultValue={assignment.promotional_price || ''} onBlur={(e) => void updateAssignment(assignment.id, { promotional_price: e.target.value })} /></td><td className="p-3"><input type="checkbox" checked={assignment.show_on_landing === true} onChange={(e) => void updateAssignment(assignment.id, { show_on_landing: e.target.checked })} /></td><td className="p-3"><button type="button" onClick={() => void updateAssignment(assignment.id, { is_featured: !assignment.is_featured })} className={`flex h-10 w-10 items-center justify-center rounded-xl ${assignment.is_featured ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-400'}`}><Star size={17} fill={assignment.is_featured ? 'currentColor' : 'none'} /></button></td><td className="p-3"><button type="button" onClick={() => void updateAssignment(assignment.id, { status: assignment.status === 'active' ? 'inactive' : 'active' })} className={`rounded-full px-3 py-2 text-xs font-black ${assignment.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{assignment.status === 'active' ? 'Ativo' : 'Inativo'}</button></td></tr>)}</tbody></table>{!filteredAssignments.length ? <div className="p-10 text-center text-sm font-bold text-zinc-500">Nenhum veículo encontrado. Vincule lojas ao evento e clique em sincronizar.</div> : null}</div></section> : null}
    </div>
  );
}

function AssetField({ label, value, loading, onUpload, onRemove }: { label: string; value: string; loading: boolean; onUpload: (file?: File) => void; onRemove: () => void }) {
  return <div className="rounded-3xl border border-zinc-200 p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">{label}</p><div className="mt-3 flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-zinc-50">{value ? <img src={value} alt={label} className="h-full w-full object-contain" /> : <ImagePlus size={34} className="text-zinc-300" />}</div><div className="mt-3 flex gap-2"><label className="premium-button-secondary flex-1 cursor-pointer justify-center text-xs"><Upload size={14} /> {loading ? 'Enviando...' : 'Enviar'}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onUpload(e.target.files?.[0])} /></label>{value ? <button type="button" onClick={onRemove} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500"><X size={16} /></button> : null}</div></div>;
}
