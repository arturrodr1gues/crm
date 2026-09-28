import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------
// Configuração de SLA e follow-up (tabela atendimento_config, uma linha)
// ---------------------------------------------------------------------
export const CONFIG_PADRAO = { sla_resposta_min: 60, followup_horas: 12, followup_resposta_id: null };

let cache = null;
let pedido = null;
const ouvintes = new Set();

export async function recarregarConfig() {
  const { data } = await supabase.from("atendimento_config")
    .select("sla_resposta_min, followup_horas, followup_resposta_id").maybeSingle();
  cache = { ...CONFIG_PADRAO, ...(data ?? {}) };
  ouvintes.forEach((f) => f(cache));
  return cache;
}

/** Configuração do atendimento, compartilhada entre as telas (carrega uma vez). */
export function useAtendimentoConfig() {
  const [config, setConfig] = useState(cache ?? CONFIG_PADRAO);
  useEffect(() => {
    ouvintes.add(setConfig);
    if (!cache) { pedido ??= recarregarConfig(); pedido.then(setConfig); }
    return () => { ouvintes.delete(setConfig); };
  }, []);
  return config;
}

/** Hora atual que se atualiza sozinha (padrão: a cada minuto), para os contadores de tempo. */
export function useAgora(intervaloMs = 60_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

// ---------------------------------------------------------------------
// Mensagens rápidas com o nome do contato
// ---------------------------------------------------------------------
export const VARIAVEIS = [
  { chave: "{primeiro_nome}", descricao: "Primeiro nome", exemplo: "Maria" },
  { chave: "{nome}", descricao: "Nome completo", exemplo: "Maria Souza" },
];

/**
 * Troca {nome} e {primeiro_nome} pelo nome do contato. Sem nome cadastrado,
 * tira a variável sem deixar vírgula sobrando ("Oi, {primeiro_nome}!" vira "Oi!").
 */
export function aplicarVariaveis(texto, contato) {
  const nome = (contato?.is_grupo ? "" : contato?.nome ?? "").trim();
  const primeiro = nome.split(/\s+/)[0] ?? "";
  const trocar = (t, chave, valor) => {
    if (valor) return t.split(chave).join(valor);
    // Some com a variável e a pontuação em volta: "Oi, {x}!" → "Oi!", "Oi, {x}, tudo" → "Oi, tudo"
    const re = new RegExp(`,?\\s*${chave.replace(/[{}]/g, "\\$&")}\\s*,?`, "g");
    return t.replace(re, (m) => {
      if (m.startsWith(",")) return m.endsWith(",") ? "," : "";
      return /^\s/.test(m) ? " " : "";
    });
  };
  const r = trocar(trocar(texto, "{primeiro_nome}", primeiro), "{nome}", nome).trim();
  // Sem nome no começo da frase: "{primeiro_nome}, para eu..." vira "Para eu..."
  return nome ? r : r.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------
// SLA e follow-up de uma conversa
// ---------------------------------------------------------------------
const MIN = 60_000;

/**
 * - sla: o cliente escreveu e ainda não respondemos. `critico` depois do limite configurado.
 * - followup: respondemos e o cliente está sem retorno há mais que o limite.
 * Só vale para leads: grupos, conversas normais, não classificadas e fechadas ficam de fora.
 */
export function estadoAtendimento(contato, config, agora = Date.now()) {
  if (!contato || contato.is_grupo || contato.bloqueado || contato.conversa_fechada || contato.tipo_contato !== "lead") return { sla: null, followup: null };
  const esperaMin = contato.aguardando_resposta_desde
    ? Math.max(0, Math.floor((agora - new Date(contato.aguardando_resposta_desde)) / MIN)) : null;
  const semRetornoMin = contato.aguardando_cliente_desde
    ? Math.max(0, Math.floor((agora - new Date(contato.aguardando_cliente_desde)) / MIN)) : null;
  return {
    sla: esperaMin === null ? null : { minutos: esperaMin, critico: esperaMin >= config.sla_resposta_min },
    followup: semRetornoMin !== null && semRetornoMin >= config.followup_horas * 60 ? { minutos: semRetornoMin } : null,
  };
}

/** "12 min", "1h 20", "3h", "2 dias" */
export function duracaoCurta(minutos) {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 24 * 60) {
    const h = Math.floor(minutos / 60), m = minutos % 60;
    return m ? `${h}h ${String(m).padStart(2, "0")}` : `${h}h`;
  }
  const d = Math.floor(minutos / (24 * 60));
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}
