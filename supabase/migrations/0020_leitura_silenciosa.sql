-- =====================================================================
-- Leitura silenciosa (login de administrador)
-- Quem tem `leitura_silenciosa` abre as conversas só para acompanhar:
-- não zera o contador de não lidas e não manda o "visto" no WhatsApp.
-- O atendimento continua vendo as conversas como estavam.
-- =====================================================================

alter table public.equipe
  add column leitura_silenciosa boolean not null default false;

create or replace function public.leitura_silenciosa()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select leitura_silenciosa from public.equipe where user_id = auth.uid()), false) $$;

-- Trava no banco: mesmo que o navegador tente, essa conta não diminui o
-- contador. O webhook (service_role, sem auth.uid()) segue somando normalmente.
create or replace function public.preserva_nao_lidas()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.nao_lidas < old.nao_lidas and public.leitura_silenciosa() then
    new.nao_lidas := old.nao_lidas;
  end if;
  return new;
end $$;

create trigger contatos_preserva_nao_lidas
  before update of nao_lidas on public.contatos
  for each row execute function public.preserva_nao_lidas();
