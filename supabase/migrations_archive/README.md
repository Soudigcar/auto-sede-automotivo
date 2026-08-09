# Arquivo de migrations anteriores ao baseline

Estes arquivos ficam fora de `supabase/migrations/` para não participarem do
fluxo ativo do Supabase CLI.

- `remote_history_2026-08-09/` preserva as 46 migrations registradas no banco
  de produção na data da rechecagem. Um único literal de `verify_token` foi
  removido antes da publicação; a estrutura da coluna foi mantida.
- `repository_main_2026-08-09/` preserva exatamente os quatro arquivos que
  estavam ativos na `main` antes desta correção. Três deles tinham timestamps
  diferentes dos registros remotos.

Não editar nem executar estes arquivos como uma sequência paralela. Eles são
mantidos somente para auditoria, rastreabilidade e comparação histórica.
