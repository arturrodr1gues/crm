-- =====================================================================
-- Mover card no funil voltava a dar erro de RLS em historico_etapas:
-- o gatilho que registra a mudança rodava com as permissões de quem moveu
-- o card, e a tabela de histórico só aceita leitura pelo app.
-- O gatilho passa a rodar como dono (security definer). Continua fora da
-- API pública (EXECUTE revogado na 0021).
-- =====================================================================

alter function public.registrar_mudanca_etapa() security definer;
