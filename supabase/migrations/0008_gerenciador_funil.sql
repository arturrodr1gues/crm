-- =====================================================================
-- Gerenciador do funil
-- Colunas editáveis (nome, cor, ordem, alerta de dias parado),
-- ordem dos cards dentro da coluna e o que aparece em cada card.
-- "Ganho" e "Perdido" são fixas: podem ser renomeadas, nunca excluídas.
-- =====================================================================

create table public.etapas_funil (
  id          text primary key,
  nome        text not null check (length(trim(nome)) > 0),
  tipo        text not null default 'aberta' check (tipo in ('aberta','ganho','perdido')),
  ordem       double precision not null default 0,
  cor         text not null default 'sol',
  dias_alerta integer check (dias_alerta is null or dias_alerta > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Só pode existir uma coluna de ganho e uma de perdido
create unique index etapas_funil_tipo_fixo_idx on public.etapas_funil (tipo) where tipo <> 'aberta';

create trigger etapas_funil_updated_at before update on public.etapas_funil
for each row execute function public.set_updated_at();

insert into public.etapas_funil (id, nome, tipo, ordem, cor, dias_alerta) values
  ('novo',        'Novo contato',          'aberta',  1, 'sol',   null),
  ('qualificado', 'Conta de luz recebida', 'aberta',  2, 'sol',   null),
  ('visita',      'Visita técnica',        'aberta',  3, 'sol',   null),
  ('proposta',    'Proposta enviada',      'aberta',  4, 'sol',   3),
  ('negociacao',  'Negociação',            'aberta',  5, 'sol',   null),
  ('fechado',     'Ganho',                 'ganho',   1000, 'ok',     null),
  ('perdido',     'Perdido',               'perdido', 1001, 'alerta', null);

-- Colunas fixas: não podem ser apagadas nem mudar de tipo
create or replace function public.proteger_etapas_fixas()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.tipo <> 'aberta' then
      raise exception 'A coluna "%" é padrão do funil e não pode ser excluída', old.nome;
    end if;
    return old;
  end if;
  if new.tipo is distinct from old.tipo or new.id is distinct from old.id then
    raise exception 'Não é possível mudar o tipo ou o identificador de uma coluna';
  end if;
  return new;
end $$;

create trigger etapas_funil_protege before update or delete on public.etapas_funil
for each row execute function public.proteger_etapas_fixas();

-- A etapa da oportunidade passa a apontar para a tabela de colunas.
-- Coluna com cards não pode ser apagada: a tela move os cards antes.
alter table public.oportunidades drop constraint if exists oportunidades_etapa_check;
alter table public.oportunidades
  add constraint oportunidades_etapa_fkey foreign key (etapa)
  references public.etapas_funil(id) on update cascade on delete restrict;

-- Ordem do card dentro da coluna (menor = mais em cima)
alter table public.oportunidades add column posicao double precision;
create index oportunidades_etapa_posicao_idx on public.oportunidades (etapa, posicao);

-- Se alguma etapa usada pelo sistema for excluída (ex.: "novo", que o webhook usa),
-- o lead cai na primeira coluna aberta em vez de dar erro.
create or replace function public.normalizar_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.etapas_funil where id = new.etapa) then
    if tg_op = 'UPDATE' then
      new.etapa = old.etapa;
    else
      select id into new.etapa from public.etapas_funil
       where tipo = 'aberta' order by ordem limit 1;
    end if;
  end if;
  return new;
end $$;

-- Nome começa com "0_" para rodar antes do trigger de histórico (ordem alfabética)
create trigger oportunidades_0_normaliza_etapa before insert or update of etapa on public.oportunidades
for each row execute function public.normalizar_etapa();

-- O fechamento passa a depender do tipo da coluna (ganho), não do nome
create or replace function public.registrar_mudanca_etapa()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historico_etapas (oportunidade_id, de, para) values (new.id, null, new.etapa);
  elsif new.etapa is distinct from old.etapa then
    new.etapa_desde = now();
    if exists (select 1 from public.etapas_funil where id = new.etapa and tipo = 'ganho') then
      new.fechado_em = now();
    end if;
    insert into public.historico_etapas (oportunidade_id, de, para) values (new.id, old.etapa, new.etapa);
  end if;
  return new;
end $$;

-- O que aparece em cada card do funil (uma linha só)
create table public.funil_config (
  id          smallint primary key default 1 check (id = 1),
  campos_card text[] not null default array[
    'bairro','consumo','origem','financiamento','retorno','dias_etapa','avancar'
  ],
  updated_at  timestamptz not null default now()
);
insert into public.funil_config (id) values (1);

create trigger funil_config_updated_at before update on public.funil_config
for each row execute function public.set_updated_at();

alter table public.etapas_funil enable row level security;
alter table public.funil_config enable row level security;
create policy equipe_all on public.etapas_funil for all to authenticated using (public.is_equipe()) with check (public.is_equipe());
create policy equipe_all on public.funil_config for all to authenticated using (public.is_equipe()) with check (public.is_equipe());
