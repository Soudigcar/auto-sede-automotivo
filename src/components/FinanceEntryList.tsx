'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Download, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { FinanceDashboardPanel } from '@/components/FinanceDashboardPanel';

function money(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function safe(value: any) {
  return String(value ?? '-')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const categories = ['Patrocínio', 'Imposto', 'Fornecedor', 'Marketing', 'Estrutura', 'Comissão', 'Outros'];
const valueOptions = [5000, 10000, 15000, 20000, 25000, 30000, 50000, 75000, 100000];

export function FinanceEntryList({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const supabase = createClient();
  const [entries, setEntries] = useState<any[]>([]);
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({
    eventName: '',
    sponsorBank: '',
    supplierName: '',
    category: 'Patrocínio',
    amount: '10000',
    discount: '0',
    paymentDate: '',
    movementType: 'income',
    paymentStatus: 'paid'
  });

  async function loadData() {
    const { data } = await supabase
      .from('financial_entries')
      .select('*')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    setEntries(data || []);
  }

  useEffect(() => {
    loadData().catch(() => null);
  }, [refreshKey]);

  const summary = useMemo(() => {
    const paidEntries = entries.filter((item) => (item.status || 'paid') === 'paid');
    const pendingEntries = entries.filter((item) => item.status === 'pending');

    const incomePaid = paidEntries
      .filter((item) => item.movement_type !== 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const incomePending = pendingEntries
      .filter((item) => item.movement_type !== 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expensePaid = paidEntries
      .filter((item) => item.movement_type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expensePending = pendingEntries
      .filter((item) => item.movement_type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const discountPaid = paidEntries.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const discountTotal = entries.reduce((sum, item) => sum + Number(item.discount || 0), 0);

    const suppliers = new Set(entries.map((item) => item.supplier_name).filter(Boolean)).size;
    const categoriesCount = new Set(entries.map((item) => item.category).filter(Boolean)).size;

    return {
      incomePaid,
      incomePending,
      expensePaid,
      expensePending,
      discountPaid,
      discountTotal,
      realizedBalance: incomePaid - expensePaid - discountPaid,
      projectedBalance: incomePaid + incomePending - expensePaid - expensePending - discountTotal,
      suppliers,
      categoriesCount,
      paid: paidEntries.length,
      pending: pendingEntries.length
    };
  }, [entries]);

  function startEdit(item: any) {
    setEditingId(item.id);
    setEditForm({
      eventName: item.event_name || '',
      sponsorBank: item.sponsor_bank || 'Bradesco',
      supplierName: item.supplier_name || '',
      category: item.category || 'Patrocínio',
      amount: String(Number(item.amount || 0)),
      discount: String(Number(item.discount || 0)),
      paymentDate: item.payment_date || '',
      movementType: item.movement_type || 'income',
      paymentStatus: item.status === 'pending' ? 'pending' : 'paid'
    });
  }

  async function saveEdit() {
    const { error } = await supabase
      .from('financial_entries')
      .update({
        event_name: editForm.eventName,
        sponsor_bank: editForm.movementType === 'income' && editForm.category === 'Patrocínio' ? editForm.sponsorBank : null,
        supplier_name: editForm.supplierName || null,
        category: editForm.category,
        amount: Number(editForm.amount || 0),
        discount: Number(editForm.discount || 0),
        payment_date: editForm.paymentDate || null,
        movement_type: editForm.movementType,
        status: editForm.paymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingId);

    if (error) return;

    setEditingId('');
    await loadData();
    onChanged?.();
  }

  async function updatePaymentStatus(item: any, status: 'paid' | 'pending') {
    await supabase
      .from('financial_entries')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    await loadData();
    onChanged?.();
  }

  async function removeItem(item: any) {
    const confirmed = window.confirm(`Excluir lançamento de ${money(item.amount)}?`);
    if (!confirmed) return;

    await supabase
      .from('financial_entries')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', item.id);

    await loadData();
    onChanged?.();
  }

  function exportPdf() {
    const rows = entries.map((item) => `
      <tr>
        <td>${safe(item.payment_date || 'sem data')}</td>
        <td>${safe(item.movement_type === 'expense' ? (item.status === 'pending' ? 'Saída a pagar' : 'Saída paga') : (item.status === 'pending' ? 'Entrada a receber' : 'Entrada recebida'))}</td>
        <td>${safe(item.status === 'pending' ? 'Pendente' : 'Pago')}</td>
        <td>${safe(item.event_name)}</td>
        <td>${safe(item.category)}</td>
        <td>${safe(item.supplier_name || item.sponsor_bank || '-')}</td>
        <td>${safe(money(item.amount))}</td>
        <td>${safe(money(item.discount))}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Relatório financeiro</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; padding: 32px; }
            h1 { margin: 0; font-size: 28px; }
            .subtitle { margin-top: 8px; color: #6b7280; }
            .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
            .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }
            .label { color: #9ca3af; font-size: 12px; font-weight: 700; text-transform: uppercase; }
            .value { margin-top: 6px; font-size: 18px; font-weight: 900; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #071020; color: white; text-align: left; padding: 10px; }
            td { border-bottom: 1px solid #e5e7eb; padding: 10px; }
            .paid { color: #059669; font-weight: 900; }
            .pending { color: #dc2626; font-weight: 900; }
            @media print { body { padding: 18px; } }
          </style>
        </head>
        <body>
          <h1>Relatório financeiro completo</h1>
          <p class="subtitle">Gerado em ${safe(new Date().toLocaleString('pt-BR'))}</p>

          <div class="summary">
            <div class="card"><div class="label">Recebido</div><div class="value">${safe(money(summary.incomePaid))}</div></div>
            <div class="card"><div class="label">A receber</div><div class="value pending">${safe(money(summary.incomePending))}</div></div>
            <div class="card"><div class="label">Saídas pagas</div><div class="value">${safe(money(summary.expensePaid))}</div></div>
            <div class="card"><div class="label">A pagar</div><div class="value pending">${safe(money(summary.expensePending))}</div></div>
            <div class="card"><div class="label">Saldo real</div><div class="value">${safe(money(summary.realizedBalance))}</div></div>
            <div class="card"><div class="label">Saldo previsto</div><div class="value">${safe(money(summary.projectedBalance))}</div></div>
            <div class="card"><div class="label">Pagos</div><div class="value paid">${safe(summary.paid)}</div></div>
            <div class="card"><div class="label">Pendentes</div><div class="value pending">${safe(summary.pending)}</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Evento</th>
                <th>Categoria</th>
                <th>Fornecedor/Banco</th>
                <th>Valor</th>
                <th>Desconto</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="8">Nenhum lançamento registrado.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
    }, 500);
  }

  return (
    <>
      <FinanceDashboardPanel refreshKey={refreshKey} />

      <section className="premium-card p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-zinc-950">Relatório financeiro</h2>
            <p className="mt-1 text-sm text-zinc-500">Controle completo de entradas, saídas, status de pagamento e exportação.</p>
          </div>

          <button className="premium-button-primary" type="button" onClick={exportPdf}>
            <Download size={18} /> Exportar relatório PDF
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Mini label="Recebido" value={money(summary.incomePaid)} tone="text-emerald-600" />
          <Mini label="A receber" value={money(summary.incomePending)} tone="text-red-600" />
          <Mini label="Saídas pagas" value={money(summary.expensePaid)} tone="text-red-600" />
          <Mini label="A pagar" value={money(summary.expensePending)} tone="text-red-600" />
          <Mini label="Saldo real" value={money(summary.realizedBalance)} tone="text-zinc-950" />
          <Mini label="Saldo previsto" value={money(summary.projectedBalance)} tone="text-zinc-950" />
          <Mini label="Pagos" value={String(summary.paid)} tone="text-emerald-600" />
          <Mini label="Pendentes" value={String(summary.pending)} tone="text-red-600" />
        </div>

        <div className="mt-5 space-y-3">
          {entries.map((item) => {
            const isPending = item.status === 'pending';

            return (
              <div key={item.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                {editingId === item.id ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <select className="premium-input" value={editForm.movementType} onChange={(e) => setEditForm({ ...editForm, movementType: e.target.value })}>
                      <option value="income">Entrada</option>
                      <option value="expense">Saída</option>
                    </select>

                    <select className="premium-input" value={editForm.paymentStatus} onChange={(e) => setEditForm({ ...editForm, paymentStatus: e.target.value })}>
                      <option value="paid">Pago</option>
                      <option value="pending">Pendente</option>
                    </select>

                    <input className="premium-input" value={editForm.eventName} onChange={(e) => setEditForm({ ...editForm, eventName: e.target.value })} />

                    <input className="premium-input" value={editForm.supplierName} onChange={(e) => setEditForm({ ...editForm, supplierName: e.target.value })} placeholder="Fornecedor" />

                    <select className="premium-input" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                      {categories.map((category) => <option key={category}>{category}</option>)}
                    </select>

                    <select className="premium-input" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}>
                      {valueOptions.map((value) => <option key={value} value={value}>{money(value)}</option>)}
                    </select>

                    <input
                      className="premium-input cursor-pointer"
                      type="date"
                      min="2024-01-01"
                      max="2035-12-31"
                      inputMode="none"
                      value={editForm.paymentDate}
                      onKeyDown={(event) => event.preventDefault()}
                      onPaste={(event) => event.preventDefault()}
                      onFocus={(event) => event.currentTarget.showPicker?.()}
                      onClick={(event) => event.currentTarget.showPicker?.()}
                      onChange={(e) => setEditForm({ ...editForm, paymentDate: e.target.value })}
                    />

                    <select className="premium-input" value={editForm.discount} onChange={(e) => setEditForm({ ...editForm, discount: e.target.value })}>
                      <option value="0">R$ 0</option>
                      <option value="500">R$ 500</option>
                      <option value="1000">R$ 1.000</option>
                      <option value="2500">R$ 2.500</option>
                      <option value="5000">R$ 5.000</option>
                    </select>

                    <input className="premium-input" value={editForm.sponsorBank} onChange={(e) => setEditForm({ ...editForm, sponsorBank: e.target.value })} placeholder="Banco" />

                    <div className="flex gap-2 md:col-span-3">
                      <button className="premium-button-primary" type="button" onClick={saveEdit}>Salvar</button>
                      <button className="premium-button-secondary" type="button" onClick={() => setEditingId('')}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className={item.movement_type === 'expense' ? 'text-red-600' : 'text-emerald-600'}>
                            {item.movement_type === 'expense' ? (isPending ? 'Saída a pagar' : 'Saída paga') : (isPending ? 'Entrada a receber' : 'Entrada recebida')} - {item.sponsor_bank || item.supplier_name || 'Lançamento'} - {money(item.amount)}
                          </strong>

                          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${
                            isPending ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {isPending ? <Clock3 size={14} /> : <CheckCircle2 size={14} />}
                            {isPending ? 'Pendente' : 'Pago'}
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-zinc-500">
                          {item.event_name} | {item.category} | fornecedor: {item.supplier_name || '-'} | desconto: {money(item.discount)}
                        </p>
                      </div>

                      <span className="text-xs font-black uppercase tracking-wide text-zinc-400">{item.payment_date || 'sem data'}</span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="premium-button-secondary text-xs" type="button" onClick={() => updatePaymentStatus(item, 'paid')}>
                        <CheckCircle2 size={14} /> Pago
                      </button>

                      <button className="premium-button-secondary text-xs" type="button" onClick={() => updatePaymentStatus(item, 'pending')}>
                        <Clock3 size={14} /> Pendente
                      </button>

                      <button className="premium-button-secondary text-xs" type="button" onClick={() => startEdit(item)}>
                        <Pencil size={14} /> Editar
                      </button>

                      <button className="premium-button-secondary text-xs" type="button" onClick={() => removeItem(item)}>
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {entries.length === 0 ? <p className="text-sm text-zinc-500">Nenhum lançamento registrado.</p> : null}
        </div>
      </section>
    </>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
      <p className="text-xs font-bold text-zinc-400">{label}</p>
      <strong className={`mt-1 block text-sm ${tone}`}>{value}</strong>
    </div>
  );
}
