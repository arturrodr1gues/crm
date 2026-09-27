import { supabase } from "./supabase";
import { formatarTelefone, soDigitos } from "./format";

// Dados de cada card, usados no quadro e na tabela do funil.
// Ganho e Perdido só dos últimos 30 dias, para o funil não crescer sem fim.
export function buscarOportunidades() {
  const corte = new Date(Date.now() - 30 * 86400000).toISOString();
  return supabase.from("oportunidades")
    .select("id, etapa, posicao, etapa_desde, proximo_followup, faixa_consumo, financiamento_status, motivo_perda, contato:contatos(id, nome, telefone, bairro, consumo_kwh, origem)")
    .or(`etapa.not.in.(fechado,perdido),etapa_desde.gte."${corte}"`)
    .order("posicao", { ascending: true, nullsFirst: false })
    .order("etapa_desde", { ascending: true });
}

export const semAcento = (t) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Busca por nome, bairro ou telefone (com ou sem máscara).
export function combina(o, termo) {
  if (!termo) return true;
  const c = o.contato;
  const digitos = soDigitos(termo);
  if (digitos.length >= 3 && soDigitos(c.telefone).includes(digitos)) return true;
  const t = semAcento(termo);
  return [c.nome, c.bairro, formatarTelefone(c.telefone)].some((v) => semAcento(v).includes(t));
}
