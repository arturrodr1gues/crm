import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Figurinhas salvas pela equipe. O arquivo fica em whatsapp-midia/figurinhas/
// (fora da pasta do contato), então não some se o contato for excluído.
const BUCKET = "whatsapp-midia";
const MUDOU = "crm-figurinhas-mudaram";
const avisar = () => window.dispatchEvent(new Event(MUDOU));

const extensao = (path, mime) => path?.match(/\.(\w{1,5})$/)?.[1] ?? (mime?.split("/")[1] || "webp");

/** Lista das figurinhas salvas, mais novas primeiro; atualiza quando alguém salva ou remove. */
export function useFigurinhasSalvas() {
  const [lista, setLista] = useState(null);
  useEffect(() => {
    const carregar = () => supabase.from("figurinhas_salvas").select("id, midia_path, mime, origem_path")
      .order("created_at", { ascending: false }).then(({ data }) => setLista(data ?? []));
    carregar();
    window.addEventListener(MUDOU, carregar);
    return () => window.removeEventListener(MUDOU, carregar);
  }, []);
  return lista;
}

/** A figurinha dessa mensagem já está salva? */
export async function figurinhaJaSalva(origemPath) {
  const { count } = await supabase.from("figurinhas_salvas").select("id", { count: "exact", head: true })
    .eq("origem_path", origemPath);
  return (count ?? 0) > 0;
}

/** Salva a figurinha de uma mensagem (copia o arquivo). */
export async function salvarFigurinhaDaMensagem(m) {
  if (!m.midia_path) throw new Error("Essa figurinha ainda não terminou de baixar.");
  const destino = `figurinhas/${crypto.randomUUID()}.${extensao(m.midia_path, m.midia_mime)}`;
  const { error: erroCopia } = await supabase.storage.from(BUCKET).copy(m.midia_path, destino);
  if (erroCopia) throw new Error("Não foi possível salvar a figurinha.");
  const { error } = await supabase.from("figurinhas_salvas")
    .insert({ midia_path: destino, mime: m.midia_mime ?? "image/webp", origem_path: m.midia_path });
  if (error) {
    await supabase.storage.from(BUCKET).remove([destino]);
    if (error.code === "23505") return; // já estava salva
    throw new Error("Não foi possível salvar a figurinha.");
  }
  avisar();
}

/** Sobe uma imagem do computador direto para as figurinhas salvas (sem enviar). */
export async function subirFigurinha(arquivo) {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha uma imagem.");
  if (arquivo.size > 1024 * 1024) throw new Error("A figurinha precisa ter até 1 MB.");
  const destino = `figurinhas/${crypto.randomUUID()}.${extensao(arquivo.name, arquivo.type)}`;
  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(destino, arquivo, { contentType: arquivo.type });
  if (erroUpload) throw new Error("Não foi possível subir a figurinha.");
  const { error } = await supabase.from("figurinhas_salvas").insert({ midia_path: destino, mime: arquivo.type });
  if (error) throw new Error("Não foi possível salvar a figurinha.");
  avisar();
}

/** Tira das salvas. O arquivo só é apagado se nenhuma mensagem enviada usa ele. */
export async function removerFigurinha(f) {
  const { error } = await supabase.from("figurinhas_salvas").delete().eq("id", f.id);
  if (error) throw new Error("Não foi possível remover a figurinha.");
  const { count } = await supabase.from("mensagens").select("id", { count: "exact", head: true })
    .eq("midia_path", f.midia_path);
  if (!count) await supabase.storage.from(BUCKET).remove([f.midia_path]);
  avisar();
}
