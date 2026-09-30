-- =====================================================================
-- Situação da conexão com o WhatsApp (UAZAPI) e histórico
-- whatsapp_conexao: uma linha com o estado atual (bolinha em Conversas).
-- whatsapp_conexao_log: cada troca de estado (histórico em Ajustes).
-- Quem grava são as Edge Functions (service role): eventos "connection" do
-- webhook, verificação periódica, tela de Ajustes e falhas de envio.
-- =====================================================================

create table public.whatsapp_conexao (
  id            boolean primary key default true check (id),
  estado        text not null check (estado in ('online', 'conectando', 'offline')),
  desde         timestamptz not null default now(),  -- quando entrou nesse estado
  motivo        text,                                -- motivo da desconexão, quando a UAZAPI informa
  verificado_em timestamptz not null default now()   -- última vez que alguém conferiu
);

create table public.whatsapp_conexao_log (
  id      bigint generated always as identity primary key,
  estado  text not null check (estado in ('online', 'conectando', 'offline')),
  momento timestamptz not null default now(),
  motivo  text,
  origem  text   -- webhook | verificacao | ajustes | envio
);
create index whatsapp_conexao_log_momento_idx on public.whatsapp_conexao_log (momento desc);

alter table public.whatsapp_conexao enable row level security;
alter table public.whatsapp_conexao_log enable row level security;
create policy equipe_le on public.whatsapp_conexao for select to authenticated using (public.is_equipe());
create policy equipe_le on public.whatsapp_conexao_log for select to authenticated using (public.is_equipe());

-- A bolinha e o histórico atualizam na hora
alter publication supabase_realtime add table public.whatsapp_conexao, public.whatsapp_conexao_log;
