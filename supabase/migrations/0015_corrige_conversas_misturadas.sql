-- =====================================================================
-- Corrige mensagens de conversas diferentes gravadas no mesmo contato
-- Causa (corrigida no uazapi-webhook): em mensagem enviada pelo celular, o
-- telefone da conversa era tirado do remetente, que é o próprio número
-- conectado. Toda primeira mensagem minha para um chat que ainda não estava
-- no CRM caía no contato que tinha esse telefone.
-- Aqui cada mensagem volta para o contato do chat de onde ela veio
-- (raw.chat.wa_chatid), criando o contato quando ele ainda não existe.
-- =====================================================================

-- 1) Contato com o telefone de uma pessoa e o chat de outra: o chat manda.
update public.contatos c
   set telefone = split_part(c.whatsapp_chatid, '@', 1)
 where not c.is_grupo
   and c.whatsapp_chatid like '%@s.whatsapp.net'
   and c.telefone is not null
   and public.telefone_chave(c.telefone) <> public.telefone_chave(split_part(c.whatsapp_chatid, '@', 1))
   and not exists (select 1 from public.contatos x where x.id <> c.id
                    and public.telefone_chave(x.telefone) = public.telefone_chave(split_part(c.whatsapp_chatid, '@', 1)));

-- Mensagens fora do lugar e o chat certo de cada uma
create temp table desviadas on commit drop as
select m.id, m.contato_id as de, m.momento,
       m.raw->'chat'->>'wa_chatid' as chat,
       nullif(trim(m.raw->'chat'->>'wa_contactName'), '') as agenda
  from public.mensagens m
  join public.contatos c on c.id = m.contato_id
 where not c.is_grupo
   and m.raw ? 'chat'
   and coalesce(m.raw->'chat'->>'wa_chatid', '') like '%@s.whatsapp.net'
   and m.raw->'chat'->>'wa_chatid' is distinct from c.whatsapp_chatid;

-- 2) Chats que ainda não têm contato (nem pelo chat, nem pelo telefone)
insert into public.contatos (nome, telefone, whatsapp_chatid, origem, is_grupo, created_at)
select distinct on (d.chat)
       d.agenda, split_part(d.chat, '@', 1), d.chat, 'whatsapp', false,
       (select min(x.momento) from desviadas x where x.chat = d.chat)
  from desviadas d
 where not exists (select 1 from public.contatos x where x.whatsapp_chatid = d.chat)
   and not exists (select 1 from public.contatos x
                    where public.telefone_chave(x.telefone) = public.telefone_chave(split_part(d.chat, '@', 1)))
 order by d.chat, d.momento desc;

-- Contato certo de cada chat (pelo chat; senão, pelo telefone)
create temp table destino on commit drop as
select d.chat,
       coalesce(
         (select x.id from public.contatos x where x.whatsapp_chatid = d.chat),
         (select x.id from public.contatos x
           where public.telefone_chave(x.telefone) = public.telefone_chave(split_part(d.chat, '@', 1)) limit 1)
       ) as para
  from (select distinct chat from desviadas) d;

-- Quem foi achado pelo telefone ganha o id do chat
update public.contatos c set whatsapp_chatid = t.chat
  from destino t
 where t.para = c.id and c.whatsapp_chatid is null;

-- 3) Move as mensagens
update public.mensagens m set contato_id = t.para
  from desviadas d join destino t on t.chat = d.chat
 where m.id = d.id and t.para is not null and t.para <> d.de;

-- 4) Refaz o resumo (última mensagem e esperas) dos contatos envolvidos
create temp table afetados on commit drop as
select de as id from desviadas union select para from destino where para is not null;

update public.contatos c set
  ultima_mensagem_em = u.momento,
  ultima_mensagem    = left(public.rotulo_mensagem(u.tipo, u.texto), 140),
  aguardando_resposta_desde = case when u.direcao = 'in' then (
      select min(i.momento) from public.mensagens i
       where i.contato_id = c.id and i.direcao = 'in'
         and i.momento > coalesce((select max(o.momento) from public.mensagens o
                                    where o.contato_id = c.id and o.direcao = 'out' and o.status <> 'falhou'),
                                  '-infinity'::timestamptz)) end,
  aguardando_cliente_desde = case when u.direcao = 'out' then u.momento end
  from (select distinct on (contato_id) contato_id, momento, tipo, texto, direcao
          from public.mensagens
         where contato_id in (select id from afetados) and (direcao = 'in' or status <> 'falhou')
         order by contato_id, momento desc) u
 where u.contato_id = c.id;

-- 5) Nome da agenda nos contatos corrigidos (mesma regra da 0014)
update public.contatos c set nome = x.nome
  from (
    select distinct on (m.contato_id) m.contato_id,
           nullif(trim(m.raw->'chat'->>'wa_contactName'), '') as nome,
           m.raw->'chat'->>'wa_chatid' as chat
      from public.mensagens m
     where m.contato_id in (select id from afetados)
       and nullif(trim(m.raw->'chat'->>'wa_contactName'), '') is not null
     order by m.contato_id, m.momento desc
  ) x
 where x.contato_id = c.id and not c.is_grupo and not c.nome_editado
   and x.chat = c.whatsapp_chatid and c.nome is distinct from x.nome;
