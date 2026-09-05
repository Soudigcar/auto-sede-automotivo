# CHECKPOINT — WhatsApp API por Loja V1 — hardening pré-Preview

Data: 2026-09-05

Playbook principal:

`docs/playbooks/WHATSAPP_API_STORE_V1_PLAYBOOK.md`

## Estado confirmado

- `main` avançou externamente durante esta frente para `c816d6ff2423532dc73e642391ff38d339037751` via merge do PR #208 (`feature/landing-v3-structured-page-builder`).
- branch: `feature/whatsapp-api-store-v1-isolated`
- Supabase temporário: `ggvwuqomwbxhtlxaocau`, ACTIVE_HEALTHY, `with_data=false`
- Vercel Production atual: `dpl_ABPQbJpb86ykyfaNH9V2nEHoPew6`, READY, commit `c816d6ff2423532dc73e642391ff38d339037751`
- nenhuma alteração em CRM Production, AUTOCAR, saas-dev, autocar-dev, Evolution/VPS ou modos OFF/COPILOT/AUTOPILOT por esta frente

## Hardening adicional realizado

Arquivo:

`src/lib/server/storeWhatsappCloud.ts`

Commit:

`205bd6806cfd4f58a5e6270ffe49d320a6115102`

O gate de escrita da Cloud API agora exige simultaneamente:

1. `VERCEL_ENV=preview`
2. `VERCEL_GIT_COMMIT_REF=feature/whatsapp-api-store-v1-isolated`
3. `WHATSAPP_CLOUD_PREVIEW_ENABLED=true`
4. `NEXT_PUBLIC_SUPABASE_URL` com hostname exatamente `ggvwuqomwbxhtlxaocau.supabase.co`

Production, development, outra branch, flag ausente/falsa, URL malformada ou qualquer outro projeto Supabase permanecem bloqueados.

Isso protege contra um erro de configuração na Vercel: a flag isoladamente não é suficiente para liberar escrita.

## Testes adicionados

Arquivo:

`tests/whatsapp-cloud-preview-scope.test.ts`

Commit:

`80558a20760f0aa74a55086e327c6e6113a7f7d5`

Cobertura adicionada:

- permite somente Preview + branch exata + temp Supabase + flag true;
- bloqueia Production;
- bloqueia outra branch;
- bloqueia flag ausente/falsa;
- bloqueia CRM Production `wufikrdgyxrsszlbpfmv`;
- bloqueia URL ausente/malformada.

IMPORTANTE: o arquivo de teste foi criado, mas este checkpoint NÃO afirma que o teste foi executado por CI. O HEAD da branch não possuía status checks automáticos antes da liberação do Preview.

## TypeScript / React

Arquivo:

`src/components/WhatsappCloudApiPanel.tsx`

Commit:

`1f0487ce8ec53ee64942ceb41ee7754d076cf248`

Alteração:

- import explícito de `type ReactNode`;
- `Capability.icon` usa `ReactNode` em vez de depender do namespace global `React.ReactNode`.

Objetivo: reduzir risco de typecheck no Next/React 19/TypeScript 6.

## Vercel — variáveis branch-specific configuradas

Confirmado via `vercel env ls preview feature/whatsapp-api-store-v1-isolated`:

- `NEXT_PUBLIC_SUPABASE_URL` — Config — Preview da branch isolada
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Config — Preview da branch isolada
- `SUPABASE_SERVICE_ROLE_KEY` — Secret — Preview da branch isolada
- `WHATSAPP_CLOUD_PREVIEW_ENABLED` — Config — Preview da branch isolada

Nenhum valor secreto é registrado neste documento.

## Liberação controlada do Preview

O bloqueio abaixo foi removido somente da branch isolada após a confirmação das 4 variáveis:

```json
"git": {
  "deploymentEnabled": false
}
```

Commit de remoção do bloqueio:

`4176decc0707b87aec79132b48e9efa701f57d57`

Esse primeiro commit recebeu status Vercel `failure` com descrição `Deployment failed`, mas nenhuma implantação foi criada para o SHA (confirmado por `vercel ls -m githubCommitSha=4176decc0707b87aec79132b48e9efa701f57d57`). Portanto a falha ocorreu antes do build.

Este checkpoint atualizado serve como novo commit inofensivo para testar o gatilho Git→Vercel já com `deploymentEnabled=false` removido.

## Próximo passo

1. verificar se o commit deste checkpoint gera Preview da branch;
2. se gerar, confirmar branch/SHA/ambiente e build/typecheck;
3. executar smoke UI/API somente com dados sintéticos;
4. confirmar por consulta que somente `ggvwuqomwbxhtlxaocau` recebeu efeitos;
5. confirmar CRM Production e Evolution sem mudanças;
6. parar antes de PR/merge/Production.

Não autorizados nesta frente: PR, merge, `main`, CRM Production, AUTOCAR Production, `saas-dev`, `autocar-dev`, Evolution/VPS, instâncias/webhooks reais, números/QR Codes reais, dados/tokens reais, OFF/COPILOT/AUTOPILOT e Vercel Production.
