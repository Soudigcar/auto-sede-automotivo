# Billing — etapa 11 — preparação cadastral

Esta etapa adiciona ao Master um checklist de prontidão para a futura ativação
do billing. Ela funciona somente no Vercel Preview ligado ao projeto `saas-dev`
e somente para os dois seeds sintéticos já autorizados.

## Campos avaliados

- razão social;
- CNPJ com validação dos dígitos verificadores;
- e-mail financeiro;
- telefone financeiro brasileiro;
- loja ativa com pelo menos um usuário ativo no SaaS.

O resultado é `incomplete` ou `ready_for_activation`. O simulador apenas
normaliza e valida o formulário enviado pelo Master. O payload não é inserido
nem atualizado em nenhuma tabela.

## Limites deliberados

- nenhuma migration nova;
- nenhum dado cadastral é persistido;
- `responsible_email` e `responsible_phone` servem somente como sugestão inicial
  no formulário e não são reinterpretados como campos financeiros;
- nenhuma assinatura, trial, cliente Asaas ou cobrança é criado;
- o modo de acesso continua `observe` e o enforcement permanece desligado;
- Production e qualquer loja fora dos seeds sintéticos são recusados no servidor.

Uma futura etapa autorizada deverá criar campos financeiros próprios antes de
persistir dados reais. Até lá, o checklist existe exclusivamente para validar a
experiência e as regras cadastrais.
