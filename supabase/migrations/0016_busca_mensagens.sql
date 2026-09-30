-- =====================================================================
-- Busca por mensagens na página de Conversas
-- Índice de trigramas para o "contém" (ilike '%termo%') no texto das mensagens
-- continuar rápido com o histórico crescendo. (pg_trgm já está instalado no public.)
-- =====================================================================

create extension if not exists pg_trgm;

create index if not exists mensagens_texto_trgm_idx
  on public.mensagens using gin (texto gin_trgm_ops);
