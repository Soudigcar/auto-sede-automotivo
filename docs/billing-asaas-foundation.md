# Billing Asaas — Foundation

## Escopo desta etapa

Esta fundacao separa tres conceitos que nao podem compartilhar o mesmo status:

1. cadastro publico da loja no portal;
2. operacao atual da loja e de seus usuarios;
3. assinatura comercial para acesso ao CRM/SaaS.

A migration nao altera `stores`, `users`, `portal_enabled`, leads, estoque, WhatsApp ou AUTOCAR. Ela tambem nao cria assinaturas automaticamente.

## Protecao contra interrupcao

O bloqueio depende simultaneamente de tres autorizacoes:

- `BILLING_ENFORCEMENT_ENABLED=true` no ambiente;
- `BILLING_PREVIEW_ENFORCEMENT_ENABLED=true` ou `BILLING_PRODUCTION_ENFORCEMENT_ENABLED=true`, conforme o ambiente;
- `access_enforcement_mode='enforce'` na assinatura individual.

O valor padrao global e individual permanece desligado/`observe`. Erro de infraestrutura ou migration ausente tambem preserva o acesso atual (`billing_infrastructure_unavailable`). O Master sempre possui bypass administrativo.

## Trial atual

- somente o Master ativo pode chamar `start_store_billing_trial`;
- o banco usa seu proprio relogio para registrar inicio e fim;
- `trial_ends_at` deve ser exatamente `trial_started_at + 7 days`;
- a operacao e idempotente enquanto a assinatura estiver em trial;
- uma loja nao recebe um segundo trial depois que o primeiro foi utilizado;
- o trial nasce em `observe`, sem qualquer bloqueio;
- nenhum status de loja ou usuario e alterado.

## Etapa 2 — interface Master em Preview

- a rota `/master/billing` apresenta o plano Profissional, o status por loja e a janela fixa do trial;
- cadastro no portal, usuarios ativos no sistema e assinatura aparecem como conceitos separados;
- somente loja ativa com pelo menos um usuario ativo do sistema e marcada como elegivel;
- a API aceita leitura no Preview apenas quando a chave de leitura está ativa e o project ref coincide com `BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF`;
- `BILLING_TRIAL_START_ENABLED=false` bloqueia a mutacao no servidor antes da chamada ao banco;
- nesta etapa, nenhuma assinatura ou trial e persistido e o Asaas continua sem configuracao.

## Etapa 6 — experiencia da loja e entitlement observado

- gestores da loja consultam plano, trial, vencimento, cartao e situacao da cobranca em `/loja/[slug]/assinatura`;
- equipes comerciais nao recebem permissao para visualizar dados financeiros;
- o entitlement consulta a assinatura e calcula o resultado comercial, mas sempre preserva o acesso em `observe`;
- uma trava adicional da etapa 6 impede enforcement mesmo se a chave global antiga for ativada isoladamente;
- o diagnostico e enviado aos logs sem nome, email ou telefone;
- falhas de consulta ao billing permanecem fail-open;
- `BILLING_PREVIEW_MUTATIONS_ENABLED=false` bloqueia no servidor trial, Checkout, confirmacao manual e cenarios sinteticos;
- os controles da etapa 5 nao aparecem na interface e seus endpoints deixam de ser expostos.

## Etapa 9 — preparacao segura para Production

- Preview e Production possuem allowlists independentes do project ref do Supabase;
- cada ambiente possui chaves próprias de leitura, mutação e enforcement;
- Production nasce com todas as chaves desligadas e não herda nenhuma variável do Preview ou da etapa 6;
- quando autorizada futuramente, a leitura de Production poderá operar em modo `observe` sem liberar POST, trials, Checkout ou bloqueio;
- mismatch de projeto, credencial ausente, ambiente não suportado ou leitura desligada falham fechados antes do acesso ao billing;
- a interface e as APIs não dependem mais de texto ou contrato exclusivo de Preview;
- Node.js fica fixado em `24.x`, compatível com as bibliotecas atuais do Supabase;
- nenhuma migration, assinatura, cobrança ou dado é criado por esta etapa;
- toda chamada HTTP ao Asaas Production continua proibida por `ASAAS_PRODUCTION_FORBIDDEN`.

## Asaas

- API Key e token do Webhook sao exclusivamente server-side;
- Sandbox e Production usam URLs fixas e chaves separadas;
- o Webhook valida `asaas-access-token` em tempo constante;
- o corpo e limitado a 256 KiB;
- `provider_event_id` e unico para garantir idempotencia;
- apenas um payload financeiro minimo e persistido, sem dados de cartao;
- o recebimento apenas registra o evento. Processamento financeiro e Checkout serao adicionados em etapa separada.

## Ordem segura de rollout

1. revisar e validar a migration em banco isolado;
2. aplicar somente em ambiente autorizado;
3. configurar Asaas Sandbox no Preview;
4. validar Webhook e duplicidades;
5. criar Checkout hospedado e conciliacao de pagamentos;
6. identificar somente lojas que realmente acessam o sistema;
7. iniciar trials individualmente ou em lote confirmado pelo Master;
8. manter enforcement global desligado durante o periodo inicial;
9. habilitar enforcement por loja somente apos cobranca e conciliacao validadas;
10. habilitar a chave global apenas com autorizacao especifica.
