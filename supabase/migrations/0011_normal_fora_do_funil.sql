-- =====================================================================
-- Contato "Normal" não volta para o funil sozinho
-- Só entra no funil por ação de alguém da equipe ("Novo lead" na conversa ou
-- "Colocar no funil" na ficha). Inserções automáticas (webhook e outras
-- funções, que rodam sem usuário logado) são ignoradas para esses contatos.
-- =====================================================================

create or replace function public.bloquear_funil_normal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     and exists (select 1 from contatos where id = new.contato_id and tipo_contato = 'normal') then
    return null; -- descarta a inserção sem erro
  end if;
  return new;
end $$;

-- O nome começa com "0_b" para rodar antes dos outros gatilhos de oportunidades
-- (inclusive o que marca o contato como lead).
create trigger oportunidades_0_bloqueia_normal before insert on public.oportunidades
for each row execute function public.bloquear_funil_normal();
