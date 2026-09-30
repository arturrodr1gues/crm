-- =====================================================================
-- Mensagens que chegavam "estranhas" no chat
-- - Aviso de álbum ("Album: 2 images"): o WhatsApp manda antes das fotos de
--   um álbum, que chegam cada uma como mensagem própria. Não é mensagem de
--   verdade; o webhook passou a ignorar. Aqui saem os que já foram gravados.
-- - Localização: vinha sem texto. Vira um link do Google Maps.
-- =====================================================================

delete from public.mensagens
 where raw->'message'->>'messageType' = 'AlbumMessage';

update public.mensagens
   set texto = '📍 Localização' || chr(10) || 'https://maps.google.com/?q='
               || (raw->'message'->'content'->>'degreesLatitude') || ','
               || (raw->'message'->'content'->>'degreesLongitude')
 where raw->'message'->>'messageType' = 'LocationMessage'
   and texto is null
   and raw->'message'->'content' ? 'degreesLatitude';
