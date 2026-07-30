# Lançamento oficial — Auto Sede

## Arquitetura obrigatória

- `https://www.autosede.com.br` — portal oficial, catálogo, lojas, campanhas e páginas institucionais.
- `https://autosede.com.br` — redirecionamento permanente para `https://www.autosede.com.br`, preservando caminho e parâmetros.
- `https://sistemaautomotivo.autosede.com.br` — sistema interno e login das lojas.

Os três hosts utilizam o mesmo projeto Next.js, com separação aplicada por `src/proxy.ts`.

## 1. Vercel

No projeto `auto-sede-automotivo`, acessar **Settings > Domains** e confirmar:

1. `www.autosede.com.br` adicionado e definido como domínio principal do portal.
2. `autosede.com.br` adicionado ao mesmo projeto.
3. `sistemaautomotivo.autosede.com.br` adicionado ao mesmo projeto e sem redirecionamento externo.
4. Certificados SSL emitidos e status dos três domínios como válido.
5. Produção vinculada à branch `main`.

Não usar valores genéricos de DNS sem conferir. O painel da Vercel deve fornecer o destino exato de cada registro.

## 2. DNS na Hostinger

Antes de qualquer alteração, exportar ou registrar a zona DNS atual.

### Registros que não podem ser removidos ou substituídos

- MX de e-mail;
- TXT de SPF, DKIM, DMARC e verificações;
- registros de serviços externos;
- o registro atual de `sistemaautomotivo`, até que a Vercel confirme o novo destino;
- CAA, salvo quando houver motivo documentado e validação do impacto.

### Registros do site

Configurar somente os registros indicados pela Vercel:

- `www`: normalmente CNAME para o destino específico exibido em **Settings > Domains**;
- raiz `@`: normalmente A para o endereço exibido pela Vercel;
- `sistemaautomotivo`: CNAME para o destino exibido pela Vercel, caso ainda não esteja correto.

TTL recomendado durante a ativação: o menor valor permitido pela Hostinger. Após estabilização, retornar ao padrão operacional.

## 3. Supabase Auth

Não alterar automaticamente. Conferir no projeto Supabase:

- URL principal do sistema interno;
- URLs de redirecionamento usadas por login, recuperação de senha e troca de senha;
- ausência de redirecionamento autenticado para o domínio público.

Qualquer mudança deve preservar sessões e fluxos existentes das lojas.

## 4. Verificação funcional

### Portal público

- `/` carrega o portal;
- `/veiculos` lista somente veículos com loja válida;
- página individual de veículo abre e direciona o lead à loja proprietária;
- `/lojas` e páginas individuais carregam;
- `/campanha/[slug]` mantém as regras de distribuição do evento;
- `/sobre`, `/contato`, `/privacidade` e `/termos` carregam;
- `/sitemap.xml` e `/robots.txt` respondem corretamente;
- rota inexistente retorna a página 404 personalizada.

### Sistema interno

- raiz de `sistemaautomotivo.autosede.com.br` redireciona para `/login`;
- painéis internos não aparecem em `www.autosede.com.br`;
- páginas públicas acessadas no subdomínio interno redirecionam para `www`;
- respostas internas incluem `X-Robots-Tag: noindex, nofollow, noarchive`;
- login, recuperação de senha e sessões existentes continuam funcionando.

### Monitoramento

- `/api/health` retorna HTTP 200 e `status: ok`;
- deploy da `main` está aprovado na Vercel;
- não há erros novos no log de funções;
- leads de teste chegam ao destino correto;
- nenhum dado de teste permanece após a homologação.

## 5. Indexação

Depois que o DNS e o SSL estiverem estáveis:

1. cadastrar `https://www.autosede.com.br` no Google Search Console;
2. enviar `https://www.autosede.com.br/sitemap.xml`;
3. solicitar indexação da home, `/veiculos` e `/lojas`;
4. manter o subdomínio interno fora da indexação.
