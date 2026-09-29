// Foto de perfil do WhatsApp: o link expira, então a foto é copiada para o Storage
// em whatsapp-midia/<contato_id>/perfil-<momento>.jpg (excluir o contato apaga junto).

import { admin } from "./config.ts";

// Foto é buscada de novo depois desse tempo (a pessoa pode ter trocado).
export const VALIDADE_FOTO_MS = 3 * 24 * 3600 * 1000;

export const fotoVencida = (c: { foto_em?: string | null }) =>
  !c.foto_em || Date.now() - new Date(c.foto_em).getTime() > VALIDADE_FOTO_MS;

/**
 * Baixa a foto do link do WhatsApp e grava no contato. `url` null = contato sem foto
 * (ou escondida pela privacidade). Devolve false se não deu para baixar; aí o contato
 * não é marcado como atualizado e tenta de novo na próxima vez.
 */
export async function salvarFotoPerfil(
  c: { id: string; foto_path?: string | null },
  url: string | null,
  extra: Record<string, unknown> = {},
) {
  let foto_path: string | null = null;
  if (url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const foto = await res.blob();
      // Nome novo a cada troca: o navegador não fica mostrando a foto antiga do cache
      foto_path = `${c.id}/perfil-${Date.now()}.jpg`;
      const { error } = await admin.storage.from("whatsapp-midia")
        .upload(foto_path, foto, { contentType: res.headers.get("content-type") ?? "image/jpeg", upsert: true });
      if (error) throw error;
    } catch (e) {
      console.warn("foto de perfil: download", c.id, e);
      if (Object.keys(extra).length) await admin.from("contatos").update(extra).eq("id", c.id);
      return false;
    }
  }
  await admin.from("contatos").update({ ...extra, foto_path, foto_em: new Date().toISOString() }).eq("id", c.id);
  if (c.foto_path && c.foto_path !== foto_path) {
    await admin.storage.from("whatsapp-midia").remove([c.foto_path]);
  }
  return true;
}

/** Último link de foto que chegou num webhook desse chat (serve enquanto não expira). */
export async function fotoDoUltimoWebhook(contatoId: string, chat: string | null) {
  const { data } = await admin.from("mensagens").select("raw").eq("contato_id", contatoId)
    .not("raw->chat->>imagePreview", "is", null).order("momento", { ascending: false }).limit(5);
  for (const m of data ?? []) {
    const ch = (m.raw as any)?.chat;
    if (chat && ch?.wa_chatid && ch.wa_chatid !== chat) continue;
    const url = ch?.imagePreview || ch?.image;
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return null;
}
