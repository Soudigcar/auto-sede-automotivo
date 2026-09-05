# PLAYBOOK — WhatsApp API por Loja V1

Checkpoint operacional do projeto AUTO CONTROLE AUTOMOTIVO.

Data do checkpoint: 2026-09-05 (America/Sao_Paulo)

## 0. REGRA DE RETOMADA

Antes de qualquer alteração:

1. Ler este playbook inteiro.
2. Revalidar conexões GitHub, Supabase e Vercel.
3. Ler `main`, HEAD da branch isolada, estado do Supabase temporário e deploys Vercel.
4. Comparar o estado atual com este checkpoint.
5. Informar diferenças.
6. Só depois recomendar ou alterar.
7. Em dúvida: FAIL-CLOSED.

Nunca assumir que autorização antiga permite nova alteração de Production, merge, migration Production, Evolution/VPS, WhatsApp real, tokens reais ou modos AUTOCAR.

## 1. AUTORIZAÇÃO VIGENTE DESTA FRENTE

Autorização concedida pelo usuário:

> Autorizo criar uma branch Git isolada a partir da `main` atual e uma branch temporária do Supabase CRM `AutoSedeAutomotivo` exclusivamente para implementar e homologar a V1 do WhatsApp API por Loja, incluindo armazenamento de segredos no Vault, conexão Meta por loja, Modelos de Mensagem, WhatsApp Flows, Jornadas internas e auditoria, usando somente dados e credenciais sintéticos, aplicando migrations somente na branch Supabase temporária e gerando somente Vercel Preview conectado a essa branch. Não autorizo alterar CRM Production, AUTOCAR Production, `saas-dev`, `autocar-dev`, Evolution/VPS, instâncias ou webhooks atuais, números/QR Codes reais, dados ou tokens reais, OFF/COPILOT/AUTOPILOT, `main`, PR, merge ou Vercel Production.

Consequência prática:

- PERMITIDO: branch Git isolada, branch Supabase temporária do CRM, migrations apenas nela, dados sintéticos, segredos sintéticos, código apenas na branch, Vercel Preview apenas se ligado ao Supabase temporário.
- NÃO PERMITIDO: CRM Production, AUTOCAR Production, `saas-dev`, `autocar-dev`, Evolution/VPS, instâncias atuais, webhooks atuais, números reais, QR Codes reais, tokens reais, `main`, PR, merge, Vercel Production, OFF/COPILOT/AUTOPILOT.

## 2. INFRA — CHECKPOINT

### GitHub

Repositório:

`Soudigcar/auto-sede-automotivo`

`main` confirmado neste checkpoint:

`e06039a27fcd9128f1475b8c5214bf32bcb35461`

Branch protection da `main`:

DESABILITADA.

Branch isolada desta frente:

`feature/whatsapp-api-store-v1-isolated`

Base original da branch:

`e06039a27fcd9128f1475b8c5214bf32bcb35461`

HEAD imediatamente antes da criação deste playbook:

`5bbb070aa4c1377c639f98f5c0c2085daf9d6ed7`

O commit que contém este playbook passa a ser o novo HEAD da branch.

Não existe PR autorizado para esta frente.
Não existe merge autorizado.
Não alterar `main`.

### Supabase CRM Production

Projeto:

`AutoSedeAutomotivo`

Ref Production:

`wufikrdgyxrsszlbpfmv`

NÃO ALTERAR nesta frente.

### Supabase temporário desta homologação

Nome da branch:

`whatsapp-api-store-v1-isolated`

Project ref:

`ggvwuqomwbxhtlxaocau`

Branch ID:

`1927c321-f276-443c-b26e-c7384910de69`

Parent:

`wufikrdgyxrsszlbpfmv`

Estado no checkpoint:

`ACTIVE_HEALTHY`

`with_data=false`

Custo confirmado na criação:

`US$ 0,01344/hora`

Não excluir esta branch sem nova autorização explícita de cleanup se a homologação ainda estiver em andamento.

### Supabase protegidos / fora do escopo

AUTOCAR Production:

`icmwdggbvijexjgrvsbl`

AUTOCAR DEV legado:

`azszzdotbrczlhrmhrlw`

`saas-dev`:

`hfzmzfhuhukmxkxbkxay`

Nenhum deles deve receber migrations, dados ou alterações desta frente.

### Vercel

Team:

`soudigcar`

Team ID:

`team_9rTvoLWDdYyZEXGlnfCWMf42`

Projeto:

`auto-sede-automotivo`

Project ID:

`prj_doyYow0E3msbd0NaiNCA9too6gd4`

Production confirmada no checkpoint:

Deployment: `dpl_2BSR7SyC7sjXXyXdG256Hz2z8EwS`

Estado: `READY`

Git SHA: `e06039a27fcd9128f1475b8c5214bf32bcb35461`

Nenhum Preview desta branch `feature/whatsapp-api-store-v1-isolated` foi criado até este checkpoint.

Existem Previews de outras branches. Não confundir com esta frente.

## 3. TRAVA TEMPORÁRIA DE VERCEL

Na branch isolada, `vercel.json` foi alterado apenas para impedir deploy automático enquanto as variáveis Preview específicas da branch não puderem ser configuradas com segurança:

```json
"git": {
  "deploymentEnabled": false
}
```

Essa trava NÃO existe na `main`.

Não remover essa trava antes de confirmar que o Preview da branch usará exclusivamente o Supabase temporário `ggvwuqomwbxhtlxaocau`.

## 4. VARIÁVEIS NECESSÁRIAS PARA O PREVIEW ISOLADO

Antes de gerar o Preview, configurar overrides exclusivos da branch Vercel `feature/whatsapp-api-store-v1-isolated`:

- `NEXT_PUBLIC_SUPABASE_URL` -> URL do Supabase temporário `ggvwuqomwbxhtlxaocau`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` -> anon key do Supabase temporário
- `SUPABASE_SERVICE_ROLE_KEY` -> service_role do Supabase temporário
- `WHATSAPP_CLOUD_PREVIEW_ENABLED=true`

REGRAS:

- Nunca copiar essas chaves para o chat.
- Nunca usar chaves do CRM Production nesse Preview.
- Nunca gravar chaves em Git.
- Confirmar o escopo da variável como Preview + branch específica antes de remover `deploymentEnabled=false`.
- A conexão Vercel disponível no checkpoint permite leitura/deploy, mas não expõe escrita de Environment Variables por branch. Portanto, esse passo precisa de uma interface segura que suporte branch-specific env vars.

## 5. ROTAS DA APLICAÇÃO — EXATAS

### UI da loja

Rota navegável:

`/loja/[slug]/integracoes`

Arquivo:

`src/app/loja/[slug]/integracoes/page.tsx`

Estado:

- mantém `WhatsappEvolutionPanel` existente;
- mantém `StoreWhatsappWebhookButton` existente;
- adiciona `WhatsappCloudApiPanel` abaixo deles.

### Evolution existente — NÃO MODIFICADO

Rota existente:

`/api/store/integrations/whatsapp`

Arquivo:

`src/app/api/store/integrations/whatsapp/route.ts`

Provider atual:

Evolution.

Não usar essa rota para Cloud API.
Não alterar essa rota nesta frente sem nova necessidade explícita.
Não clicar em ações de conectar/desconectar/refresh Evolution durante homologação da Cloud API se houver qualquer chance de atingir a VPS real.

### Cloud API por Loja — conexão

Rota nova:

`/api/store/integrations/whatsapp-cloud`

Arquivo:

`src/app/api/store/integrations/whatsapp-cloud/route.ts`

Métodos:

`GET`

- consulta a integração da loja;
- retorna contagem de Templates, Flows e Jornadas;
- retorna `external_execution=false`;
- retorna `synthetic_only=true`.

`POST`

Ações aceitas:

- `save-draft`
- `save-synthetic-secrets`
- `disable`
- `revoke-synthetic-secrets`

Todas as escritas chamam `assertWhatsappCloudPreviewWriteEnabled()`.

### Cloud API por Loja — assets

Rota nova:

`/api/store/integrations/whatsapp-cloud/assets`

Arquivo:

`src/app/api/store/integrations/whatsapp-cloud/assets/route.ts`

Métodos:

`GET`

- lista Templates da loja;
- lista WhatsApp Flows da loja;
- lista Jornadas internas da loja.

`POST`

`kind` aceitos:

- `template`
- `flow`
- `journey`

Todos são criados como sintéticos na homologação.

Jornada é criada obrigatoriamente com:

`execution_enabled=false`

`safe_core_required=true`

### Helper server-side

Arquivo:

`src/lib/server/storeWhatsappCloud.ts`

Funções principais:

- `assertWhatsappCloudPreviewWriteEnabled`
- `publicWhatsappCloudIntegration`
- `loadStoreWhatsappCloudIntegration`
- `saveStoreWhatsappCloudDraft`
- `saveStoreWhatsappCloudSyntheticSecrets`
- `auditStoreWhatsappCloud`

Gate de segurança:

- se `VERCEL_ENV === 'production'` -> escrita Cloud API é bloqueada;
- se `WHATSAPP_CLOUD_PREVIEW_ENABLED !== 'true'` -> escrita é bloqueada;
- segredos sintéticos precisam começar com `synthetic-`.

## 6. O QUE AINDA NÃO EXISTE / NÃO ESTÁ LIBERADO

IMPORTANTE para não inferir funcionalidades inexistentes:

- NÃO existe chamada real à Meta implementada nesta V1 de homologação.
- NÃO existe envio real via Cloud API implementado.
- NÃO existe recebimento real via webhook Meta implementado.
- NÃO existe rota pública de webhook Meta criada nesta frente até este checkpoint.
- NÃO existe sincronização real de Templates com a Meta.
- NÃO existe sincronização real de WhatsApp Flows com a Meta.
- NÃO existe execução externa de Jornadas.
- NÃO existe fallback para Evolution.
- NÃO existe fallback para Master.
- NÃO existe fallback entre lojas.
- Graph API Version foi deixada configurável e não foi hardcoded porque a documentação oficial da Meta não foi validada neste checkpoint.

Antes de implementar endpoints Meta reais, validar documentação oficial atual de 2026 sobre Graph API, webhook signature, templates, Flows e onboarding/OAuth.

## 7. UI NOVA

Componente:

`src/components/WhatsappCloudApiPanel.tsx`

Título exibido:

`WhatsApp via API própria da loja`

Campos:

- Nome da conta
- WABA ID
- Phone Number ID
- Número de exibição
- Graph API Version
- Access Token
- App Secret
- Verify Token

A UI informa explicitamente:

`Homologação · execução externa OFF`

O frontend nunca recebe o valor de um segredo já salvo no Vault; recebe apenas flags booleanas:

- `has_access_token`
- `has_app_secret`
- `has_verify_token`

## 8. MIGRATION VERSIONADA NO GIT

Arquivo oficial da branch Git:

`supabase/migrations/20260905144500_whatsapp_cloud_api_store_v1.sql`

Esta é a migration consolidada que deve ser usada como fonte de verdade da implementação.

### ATENÇÃO — histórico da branch Supabase temporária

Durante a homologação foram aplicadas três migrations incrementais diretamente no ambiente temporário:

- `20260905140841 whatsapp_cloud_api_store_v1`
- `20260905140906 whatsapp_cloud_api_store_v1_grants`
- `20260905140947 whatsapp_cloud_api_store_v1_rls_qualified_store`

No Git elas foram consolidadas em uma única migration:

`20260905144500_whatsapp_cloud_api_store_v1.sql`

REGRA:

- se recriar/resetar uma branch de homologação a partir do Git, aplicar a migration consolidada do Git;
- NÃO copiar as três versões temporárias para Production;
- NÃO reaplicar a migration consolidada na branch temporária atual sem antes auditar o histórico, pois a estrutura equivalente já existe nela;
- qualquer futura aplicação em CRM Production exige autorização separada e preflight de migration.

## 9. TABELAS NOVAS

Criadas apenas na branch Supabase temporária e versionadas na migration Git:

- `store_whatsapp_cloud_integrations`
- `whatsapp_message_template_blueprints`
- `store_whatsapp_message_templates`
- `store_whatsapp_flows`
- `store_whatsapp_journeys`
- `store_whatsapp_journey_steps`
- `whatsapp_cloud_webhook_events`
- `whatsapp_cloud_audit_events`

Princípio de arquitetura:

`store_whatsapp_integrations` continua sendo a estrutura Evolution existente.

A Cloud API usa `store_whatsapp_cloud_integrations` separadamente.

Não misturar providers na tabela Evolution.

## 10. VAULT / RPCS

RPCs versionadas:

- `store_whatsapp_cloud_set_secrets(uuid,text,text,text)`
- `store_whatsapp_cloud_get_secrets(uuid)`
- `store_whatsapp_cloud_revoke_secrets(uuid)`

Permissão:

- `anon`: sem EXECUTE
- `authenticated`: sem EXECUTE
- `service_role`: EXECUTE

Segredos:

- Access Token
- App Secret
- Verify Token

A tabela de integração guarda somente referências UUID dos segredos.

## 11. RLS / ISOLAMENTO MULTI-TENANT

Todas as tabelas novas relevantes estão com RLS habilitada.

Modelo:

- Gestor da loja autenticado -> somente leitura da própria loja;
- Master -> leitura global;
- escrita -> backend com `service_role` após autorização do portal;
- RPC de descriptografia -> somente `service_role`.

Falha descoberta durante homologação:

A primeira versão das policies tinha referência ambígua a `store_id`; uma sessão sintética da Loja A conseguiu ver 2 integrações.

Correção aplicada:

qualificação explícita do `store_id` da tabela em cada policy afetada.

Resultado depois da correção:

- Loja A -> 1 integração, somente Loja A;
- Loja B -> 1 integração, somente Loja B;
- Master -> 2 integrações.

Essa correção já está incorporada na migration consolidada do Git.

## 12. AUDITORIA / IDEMPOTÊNCIA

Tabela:

`whatsapp_cloud_audit_events`

Trigger:

auditoria é imutável; UPDATE ou DELETE gera exceção.

Tabela de eventos:

`whatsapp_cloud_webhook_events`

Idempotência:

`unique (integration_id, provider_event_id)`

Teste executado:

o mesmo evento sintético inserido/repetido resultou em apenas 1 evento persistido.

## 13. DADOS SINTÉTICOS DO AMBIENTE TEMPORÁRIO

### Loja Sintética A

Store ID:

`11111111-1111-4111-8111-111111111111`

Integration ID:

`41111111-1111-4111-8111-111111111111`

Estado atual:

- provider: `meta_cloud`
- status: `testing`
- enabled: `false`
- is_synthetic: `true`
- access token no Vault: SIM
- app secret no Vault: SIM
- verify token no Vault: SIM
- templates: 1
- flows: 1
- journeys: 1

### Loja Sintética B

Store ID:

`22222222-2222-4222-8222-222222222222`

Integration ID:

`42222222-2222-4222-8222-222222222222`

Estado atual:

- provider: `meta_cloud`
- status: `disabled`
- enabled: `false`
- is_synthetic: `true`
- access token no Vault: NÃO
- app secret no Vault: NÃO
- verify token no Vault: NÃO
- templates: 0
- flows: 0
- journeys: 0

Contadores sintéticos adicionais no checkpoint:

- `whatsapp_cloud_webhook_events`: 1
- `whatsapp_cloud_audit_events`: 1

Não migrar esses dados sintéticos para Production.

## 14. TESTES JÁ PASSADOS

- branch Supabase criada sem dados de Production;
- Vault disponível;
- segredos armazenados criptografados;
- frontend não recebe segredos armazenados;
- `authenticated` não consegue executar RPC de descriptografia;
- `service_role` consegue executar RPC necessária;
- Loja A não vê Loja B após correção de RLS;
- Loja B não vê Loja A;
- Master vê ambas;
- `authenticated` sem INSERT/UPDATE/DELETE nas tabelas Cloud;
- `service_role` com DML server-side;
- evento duplicado bloqueado pela idempotência;
- auditoria imutável validada;
- jornada criada com `execution_enabled=false`;
- jornada criada com `safe_core_required=true`;
- revogação de segredos desliga a integração;
- integração não pode ficar habilitada sem WABA, Phone Number ID e três referências Vault;
- nenhum Preview desta branch foi disparado;
- nenhum arquivo interno Evolution foi modificado;
- CRM Production permaneceu intocado;
- Vercel Production permaneceu no commit da `main`.

## 15. ARQUITETURA ALVO

```text
                    AUTO CONTROLE
                         |
               WhatsApp Integration Router
                  /                 \
          EVOLUTION               META CLOUD
        Espelhamento            API por loja
             |             Templates / Flows
             \                 /
               CRM normalizado
                    |
                 AUTOCAR
```

Regras:

- Evolution existente continua independente.
- Meta Cloud é por loja.
- nenhuma loja usa credencial de outra loja.
- nenhum fallback entre providers.
- nenhum segredo Meta vai para AUTOCAR.
- AUTOCAR permanece provider-agnostic.
- Jornadas internas passam por SAFE CORE.
- `create_follow_up` não deve ser liberado implicitamente por esta implementação.

## 16. PRÓXIMO PASSO EXATO

Estado atual: BLOQUEADO DE FORMA SEGURA antes de Preview.

Motivo:

as variáveis específicas de Preview ainda não foram gravadas na Vercel para esta branch, e a conexão Vercel usada no checkpoint não expõe operação de Environment Variable por branch.

Sequência obrigatória:

1. Revalidar `main` e HEAD da branch.
2. Revalidar que Supabase `ggvwuqomwbxhtlxaocau` está `ACTIVE_HEALTHY`.
3. Configurar na Vercel os 4 overrides de Preview exclusivos da branch.
4. Confirmar sem expor valores que os três Supabase vars apontam para `ggvwuqomwbxhtlxaocau`.
5. Confirmar `WHATSAPP_CLOUD_PREVIEW_ENABLED=true` apenas nessa branch.
6. Confirmar que nenhuma variável necessária está usando CRM Production.
7. Só então remover `git.deploymentEnabled=false` do `vercel.json` NA BRANCH ISOLADA.
8. Push/commit dessa remoção apenas na branch isolada.
9. Confirmar que a Vercel gerou Preview da branch correta.
10. Confirmar que o Preview NÃO é Production.
11. Fazer smoke da rota `/loja/<slug-sintetico>/integracoes`.
12. Testar GET `/api/store/integrations/whatsapp-cloud`.
13. Testar `save-draft` com dados sintéticos.
14. Testar `save-synthetic-secrets` apenas com `synthetic-*`.
15. Testar criação sintética de template/flow/journey.
16. Recarregar e conferir contagens.
17. Repetir teste RLS Loja A x Loja B.
18. Repetir auditoria imutável e idempotência.
19. Confirmar `external_execution=false`.
20. Confirmar zero chamada real Meta.
21. Confirmar zero mudança em Evolution/VPS.
22. Parar e apresentar resultado.
23. NÃO criar PR.
24. NÃO mergear.
25. NÃO aplicar nada em CRM Production.

## 17. CHECKLIST DE SMOKE DO PREVIEW

### GET conexão

`GET /api/store/integrations/whatsapp-cloud?slug=<slug>`

Esperado:

- HTTP 200 para Gestor/Master autorizado;
- `provider=meta_cloud`;
- `enabled=false`;
- `external_execution=false`;
- `synthetic_only=true`;
- nenhum segredo retornado.

### POST draft

`POST /api/store/integrations/whatsapp-cloud`

Body lógico:

```json
{
  "action": "save-draft",
  "slug": "<slug-sintetico>",
  "business_account_name": "Conta sintética",
  "waba_id": "WABA_SYNTH_001",
  "phone_number_id": "PHONE_SYNTH_001",
  "display_phone_number": "+5500000000000",
  "graph_api_version": ""
}
```

### POST Vault sintético

Ação:

`save-synthetic-secrets`

Todos os valores precisam começar com:

`synthetic-`

### Assets

`GET /api/store/integrations/whatsapp-cloud/assets?slug=<slug>`

Criação:

`POST /api/store/integrations/whatsapp-cloud/assets`

`kind=template|flow|journey`

### Fail-closed

Testar:

- POST sem `WHATSAPP_CLOUD_PREVIEW_ENABLED=true` -> deve falhar;
- POST com `VERCEL_ENV=production` -> deve falhar por código;
- credencial sem prefixo `synthetic-` -> deve falhar;
- Gestor Loja A tentando agir sobre Loja B -> deve falhar/ficar fora do escopo;
- jornada criada -> `execution_enabled=false`.

## 18. CAMINHO FUTURO PARA META REAL — NÃO AUTORIZADO AINDA

Somente depois da homologação sintética:

1. validar documentação oficial Meta atual;
2. desenhar webhook real com assinatura HMAC;
3. desenhar onboarding/credencial por loja;
4. testar em ambiente isolado com credencial de teste apropriada;
5. desenhar normalização inbound/outbound CRM;
6. provar não interferência no Evolution;
7. provar idempotência;
8. provar roteamento por store;
9. provar fail-closed sem fallback;
10. apresentar relatório;
11. pedir autorização separada para qualquer passo com credencial/número real;
12. pedir autorização separada para CRM Production;
13. pedir autorização separada para PR/merge/deploy Production.

## 19. PRODUÇÃO — REGRAS PARA O FUTURO

NUNCA aplicar a migration em CRM Production apenas porque o Preview passou.

Antes de Production:

- atualizar a leitura da `main`;
- verificar se a `main` avançou;
- refazer comparação da branch;
- reauditar migration consolidada;
- revisar RLS/FKs/indexes/RPCs/grants/Vault;
- revisar compatibilidade com `store_whatsapp_integrations` e `whatsapp_numbers` existentes;
- revisar o token plaintext legado encontrado em Production sem lê-lo/exibi-lo;
- validar backup/rollback;
- pedir autorização explícita de migration CRM Production;
- aplicar somente após autorização;
- validar banco;
- depois pedir autorização separada para PR/merge/Vercel Production.

## 20. PROMPT DE RETOMADA PARA NOVO CHAT

Usar este texto em um novo chat:

> Retome a frente WhatsApp API por Loja V1 do projeto AUTO CONTROLE AUTOMOTIVO. Primeiro leia no GitHub `Soudigcar/auto-sede-automotivo`, branch `feature/whatsapp-api-store-v1-isolated`, o arquivo `docs/playbooks/WHATSAPP_API_STORE_V1_PLAYBOOK.md`. Depois revalide GitHub, Supabase e Vercel contra o checkpoint do arquivo e me informe qualquer diferença antes de alterar qualquer coisa. Continue em fail-closed e respeite exatamente as autorizações registradas no playbook.

## 21. CHECKPOINT RESUMIDO

CONCLUÍDO:

- arquitetura paralela Cloud API por loja;
- branch Git isolada;
- branch Supabase temporária;
- migration temporária homologada;
- migration Git consolidada;
- Vault;
- RLS corrigida;
- Templates;
- Flows;
- Jornadas OFF + SAFE CORE;
- auditoria imutável;
- idempotência;
- UI paralela;
- APIs sintéticas;
- trava Vercel de deploy automático.

VALIDADO:

- isolamento Loja A/Loja B;
- Master global;
- Vault;
- grants;
- revogação;
- fail-closed de secrets;
- idempotência;
- auditoria imutável;
- nenhum Preview desta branch;
- Production intocada.

PENDENTE:

- overrides Vercel Preview por branch;
- remover trava somente após overrides;
- gerar Preview;
- smoke visual/API;
- documentação Meta oficial;
- webhook Meta real;
- chamadas Meta reais;
- homologação com credenciais reais (não autorizada);
- qualquer Production (não autorizada);
- PR/merge (não autorizados).
