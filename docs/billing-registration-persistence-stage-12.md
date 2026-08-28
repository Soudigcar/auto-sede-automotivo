# Billing — etapa 12 — persistência cadastral sintética

## Objetivo

Persistir CNPJ, razão social, e-mail financeiro e telefone financeiro fora de
`stores`, usando exclusivamente a `Loja DEV Billing Falhas` no `saas-dev`.

## Estrutura

- `store_billing_registration_profiles`: cadastro financeiro por loja, status
  `incomplete` ou `ready_for_activation`, validação, versão e timestamps.
- `store_billing_registration_audit`: ator Master, transição de estado, campos
  alterados e idempotência. O log não duplica CNPJ, razão social, e-mail ou
  telefone.
- `save_store_billing_registration_profile(...)`: RPC `SECURITY INVOKER`,
  executável somente por `service_role`, idempotente e travada no seed
  `billing_stage5_seed` da `Loja DEV Billing Falhas`.

As duas tabelas têm RLS ativo, nenhum acesso para `anon` ou `authenticated` e
nenhuma permissão de exclusão para `service_role`.

## Aplicação no ambiente autorizado

A migration foi aplicada exclusivamente no `saas-dev`. A validação persistiu
um perfil sintético em estado
`ready_for_activation` para a `Loja DEV Billing Falhas` e uma única auditoria
`registration_created`. A repetição com a mesma chave foi reconhecida como
idempotente e não criou outra auditoria.

As contagens preexistentes de trials, assinaturas, pagamentos e auditoria
financeira permaneceram inalteradas. Nenhum valor cadastral sintético é
duplicado no log de auditoria.

## Travas da aplicação

A persistência exige simultaneamente:

1. `VERCEL_ENV=preview`;
2. ambiente lógico `saas-dev`;
3. projeto real e allowlist iguais a `hfzmzfhuhukmxkxbkxay`;
4. leitura de Preview habilitada;
5. `BILLING_PREVIEW_REGISTRATION_WRITES_ENABLED=true`;
6. Master autenticado e ativo;
7. ID, nome e `registration_source` exatos do seed sintético;
8. loja ativa com pelo menos um usuário SaaS ativo;
9. todos os campos cadastrais válidos;
10. chave UUID de idempotência.

## O que permanece bloqueado

- `BILLING_PREVIEW_MUTATIONS_ENABLED=false`;
- `BILLING_TRIAL_START_ENABLED=false`;
- `BILLING_ENFORCEMENT_ENABLED=false`;
- nenhum trial ou assinatura é criado;
- nenhum cliente, Checkout ou cobrança é criado no Asaas;
- nenhuma chamada ao Asaas é executada pela rota cadastral;
- `stores`, usuários, leads e dados reais não são atualizados;
- Supabase Production, Asaas Production e Vercel Production permanecem fora do
  escopo.

## Rollback operacional

Antes de qualquer rollback, desligar
`BILLING_PREVIEW_REGISTRATION_WRITES_ENABLED`. Como a migration é aditiva e não
altera `stores`, a interface pode voltar a somente leitura sem remover tabelas
nem apagar o cadastro sintético. Exclusão de dados não faz parte desta etapa.
