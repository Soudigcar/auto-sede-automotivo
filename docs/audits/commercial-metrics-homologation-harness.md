# Commercial metrics homologation harness — Fase 2A-1B

## Limite da entrega

Somente código na branch `fix/commercial-metrics-canonicalization-v1`.
Nenhum banco remoto, usuário Auth, seed remoto, variável Vercel ou Preview criado.
O manifesto versionado permanece `approved=false`, com ambos os refs nulos.
Isso impede habilitação até revisão explícita dos dois projetos temporários.

## Isolamento

O resolver de métricas usa o runtime operacional exclusivamente em Production.
Em Preview exige os dois flags, `VERCEL_GIT_COMMIT_REF` oficial, branch exata,
URLs HTTPS, refs distintos, confirmação por variável e manifesto aprovado.
Development falha fechado. Os quatro refs existentes são proibidos.
Nenhuma função ou executor em `src/lib/server/autocar/` foi alterado.

A proxy aplica allowlist GET/HEAD para login/logout, contexto, Dashboard,
Pipeline, duas lojas sintéticas e assets estáticos Next. O destino inicial do
Master é redirecionado à Store Alpha sem executar o Dashboard Master.
Todos os métodos de escrita e rotas operacionais ficam bloqueados no modo.
`/_next/image` também é bloqueado para impedir fetch de imagem arbitrária.
O hook de fotos retorna missing antes de enfileirar qualquer requisição.
A CSP permite conexões do navegador somente à própria origem e ao CRM
sintético (HTTPS/WSS). Não é um firewall de egress do sistema operacional.
Os transportes Supabase usados nas rotas permitidas restringem hosts e paths;
redirects são rejeitados. Não existem credenciais operacionais nos fixtures.

## Instalação futura — ainda bloqueada

Não utilizar `supabase db push`, projeto linked/default ou migrations completas.
`schema.sql`, RPCs propostas e `seed.sql` são arquivos separados.
O renderer local exige `--kind` e `--project-ref`, confere o manifesto e apenas
imprime um bundle transacional. Não faz conexão nem executa SQL.
O bootstrap exige marca synthetic-only, ref permitido e a identificação
`app.settings.api_external_url` correspondente ao destino. Essa identificação
precisa ser verificada no futuro projeto. Se estiver ausente, PARAR; não
inventar ou sobrescrever a identidade do banco para contornar o bloqueio.
Os testes locais configuram essa identidade exclusivamente na instância PGlite.
Essas verificações SQL são defesa adicional; a origem da conexão também deve
ser conferida pelo operador antes da instalação. Não são autorização independente.

CRM: nove tabelas mínimas, sem extensão adicional, cron, trigger de integração,
Edge Function ou Storage. `store_whatsapp_integrations` existe vazia, sem
coluna de credencial. Somente `leads` entra em Realtime.
AUTOCAR: três tabelas de evidência, sem runtime operacional.
As três RPCs permanecem em `supabase/proposed/commercial-metrics-v1/`, intactas.
Sua instalação revoga EXECUTE de PUBLIC/anon/authenticated e concede a service_role.

Auth: o JSON `auth/users.json` descreve nove contas fictícias em `.invalid`.
Não inclui senhas. Provisionar futuramente via Auth administrativo, com
email_confirm=true, sem convite/email, após autorização específica.
`auth/bind-profiles.sql` exige as nove contas pré-existentes e somente vincula
os perfis sintéticos por email. Nunca inserir diretamente em auth.users no
Supabase hospedado. O teste local usa uma tabela Auth descartável simulada.

## Permissões

Authenticated lê somente seu perfil; lojas/leads obedecem papel e loja.
Master tem escopo global autorizado. Gestor não lê Beta se pertence à Alpha.
Membros leem ownership e participação histórica na função correspondente.
Authenticated/anon não atualizam tabelas. Service role possui DML nas tabelas
sintéticas para instalação e controle de fixture; isso não é protegido por RLS.
O transporte do aplicativo não permite DML, apenas leituras e RPCs enumeradas.
Realtime será provocado somente por controlador sintético autorizado fora do
navegador; não existe endpoint novo para essa mutação.

## Fixtures

552 leads Alpha, 20 Beta, duas vendas Alpha (lead 400 fora da primeira página).
Nove perfis, ownership e participação separados, várias etapas, duas conversas
para um lead, autores humano/AUTOCAR/indeterminado e estados pending/failed.
Timestamps UTC explícitos. Seed repetido usa IDs determinísticos e não duplica
registros; não é mecanismo de reset de alterações posteriores.
`external_execution=true` é JSON fictício inerte. Não executa qualquer ação.
Seeds AUTOCAR incluem geração sem envio e claim failed. Casos positivos,
duplicidade, múltiplas fotos e ordem temporal também constam da suíte canônica
anterior, executada integralmente com transporte externo bloqueado.

## Variáveis Vercel — inventário não certificado

O conector disponível não expõe inventário de Environment Variables.
A tabela abaixo registra requisitos do código, não prova configuração remota.
Em todas as linhas: Production/Preview/Development/override existente = NÃO CERTIFICADO.

| Nome | Necessário | Tratamento futuro | Risco se herdado |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Sim | CRM temporário somente branch | Banco errado |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Sim | Credencial pública temporária | Auth/banco errado |
| SUPABASE_SERVICE_ROLE_KEY | Sim | Segredo CRM temporário server-side | Acesso administrativo indevido |
| CRM_METRICS_EXPECTED_PROJECT_REF | Sim | Ref revisado | Falha de isolamento |
| AUTOCAR_METRICS_SUPABASE_URL | Sim | AUTOCAR temporário | Fonte incorreta |
| AUTOCAR_METRICS_SUPABASE_SERVICE_ROLE_KEY | Sim | Segredo temporário server-side | Acesso indevido |
| AUTOCAR_METRICS_EXPECTED_PROJECT_REF | Sim | Ref revisado | Falha de isolamento |
| COMMERCIAL_METRICS_HOMOLOGATION_ENABLED | Sim | true somente branch | Ativação indevida |
| NEXT_PUBLIC_COMMERCIAL_METRICS_HOMOLOGATION_ENABLED | Sim | true somente branch | Foto/rede não bloqueada na UI |
| VERCEL_ENV | Sim | Metadado oficial preview | Ambiente incorreto |
| VERCEL_GIT_COMMIT_REF | Sim | Metadado oficial branch exata | Guard rejeita |
| NEXT_PUBLIC_VERCEL_ENV | Sim | Metadado público oficial preview | Proteção cliente não ativa |
| AUTOCAR_SUPABASE_URL / AUTOCAR_SUPABASE_SERVICE_ROLE_KEY | Não | Não usar no harness | Credenciais operacionais |
| AUTOCAR_DEV_SUPABASE_URL / AUTOCAR_DEV_SUPABASE_SERVICE_ROLE_KEY | Não | Não usar | DEV legado |
| AUTOCAR_KNOWLEDGE_SUPABASE_URL / AUTOCAR_KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY | Não | Não usar | Fallback legado |
| OPENAI_API_KEY | Não | Nenhuma credencial operacional acessível | Chamada real |

Evolution, Meta, webhooks e outras variáveis herdadas precisam de inventário
completo por nome antes do Preview. Não declarar ausência de segredos sem
verificação. Nenhuma variável foi lida em valor ou alterada nesta rodada.

## Pendências antes do Preview

- Criar projetos somente após autorização e custo confirmado.
- Revisar refs no manifesto em commit separado autorizado.
- Certificar configuração de identidade SQL; não desativar guards se ausente.
- Certificar inventário/overrides Vercel e exposição dos metadados oficiais.
- Instalar estrutura, criar Auth sintético e testar autenticação real isolada.
- Conferir visualmente app shell, CSP, assets, fluxo login e Realtime.
- Medir desempenho com schema mínimo; não extrapolar para Production.

## Cleanup futuro

Excluir exclusivamente deployments da homologação, remover overrides da branch,
excluir ambos os projetos pelos refs registrados, remover credenciais/sessões
locais e revalidar Production. Preservar testes e relatório sanitizado em Git.
Não afirmar exclusão instantânea de backups/logs retidos pelo provedor.

## Validação local desta rodada

735 testes aprovados (719 anteriores + 16 novos), sem falhas.
SQL executado somente em duas instâncias PGlite descartáveis; instalação
repetida, permissões, isolamento de membros e publicação somente de leads.
ESLint, TypeScript e Next build aprovados. Build com ambiente sintético e
bloqueio de rede Node; nenhuma namespace/firewall de SO foi provisionada.
O teste do hook executa a função real transpilada e exige zero fetches.
O teste de proxy exige rejeição da foto antes de encaminhar à rota.
Não houve verificação visual de Preview, login Supabase hospedado ou evento
Realtime remoto. A prontidão desta entrega é local, não validação integrada.
