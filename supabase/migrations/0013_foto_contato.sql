-- =====================================================================
-- Foto de perfil do WhatsApp
-- A foto é copiada para o Storage (o link do WhatsApp expira) em
-- whatsapp-midia/<contato_id>/perfil-<momento>.jpg, então excluir o contato
-- apaga a foto junto. foto_em diz quando foi buscada pela última vez
-- (com ou sem foto), para não perguntar ao WhatsApp a toda hora.
-- =====================================================================

alter table public.contatos
  add column foto_path text,
  add column foto_em   timestamptz;
