# Billing — etapa 13 — ensaio sintético de ativação

## Escopo

A etapa 13 cria uma terceira loja exclusivamente sintética no `saas-dev`,
persiste seu cadastro financeiro separado de `stores`, inicia um único trial de
7 dias por uma sessão Master e cria um Checkout recorrente no Asaas Sandbox com
`customerData` pré-preenchido.

O Checkout apenas inicia a jornada de pagamento. Esta etapa não confirma
cobrança, não promove a assinatura para ativa e não habilita bloqueio.

## Gates obrigatórios do Preview

```text
BILLING_PREVIEW_READS_ENABLED=true
BILLING_PREVIEW_MUTATIONS_ENABLED=false
BILLING_PREVIEW_ENFORCEMENT_ENABLED=false
BILLING_ENFORCEMENT_ENABLED=false
BILLING_TRIAL_START_ENABLED=true
BILLING_PREVIEW_STAGE13_ACTIVATION_ENABLED=true
BILLING_ASAAS_SANDBOX_ENABLED=true
BILLING_ASAAS_STAGE13_SYNTHETIC_STORE_ID=360eaf1f-8ea3-4fc6-bdb5-a17282c0f103
ASAAS_ENV=sandbox
```

As variáveis de identificação do `saas-dev`, URL do Preview, API Key Sandbox,
token do Webhook e bypass da proteção continuam server-side e com escopo apenas
de Preview. Production deve permanecer sem as duas chaves da etapa 13.

## Ordem de execução

1. Registrar o seed de `supabase/billing-stage-13-synthetic-activation-seed.sql`
   somente no `saas-dev`.
2. Confirmar três lojas sintéticas, um perfil novo, uma auditoria cadastral nova
   e zero assinatura para o novo `store_id`.
3. Publicar a branch em Preview e habilitar somente os gates listados acima.
4. Entrar como Master, selecionar **Loja DEV Billing Ativacao** e executar a
   ativação sintética.
5. Repetir a mesma ação: a assinatura e o Checkout devem ser reutilizados, sem
   nova auditoria financeira.
6. Confirmar `trial_ends_at = trial_started_at + 7 days`, modo `observe`,
   Checkout Sandbox com cadastro pré-preenchido e Webhook autenticado.
7. Não abrir o fluxo de confirmação de pagamento.

O Asaas exige endereço no `customerData`. Para não introduzir dados reais nem
ampliar o cadastro financeiro da loja, o ensaio envia um endereço técnico
exclusivamente sintético junto dos quatro campos persistidos da etapa 12.

## Provas esperadas

- exatamente 1 assinatura aberta para a terceira loja;
- exatamente 1 auditoria `trial_started_by_master`;
- exatamente 1 auditoria `asaas_sandbox_checkout_created`;
- o mesmo `provider_checkout_id` após repetição;
- eventos do Webhook únicos por `provider_event_id`;
- contagem regressiva exibida pelo Master;
- `access_enforcement_mode='observe'` e flags globais de enforcement desligadas;
- nenhuma alteração em lojas reais, Supabase Production ou Asaas Production.
