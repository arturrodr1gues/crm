-- =====================================================================
-- Bloquear o recebimento de conversas e excluir contatos
-- Contato bloqueado: o webhook ignora as mensagens novas dele e o CRM não
-- envia nada para ele. A conversa sai da lista e fica no filtro "Bloqueados".
-- No WhatsApp do celular nada muda.
-- =====================================================================

alter table public.contatos
  add column bloqueado    boolean not null default false,
  add column bloqueado_em timestamptz;

create index contatos_bloqueado_idx on public.contatos (bloqueado) where bloqueado;

-- Bloqueia ou desbloqueia vários de uma vez. Ao bloquear, zera não lidas e
-- os prazos de SLA/follow-up, para a conversa não seguir contando em lugar nenhum.
create or replace function public.bloquear_contatos(p_ids uuid[], p_bloquear boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.is_equipe() then raise exception 'acesso negado'; end if;

  update contatos set
    bloqueado    = p_bloquear,
    bloqueado_em = case when p_bloquear then now() end,
    nao_lidas    = case when p_bloquear then 0 else nao_lidas end,
    aguardando_resposta_desde = case when p_bloquear then null else aguardando_resposta_desde end,
    aguardando_cliente_desde  = case when p_bloquear then null else aguardando_cliente_desde end
  where id = any(p_ids) and bloqueado is distinct from p_bloquear;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.bloquear_contatos(uuid[], boolean) from public, anon;
grant execute on function public.bloquear_contatos(uuid[], boolean) to authenticated;

-- Excluir contato apaga também as fotos, áudios e arquivos da conversa.
create policy whatsapp_midia_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'whatsapp-midia' and public.is_equipe());
