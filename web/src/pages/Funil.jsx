import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ETAPAS, DIAS_ALERTA_PROPOSTA } from "../lib/constantes";
import { dataCurta, diasDesde, inicioDoDia, nomeOuTelefone } from "../lib/format";

export default function Funil() {
  const [ops, setOps] = useState(null);
  const [arrastando, setArrastando] = useState(null);

  async function carregar() {
    // Fechados só dos últimos 30 dias, para o quadro não crescer sem fim
    const corte = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabase.from("oportunidades")
      .select("id, etapa, etapa_desde, proximo_followup, faixa_consumo, financiamento_status, fechado_em, contato:contatos(id, nome, telefone, bairro, consumo_kwh, origem)")
      .neq("etapa", "perdido")
      .or(`etapa.neq.fechado,fechado_em.gte."${corte}"`)
      .order("etapa_desde", { ascending: true });
    setOps(data ?? []);
  }

  useEffect(() => { carregar(); }, []);

  async function mover(id, etapa) {
    setOps((lista) => lista.map((o) => (o.id === id ? { ...o, etapa, etapa_desde: new Date().toISOString() } : o)));
    const { error } = await supabase.from("oportunidades").update({ etapa }).eq("id", id);
    if (error) carregar();
  }

  if (!ops) return <div className="p-6 text-tinta-suave">Carregando…</div>;

  return (
    <div className="pt-6">
      <header className="px-4 md:px-8 mb-4">
        <h1 className="text-3xl font-bold">Funil</h1>
        <p className="text-tinta-suave">{ops.filter((o) => o.etapa !== "fechado").length} negociações em andamento</p>
      </header>

      <div className="flex gap-3 overflow-x-auto px-4 md:px-8 pb-4 snap-x snap-mandatory md:snap-none overscroll-x-contain">
        {ETAPAS.map((etapa, idx) => {
          const cards = ops.filter((o) => o.etapa === etapa.id);
          return (
            <section key={etapa.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (arrastando) mover(arrastando, etapa.id); setArrastando(null); }}
              className="snap-start shrink-0 w-[82vw] sm:w-72 bg-superficie/60 rounded-2xl border border-linha flex flex-col max-h-[calc(100vh-11rem)]">
              <div className="p-3 pb-2">
                {/* Régua de progresso: mostra onde a etapa está no caminho até o fechamento */}
                <div className="flex gap-1 mb-2" aria-hidden="true">
                  {ETAPAS.map((_, i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-sol" : "bg-linha"}`} />
                  ))}
                </div>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold">{etapa.nome}</h2>
                  <span className="text-sm text-tinta-suave">{cards.length}</span>
                </div>
              </div>
              <ul className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {cards.map((o) => (
                  <Cartao key={o.id} o={o} idx={idx} onMover={mover} onArrastar={setArrastando} />
                ))}
                {cards.length === 0 && <li className="text-sm text-tinta-suave py-4 text-center">Vazio</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Cartao({ o, idx, onMover, onArrastar }) {
  const c = o.contato;
  const dias = diasDesde(o.etapa_desde);
  const parada = o.etapa === "proposta" && dias >= DIAS_ALERTA_PROPOSTA;
  const retornoAtrasado = o.proximo_followup && new Date(o.proximo_followup) < inicioDoDia();
  const proxima = ETAPAS[idx + 1];

  return (
    <li draggable onDragStart={() => onArrastar(o.id)} onDragEnd={() => onArrastar(null)}
      className="bg-superficie rounded-xl border border-linha p-3 cursor-grab active:cursor-grabbing">
      <Link to={`/contatos/${c.id}`} draggable={false} className="block">
        <div className="font-medium truncate">{nomeOuTelefone(c)}</div>
        <div className="text-sm text-tinta-suave mt-0.5">
          {[c.bairro, c.consumo_kwh && `${c.consumo_kwh} kWh`].filter(Boolean).join(", ") || "Sem conta de luz ainda"}
        </div>
      </Link>
      <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
        {c.origem === "indicacao" && <Etiqueta>Indicação</Etiqueta>}
        {o.financiamento_status === "em_analise" && <Etiqueta>Financiamento em análise</Etiqueta>}
        {o.financiamento_status === "recusado" && <Etiqueta cor="alerta">Financiamento recusado</Etiqueta>}
        {retornoAtrasado && <Etiqueta cor="alerta">Retorno atrasado</Etiqueta>}
        {o.proximo_followup && !retornoAtrasado && <Etiqueta>Retorno {dataCurta(o.proximo_followup)}</Etiqueta>}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className={`text-xs ${parada ? "text-alerta font-semibold" : "text-tinta-suave"}`}>
          {dias === 0 ? "Hoje nesta etapa" : `${dias} ${dias === 1 ? "dia" : "dias"} nesta etapa`}
        </span>
        {proxima && (
          <button onClick={() => onMover(o.id, proxima.id)}
            className="text-xs font-semibold px-2.5 h-8 rounded-lg bg-fundo hover:bg-linha">
            Avançar
          </button>
        )}
      </div>
    </li>
  );
}

function Etiqueta({ children, cor }) {
  return (
    <span className={`px-2 py-0.5 rounded-full ${cor === "alerta" ? "bg-alerta/10 text-alerta" : "bg-fundo text-tinta-suave"}`}>
      {children}
    </span>
  );
}
