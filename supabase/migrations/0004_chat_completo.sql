-- =====================================================================
-- Chat completo: mídia (áudio, foto, vídeo, arquivo, figurinha), contato,
-- enquete, resposta, reação, edição, exclusão e confirmação de leitura.
-- =====================================================================

-- Tipos: texto, imagem, video, audio, documento, figurinha, contato, enquete, outro
alter table public.mensagens
  add column midia_path    text,          -- caminho no bucket 'whatsapp-midia'
  add column midia_mime    text,
  add column midia_nome    text,          -- nome do arquivo (documentos)
  add column midia_tamanho bigint,
  add column resposta_a    text,          -- message_id da mensagem respondida
  add column reacoes       jsonb not null default '{}'::jsonb,  -- { "<autor>": "👍" }; "eu" = você
  add column extra         jsonb,         -- contato: {nome, telefones[]} · enquete: {pergunta, opcoes[], multipla, votos{}}
  add column editada_em    timestamptz,
  add column apagada       boolean not null default false;

-- Confirmação de leitura: enviada (✓), entregue (✓✓), lida (✓✓ azul), reproduzida (áudio ouvido).
-- Mensagem recebida vira 'lida' depois que você abre a conversa no CRM.
alter table public.mensagens drop constraint mensagens_status_check;
alter table public.mensagens add constraint mensagens_status_check
  check (status in ('pendente','enviada','entregue','lida','reproduzida','falhou','recebida'));

create index mensagens_resposta_idx on public.mensagens (resposta_a) where resposta_a is not null;

-- Resumo da conversa com rótulo amigável para mídia.
create or replace function public.rotulo_mensagem(p_tipo text, p_texto text)
returns text language sql immutable as $$
  select case p_tipo
    when 'imagem'    then '📷 ' || coalesce(nullif(p_texto, ''), 'Foto')
    when 'video'     then '🎥 ' || coalesce(nullif(p_texto, ''), 'Vídeo')
    when 'audio'     then '🎤 Áudio'
    when 'documento' then '📄 ' || coalesce(nullif(p_texto, ''), 'Arquivo')
    when 'figurinha' then '💟 Figurinha'
    when 'contato'   then '👤 ' || coalesce(nullif(p_texto, ''), 'Contato')
    when 'enquete'   then '📊 ' || coalesce(nullif(p_texto, ''), 'Enquete')
    else coalesce(p_texto, '[' || p_tipo || ']')
  end
$$;

create or replace function public.atualizar_resumo_conversa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  resumo text := public.rotulo_mensagem(new.tipo, new.texto);
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

-- Reação: um emoji por autor; emoji vazio remove.
create or replace function public.definir_reacao(p_message_id text, p_autor text, p_emoji text)
returns void language sql security definer set search_path = public as $$
  update public.mensagens
     set reacoes = case when coalesce(p_emoji, '') = '' then reacoes - p_autor
                        else reacoes || jsonb_build_object(p_autor, p_emoji) end
   where message_id = p_message_id
$$;

-- Voto em enquete: guarda as opções escolhidas por autor (lista vazia remove o voto).
create or replace function public.definir_voto(p_message_id text, p_autor text, p_opcoes jsonb)
returns void language sql security definer set search_path = public as $$
  update public.mensagens
     set extra = jsonb_set(coalesce(extra, '{}'::jsonb), '{votos}',
                   case when jsonb_array_length(p_opcoes) = 0 then coalesce(extra->'votos', '{}'::jsonb) - p_autor
                        else coalesce(extra->'votos', '{}'::jsonb) || jsonb_build_object(p_autor, p_opcoes) end)
   where message_id = p_message_id and tipo = 'enquete'
$$;

-- Recibos chegam fora de ordem: o status só avança, nunca volta.
create or replace function public.avancar_status(p_ids text[], p_status text)
returns void language sql security definer set search_path = public as $$
  update public.mensagens
     set status = p_status
   where message_id = any(p_ids) and direcao = 'out'
     and array_position(array['pendente','enviada','entregue','lida','reproduzida'], status)
       < array_position(array['pendente','enviada','entregue','lida','reproduzida'], p_status)
$$;

-- Só as Edge Functions (service_role) chamam essas funções.
revoke execute on function public.definir_reacao(text, text, text) from public, anon, authenticated;
revoke execute on function public.definir_voto(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.avancar_status(text[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage: mídia das conversas (privado, até 30 MB por arquivo)
-- O navegador sobe o arquivo; a Edge Function gera um link temporário para a UAZAPI.
-- Mídia recebida é copiada para cá pelo webhook (o link da UAZAPI expira em 2 dias).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-midia', 'whatsapp-midia', false, 31457280)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy whatsapp_midia_le on storage.objects for select to authenticated
  using (bucket_id = 'whatsapp-midia' and public.is_equipe());
create policy whatsapp_midia_sobe on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp-midia' and public.is_equipe());
