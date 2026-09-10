# Métricas canônicas — Fase 2A-1

Baseline revalidado: `1011579a13d7307f8f9f09a4f4b6a73bfbfb07af`.
Production observado: `dpl_FWXF6DYwuf8cQvFxyhfnrB3Sb4in`, mesmo SHA.
Branch: `fix/commercial-metrics-canonicalization-v1`.

## Limites da entrega

Implementação e validação locais. Nenhuma migration aplicada em Supabase,
nenhum dado real alterado, nenhuma chamada a provedores de mensagens ou IA.
Sem PR, merge, Preview ou deploy. O arquivo `vercel.json` bloqueia o disparo
Git somente desta branch. Remover esse bloqueio depende da autorização seguinte.

Os três SQLs em `supabase/proposed/commercial-metrics-v1/` são propostas
versionadas de instalação, separadas deliberadamente do diretório aplicado de
migrations. A CLI de migrations não ficou disponível nesta execução.
Eles foram executados exclusivamente em PostgreSQL embutido em memória,
com schema e dados sintéticos. Isso não cria histórico em nenhum Supabase.

## Contrato comercial

Dashboard e Pipeline chamam `readCanonicalCommercialMetrics`.
`read_store_commercial_metrics_v1` agrega os dados dentro do PostgreSQL e retorna
um único objeto JSON. Não usa uma lista REST truncada de mensagens nem envia
histórico de WhatsApp ao navegador. Falha explícita se a função não estiver
instalada: não retorna silenciosamente as métricas antigas ou valores zero.

Período: histórico disponível até `as_of`. Sem mudança de período visual nesta
fase. `sold`: leads distintos com venda `confirmed`, no escopo autorizado.
`showed_up`: marco histórico via estado atual ou activity log. `stage_totals`:
estado operacional atual. Conversão da loja: leads vendidos distintos / leads
no escopo. Não equivale a conversão de uma coorte de aquisição histórica.

## Human First Response

Unidade: lead. Todas as conversas válidas do lead participam do mesmo relógio.
Primeira inbound válida até a primeira resposta humana certificável posterior.
A classificação exige os marcadores CRM de autoria humana e usuário; ausência
de marcador AUTOCAR não prova autoria humana. Sistema e AUTOCAR não encerram
esse relógio. `failed`/`pending` não contam; status desconhecido sem prova de
envio não conta como humano válido.

Timestamp: `sent_at`; somente se ausente, `created_at`, com origem identificada
como `created_at_fallback`. Um `sent_at` inválido não é silenciosamente reparado.
No banco, as colunas são timestamps tipados; fixtures TypeScript também testam
entradas inválidas. Receipts `delivered`/`read` não substituem o instante original
do envio. Deduplicação por conversa e identificador de provider, ou ID da mensagem.

Categorias exclusivas: measured, unanswered, indeterminate. Um outbound de
natureza indeterminada antes do primeiro humano comprovado torna incerta a
primeira resposta e exclui esse lead da mediana. O horário humano comprovado
continua disponível como evidência. Outbound anterior ao primeiro inbound não
encerra nem inicia o relógio.

`eligible_leads = measured_leads + unanswered_leads + indeterminate_leads`.
Cobertura de medição: measured / eligible. Cobertura de classificação:
(eligible - indeterminate) / eligible. Média, p50/mediana e p90 usam apenas
measured. `history_complete` significa que a consulta agregou o histórico
persistido disponível no snapshot, não que o provider entregou todo o histórico
possível. Não garante ausência de mensagens nunca persistidas.

## Pipeline

Páginas por etapa, 50 cards por requisição, cursor `(created_at, id)` descendente.
A paginação legada continua disponível para consumidores existentes.
Os KPIs vêm do agregado canônico, e nunca do número de cards carregados.

Carregar mais amplia somente o orçamento da etapa solicitada. Revalidação
reconstrói as páginas já carregadas até alcançar também o limite antigo; assim,
novos cards no topo não descartam silenciosamente o último card antigo.
Reconciliação por ID, com preferência por `updated_at` mais recente. Cursor que
não avança falha explicitamente. Eventos durante uma requisição enfileiram nova
revalidação. Trocas de responsável invalidam respostas do escopo anterior.

Colunas customizadas continuam sendo organização local da UI; não se tornam
etapas comerciais persistidas. A contagem delas não redefine os KPIs canônicos.

## Participação comercial

Responsabilidade atual permanece separada de seller, pre-sales e captador.
Participações são contadas separadamente por função, inclusive quando o dono
atual é outra pessoa. Uma pessoa pode acumular funções sem duplicar a venda da
loja. A conversão histórica individual fica null: não existe denominador histórico
comprovado para inferi-la usando a distribuição atual de leads.

## AUTOCAR

`read_store_autocar_evidence_v1` lê claims concluídas com external execution
verdadeira e estado runtime ativo. Retorna somente referências mínimas,
sem mensagens, prompts ou payloads externos. O backend usa o seletor de ambiente
existente, diretamente, sem importar executores nem funções ensure/upsert.

`read_store_autocar_metrics_v1` reconcilia essas referências no CRM, validando
store, conversa, lead e mensagem com status sent/delivered/read. Conta mensagens
únicas, leads/conversas atendidos, primeira resposta por lead, estado atual válido,
agendamentos e vendas posteriores com participação. Uma execução com várias
fotos conta várias mensagens, não várias conversas. Claims falhadas/parciais
ficam fora do conjunto conservador desta versão.

Não há join cross-database. `crm_as_of`, `autocar_as_of` e `atomic_snapshot=false`
explicam que não é uma transação distribuída. Indisponibilidade de ambiente ou
função é mostrada como indisponibilidade, nunca zero atividade.

## Segurança

Mantido admin client. Bearer, perfil ativo, papel e vínculo com loja são
resolvidos pelo backend existente. O novo serviço valida novamente o escopo e
resolve subject em users dentro da loja. Membros não podem ampliar seu escopo.
SQL revalida ator/subject/loja e restringe todas as relações por loja.
`SECURITY INVOKER` com service role não fornece barreira RLS: a segurança depende
dessas verificações e de EXECUTE revogado de PUBLIC/anon/authenticated e
concedido somente a service_role. Browser não fornece actor_profile_id ou
store_id com autoridade própria. RPCs retornam apenas métricas, nomes de equipe
já exibidos e evidência mínima de cards autorizados.

## Validação e limites

Testes executam os SQLs reais em PGlite, com dois bancos independentes e fixtures
inteiramente sintéticos. Testam autoria, estatísticas, participação, isolamento,
EXECUTE, paginação, movimentos e métricas AUTOCAR. O schema mínimo de teste não
substitui conferir a compatibilidade física e planos no banco de homologação.

O bloqueio de rede da validação cobre fetch e sockets Node externos. Isolamento
por namespace do sistema operacional não estava disponível. Build recebe
ambiente limpo e credenciais sintéticas; os GETs do banco sintético são simulados.

Riscos a conferir antes de produção: custo das agregações a cada revalidação por
etapa; crescimento das referências de claims AUTOCAR; concorrência entre snapshots
independentes; cobertura histórica dos marcadores de autoria; planos e índices do
banco real. Não foi proposto índice novo sem EXPLAIN no ambiente de homologação.

## Próxima fase e rollback

Antes de Preview: autorização explícita, bancos isolados apropriados, conferência
de schema e instalação autorizada das propostas SQL. Nunca apontar testes a
Production. A ausência das funções bloqueia métricas; essa branch não é publicável
isoladamente sobre banco sem preparação.

Rollback de código: reverter os commits desta branch, preservando dados. As novas
funções são somente leitura e podem permanecer sem consumidores; removê-las
exigiria autorização de banco separada. Não há reprocessamento nem correção de
registros históricos a desfazer.

## Resultado final local

- 719 testes aprovados, zero falhas (628 existentes e 91 adicionais).
- SQL real executado somente em dois PostgreSQLs PGlite em memória.
- ESLint aprovado, sem warnings.
- TypeScript aprovado.
- Next.js build aprovado com configuração sintética e guard de rede Node.
- npm audit: zero vulnerabilidades reportadas.
- `git diff --check`: aprovado.
- Nenhum SQL aplicado em Supabase. Nenhuma migração de dados.

Pronto para preparar um Preview controlado somente após autorização da Fase 2A-2
com preparação explícita dos bancos isolados. Isso não é autorização de Preview
contra bancos Production nem de publicação.
