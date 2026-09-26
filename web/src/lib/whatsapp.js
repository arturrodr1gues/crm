import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Mesmo limite do bucket 'whatsapp-midia'.
export const LIMITE_MIDIA = 30 * 1024 * 1024;

/** Chama a Edge Function whatsapp-send e devolve o JSON; erro vira Error com a mensagem do servidor. */
export async function chamarWhatsapp(body) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", { body });
  if (error) {
    let msg = "Não foi possível falar com o WhatsApp.";
    try { msg = (await error.context.json()).error ?? msg; } catch { /* mantém padrão */ }
    throw new Error(msg);
  }
  return data;
}

/** Tipo de mensagem pelo arquivo. Vídeo que não é MP4 vai como documento (o WhatsApp só toca MP4). */
export function tipoDoArquivo(file) {
  const t = file.type || "";
  if (t.startsWith("image/")) return "imagem";
  if (t === "video/mp4") return "video";
  if (t.startsWith("audio/")) return "audio";
  return "documento";
}

const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "image/jpeg": "jpg" };

/** Sobe o arquivo para a pasta da conversa e devolve o caminho no Storage. */
export async function subirMidia(contatoId, file) {
  if (file.size > LIMITE_MIDIA) throw new Error("O arquivo passa de 30 MB.");
  const mime = (file.type || "application/octet-stream").split(";")[0];
  const ext = file.name?.match(/\.(\w{1,8})$/)?.[1]?.toLowerCase() ?? EXT[mime] ?? mime.split("/")[1] ?? "bin";
  const path = `${contatoId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("whatsapp-midia").upload(path, file, { contentType: mime });
  if (error) throw new Error("Não foi possível subir o arquivo.");
  return { path, mime };
}

// Links assinados valem 1 hora; guarda por 50 minutos para não pedir de novo a cada render.
const cache = new Map();

export function useUrlMidia(path, nomeDownload) {
  const chave = path ? `${path}|${nomeDownload ?? ""}` : null;
  const [url, setUrl] = useState(() => (chave && cache.get(chave)?.expira > Date.now() ? cache.get(chave).url : null));

  useEffect(() => {
    if (!chave) { setUrl(null); return; }
    const salvo = cache.get(chave);
    if (salvo?.expira > Date.now()) { setUrl(salvo.url); return; }
    let ativo = true;
    supabase.storage.from("whatsapp-midia")
      .createSignedUrl(path, 3600, nomeDownload ? { download: nomeDownload } : undefined)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        cache.set(chave, { url: data.signedUrl, expira: Date.now() + 50 * 60 * 1000 });
        if (ativo) setUrl(data.signedUrl);
      });
    return () => { ativo = false; };
  }, [chave]);

  return url;
}

export function tamanhoLegivel(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Texto curto de uma mensagem, para citação e resumo. */
export function rotuloMensagem(m) {
  if (!m) return "Mensagem";
  if (m.apagada) return "Mensagem apagada";
  const r = {
    imagem: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", documento: "📄 " + (m.midia_nome || "Arquivo"),
    figurinha: "💟 Figurinha", contato: "👤 Contato", enquete: "📊 Enquete",
  }[m.tipo];
  if (m.tipo === "texto" || !r) return m.texto || `[${m.tipo}]`;
  return m.texto && m.tipo !== "documento" ? `${r}: ${m.texto}` : r;
}
