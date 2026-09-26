# CRM Solar — MVP

Contatos, funil comercial, conversas do WhatsApp (UAZAPI) e agenda.
Feito para uso no celular em campo, e confortável no computador.

## O que tem no MVP

| Tela | Para que serve |
|---|---|
| **Hoje** | Agenda do dia, mensagens sem resposta, retornos marcados e propostas paradas há 3+ dias |
| **Funil** | Kanban das 6 etapas. Arraste no computador ou toque em "Avançar" no celular |
| **Conversas** | Inbox do WhatsApp com busca e filtro de não lidas, em tempo real. O chat manda texto, emoji, áudio gravado, foto, vídeo, arquivo (até 30 MB), figurinha, contato e enquete; responde, reage, edita e apaga mensagens; mostra ✓ enviada, ✓✓ entregue e ✓✓ azul lida |
| **Ficha do cliente** | Conversa + venda (etapa, retorno, financiamento) + compromissos + dados + conta de luz + indicações |
| **Agenda** | Próximos 14 dias e o que ficou para trás |

Automatismos:
- Mensagem nova de número desconhecido cria o contato e a oportunidade em "Novo contato".
- Grupos do WhatsApp aparecem em Conversas (com o nome de quem escreveu) e dá para responder por ali.
  Ficam fora do funil, da tela Hoje e do contador de não lidas.
- Ao informar o consumo pela primeira vez, a faixa é preenchida e a etapa passa para "Conta de luz recebida".
- Toda mudança de etapa fica registrada em `historico_etapas` (base para as métricas da fase 3).

## Estrutura

```
supabase/
  migrations/0001_mvp.sql          tabelas, RLS, triggers, realtime, storage
  migrations/0002_whatsapp_config.sql  servidor e token da UAZAPI (só as Edge Functions leem)
  migrations/0004_chat_completo.sql    mídia, reações, enquetes, edição, exclusão e leitura
  functions/_shared/uazapi.ts      tudo que é específico da UAZAPI
  functions/_shared/config.ts      lê a configuração salva pela tela de Ajustes
  functions/uazapi-webhook/        recebe mensagens
  functions/whatsapp-send/         envia mensagens, reage, edita, apaga e marca como lida (com travas de proteção)
  functions/whatsapp-config/       conectar/desconectar o WhatsApp e cadastrar o webhook
web/                               React + Tailwind (Vite)
```

## Passo a passo

### 1. Supabase
1. Crie o projeto e rode as migrations de `supabase/migrations/` em ordem (0001 → 0004) no **SQL Editor** (ou `supabase db push`).
2. Em **Authentication → Providers → Email**, crie seu usuário e **desative novos cadastros** (Allow new users to sign up = off).
3. Libere seu acesso:
   ```sql
   insert into equipe (user_id, nome)
   select id, 'Artur' from auth.users where email = 'SEU-EMAIL';
   ```

### 2. Edge Functions
```bash
supabase secrets set APP_ORIGIN=https://endereco-do-seu-crm.com   # opcional

supabase functions deploy uazapi-webhook --no-verify-jwt
supabase functions deploy whatsapp-send
supabase functions deploy whatsapp-config
```

### 3. UAZAPI
No CRM, abra **Ajustes** e informe o endereço do servidor e o token da instância (ficam no painel da UAZAPI).
O CRM testa os dados, guarda o token só no servidor (tabela `whatsapp_config`, inacessível pelo navegador)
e cadastra sozinho o webhook na UAZAPI, com um secret gerado na hora. Depois é só conectar
com o QR Code ou com o código de pareamento pelo número.

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
