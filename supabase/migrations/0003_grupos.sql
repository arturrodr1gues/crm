-- =====================================================================
-- Grupos do WhatsApp: recebidos e enviados pela mesma inbox
-- =====================================================================

-- O grupo é uma conversa em `contatos` (whatsapp_chatid termina em @g.us),
-- sem telefone e fora do funil.
alter table public.contatos add column is_grupo boolean not null default false;

-- Quem escreveu no grupo (nas conversas individuais fica vazio).
alter table public.mensagens add column autor_nome text;
alter table public.mensagens add column autor_telefone text;

-- No resumo da conversa, mostra o autor da última mensagem do grupo.
create or replace function public.atualizar_resumo_conversa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  resumo text := coalesce(new.texto, '['||new.tipo||']');
begin
  if new.direcao = 'in' and new.autor_nome is not null then
    resumo := new.autor_nome || ': ' || resumo;
  end if;
  update public.contatos
     set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, new.momento), new.momento),
         ultima_mensagem    = left(resumo, 140),
         nao_lidas          = case when new.direcao = 'in' then nao_lidas + 1 else 0 end
   where id = new.contato_id;
  return new;
end $$;
