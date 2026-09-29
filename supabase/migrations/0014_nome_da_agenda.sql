-- =====================================================================
-- Nome do contato igual ao da agenda do número conectado
-- O webhook e a atualização de fotos usam o nome salvo na agenda do celular
-- conectado (wa_contactName). Se alguém da equipe troca o nome no CRM,
-- nome_editado fica true e o nome da agenda deixa de sobrescrever.
-- =====================================================================

alter table public.contatos
  add column nome_editado boolean not null default false;

-- Nomes da agenda que já chegaram nos webhooks: aplica o mais recente de cada conversa.
-- Só quando a mensagem é mesmo daquele chat e o telefone do contato bate com o chat
-- (contato com telefone de uma pessoa e chat de outra fica de fora). Grupos não entram.
update public.contatos c set nome = x.nome
  from (
    select distinct on (m.contato_id) m.contato_id,
           nullif(trim(m.raw->'chat'->>'wa_contactName'), '') as nome,
           m.raw->'chat'->>'wa_chatid' as chat
      from public.mensagens m
     where m.raw ? 'chat' and nullif(trim(m.raw->'chat'->>'wa_contactName'), '') is not null
     order by m.contato_id, m.momento desc
  ) x
 where x.contato_id = c.id
   and not c.is_grupo
   and x.chat = c.whatsapp_chatid
   and (c.telefone is null or public.telefone_chave(c.telefone) = public.telefone_chave(split_part(c.whatsapp_chatid, '@', 1)))
   and c.nome is distinct from x.nome;
