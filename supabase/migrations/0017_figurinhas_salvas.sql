-- =====================================================================
-- Figurinhas salvas
-- A equipe salva figurinhas recebidas (ou sobe do computador) e envia a
-- partir do painel de figurinhas. O arquivo é copiado para
-- whatsapp-midia/figurinhas/, então continua lá mesmo se o contato de onde
-- ela veio for excluído.
-- =====================================================================

create table public.figurinhas_salvas (
  id          uuid primary key default gen_random_uuid(),
  midia_path  text not null unique,
  mime        text,
  origem_path text,   -- arquivo da mensagem de onde foi salva (evita salvar a mesma duas vezes)
  criado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index figurinhas_salvas_origem_idx on public.figurinhas_salvas (origem_path) where origem_path is not null;

alter table public.figurinhas_salvas enable row level security;
create policy equipe_all on public.figurinhas_salvas for all to authenticated
  using (public.is_equipe()) with check (public.is_equipe());
