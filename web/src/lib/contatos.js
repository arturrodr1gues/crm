import { supabase } from "./supabase";

// Arquivos ficam em <contato_id>/... nesses buckets.
const BUCKETS = ["whatsapp-midia", "contas-luz"];

const emLotes = (lista, n = 100) =>
  Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

/**
 * Bloqueia (ou desbloqueia) o recebimento: o webhook passa a ignorar as mensagens
 * desses contatos e o CRM não envia nada para eles.
 */
export async function bloquearContatos(ids, bloquear = true) {
  const { error } = await supabase.rpc("bloquear_contatos", { p_ids: ids, p_bloquear: bloquear });
  if (error) throw new Error(bloquear ? "Não foi possível bloquear. Tente de novo." : "Não foi possível desbloquear. Tente de novo.");
}

async function arquivosDe(bucket, contatoId) {
  const { data } = await supabase.storage.from(bucket).list(contatoId, { limit: 1000 });
  return (data ?? []).filter((f) => f.id).map((f) => `${contatoId}/${f.name}`); // pastas vêm sem id
}

/**
 * Exclui os contatos com mensagens, venda no funil e arquivos.
 * Compromissos da agenda e indicações ficam, só sem o vínculo com o cliente.
 */
export async function excluirContatos(ids) {
  // Lista os arquivos antes, enquanto as mensagens ainda existem
  const porBucket = {};
  for (const bucket of BUCKETS) {
    porBucket[bucket] = (await Promise.all(ids.map((id) => arquivosDe(bucket, id)))).flat();
  }
  // Figurinha pode ter sido reaproveitada em outra conversa: essas ficam.
  const midia = porBucket["whatsapp-midia"];
  if (midia.length) {
    const emUso = new Set();
    for (const lote of emLotes(midia)) {
      const { data } = await supabase.from("mensagens").select("midia_path")
        .in("midia_path", lote).not("contato_id", "in", `(${ids.join(",")})`);
      (data ?? []).forEach((m) => emUso.add(m.midia_path));
    }
    porBucket["whatsapp-midia"] = midia.filter((p) => !emUso.has(p));
  }

  for (const lote of emLotes(ids)) {
    const { error } = await supabase.from("contatos").delete().in("id", lote);
    if (error) throw new Error("Não foi possível excluir. Tente de novo.");
  }

  // Os contatos já saíram; se algum arquivo não apagar, só sobra espaço ocupado.
  for (const [bucket, caminhos] of Object.entries(porBucket)) {
    for (const lote of emLotes(caminhos)) {
      const { error } = await supabase.storage.from(bucket).remove(lote);
      if (error) console.warn("arquivos não apagados", bucket, error);
    }
  }
}
