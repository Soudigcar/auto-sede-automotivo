# Auto Controle — Importador OLX (Chrome Manifest V3)

Extensão auxiliar para ler anúncios de veículos diretamente no navegador do usuário e abrir o modal de revisão do Auto Controle Automotivo.

## Instalação para teste

1. Baixe esta pasta inteira.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `extensions/auto-controle-olx`.
6. Abra o ícone da extensão e confirme o endereço do Preview ou da produção.

## Uso

1. Entre no Auto Controle em outra aba.
2. Abra um anúncio de veículo da OLX.
3. Clique no botão flutuante **Importar para Auto Controle** ou no ícone da extensão.
4. A extensão lê a página, baixa e comprime até 12 fotos e abre `/importar-olx`.
5. Revise os campos. Master e gestor podem publicar; demais usuários enviam para aprovação.

## Segurança

- A extensão não lê senha da OLX.
- A autorização de publicação continua sendo validada pelo servidor do Auto Controle.
- As fotos são transferidas temporariamente pelo armazenamento local da extensão e removidas após a página confirmar o recebimento.
- Nenhum token do Auto Controle é enviado à extensão.
