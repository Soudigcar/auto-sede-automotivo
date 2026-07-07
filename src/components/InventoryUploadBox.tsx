'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { inventoryKey, parseInventoryText, parseInventoryWorkbook } from '@/lib/inventory-import';

export function InventoryUploadBox({ eventId, stores, initialStoreId, onImported }: { eventId: string; stores: any[]; initialStoreId?: string; onImported: () => void }) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState(initialStoreId || stores[0]?.id || '');
  const [message, setMessage] = useState('');

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!storeId) {
      setMessage('Selecione uma loja antes de importar o estoque.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['xls', 'xlsx', 'csv', 'txt', 'pdf'].includes(extension || '')) {
      setMessage('Formato nao aceito. Envie XLS, XLSX, CSV, TXT ou PDF.');
      event.target.value = '';
      return;
    }

    if (extension === 'pdf') {
      setMessage('PDF recebido. Para leitura automatica dos carros, envie XLS, XLSX, CSV ou TXT.');
      event.target.value = '';
      return;
    }

    const rows = ['xls', 'xlsx'].includes(extension || '')
      ? parseInventoryWorkbook(await file.arrayBuffer(), eventId, storeId)
      : parseInventoryText(await file.text(), eventId, storeId);

    if (rows.length === 0) {
      setMessage('Nenhum veiculo valido encontrado no arquivo. Confira os campos do estoque.');
      event.target.value = '';
      return;
    }

    const { data: existing } = await supabase.from('inventory').select('*').eq('store_id', storeId);
    const existingKeys = new Set((existing || []).map(inventoryKey));
    const fileKeys = new Set<string>();
    const uniqueRows = rows.filter((item) => {
      const key = inventoryKey(item);
      if (existingKeys.has(key) || fileKeys.has(key)) return false;
      fileKeys.add(key);
      return true;
    });

    if (uniqueRows.length === 0) {
      setMessage('Nenhum carro novo importado. O arquivo parece duplicado.');
      event.target.value = '';
      return;
    }

    const { error } = await supabase.from('inventory').insert(uniqueRows);
    if (error) {
      setMessage('Erro ao importar. Rode o SQL de atualização de estoque no Supabase e tente novamente.');
      event.target.value = '';
      return;
    }

    setMessage(`${uniqueRows.length} veiculo(s) importado(s). ${rows.length - uniqueRows.length} duplicidade(s) ignorada(s).`);
    event.target.value = '';
    onImported();
  }

  return (
    <div className="premium-card p-6">
      <h2 className="text-2xl font-black text-zinc-950">Anexar estoque</h2>
      <p className="mt-2 text-sm text-zinc-500">Importe o estoque no padrão Lotus. XLS, XLSX, CSV e TXT são lidos automaticamente.</p>
      <div className="mt-5 grid gap-3">
        <select className="premium-input" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          <option value="">Selecione a loja</option>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
        </select>
        <label className="premium-button-secondary cursor-pointer">
          <Upload size={16} /> Upload XLS, XLSX, CSV, TXT ou PDF
          <input className="hidden" type="file" accept=".xls,.xlsx,.csv,.txt,.pdf" onChange={handleUpload} />
        </label>
        <p className="text-xs text-zinc-400">Campos: Vehicle, Localização, Marca, Modelo, Ano Fabricação, Ano Modelo, Cor, Km, Placa, Combustível, Preço FIPE e Preço Web.</p>
        {message ? <p className="rounded-2xl bg-zinc-50 p-3 text-sm font-medium text-zinc-600">{message}</p> : null}
      </div>
    </div>
  );
}
