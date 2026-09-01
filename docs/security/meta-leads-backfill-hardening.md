# Hardening do backfill temporário da Meta

## Escopo

Esta correção substitui a implementação não versionada de `meta-leads-backfill-temp`. Ela não altera as tabelas, instâncias, QR Codes, webhooks ou credenciais da Evolution e não participa do envio de mensagens do WhatsApp.

## Proteções adicionadas

- segredo de acesso somente por variável privada, com comparação por digest;
- URL do webhook somente por variável privada e allowlist exata de host;
- bloqueio explícito de destino Production quando a função roda em DEV;
- bloqueio de modo Production fora do projeto CRM Production esperado;
- `POST` obrigatório e respostas com `no-store`;
- modo somente simulação por padrão;
- execução real somente com `?commit=1` e `x-backfill-mode: commit` juntos;
- token da Meta enviado no header, não na URL da Graph API;
- payload sintético assinado com `x-hub-signature-256`, como exige o webhook atual;
- erros externos não devolvem stack, tokens nem respostas completas de terceiros.

## Variáveis obrigatórias

| Variável | DEV | Production |
|---|---|---|
| `META_LEADS_BACKFILL_ENV` | `development` | `production` |
| `META_LEADS_BACKFILL_KEY` | segredo exclusivo de DEV | segredo exclusivo de Production |
| `META_APP_SECRET` | segredo do aplicativo de teste | segredo do aplicativo real |
| `META_LEADS_BACKFILL_WEBHOOK_URL` | URL do Preview/DEV | URL oficial |
| `META_LEADS_BACKFILL_ALLOWED_HOST` | host exato do Preview/DEV | `sistemaautomotivo.autosede.com.br` |
| `META_PAGE_ACCESS_TOKEN` | opcional; preferido ao legado no banco | opcional; preferido ao legado no banco |

## Sequência segura de implantação

1. Configurar segredos exclusivos no projeto `autocar-dev`.
2. Confirmar que o webhook aponta para Preview/DEV e não para Production.
3. Implantar a função em DEV mantendo `verify_jwt=false`, pois a autenticação é feita pelo segredo privado da função.
4. Executar apenas o dry-run e validar que nenhuma linha foi criada.
5. Usar uma carga sintética e os dois sinais de commit; conferir logs e idempotência.
6. Só depois de uma autorização separada, preparar Production com segredos diferentes e nova janela de validação.

Não remover nem migrar `whatsapp_numbers.access_token` nesta entrega. O único registro legado deve ser migrado em uma janela própria, com teste da Meta Cloud API e rollback, sem tocar nas integrações Evolution conectadas.
