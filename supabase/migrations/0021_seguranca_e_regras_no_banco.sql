-- =====================================================================
-- Segurança e regras de negócio no banco
-- 1) Funções de gatilho e auxiliares deixam de ser chamáveis pela API
--    (/rest/v1/rpc/...). Gatilhos continuam disparando normalmente:
--    o Postgres só confere EXECUTE ao criar o gatilho, não ao disparar.
-- 2) search_path fixo nas funções que ainda não tinham.
-- 3) Regras que estavam no navegador passam a valer no banco:
--    faixa de consumo, avanço de "novo" para "qualificado", criar contato
--    com venda e excluir coluna do funil movendo os cards (tudo ou nada).
-- =====================================================================

-- 1) Permissões --------------------------------------------------------

revoke execute on function public.atualizar_resumo_conversa() from public, anon, authenticated;
revoke execute on function public.bloquear_funil_normal()     from public, anon, authenticated;
revoke execute on function public.marcar_contato_lead()       from public, anon, authenticated;
revoke execute on function public.normalizar_etapa()          from public, anon, authenticated;
revoke execute on function public.preserva_nao_lidas()        from public, anon, authenticated;
revoke execute on function public.registrar_mudanca_etapa()   from public, anon, authenticated;
revoke execute on function public.proteger_etapas_fixas()     from public, anon, authenticated;
revoke execute on function public.set_updated_at()            from public, anon, authenticated;
revoke execute on function public.leitura_silenciosa()        from public, anon, authenticated;

-- is_equipe() é usada nas políticas de RLS de quem está logado: só sai do anônimo.
revoke execute on function public.is_equipe() from public, anon;
grant  execute on function public.is_equipe() to authenticated;

-- 2) search_path fixo ------------------------------------------------------

alter function public.set_updated_at()              set search_path = public;
alter function public.registrar_mudanca_etapa()     set search_path = public;
alter function public.proteger_etapas_fixas()       set search_path = public;
alter function public.rotulo_mensagem(text, text)   set search_path = public;
alter function public.telefone_chave(text)          set search_path = public;

-- 3) Regras de negócio ----------------------------------------------------

-- Mesma tabela de faixas que o CRM mostra (lib/constantes.js).
create or replace function public.faixa_por_consumo(kwh numeric)
returns text language sql immutable set search_path = public as $$
  select case
    when kwh is null or kwh <= 0 then null
    when kwh <= 500  then 'ate_500'
    when kwh <= 700  then '500_700'
    when kwh <= 1000 then '700_1000'
    when kwh <= 1200 then '1000_1200'
    else 'acima_1200'
  end
$$;

-- Consumo informado pela primeira vez: preenche a faixa da venda e avança de
-- "novo" para "qualificado". Antes isso era feito pelo navegador, em dois passos.
create or replace function public.consumo_atualiza_venda()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.consumo_kwh is not null and old.consumo_kwh is null then
    update public.oportunidades set faixa_consumo = public.faixa_por_consumo(new.consumo_kwh)
     where contato_id = new.id and faixa_consumo is null;
    update public.oportunidades set etapa = 'qualificado'
     where contato_id = new.id and etapa = 'novo';
  end if;
  return new;
end $$;
revoke execute on function public.consumo_atualiza_venda() from public, anon, authenticated;

create trigger contatos_consumo_atualiza_venda
  after update of consumo_kwh on public.contatos
  for each row execute function public.consumo_atualiza_venda();

-- Novo contato já com a venda no funil, numa transação só.
-- security invoker: as políticas de RLS de quem chamou continuam valendo.
create or replace function public.criar_contato(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_consumo numeric := nullif(p->>'consumo_kwh', '')::numeric;
  v_aceite boolean := coalesce((p->>'consentimento_lgpd')::boolean, false);
  v_origem text := coalesce(nullif(p->>'origem', ''), 'whatsapp');
begin
  if not public.is_equipe() then raise exception 'acesso negado'; end if;

  insert into public.contatos (nome, nome_editado, telefone, bairro, cidade, origem, indicado_por,
                               consumo_kwh, consentimento_lgpd, consentimento_em)
  values (
    nullif(trim(p->>'nome'), ''),
    nullif(trim(p->>'nome'), '') is not null,
    nullif(p->>'telefone', ''),
    nullif(trim(p->>'bairro'), ''),
    nullif(trim(p->>'cidade'), ''),
    v_origem,
    case when v_origem = 'indicacao' then nullif(p->>'indicado_por', '')::uuid end,
    v_consumo,
    v_aceite,
    case when v_aceite then now() end
  )
  returning id into v_id;

  insert into public.oportunidades (contato_id, etapa, faixa_consumo)
  values (v_id, case when v_consumo > 0 then 'qualificado' else 'novo' end, public.faixa_por_consumo(v_consumo));

  return v_id;
end $$;
revoke execute on function public.criar_contato(jsonb) from public, anon;
grant  execute on function public.criar_contato(jsonb) to authenticated;

-- Exclui uma coluna do funil movendo os cards dela para outra (tudo ou nada).
create or replace function public.excluir_etapa(p_etapa text, p_destino text default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_equipe() then raise exception 'acesso negado'; end if;
  if p_destino is not null then
    if p_destino = p_etapa or not exists (select 1 from public.etapas_funil where id = p_destino) then
      raise exception 'coluna de destino inválida';
    end if;
    update public.oportunidades set etapa = p_destino where etapa = p_etapa;
  end if;
  delete from public.etapas_funil where id = p_etapa;
end $$;
revoke execute on function public.excluir_etapa(text, text) from public, anon;
grant  execute on function public.excluir_etapa(text, text) to authenticated;
