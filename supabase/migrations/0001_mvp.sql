-- =====================================================================
-- CRM Solar — MVP
-- Contatos, funil comercial, inbox WhatsApp (UAZAPI) e agenda
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Equipe (lista de quem pode acessar o CRM)
-- Hoje é só o Artur; já fica pronto para uma futura contratação.
-- ---------------------------------------------------------------------
create table public.equipe (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  papel      text not null default 'admin' check (papel in ('admin','vendedor','tecnico')),
  created_at timestamptz not null default now()
);

create or replace function public.is_equipe()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.equipe where user_id = auth.uid()) $$;

-- ---------------------------------------------------------------------
-- Utilitário: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- Contatos
-- ---------------------------------------------------------------------
create table public.contatos (
  id                  uuid primary key default gen_random_uuid(),
  nome                text,
  telefone            text unique,             -- só dígitos, com DDI: 5584999999999
  whatsapp_chatid     text unique,             -- id do chat na UAZAPI (pode ser @s.whatsapp.net ou @lid)
  cidade              text,
  bairro              text,
  endereco            text,
  origem              text not null default 'whatsapp'
                      check (origem in ('whatsapp','indicacao','instagram','porta_a_porta','evento','outro')),
  indicado_por        uuid references public.contatos(id) on delete set null,
  consumo_kwh         integer check (consumo_kwh is null or consumo_kwh > 0),
  conta_luz_path      text,                    -- caminho no bucket 'contas-luz'
  consentimento_lgpd  boolean not null default false,
  consentimento_em    timestamptz,
  observacoes         text,
  ultima_mensagem_em  timestamptz,
  ultima_mensagem     text,
  nao_lidas           integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index contatos_ultima_msg_idx on public.contatos (ultima_mensagem_em desc nulls last);
create index contatos_nome_trgm_idx on public.contatos using gin (nome gin_trgm_ops);
create index contatos_indicado_por_idx on public.contatos (indicado_por);

create trigger contatos_updated_at before update on public.contatos
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Oportunidades (funil comercial)
-- ---------------------------------------------------------------------
create table public.oportunidades (
  id                    uuid primary key default gen_random_uuid(),
  contato_id            uuid not null references public.contatos(id) on delete cascade,
  etapa                 text not null default 'novo'
                        check (etapa in ('novo','qualificado','visita','proposta','negociacao','fechado','perdido')),
  faixa_consumo         text check (faixa_consumo in ('ate_500','500_700','700_1000','1000_1200','acima_1200')),
  valor_proposta        numeric(12,2),         -- preenchido só por você, nunca automático
  financiamento_status  text check (financiamento_status in ('nao_precisa','em_analise','aprovado','recusado')),
  financiamento_banco   text,
  motivo_perda          text,
  proximo_followup      timestamptz,
  etapa_desde           timestamptz not null default now(),
  fechado_em            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index oportunidades_contato_idx on public.oportunidades (contato_id);
create index oportunidades_etapa_idx on public.oportunidades (etapa);
create index oportunidades_followup_idx on public.oportunidades (proximo_followup)
  where etapa not in ('fechado','perdido');

create trigger oportunidades_updated_at before update on public.oportunidades
for each row execute function public.set_updated_at();

-- Histórico de etapas (base para medir conversão e tempo por etapa na fase 3)
create table public.historico_etapas (
  id              bigint generated always as identity primary key,
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  de              text,
  para            text not null,
  em              timestamptz not null default now()
);

create or replace function public.registrar_mudanca_etapa()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historico_etapas (oportunidade_id, de, para) values (new.id, null, new.etapa);
  elsif new.etapa is distinct from old.etapa then
    new.etapa_desde = now();
    if new.etapa = 'fechado' then new.fechado_em = now(); end if;
    insert into public.historico_etapas (oportunidade_id, de, para) values (new.id, old.etapa, new.etapa);
  end if;
  return new;
end $$;

create trigger oportunidades_etapa_ins after insert on public.oportunidades
for each row execute function public.registrar_mudanca_etapa();
create trigger oportunidades_etapa_upd before update on public.oportunidades
for each row execute function public.registrar_mudanca_etapa();

-- ---------------------------------------------------------------------
-- Agenda (visitas, instalações, manutenções, follow-ups)
-- ---------------------------------------------------------------------
create table public.agenda (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  tipo            text not null default 'visita'
                  check (tipo in ('visita','instalacao','manutencao','followup','outro')),
  contato_id      uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  inicio          timestamptz not null,
  fim             timestamptz,
  local           text,
  notas           text,
  concluido       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);

create index agenda_inicio_idx on public.agenda (inicio);
create trigger agenda_updated_at before update on public.agenda
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Mensagens WhatsApp
-- ---------------------------------------------------------------------
create table public.mensagens (
  id           uuid primary key default gen_random_uuid(),
  contato_id   uuid not null references public.contatos(id) on delete cascade,
  direcao      text not null check (direcao in ('in','out')),
  tipo         text not null default 'texto',   -- texto, imagem, audio, documento, outro
  texto        text,
  message_id   text unique,                     -- id da UAZAPI (evita duplicados)
  status       text not null default 'enviada' check (status in ('pendente','enviada','falhou','recebida')),
  erro         text,
  enviado_por  uuid references auth.users(id),
  momento      timestamptz not null default now(),
  raw          jsonb
);

create index mensagens_contato_idx on public.mensagens (contato_id, momento desc);

-- Atualiza o resumo da conversa no contato
create or replace function public.atualizar_resumo_conversa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.contatos
     set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, new.momento), new.momento),
         ultima_mensagem    = left(coalesce(new.texto, '['||new.tipo||']'), 140),
         nao_lidas          = case when new.direcao = 'in' then nao_lidas + 1 else 0 end
   where id = new.contato_id;
  return new;
end $$;

create trigger mensagens_resumo after insert on public.mensagens
for each row execute function public.atualizar_resumo_conversa();

-- ---------------------------------------------------------------------
-- Respostas rápidas (você escreve; o sistema não inventa preço nem prazo)
-- ---------------------------------------------------------------------
create table public.respostas_rapidas (
  id         uuid primary key default gen_random_uuid(),
  atalho     text not null unique,
  texto      text not null,
  ordem      integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.respostas_rapidas (atalho, texto, ordem) values
  ('Boas-vindas', 'Oi! Aqui é o Artur, da Energy Brasil. Que bom falar com você! Como posso te ajudar?', 1),
  ('Pedir conta de luz', 'Para eu te mostrar quanto dá pra economizar, pode me mandar uma foto da sua última conta de luz? Pode ser pelo celular mesmo.', 2),
  ('Confirmar visita', 'Passando para confirmar nossa visita. Está tudo certo para você?', 3);

-- ---------------------------------------------------------------------
-- RLS: só membros da equipe acessam. O webhook usa service_role (ignora RLS).
-- ---------------------------------------------------------------------
alter table public.equipe             enable row level security;
alter table public.contatos           enable row level security;
alter table public.oportunidades      enable row level security;
alter table public.historico_etapas   enable row level security;
alter table public.agenda             enable row level security;
alter table public.mensagens          enable row level security;
alter table public.respostas_rapidas  enable row level security;

create policy equipe_le_propria on public.equipe for select to authenticated
  using (user_id = auth.uid());

create policy equipe_all on public.contatos          for all to authenticated using (public.is_equipe()) with check (public.is_equipe());
create policy equipe_all on public.oportunidades     for all to authenticated using (public.is_equipe()) with check (public.is_equipe());
create policy equipe_le  on public.historico_etapas  for select to authenticated using (public.is_equipe());
create policy equipe_all on public.agenda            for all to authenticated using (public.is_equipe()) with check (public.is_equipe());
create policy equipe_le  on public.mensagens         for select to authenticated using (public.is_equipe());
create policy equipe_all on public.respostas_rapidas for all to authenticated using (public.is_equipe()) with check (public.is_equipe());
-- Mensagens só são inseridas pelas Edge Functions (service_role), nunca direto do navegador.

-- ---------------------------------------------------------------------
-- Realtime para inbox e contadores
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.mensagens;
alter publication supabase_realtime add table public.contatos;

-- ---------------------------------------------------------------------
-- Storage: contas de luz (privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('contas-luz', 'contas-luz', false)
on conflict (id) do nothing;

create policy contas_luz_equipe on storage.objects for all to authenticated
  using (bucket_id = 'contas-luz' and public.is_equipe())
  with check (bucket_id = 'contas-luz' and public.is_equipe());
