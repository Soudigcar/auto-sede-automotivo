# CHECKPOINT — WhatsApp API por Loja V1 — hardening pré-Preview

Data: 2026-09-05

Playbook principal:

`docs/playbooks/WHATSAPP_API_STORE_V1_PLAYBOOK.md`

## Estado confirmado

- `main`: `e06039a27fcd9128f1475b8c5214bf32bcb35461`
- branch: `feature/whatsapp-api-store-v1-isolated`
- Supabase temporário: `ggvwuqomwbxhtlxaocau`
- Vercel Production: `dpl_2BSR7SyC7sjXXyXdG256Hz2z8EwS`, READY
- Vercel Preview desta branch: NÃO EXISTE
- `vercel.json` da branch continua com `git.deploymentEnabled=false`
- nenhuma alteração em CRM Production, AUTOCAR, saas-dev, autocar-dev, Evolution/VPS ou Vercel Production

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

IMPORTANTE: o arquivo de teste foi criado, mas este checkpoint NÃO afirma que o teste foi executado por CI. O HEAD da branch não possui status checks automáticos disponíveis neste momento.

## TypeScript / React

Arquivo:

`src/components/WhatsappCloudApiPanel.tsx`

Commit:

`1f0487ce8ec53ee64942ceb41ee7754d076cf248`

Alteração:

- import explícito de `type ReactNode`;
- `Capability.icon` usa `ReactNode` em vez de depender do namespace global `React.ReactNode`.

Objetivo: reduzir risco de typecheck no Next/React 19/TypeScript 6.

## Vercel — bloqueio mantido

Arquivo:

`vercel.json`

Estado confirmado:

```json
"git": {
  "deploymentEnabled": false
}
```

Não remover até existir configuração branch-specific segura das variáveis de Preview.

A conexão Vercel disponível neste checkpoint ainda NÃO expõe escrita de Environment Variables por branch.

A documentação Vercel confirma suporte a branch-specific Preview vars e aos system vars `VERCEL_ENV` e `VERCEL_GIT_COMMIT_REF`, mas a ferramenta conectada aqui não permite gravar os overrides.

## Próximo passo

Configurar na Vercel, somente para Preview da branch `feature/whatsapp-api-store-v1-isolated`:

- `NEXT_PUBLIC_SUPABASE_URL` -> Supabase temporário `ggvwuqomwbxhtlxaocau`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` -> anon key do temporário
- `SUPABASE_SERVICE_ROLE_KEY` -> service_role do temporário
- `WHATSAPP_CLOUD_PREVIEW_ENABLED=true`

Nunca inserir secrets no chat.

Depois de confirmar os overrides:

1. revalidar `main`, HEAD e Supabase temporário;
2. remover `deploymentEnabled=false` somente na branch;
3. gerar Preview;
4. verificar build/typecheck;
5. executar smoke UI/API com dados sintéticos;
6. confirmar por consulta que somente `ggvwuqomwbxhtlxaocau` recebeu os efeitos;
7. confirmar CRM Production e Evolution sem mudanças;
8. parar antes de PR/merge/Production.
