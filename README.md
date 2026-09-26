# CRM Solar — MVP

Contatos, funil comercial, conversas do WhatsApp (UAZAPI) e agenda.
Feito para uso no celular em campo, e confortável no computador.

## O que tem no MVP

| Tela | Para que serve |
|---|---|
| **Hoje** | Agenda do dia, mensagens sem resposta, retornos marcados e propostas paradas há 3+ dias |
| **Funil** | Kanban das 6 etapas. Arraste no computador ou toque em "Avançar" no celular |
| **Conversas** | Inbox do WhatsApp com busca e filtro de não lidas, em tempo real |
| **Ficha do cliente** | Conversa + venda (etapa, retorno, financiamento) + compromissos + dados + conta de luz + indicações |
| **Agenda** | Próximos 14 dias e o que ficou para trás |

Automatismos:
- Mensagem nova de número desconhecido cria o contato e a oportunidade em "Novo contato".
- Ao informar o consumo pela primeira vez, a faixa é preenchida e a etapa passa para "Conta de luz recebida".
- Toda mudança de etapa fica registrada em `historico_etapas` (base para as métricas da fase 3).

## Estrutura

```
supabase/
  migrations/0001_mvp.sql          tabelas, RLS, triggers, realtime, storage
  functions/_shared/uazapi.ts      tudo que é específico da UAZAPI
  functions/uazapi-webhook/        recebe mensagens
  functions/whatsapp-send/         envia mensagens (com travas de proteção)
web/                               React + Tailwind (Vite)
```

## Passo a passo

### 1. Supabase
1. Crie o projeto e rode `supabase/migrations/0001_mvp.sql` no **SQL Editor** (ou `supabase db push`).
2. Em **Authentication → Providers → Email**, crie seu usuário e **desative novos cadastros** (Allow new users to sign up = off).
3. Libere seu acesso:
   ```sql
   insert into equipe (user_id, nome)
   select id, 'Artur' from auth.users where email = 'SEU-EMAIL';
   ```

### 2. Edge Functions
```bash
supabase secrets set UAZAPI_URL=https://SUA-SUBDOMINIO.uazapi.com \
                     UAZAPI_TOKEN=TOKEN_DA_INSTANCIA \
                     WEBHOOK_SECRET=$(openssl rand -hex 24) \
                     APP_ORIGIN=https://endereco-do-seu-crm.com

supabase functions deploy uazapi-webhook --no-verify-jwt
supabase functions deploy whatsapp-send
```

### 3. UAZAPI
No painel da instância, configure o webhook:
- **URL:** `https://SEU-PROJETO.supabase.co/functions/v1/uazapi-webhook?secret=SEU_WEBHOOK_SECRET`
- **Eventos:** mensagens
- Se houver a opção de excluir mensagens enviadas pela API, pode ativar (evita eco). Se não houver, o sistema já descarta duplicadas pelo `message_id`.

**Antes de usar de verdade:** mande uma mensagem de teste de outro celular e confira em `select raw from mensagens order by momento desc limit 1;` se nome, telefone e texto vieram certos. Se algum campo vier vazio, o ajuste é só em `_shared/uazapi.ts` (o parser já aceita as variações de nome de campo mais comuns).

### 4. Front
```bash
cd web
cp .env.example .env      # preencha URL e anon key
npm install
npm run dev
```
Para publicar: Vercel ou Netlify (os arquivos de rota do SPA já estão incluídos). No celular, use "Adicionar à tela inicial".

## Proteção do seu número de WhatsApp

A UAZAPI não é oficial, então o `whatsapp-send` tem três travas:
1. **Só envia para quem já te mandou mensagem** ou para quem você marcou "autorizou receber mensagens". Nada de mensagem fria pela API.
2. **Intervalo mínimo de 4 segundos** entre envios.
3. **Sem envio em massa** no MVP, de propósito.

Prospecção fria continua sendo feita pelo seu celular, do jeito humano.

## Personalização

- **Cores:** `web/src/index.css`, bloco `@theme`. Troque pelas cores da sua marca.
- **Etapas, faixas de consumo e alertas:** `web/src/lib/constantes.js`.
- **Respostas rápidas:** tabela `respostas_rapidas`. As que vêm prontas não falam de preço nem prazo; o que entra ali é decisão sua.

## Próximas fases (fora do MVP)
- Fase 2: funil de projeto com contador de 30 dias, kits por faixa e geração de proposta.
- Fase 3: pedido de indicação automático após a primeira conta reduzida, manutenção recorrente e painel de métricas.
