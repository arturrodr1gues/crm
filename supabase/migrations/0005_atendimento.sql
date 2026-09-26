-- =====================================================================
-- Atendimento: conversas em aberto/fechadas, SLA de resposta, follow-up
-- e mensagens rápidas com o nome do contato.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuração do atendimento (uma linha só)
-- ---------------------------------------------------------------------
create table public.atendimento_config (
  id                   boolean primary key default true check (id),
  sla_resposta_min     integer not null default 60 check (sla_resposta_min between 5 and 1440),  -- sem resposta há mais que isso = crítico
  followup_horas       integer not null default 12 check (followup_horas between 1 and 168),     -- cliente sem responder há mais que isso = follow-up
  followup_resposta_id uuid references public.respostas_rapidas(id) on delete set null,          -- mensagem sugerida no follow-up
  updated_at           timestamptz not null default now()
);

create trigger atendimento_config_updated_at before update on public.atendimento_config
for each row execute function public.set_updated_at();

alter table public.atendimento_config enable row level security;
create policy equipe_le on public.atendimento_config for select to authenticated using (public.is_equipe());
create policy equipe_altera on public.atendimento_config for update to authenticated
  using (public.is_equipe()) with check (public.is_equipe());

-- ---------------------------------------------------------------------
-- Estado da conversa
-- ---------------------------------------------------------------------
alter table public.contatos
  add column conversa_fechada          boolean not null default false,
  add column conversa_fechada_em       timestamptz,
  add column aguardando_resposta_desde timestamptz,  -- cliente escreveu e ainda não respondemos (SLA)
  add column aguardando_cliente_desde  timestamptz;  -- nossa última mensagem ainda sem resposta (follow-up)

create index contatos_aguardando_resposta_idx on public.contatos (aguardando_resposta_desde)
  where aguardando_resposta_desde is not null;
create index contatos_aguardando_cliente_idx on public.contatos (aguardando_cliente_desde)
  where aguardando_cliente_desde is not null;

-- Preenche com o histórico: quem está esperando quem hoje.
update public.contatos c
   set aguardando_resposta_desde = (
         -- primeira mensagem do cliente depois da nossa última resposta
         select min(m.momento) from public.mensagens m
          where m.contato_id = c.id and m.direcao = 'in'
            and m.momento > coalesce((select max(o.momento) from public.mensagens o
                                       where o.contato_id = c.id and o.direcao = 'out' and o.status <> 'falhou'),
                                     '-infinity'::timestamptz)),
       aguardando_cliente_desde = (
         -- nossa última mensagem, se o cliente não escreveu depois dela
         select case when max(o.momento) filter (where o.direcao = 'out' and o.status <> 'falhou')
                        > coalesce(max(o.momento) filter (where o.direcao = 'in'), '-infinity'::timestamptz)
                     then max(o.momento) filter (where o.direcao = 'out' and o.status <> 'falhou') end
           from public.mensagens o where o.contato_id = c.id);

-- Resumo da conversa: além do texto e das não lidas, controla SLA, follow-up
-- e reabre a conversa fechada quando o cliente volta a escrever.
-- Só a mensagem mais recente muda o estado (histórico antigo chegando não bagunça).
create or replace function public.atualizar_resumo_conversa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  resumo text := public.rotulo_mensagem(new.tipo, new.texto);
  valida boolean := new.status <> 'falhou';
begin
  if new.direcao = 'in' and new.autor_nome is not null then
    resumo := new.autor_nome || ': ' || resumo;
  end if;
  update public.contatos
     set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, new.momento), new.momento),
         ultima_mensagem    = left(resumo, 140),
         nao_lidas          = case when new.direcao = 'in' then nao_lidas + 1 else 0 end,
         aguardando_resposta_desde = case
           when new.momento < coalesce(ultima_mensagem_em, '-infinity'::timestamptz) then aguardando_resposta_desde
           when new.direcao = 'in' then coalesce(aguardando_resposta_desde, new.momento)
           when valida then null
           else aguardando_resposta_desde end,
         aguardando_cliente_desde = case
           when new.momento < coalesce(ultima_mensagem_em, '-infinity'::timestamptz) then aguardando_cliente_desde
           when new.direcao = 'in' then null
           when valida then new.momento
           else aguardando_cliente_desde end,
         conversa_fechada    = case when new.direcao = 'in' then false else conversa_fechada end,
         conversa_fechada_em = case when new.direcao = 'in' then null else conversa_fechada_em end
   where id = new.contato_id;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Mensagens rápidas com o nome do contato: {nome} e {primeiro_nome}
-- (só troca os textos padrão que ainda não foram editados)
-- ---------------------------------------------------------------------
update public.respostas_rapidas set texto = 'Oi, {primeiro_nome}! Aqui é o Artur, da Energy Brasil. Que bom falar com você! Como posso te ajudar?'
 where atalho = 'Boas-vindas' and texto = 'Oi! Aqui é o Artur, da Energy Brasil. Que bom falar com você! Como posso te ajudar?';
update public.respostas_rapidas set texto = '{primeiro_nome}, para eu te mostrar quanto dá pra economizar, pode me mandar uma foto da sua última conta de luz? Pode ser pelo celular mesmo.'
 where atalho = 'Pedir conta de luz' and texto = 'Para eu te mostrar quanto dá pra economizar, pode me mandar uma foto da sua última conta de luz? Pode ser pelo celular mesmo.';
update public.respostas_rapidas set texto = 'Oi, {primeiro_nome}! Passando para confirmar nossa visita. Está tudo certo para você?'
 where atalho = 'Confirmar visita' and texto = 'Passando para confirmar nossa visita. Está tudo certo para você?';

insert into public.respostas_rapidas (atalho, texto, ordem)
values ('Follow-up', 'Oi, {primeiro_nome}! Conseguiu ver minha última mensagem? Fico à disposição para tirar qualquer dúvida.', 4)
on conflict (atalho) do nothing;

insert into public.atendimento_config (id, followup_resposta_id)
select true, (select id from public.respostas_rapidas where atalho = 'Follow-up');
