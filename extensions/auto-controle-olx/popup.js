const importButton = document.getElementById('import');
const saveButton = document.getElementById('save');
const targetInput = document.getElementById('target');
const status = document.getElementById('status');

async function settings() {
  const result = await chrome.runtime.sendMessage({ type: 'AUTO_CONTROLE_GET_SETTINGS' });
  if (result?.ok) targetInput.value = result.target_url || '';
}

saveButton.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'AUTO_CONTROLE_SAVE_TARGET', url: targetInput.value });
  status.textContent = response?.ok ? 'Endereço salvo.' : response?.error || 'Não foi possível salvar.';
});

importButton.addEventListener('click', async () => {
  importButton.disabled = true;
  status.textContent = 'Lendo o anúncio aberto...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !String(tab.url || '').includes('olx.com.br')) throw new Error('Abra um anúncio da OLX nesta aba.');
    const extracted = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_CONTROLE_EXTRACT_ACTIVE_OLX' });
    if (!extracted?.ok) throw new Error(extracted?.error || 'Não foi possível ler o anúncio.');
    status.textContent = 'Preparando fotos...';
    const response = await chrome.runtime.sendMessage({ type: 'AUTO_CONTROLE_IMPORT_OLX', payload: extracted.payload });
    if (!response?.ok) throw new Error(response?.error || 'Não foi possível abrir o Auto Controle.');
    status.textContent = `Anúncio enviado com ${response.image_count || 0} fotos. A página de revisão foi aberta.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Falha ao importar.';
  } finally {
    importButton.disabled = false;
  }
});

void settings();
