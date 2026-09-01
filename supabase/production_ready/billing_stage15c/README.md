# Billing Stage 15C — homologação isolada

Este pacote existe somente para homologar o billing em uma branch Supabase
temporária, vazia e criada a partir do `AutoSedeAutomotivo/main`. Ele não é um
pacote de instalação em Production e não pode ser mesclado por branching.

## Alvos proibidos

- `AutoSedeAutomotivo/main` (`wufikrdgyxrsszlbpfmv`)
- `saas-dev` (`hfzmzfhuhukmxkxbkxay`)
- `AUTOCAR Production` (`icmwdggbvijexjgrvsbl`)
- `autocar-dev` (`azszzdotbrczlhrmhrlw`)

O ref temporário deve ser declarado de forma idêntica em
`NEXT_PUBLIC_SUPABASE_URL`, `BILLING_PREVIEW_ALLOWED_SUPABASE_PROJECT_REF` e
`BILLING_STAGE15C_SUPABASE_PROJECT_REF`. A branch Git deve ser exatamente
`feature/billing-foundation-asaas` e o nome lógico deve ser
`billing-stage15c-temp`.

## Ordem executável

1. confirmar os três projetos Supabase, suas branches e zero locks;
2. criar a branch sem dados e confirmar a Edge Function neutralizada;
3. executar o preflight 15B somente por leitura;
4. aplicar `fixtures_before_migrations.sql`;
5. executar o ensaio transacional 15B e confirmar `ROLLBACK`;
6. aplicar, pelo histórico de migrations, as quatro migrations seladas na 15B;
7. executar o postflight e os advisors;
8. aplicar `seed_after_migrations.sql`;
9. executar `verify_read_only.sql` e exigir 7/7 RLS, 0 grants de cliente,
   4 migrations e 0 assinatura/pagamento/webhook antes do E2E;
10. criar exclusivamente um Vercel Preview ligado à branch temporária;
11. testar autenticação do webhook, duplicidade, concorrência, eventos fora de
    ordem e transições financeiras em `observe` usando Asaas Sandbox;
12. executar o rollback forward em transação de prova, sem persistir a remoção;
13. remover os overrides temporários do Preview, excluir a branch Supabase e
    confirmar novamente os três projetos e suas branches.

## Flags obrigatórias

As leituras de Preview ficam ligadas; mutações gerais, persistência cadastral e
todo enforcement ficam explicitamente desligados. O trial sintético dedicado da
etapa 13 pode ser ligado apenas durante o E2E. `ASAAS_ENV` permanece `sandbox` e
nenhuma chave de Production pode ser configurada.

Não criar PR, merge, alterar `main`, Vercel Production, Supabase Production,
dados reais, trials reais ou cobranças reais. A branch temporária deve ser
excluída ao final, inclusive se algum teste falhar.
