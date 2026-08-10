# Validação do baseline

Data da validação oficial: 5 de agosto de 2026

Rechecagem do histórico: 9 de agosto de 2026

## Resultado oficial em ambiente descartável

As primeiras 45 migrations e as quatro camadas do baseline foram executadas em
um projeto Supabase descartável com PostgreSQL 17.6. A comparação normalizada
com a produção confirmou equivalência em:

| Categoria | Quantidade validada |
|---|---:|
| Relações de `public`/`private` | 51 |
| Colunas | 765 |
| Constraints | 289 |
| Índices | 209 |
| Policies de `public` + `storage.objects` | 156 |
| Funções próprias | 37 |
| Triggers de tabela | 25 |
| Event triggers | 1 |
| Privilégios de tabela | 1.016 |
| Privilégios de rotina | 86 |
| Buckets de Storage | 3 |
| Tabelas no Realtime | 4 |
| Extensões | 7 |

A extensão hospedada `http` executou corretamente. O planejamento das policies
RLS compilou para `anon` e `authenticated`. Nenhum arquivo de Storage foi
enviado, alterado ou excluído durante o teste.

O projeto descartável usado na validação foi excluído depois do teste e não
está mais ativo.

## 46ª migration

Em 9 de agosto, uma nova consulta somente leitura confirmou a migration
`20260805173249_apply_pick_next_lead_store_by_event` no histórico da produção.
A definição de `public.pick_next_lead_store_by_event(uuid, text)` no catálogo
de produção coincide com o SQL preservado no histórico desta branch.

Essa migration foi acrescentada ao final do baseline consolidado. Nenhuma
mudança foi aplicada ao banco durante essa conferência.

## Replay local do arquivo consolidado

Em 9 de agosto, o baseline ativo foi executado como um único arquivo em um
PostgreSQL compatível e descartável. O replay concluiu sem erro e retornou:

| Categoria | Quantidade |
|---|---:|
| Tabelas de `public`/`private` | 50 |
| Colunas | 765 |
| Constraints, sem `NOT NULL` interno | 289 |
| Índices | 209 |
| Policies de `public`/`private`/`storage` | 156 |
| Funções próprias | 38 |
| Triggers de tabela | 25 |
| Buckets de Storage | 3 |
| Tabelas no Realtime | 4 |

A 38ª função é `pick_next_lead_store_by_event`, acrescentada pela migration
mais recente. O motor local não contém a extensão hospedada `http`, então
somente a instrução de instalação dessa extensão foi neutralizada nesse replay.
A mesma instrução já havia executado com sucesso no teste oficial do Supabase.

## Alertas conhecidos, não corrigidos aqui

Os advisors já apontavam alertas preexistentes, incluindo view com
`SECURITY DEFINER`, funções privilegiadas expostas e tabelas com RLS sem policy.
Esta branch reproduz o estado atual e não reformula segurança, pois isso exige
uma revisão e autorização próprias.

## Limite desta validação

O baseline consolidado é a concatenação determinística da sequência validada e
da 46ª migration verificada no catálogo. Ele deve passar por novo replay em
ambiente descartável antes de qualquer alinhamento do histórico de produção.

Para publicação no repositório público, o `DEFAULT` concreto de `verify_token`
foi removido da migration de integração WhatsApp e do baseline consolidado. A
coluna permanece obrigatória. Essa sanitização evita versionar material de
autenticação e é a única divergência intencional em relação ao texto histórico.
