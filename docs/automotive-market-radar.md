# Radar Automotivo — Distrito Federal e Goiás

## Objetivo

Registrar diariamente evidências de anúncios públicos de veículos localizados exclusivamente no Distrito Federal e no estado de Goiás, comparar as amostras com FIPE e com a base do Auto Controle Automotivo e apresentar sugestões para aprovação do Master.

## Princípios de segurança

- Nenhuma alteração automática em catálogo, aliases, regras, FIPE ou preços internos.
- Somente o Master pode consultar e revisar os dados pelo aplicativo.
- A rotina de ingestão exige segredo de servidor.
- Anúncios fora de DF/GO são recusados pela API.
- Evidências, URL da fonte, data da coleta e confiança ficam preservadas.
- Registros descartados permanecem auditáveis com o motivo do descarte.

## Estrutura

- `automotive_market_runs`: execução diária e métricas gerais.
- `automotive_market_listings`: anúncios válidos e descartados.
- `automotive_market_segments`: estatísticas por região e combinação veicular.
- `automotive_market_suggestions`: fila de aprovação do Master.

## Combinação de agrupamento

Cada segmento é identificado por:

- região: DF, GO ou consolidado DF+GO;
- marca;
- modelo;
- versão;
- ano de fabricação e ano-modelo;
- combustível;
- câmbio.

## Filtros obrigatórios

A etapa de coleta deve marcar ou excluir:

- duplicidades por URL, identificador externo e hash de conteúdo;
- preços promocionais, parcelas ou entrada de financiamento;
- preço zero, ausente ou incompatível com o veículo;
- leilão, sinistro ou dano estrutural quando explícito;
- anúncio fora do Distrito Federal ou de Goiás;
- divergência de versão que impeça comparação confiável.

## API de ingestão

Endpoint:

`POST /api/cron/automotive-market-radar`

Autorização:

`Authorization: Bearer <AUTOMOTIVE_MARKET_RADAR_SECRET>`

Também aceita `CRON_SECRET` como fallback. O endpoint recebe dados já coletados e normalizados, valida o escopo regional e grava a execução, as evidências, os agregados e as sugestões.

## Variáveis necessárias

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTOMOTIVE_MARKET_RADAR_SECRET` ou `CRON_SECRET`

## Situação desta entrega

Esta branch prepara banco, ingestão segura e painel de leitura. A coleta direta em cada fonte pública deve ser implementada em adaptadores separados, respeitando disponibilidade técnica, termos da fonte, limites de acesso e evidências obtidas. A migration não foi aplicada no Supabase e nenhum deploy de produção foi solicitado.