# CHECKPOINT — WhatsApp API por Loja V1 — PR #210

Atualizado em: 2026-09-06 (America/Sao_Paulo)

Playbook principal:

`docs/playbooks/WHATSAPP_API_STORE_V1_PLAYBOOK.md`

## Estado atual

- Repositório: `Soudigcar/auto-sede-automotivo`
- `main`: `f3288179855e4dde953acaf4c131541954c3a4dc`
- Branch protection da `main`: desabilitada
- Branch: `feature/whatsapp-api-store-v1-isolated`
- PR: #210, Draft, aberto, não mergeado
- Base do PR: `main`
- Supabase temporário: `ggvwuqomwbxhtlxaocau`
- Branch Supabase ID: `1927c321-f276-443c-b26e-c7384910de69`
- Parent CRM Production: `wufikrdgyxrsszlbpfmv`
- Supabase temporário: `ACTIVE_HEALTHY`, `with_data=false`
- CRM Production: nenhuma migration WhatsApp Cloud V1 aplicada
- AUTOCAR Production, AUTOCAR DEV, saas-dev, Evolution/VPS e modos OFF/COPILOT/AUTOPILOT: fora do escopo e não alterados por esta frente

## Arquitetura da V1

A Cloud API por loja é independente da integração Evolution existente.

- Evolution continua em `store_whatsapp_integrations` e `/api/store/integrations/whatsapp`.
- Cloud API usa `store_whatsapp_cloud_integrations` e rotas próprias.
- Não existe fallback Cloud → Evolution, entre lojas ou para Master.
- Segredos ficam no Vault do CRM e não são retornados ao frontend.
- AUTOCAR não recebe segredos da Meta.

## Rotas V1

- `GET /api/store/integrations/whatsapp-cloud`
- `POST /api/store/integrations/whatsapp-cloud`
- `GET /api/store/integrations/whatsapp-cloud/assets`
- `POST /api/store/integrations/whatsapp-cloud/assets`

Nesta homologação final estão autorizados somente os dois GETs read-only.

## SAFE CORE / fail-closed

A homologação mantém:

- `enabled=false`
- `external_execution=false`
- `synthetic_only=true`
- Jornadas com `execution_enabled=false`
- Jornadas com `safe_core_required=true`
- nenhuma chamada real à Meta Graph API
- nenhum envio real de WhatsApp
- nenhum webhook Meta real
- nenhuma execução externa de Jornada

O gate de escrita exige simultaneamente:

1. `VERCEL_ENV=preview`
2. `VERCEL_GIT_COMMIT_REF=feature/whatsapp-api-store-v1-isolated`
3. `WHATSAPP_CLOUD_PREVIEW_ENABLED=true`
4. `NEXT_PUBLIC_SUPABASE_URL` apontando exatamente para `ggvwuqomwbxhtlxaocau.supabase.co`

## Migrations versionadas no PR

- `20260905144500_whatsapp_cloud_api_store_v1.sql`
- `20260905221500_whatsapp_cloud_store_tenant_fk.sql`
- `20260906005000_whatsapp_cloud_fk_indexes.sql`

No Supabase temporário, a migration de tenant possui duas entradas históricas com o mesmo nome:

- `20260905224732 whatsapp_cloud_store_tenant_fk`
- `20260905230523 whatsapp_cloud_store_tenant_fk`

Auditoria anterior confirmou apenas uma cópia de cada constraint e `tenant_mismatches=0`. Esse drift não deve ser normalizado automaticamente.

## Homologação já comprovada

No SHA `2763935de7a70f78996bc9992cca9d09f0c07d76`, Preview `dpl_GY7JNbKP4w2ciadJU7keKNYQNTis`:

- GET integração → HTTP 200
- GET assets → HTTP 200
- 1 template sintético
- 1 Flow sintético
- 1 Jornada sintética
- Vault presente por flags booleanas, sem segredo retornado
- `enabled=false`
- `external_execution=false`
- `synthetic_only=true`
- Jornada `execution_enabled=false`
- Jornada `safe_core_required=true`

A credencial Auth descartável usada nesse smoke foi removida; token antigo passou a 403; perfil descartável removido; perfil pré-existente da Loja Sintética A permaneceu intacto.

## PR #210

PR: `https://github.com/Soudigcar/auto-sede-automotivo/pull/210`

Antes desta atualização documental, o PR estava:

- Draft
- aberto
- não mergeado
- mergeable=true
- 13 arquivos alterados
- Vercel Preview READY no HEAD anterior `105d8447fa5d506f2488385a326e247f397d4d47`
- sem GitHub Actions associados ao HEAD anterior

Após esta atualização documental, deve ser considerado válido somente o novo HEAD gerado pela própria atualização e seu Preview correspondente.

## Hardening de autofill

Commit anterior:

`1a28747ae03fef06a33ee2a1364fe51895dbd5c9`

Escopo:

- nomes próprios para campos da Cloud API
- `autoComplete=off` nos campos de configuração
- `autoComplete=new-password` nos segredos sintéticos
- bloqueios para password managers
- teste estático correspondente

Não altera backend, migrations, Vault, tenant ou execução.

## Ocorrência operacional 2026-09-06

Durante a atualização documental, foi criado por engano um arquivo vazio `__should_not_create__` na branch. O erro foi detectado imediatamente e o arquivo foi removido antes de qualquer continuação da homologação.

- criação acidental: commit `ea664996f59127ebff8ae224f6d3b75c32f396ed`
- remoção corretiva: commit `446b47f0429f5979111e759a14a2804f36c0c25a`
- diff líquido do arquivo: zero
- nenhum código, migration, banco, Vercel Production ou Production foi alterado por esse incidente

Não reescrever histórico para esconder a ocorrência.

## Próximo passo autorizado

1. atualizar este checkpoint e o playbook;
2. confirmar o novo HEAD da branch e do PR #210;
3. confirmar Vercel Preview do novo HEAD em estado READY;
4. criar credencial Auth e perfil `public.users` 100% sintéticos e descartáveis somente no Supabase temporário, sem tocar no perfil Auth existente da Loja Sintética A;
5. executar somente os dois GETs autenticados read-only no Preview do HEAD final;
6. validar isolamento, Vault e SAFE CORE;
7. remover integralmente perfil, Auth, sessão e arquivos locais sensíveis;
8. validar token antigo revogado;
9. reauditar PR/diff/status/Preview e confirmar CRM Production intacto;
10. parar sem merge e sem Production.

## Não autorizado

- POSTs de mutação da aplicação
- CRM Production
- migrations Production
- merge
- alteração de `main`
- Vercel Production
- AUTOCAR Production
- Evolution/VPS
- dados/tokens reais
- OFF/COPILOT/AUTOPILOT
