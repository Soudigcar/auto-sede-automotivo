# PLAYBOOK — WhatsApp API por Loja V1

Atualizado em: 2026-09-06 (America/Sao_Paulo)

## 0. REGRA DE RETOMADA

Antes de qualquer alteração:

1. Revalidar `main`, HEAD da branch, PR #210, Supabase temporário e Vercel Preview.
2. Comparar com este playbook.
3. Informar qualquer diferença material.
4. Em dúvida: fail-closed.
5. Autorização antiga não vale para merge, migration Production, deploy Production, Evolution/VPS, WhatsApp real, tokens reais ou modos AUTOCAR.

## 1. INFRA DA FRENTE

Repositório:

`Soudigcar/auto-sede-automotivo`

`main` no preflight desta atualização:

`f3288179855e4dde953acaf4c131541954c3a4dc`

Branch protection da `main`:

DESABILITADA.

Branch da V1:

`feature/whatsapp-api-store-v1-isolated`

PR:

#210 — Draft, aberto, não mergeado.

Supabase temporário:

- nome: `whatsapp-api-store-v1-isolated`
- project ref: `ggvwuqomwbxhtlxaocau`
- branch ID: `1927c321-f276-443c-b26e-c7384910de69`
- parent: `wufikrdgyxrsszlbpfmv`
- `with_data=false`
- estado no preflight: `ACTIVE_HEALTHY`
- custo conhecido: US$ 0,01344/hora

Fora do escopo desta frente:

- CRM Production `wufikrdgyxrsszlbpfmv`
- AUTOCAR Production `icmwdggbvijexjgrvsbl`
- AUTOCAR DEV `azszzdotbrczlhrmhrlw`
- `saas-dev` `hfzmzfhuhukmxkxbkxay`
- Evolution/VPS
- OFF/COPILOT/AUTOPILOT

## 2. OBJETIVO DA V1

Adicionar uma alternativa independente de WhatsApp Cloud API própria por loja, sem desmontar ou modificar o fluxo Evolution existente.

Princípios:

- cada loja possui configuração própria;
- nenhuma loja usa segredo/configuração de outra;
- sem fallback entre providers ou tenants;
- fail-closed por loja;
- AUTOCAR permanece provider-agnostic;
- segredos ficam no CRM/Vault, nunca no AUTOCAR;
- CRM permanece fonte de verdade do negócio e agenda.

## 3. EVOLUTION EXISTENTE

Estrutura Evolution existente permanece separada.

- tabela principal existente: `store_whatsapp_integrations`
- rota existente: `/api/store/integrations/whatsapp`
- painel existente: `WhatsappEvolutionPanel`

A V1 Cloud API não altera essa rota nem esse provider.

Não executar conectar/desconectar/QR/webhook Evolution durante homologação Cloud API.

## 4. CLOUD API V1

Tabela principal:

`store_whatsapp_cloud_integrations`

Rotas:

- `GET /api/store/integrations/whatsapp-cloud`
- `POST /api/store/integrations/whatsapp-cloud`
- `GET /api/store/integrations/whatsapp-cloud/assets`
- `POST /api/store/integrations/whatsapp-cloud/assets`

UI:

`/loja/[slug]/integracoes`

Componente:

`src/components/WhatsappCloudApiPanel.tsx`

Helper server-side:

`src/lib/server/storeWhatsappCloud.ts`

## 5. SAFE CORE / EXECUÇÃO

Nesta V1 de homologação:

- `enabled=false`
- `external_execution=false`
- `synthetic_only=true`
- Jornada `execution_enabled=false`
- Jornada `safe_core_required=true`
- sem chamada real à Meta Graph API
- sem envio real de WhatsApp
- sem webhook Meta real
- sem sincronização real de template
- sem sincronização real de Flow
- sem execução externa de Jornada

O gate de escrita exige simultaneamente:

1. `VERCEL_ENV=preview`
2. `VERCEL_GIT_COMMIT_REF=feature/whatsapp-api-store-v1-isolated`
3. `WHATSAPP_CLOUD_PREVIEW_ENABLED=true`
4. hostname Supabase exatamente `ggvwuqomwbxhtlxaocau.supabase.co`

Production, outra branch, flag ausente/falsa, URL malformada ou outro Supabase permanecem bloqueados.

## 6. VAULT

RPCs:

- `store_whatsapp_cloud_set_secrets(uuid,text,text,text)`
- `store_whatsapp_cloud_get_secrets(uuid)`
- `store_whatsapp_cloud_revoke_secrets(uuid)`

Permissão esperada:

- anon: sem EXECUTE
- authenticated: sem EXECUTE
- service_role: EXECUTE

Segredos:

- Access Token
- App Secret
- Verify Token

A integração guarda referências UUID; o frontend recebe apenas flags booleanas de presença do segredo.

## 7. TABELAS V1

- `store_whatsapp_cloud_integrations`
- `whatsapp_message_template_blueprints`
- `store_whatsapp_message_templates`
- `store_whatsapp_flows`
- `store_whatsapp_journeys`
- `store_whatsapp_journey_steps`
- `whatsapp_cloud_webhook_events`
- `whatsapp_cloud_audit_events`

RLS permanece habilitada nas tabelas relevantes.

Modelo esperado:

- loja autenticada: leitura apenas do próprio tenant;
- Master: leitura global;
- escrita: backend com `service_role` após autorização de portal;
- RPC Vault: somente `service_role`.

## 8. MIGRATIONS GIT

Fonte de verdade para futura aplicação controlada:

- `supabase/migrations/20260905144500_whatsapp_cloud_api_store_v1.sql`
- `supabase/migrations/20260905221500_whatsapp_cloud_store_tenant_fk.sql`
- `supabase/migrations/20260906005000_whatsapp_cloud_fk_indexes.sql`

A primeira migration consolida as três versões incrementais aplicadas no temporário durante a homologação inicial:

- `20260905140841 whatsapp_cloud_api_store_v1`
- `20260905140906 whatsapp_cloud_api_store_v1_grants`
- `20260905140947 whatsapp_cloud_api_store_v1_rls_qualified_store`

Nunca copiar essas três versões incrementais para Production.

## 9. DRIFT CONHECIDO NO TEMPORÁRIO

Histórico do Supabase temporário contém duas entradas com o mesmo nome:

- `20260905224732 whatsapp_cloud_store_tenant_fk`
- `20260905230523 whatsapp_cloud_store_tenant_fk`

Auditoria anterior confirmou:

- apenas uma cópia de cada constraint;
- `tenant_mismatches=0`;
- migration idempotente.

Não normalizar esse histórico automaticamente.

## 10. ÍNDICES DE FK

Migration:

`20260906005000_whatsapp_cloud_fk_indexes.sql`

Última validação conhecida no temporário:

- 22 índices esperados presentes;
- `cloud_fk_without_covering_index=0`;
- sem mudança de dados, constraints, RLS, grants ou funções.

## 11. DADOS SINTÉTICOS PRINCIPAIS

Loja Sintética A:

- store: `11111111-1111-4111-8111-111111111111`
- integration: `41111111-1111-4111-8111-111111111111`
- provider: `meta_cloud`
- status: `testing`
- enabled: false
- possui Vault refs sintéticas
- 1 template sintético
- 1 Flow sintético
- 1 Jornada sintética

Loja Sintética B:

- store: `22222222-2222-4222-8222-222222222222`
- integration: `42222222-2222-4222-8222-222222222222`
- disabled
- enabled: false
- segredos revogados

Nunca migrar dados sintéticos para Production.

## 12. HOMOLOGAÇÃO JÁ CONCLUÍDA

Preview no SHA:

`2763935de7a70f78996bc9992cca9d09f0c07d76`

Deployment:

`dpl_GY7JNbKP4w2ciadJU7keKNYQNTis`

Resultados autenticados:

- GET integração → 200
- GET assets → 200
- Vault presente sem segredo exposto
- 1 template
- 1 Flow
- 1 Jornada
- `external_execution=false`
- `synthetic_only=true`
- Jornada `execution_enabled=false`
- Jornada `safe_core_required=true`

Cleanup concluído:

- Auth descartável removido
- perfil `public.users` descartável removido
- token antigo retornando 403
- arquivos locais sensíveis removidos
- perfil pré-existente da Loja A intacto

## 13. HARDENING DE AUTOFILL

Commit:

`1a28747ae03fef06a33ee2a1364fe51895dbd5c9`

Alterações:

- nomes próprios para inputs Cloud API;
- `autoComplete=off` em campos de configuração;
- `autoComplete=new-password` em segredos;
- `data-1p-ignore=true` e `data-lpignore=true`;
- teste estático dedicado.

Esse commit não altera backend, migrations, Vault, tenant ou execução.

## 14. PR #210

Antes da atualização documental de 2026-09-06:

- base: `main` `f3288179855e4dde953acaf4c131541954c3a4dc`
- head: `105d8447fa5d506f2488385a326e247f397d4d47`
- Draft
- aberto
- mergeable=true
- 13 arquivos alterados
- Vercel Preview `dpl_Gq5z9YMu5hxEnWujsiAFF25H5MzL` READY
- status Vercel success
- sem GitHub Actions associados ao HEAD anterior

Depois da atualização documental, somente o novo HEAD e Preview decorrentes devem ser usados no preflight final.

## 15. OCORRÊNCIA OPERACIONAL 2026-09-06

Durante a atualização documental foi criado acidentalmente o arquivo vazio:

`__should_not_create__`

O erro foi detectado imediatamente e revertido antes da continuação.

- commit de criação acidental: `ea664996f59127ebff8ae224f6d3b75c32f396ed`
- commit de remoção corretiva: `446b47f0429f5979111e759a14a2804f36c0c25a`
- diff líquido: zero

Não reescrever histórico para ocultar o incidente.

## 16. HOMOLOGAÇÃO FINAL AUTORIZADA

Escopo vigente:

1. atualizar somente este playbook e o checkpoint;
2. obter novo HEAD da branch;
3. usar somente o Vercel Preview decorrente desse HEAD;
4. criar Auth + perfil sintéticos temporários exclusivos para smoke;
5. vincular apenas à Loja Sintética A;
6. executar somente os dois GETs read-only;
7. validar tenant, Vault e SAFE CORE;
8. remover Auth, perfil, sessão e arquivos locais;
9. confirmar token antigo revogado;
10. auditar PR/diff/status/Preview;
11. confirmar CRM Production sem migrations Cloud V1;
12. parar sem merge e sem Production.

## 17. NÃO AUTORIZADO

- POSTs de mutação da aplicação
- CRM Production
- migrations Production
- merge
- alteração de `main`
- Vercel Production
- AUTOCAR Production
- Evolution/VPS
- dados ou tokens reais
- OFF/COPILOT/AUTOPILOT

## 18. CHECKPOINT DE ENCERRAMENTO ESPERADO

Ao finalizar, registrar:

- novo HEAD final da branch;
- Preview final e estado READY;
- dois GETs autenticados e respectivos 200;
- isolamento tenant confirmado;
- Vault sem exposição de segredo;
- SAFE CORE intacto;
- cleanup de Auth/perfil/sessão concluído;
- token antigo revogado;
- PR #210 ainda Draft e não mergeado;
- CRM Production sem migrations Cloud V1;
- branch temporária ainda existente ou removida somente mediante autorização separada;
- nenhuma autorização implícita para Production.
