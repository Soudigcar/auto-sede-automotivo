# Billing — correções de segurança da etapa 15B

## Resultado

A etapa 15B substitui o pacote 14 sem alterar Supabase Production, Asaas
Production, trials, cobranças ou enforcement. O novo pacote preserva as
migrations históricas do `saas-dev` e define quatro novas migrations para uma
futura aplicação rastreável.

## Correções

- preflight e postflight foram separados; ambos são somente leitura, e o
  preflight funciona quando nenhuma tabela de billing existe;
- todas as migrations usam limites locais de lock e duração;
- pagamentos e auditorias usam chaves estrangeiras compostas para garantir que
  `subscription_id`, `profile_id` e `store_id` pertençam ao mesmo agregado;
- o webhook recebe um claim atômico com lease e token exclusivo;
- a finalização exige o mesmo token do claim;
- eventos de assinatura e pagamento são serializados pelo row lock da
  assinatura;
- pagamento, assinatura e auditoria financeira mudam dentro da mesma transação;
- o rollback descobre tabelas existentes antes de consultar dados e funciona
  depois de qualquer prefixo do pacote;
- a reversão é uma nova migration forward, sem adulterar o histórico anterior.

## Evidência executável

O gerador `scripts/build-billing-stage15b-rehearsal.mjs` reescreve somente os
objetos de billing para um schema isolado, preservando `public.stores` e
`public.users` como dependências read-only. O ensaio usa dados somente como
fixtures de referência, cria todos os registros financeiros dentro do schema
transacional e termina em `ROLLBACK`.

O ensaio da etapa 15B deve comprovar:

1. rollback depois apenas da fundação;
2. criação das sete tabelas com RLS e sem grants client-side;
3. seis funções `SECURITY INVOKER` com `search_path` vazio;
4. rejeição de `store_id` divergente pela FK composta;
5. um único claim e rejeição de finalização com token incorreto;
6. confirmação que ativa pagamento/assinatura atomicamente;
7. webhook atrasado que não regride o estado confirmado;
8. rollback completo e ausência posterior do schema.

O Preview valida build e integração do código, mas não habilita mutações
financeiras por si só. Enquanto as RPCs 15B não forem provisionadas no ambiente,
o endpoint de webhook responde 503 de forma fail-closed e não retorna ao fluxo
de persistência não atômico anterior.

## Aplicação futura

Uma futura autorização deverá nomear explicitamente Production e a janela. O
executor validará o backup, os hashes, o preflight e aplicará cada arquivo via
`apply_migration`. SQL Editor, `execute_sql` e `supabase db push` ficam
proibidos para Production porque não garantem a allowlist e o recibo esperado.

Referências:

- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/database/testing
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
