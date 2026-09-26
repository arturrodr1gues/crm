-- =====================================================================
-- Celular brasileiro com e sem o nono dígito é o mesmo número.
-- O WhatsApp mantém números antigos no formato de 8 dígitos
-- (55 84 9619-7515), enquanto no CRM se digita com o 9 (55 84 99619-7515).
-- Isso fazia a mensagem recebida criar um contato duplicado.
-- =====================================================================

-- Chave do telefone: celular com 9 vira o formato sem 9. Só mexe em celular
-- (9 seguido de 6 a 9), para não confundir com telefone fixo.
create or replace function public.telefone_chave(t text)
returns text language sql immutable as $$
  select case when t ~ '^55[1-9][0-9]9[6-9][0-9]{7}$' then left(t, 4) || right(t, 8) else t end
$$;

-- Junta dois contatos que são a mesma pessoa: mensagens, negociação, agenda e
-- indicações passam para `p_manter`; dados que faltavam nele vêm do outro.
create or replace function public.mesclar_contatos(p_manter uuid, p_remover uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.contatos;
begin
  select * into r from public.contatos where id = p_remover;
  if r.id is null or p_manter = p_remover then return; end if;

  update public.mensagens set contato_id = p_manter where contato_id = p_remover;
  update public.agenda    set contato_id = p_manter where contato_id = p_remover;
  update public.contatos  set indicado_por = p_manter where indicado_por = p_remover;

  -- Negociação criada sozinha pelo webhook (ainda em "Novo contato") sai se o
  -- contato mantido já tem a dele; o resto é levado junto.
  if exists (select 1 from public.oportunidades where contato_id = p_manter) then
    delete from public.oportunidades where contato_id = p_remover and etapa = 'novo';
  end if;
  update public.oportunidades set contato_id = p_manter where contato_id = p_remover;

  -- Apaga antes de copiar os campos únicos (whatsapp_chatid, telefone).
  delete from public.contatos where id = p_remover;

  update public.contatos c set
    whatsapp_chatid    = coalesce(c.whatsapp_chatid, r.whatsapp_chatid),
    telefone           = coalesce(c.telefone, r.telefone),
    nome               = coalesce(c.nome, r.nome),
    cidade             = coalesce(c.cidade, r.cidade),
    bairro             = coalesce(c.bairro, r.bairro),
    endereco           = coalesce(c.endereco, r.endereco),
    consumo_kwh        = coalesce(c.consumo_kwh, r.consumo_kwh),
    conta_luz_path     = coalesce(c.conta_luz_path, r.conta_luz_path),
    observacoes        = coalesce(c.observacoes, r.observacoes),
    indicado_por       = coalesce(c.indicado_por, r.indicado_por),
    consentimento_lgpd = c.consentimento_lgpd or r.consentimento_lgpd,
    consentimento_em   = coalesce(c.consentimento_em, r.consentimento_em),
    nao_lidas          = c.nao_lidas + r.nao_lidas,
    ultima_mensagem    = case when r.ultima_mensagem_em > coalesce(c.ultima_mensagem_em, '-infinity'::timestamptz)
                              then r.ultima_mensagem else c.ultima_mensagem end,
    ultima_mensagem_em = greatest(c.ultima_mensagem_em, r.ultima_mensagem_em),
    -- quem está esperando quem, recalculado com as mensagens dos dois
    aguardando_resposta_desde = (
      select min(m.momento) from public.mensagens m
       where m.contato_id = c.id and m.direcao = 'in'
         and m.momento > coalesce((select max(o.momento) from public.mensagens o
                                    where o.contato_id = c.id and o.direcao = 'out' and o.status <> 'falhou'),
                                  '-infinity'::timestamptz)),
    aguardando_cliente_desde = (
      select case when max(o.momento) filter (where o.direcao = 'out' and o.status <> 'falhou')
                     > coalesce(max(o.momento) filter (where o.direcao = 'in'), '-infinity'::timestamptz)
                  then max(o.momento) filter (where o.direcao = 'out' and o.status <> 'falhou') end
        from public.mensagens o where o.contato_id = c.id)
  where c.id = p_manter;
end $$;

revoke execute on function public.mesclar_contatos(uuid, uuid) from public, anon, authenticated;

-- Junta os duplicados que já existem (fica o mais antigo, normalmente o cadastrado no CRM).
do $$
declare
  d record;
begin
  for d in
    select c.id as remover,
           first_value(c.id) over (partition by public.telefone_chave(c.telefone) order by c.created_at) as manter
      from public.contatos c
     where c.telefone is not null
       and public.telefone_chave(c.telefone) in (
         select public.telefone_chave(telefone) from public.contatos
          where telefone is not null group by 1 having count(*) > 1)
  loop
    if d.remover <> d.manter then
      perform public.mesclar_contatos(d.manter, d.remover);
    end if;
  end loop;
end $$;

-- Daqui em diante o banco não aceita o mesmo celular duas vezes (com ou sem o 9).
create unique index contatos_telefone_chave_idx on public.contatos (public.telefone_chave(telefone))
  where telefone is not null;
