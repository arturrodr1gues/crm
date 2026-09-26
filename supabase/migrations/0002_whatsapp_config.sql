-- =====================================================================
-- Configuração da UAZAPI feita pela tela de Configurações do CRM
-- =====================================================================

-- Linha única. O token nunca vai para o navegador: RLS ligado e sem
-- nenhuma policy, então só as Edge Functions (service_role) leem e gravam.
create table public.whatsapp_config (
  id              boolean primary key default true check (id),
  uazapi_url      text not null,
  uazapi_token    text not null,
  webhook_secret  text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at      timestamptz not null default now()
);

alter table public.whatsapp_config enable row level security;

create trigger whatsapp_config_updated_at before update on public.whatsapp_config
for each row execute function public.set_updated_at();
