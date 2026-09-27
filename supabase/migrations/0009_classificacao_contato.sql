-- =====================================================================
-- Lead ou conversa normal
-- Mensagem nova não cai mais sozinha no funil: na conversa você escolhe
-- "Novo lead" (entra no funil em "Novo contato", como antes) ou "Normal"
-- (fica só como conversa, fora do funil e do dashboard).
-- Sem escolha (null) = ainda não classificado.
-- =====================================================================

alter table public.contatos add column tipo_contato text
  check (tipo_contato in ('lead','normal'));

create index contatos_tipo_contato_idx on public.contatos (tipo_contato) where tipo_contato is not null;

-- Quem já está no funil é lead
update public.contatos c set tipo_contato = 'lead'
 where not c.is_grupo and exists (select 1 from public.oportunidades o where o.contato_id = c.id);

-- Entrou no funil (pela ficha, pelo "Novo contato" ou pelo botão) → vira lead
create or replace function public.marcar_contato_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.contatos set tipo_contato = 'lead'
   where id = new.contato_id and tipo_contato is distinct from 'lead';
  return new;
end $$;

create trigger oportunidades_marca_lead after insert on public.oportunidades
for each row execute function public.marcar_contato_lead();

-- Botões "Novo lead" / "Normal" da conversa
create or replace function public.classificar_contato(p_contato uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_equipe() then raise exception 'acesso negado'; end if;
  if p_tipo not in ('lead', 'normal') then raise exception 'tipo inválido: %', p_tipo; end if;
  if exists (select 1 from contatos where id = p_contato and is_grupo) then
    raise exception 'Grupo não entra no funil';
  end if;

  update contatos set tipo_contato = p_tipo where id = p_contato;

  if p_tipo = 'lead' then
    if not exists (select 1 from oportunidades where contato_id = p_contato) then
      insert into oportunidades (contato_id, etapa) values (p_contato, 'novo');
    end if;
  else
    -- Sai do funil (o histórico de etapas vai junto)
    delete from oportunidades where contato_id = p_contato;
  end if;
end $$;

revoke all on function public.classificar_contato(uuid, text) from public, anon;
grant execute on function public.classificar_contato(uuid, text) to authenticated;

-- Dashboard: leads são só os marcados como lead; conversas "normais" ficam fora dos indicadores
create or replace function public.dashboard_kpis(p_inicio timestamptz, p_fim timestamptz, p_agrupar text default 'day')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
  v_sla integer;
  v_passo interval;
  resultado jsonb;
begin
  if not public.is_equipe() then raise exception 'acesso negado'; end if;
  if p_agrupar not in ('day', 'week', 'month') then raise exception 'agrupamento inválido: %', p_agrupar; end if;
  if p_fim <= p_inicio then raise exception 'período inválido'; end if;

  v_sla := coalesce((select sla_resposta_min from atendimento_config limit 1), 60);
  v_passo := ('1 ' || p_agrupar)::interval;

  with
  -- Leads = contatos novos marcados como lead
  leads as (
    select c.id, c.origem, c.created_at from contatos c
     where c.tipo_contato = 'lead' and c.created_at >= p_inicio and c.created_at < p_fim
  ),
  ganhos as (
    select o.valor_proposta, o.fechado_em from oportunidades o
     where o.etapa = 'fechado' and o.fechado_em >= p_inicio and o.fechado_em < p_fim
  ),
  -- Perdidos: foram para "perdido" no período e continuam lá
  perdidos as (
    select distinct h.oportunidade_id from historico_etapas h
      join oportunidades o on o.id = h.oportunidade_id and o.etapa = 'perdido'
     where h.para = 'perdido' and h.em >= p_inicio and h.em < p_fim
  ),
  msgs as (
    select m.contato_id, m.direcao, m.momento from mensagens m
      join contatos c on c.id = m.contato_id and not c.is_grupo and c.tipo_contato is distinct from 'normal'
     where m.momento >= p_inicio and m.momento < p_fim
       and (m.direcao = 'in' or m.status <> 'falhou')
  ),
  -- Cada vez que o cliente começa a esperar: mensagem dele logo depois de uma
  -- nossa (ou a primeira da conversa). Mensagens seguidas dele contam uma vez só.
  esperas as (
    select e.contato_id, e.momento as inicio,
           (select min(o.momento) from mensagens o
             where o.contato_id = e.contato_id and o.direcao = 'out' and o.status <> 'falhou'
               and o.momento > e.momento) as resposta
      from msgs e
     where e.direcao = 'in'
       and coalesce((select p.direcao from mensagens p
                      where p.contato_id = e.contato_id and p.momento < e.momento
                        and (p.direcao = 'in' or p.status <> 'falhou')
                      order by p.momento desc limit 1), 'out') = 'out'
  ),
  tempos as (
    select inicio, resposta,
           extract(epoch from (resposta - inicio)) / 60.0 as minutos
      from esperas
  ),
  buckets as (
    select b from generate_series(
      date_trunc(p_agrupar, p_inicio at time zone tz),
      date_trunc(p_agrupar, (p_fim - interval '1 second') at time zone tz),
      v_passo) as b
  )
  select jsonb_build_object(
    'leads', jsonb_build_object(
      'novos', (select count(*) from leads),
      'por_origem', (select coalesce(jsonb_agg(jsonb_build_object('origem', origem, 'total', n) order by n desc), '[]'::jsonb)
                       from (select origem, count(*) n from leads group by origem) x),
      'ganhos', (select count(*) from ganhos),
      'valor_ganho', (select coalesce(sum(valor_proposta), 0) from ganhos),
      'perdidos', (select count(*) from perdidos)
    ),
    -- Retrato de agora (não depende do período)
    'funil_atual', (select coalesce(jsonb_agg(jsonb_build_object('etapa', etapa, 'total', n, 'valor', v)), '[]'::jsonb)
                      from (select etapa, count(*) n, coalesce(sum(valor_proposta), 0) v from oportunidades
                             where etapa not in ('fechado', 'perdido') group by etapa) x),
    'atendimento', jsonb_build_object(
      'conversas', (select count(distinct contato_id) from msgs),
      'recebidas', (select count(*) from msgs where direcao = 'in'),
      'enviadas', (select count(*) from msgs where direcao = 'out'),
      'fechadas', (select count(*) from contatos where not is_grupo and tipo_contato is distinct from 'normal' and conversa_fechada
                      and conversa_fechada_em >= p_inicio and conversa_fechada_em < p_fim),
      'aguardando_agora', (select count(*) from contatos where not is_grupo and tipo_contato is distinct from 'normal' and not conversa_fechada
                              and aguardando_resposta_desde is not null),
      'atrasadas_agora', (select count(*) from contatos where not is_grupo and tipo_contato is distinct from 'normal' and not conversa_fechada
                             and aguardando_resposta_desde < now() - make_interval(mins => v_sla))
    ),
    'sla', jsonb_build_object(
      'limite_min', v_sla,
      'esperas', (select count(*) from tempos),
      'respondidas', (select count(*) from tempos where resposta is not null),
      'sem_resposta', (select count(*) from tempos where resposta is null),
      'media_min', (select round(avg(minutos)::numeric, 1) from tempos where resposta is not null),
      'mediana_min', (select round((percentile_cont(0.5) within group (order by minutos))::numeric, 1)
                        from tempos where resposta is not null),
      -- Dentro do prazo / (respondidas + sem resposta que já passaram do prazo)
      'no_prazo', (select count(*) from tempos where resposta is not null and minutos <= v_sla),
      'fora_prazo', (select count(*) from tempos
                      where (resposta is not null and minutos > v_sla)
                         or (resposta is null and inicio < now() - make_interval(mins => v_sla)))
    ),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object(
                'inicio', to_char(b, 'YYYY-MM-DD'),
                'leads', (select count(*) from leads l where date_trunc(p_agrupar, l.created_at at time zone tz) = b),
                'conversas', (select count(distinct m.contato_id) from msgs m where date_trunc(p_agrupar, m.momento at time zone tz) = b),
                'sla_media_min', (select round(avg(t.minutos)::numeric, 1) from tempos t
                                   where t.resposta is not null and date_trunc(p_agrupar, t.inicio at time zone tz) = b)
              ) order by b), '[]'::jsonb) from buckets)
  ) into resultado;

  return resultado;
end $$;

revoke all on function public.dashboard_kpis(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.dashboard_kpis(timestamptz, timestamptz, text) to authenticated;
