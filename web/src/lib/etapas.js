import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ETAPAS, ETAPA_PERDIDO } from "./constantes";

// Colunas do funil vêm da tabela etapas_funil (editáveis no gerenciador).
// Enquanto não carregam (ou se a migration 0005 ainda não rodou), vale a lista fixa.
const PADRAO = [
  ...ETAPAS.map((e, i) => ({
    ...e,
    nome: e.id === "fechado" ? "Ganho" : e.nome,
    tipo: e.id === "fechado" ? "ganho" : "aberta",
    ordem: e.id === "fechado" ? 1000 : i + 1,
    cor: e.id === "fechado" ? "ok" : "sol",
    dias_alerta: e.id === "proposta" ? 3 : null,
  })),
  { ...ETAPA_PERDIDO, tipo: "perdido", ordem: 1001, cor: "alerta", dias_alerta: null },
];

// Cores disponíveis para as colunas (todas do tema, ver index.css)
export const CORES = [
  { id: "sol", nome: "Amarelo", classe: "bg-sol" },
  { id: "ok", nome: "Verde", classe: "bg-ok" },
  { id: "alerta", nome: "Vermelho", classe: "bg-alerta" },
  { id: "tinta", nome: "Azul escuro", classe: "bg-tinta" },
  { id: "tinta-suave", nome: "Cinza", classe: "bg-tinta-suave" },
];
export const classeCor = (id) => CORES.find((c) => c.id === id)?.classe ?? "bg-sol";

// O que pode aparecer em cada card
export const CAMPOS_CARD = [
  { id: "telefone", nome: "Telefone" },
  { id: "bairro", nome: "Bairro" },
  { id: "consumo", nome: "Consumo (kWh)" },
  { id: "faixa", nome: "Faixa de consumo" },
  { id: "origem", nome: "Origem (etiqueta de indicação)" },
  { id: "financiamento", nome: "Financiamento" },
  { id: "retorno", nome: "Próximo retorno" },
  { id: "dias_etapa", nome: "Dias na etapa" },
  { id: "avancar", nome: "Botão \"Avançar\"" },
];
export const CAMPOS_PADRAO = ["bairro", "consumo", "origem", "financiamento", "retorno", "dias_etapa", "avancar"];

// Ordem de exibição: abertas pela ordem escolhida, Ganho e Perdido sempre no fim.
const peso = { aberta: 0, ganho: 1, perdido: 2 };
export const ordenar = (lista) =>
  [...lista].sort((a, b) => peso[a.tipo] - peso[b.tipo] || a.ordem - b.ordem);

let cache = PADRAO;
const ouvintes = new Set();

function publicar(lista) {
  cache = ordenar(lista);
  ouvintes.forEach((f) => f(cache));
}

export async function carregarEtapas() {
  const { data, error } = await supabase.from("etapas_funil").select("*");
  if (!error && data?.length) publicar(data);
  return cache;
}

export function atualizarEtapasLocal(lista) { publicar(lista); }

let pedido = null;
export function useEtapas() {
  const [lista, setLista] = useState(cache);
  useEffect(() => {
    ouvintes.add(setLista);
    pedido ??= carregarEtapas();
    return () => ouvintes.delete(setLista);
  }, []);
  return lista;
}

export const nomeEtapa = (id) => cache.find((e) => e.id === id)?.nome ?? id;
export const tipoEtapa = (id) => cache.find((e) => e.id === id)?.tipo ?? "aberta";

// Move uma coluna aberta para a posição de outra (Ganho e Perdido ficam sempre no fim)
export async function reordenarAbertas(deId, paraId) {
  const abertas = cache.filter((e) => e.tipo === "aberta");
  const de = abertas.findIndex((e) => e.id === deId);
  let para = abertas.findIndex((e) => e.id === paraId);
  if (para < 0) para = abertas.length - 1; // soltou sobre Ganho/Perdido: vira a última aberta
  if (de < 0 || de === para) return;

  const nova = [...abertas];
  nova.splice(para, 0, nova.splice(de, 1)[0]);
  const renumeradas = nova.map((e, i) => ({ ...e, ordem: i + 1 }));
  const mudaram = renumeradas.filter((e) => abertas.find((a) => a.id === e.id).ordem !== e.ordem);
  publicar([...renumeradas, ...cache.filter((e) => e.tipo !== "aberta")]);
  const res = await Promise.all(mudaram.map((e) =>
    supabase.from("etapas_funil").update({ ordem: e.ordem }).eq("id", e.id)));
  if (res.some((r) => r.error)) await carregarEtapas();
}
