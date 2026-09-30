// Situação da conexão com o WhatsApp: estado atual (bolinha em Conversas) e
// histórico de trocas (Ajustes). Só grava no histórico quando o estado muda.

import { admin } from "./config.ts";

export type EstadoConexao = "online" | "conectando" | "offline";

/** Status da UAZAPI (connected, connecting, disconnected, hibernated...) → estado do CRM. */
export const estadoDe = (status?: string | null): EstadoConexao =>
  status === "connected" ? "online" : status === "connecting" ? "conectando" : "offline";

/** Data que a UAZAPI manda (segundos, milissegundos ou texto) → ISO; inválida vira null. */
function dataDe(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  const d = Number.isFinite(n) && n > 0 ? new Date(n > 1e12 ? n : n * 1000) : new Date(String(v));
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 60_000 ? null : d.toISOString();
}

/**
 * Registra o estado. `momento` é quando aconteceu (ex.: hora da desconexão que a UAZAPI
 * informa); sem ele, vale agora. Mesmo estado de antes só atualiza a hora da verificação.
 */
export async function registrarConexao(
  estado: EstadoConexao, origem: string, opts: { motivo?: string | null; momento?: unknown } = {},
) {
  try {
    const agora = new Date().toISOString();
    const { data: atual } = await admin.from("whatsapp_conexao").select("estado").eq("id", true).maybeSingle();
    if (atual?.estado === estado) {
      if (origem !== "webhook") await admin.from("whatsapp_conexao").update({ verificado_em: agora }).eq("id", true);
      return;
    }
    const desde = (estado === "offline" ? dataDe(opts.momento) : null) ?? agora;
    const motivo = estado === "offline" ? opts.motivo ?? null : null;
    await admin.from("whatsapp_conexao").upsert({ id: true, estado, desde, motivo, verificado_em: agora });
    await admin.from("whatsapp_conexao_log").insert({ estado, momento: desde, motivo, origem });
  } catch (e) {
    console.warn("registrar conexão", e); // nunca atrapalha o fluxo principal
  }
}

/** Erro da UAZAPI que significa "o WhatsApp caiu" (ex.: 503 "WhatsApp disconnected"). */
export const erroDeDesconexao = (e: unknown) =>
  /disconnected|not connected|desconectad/i.test(String((e as Error)?.message ?? e));
