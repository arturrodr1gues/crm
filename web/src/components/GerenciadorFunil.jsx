import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../lib/supabase";
import {
  CAMPOS_CARD, CORES, atualizarEtapasLocal, carregarEtapas, classeCor, reordenarAbertas, useEtapas,
} from "../lib/etapas";
import { BotaoPrimario, Modal, Selecao } from "./ui";

// Controle do funil: colunas (nome, cor, ordem, alerta, excluir) e o que aparece em cada card.
export default function GerenciadorFunil({ campos, onCampos, contagem, onFechar, onCardsMovidos }) {
  const [aba, setAba] = useState("colunas");
  return (
    <Modal titulo="Gerenciar funil" onFechar={onFechar}>
      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-fundo mb-4">
        {[["colunas", "Colunas"], ["cards", "Conteúdo do card"]].map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`h-10 rounded-md text-sm font-medium ${aba === id ? "bg-superficie shadow-sm" : "text-tinta-suave"}`}>
            {nome}
          </button>
        ))}
      </div>
      {aba === "colunas"
        ? <Colunas contagem={contagem} onCardsMovidos={onCardsMovidos} />
        : <CamposCard campos={campos} onCampos={onCampos} />}
    </Modal>
  );
}

function Colunas({ contagem, onCardsMovidos }) {
  const etapas = useEtapas();
  const [erro, setErro] = useState("");
  const abertas = etapas.filter((e) => e.tipo === "aberta");
  const fixas = etapas.filter((e) => e.tipo !== "aberta");

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function salvar(id, dados) {
    setErro("");
    atualizarEtapasLocal(etapas.map((e) => (e.id === id ? { ...e, ...dados } : e)));
    const { error } = await supabase.from("etapas_funil").update(dados).eq("id", id);
    if (error) { setErro("Não deu para salvar. Tente de novo."); carregarEtapas(); }
  }

  async function excluir(etapa, destino) {
    setErro("");
    if (destino) {
      const { error } = await supabase.from("oportunidades").update({ etapa: destino }).eq("etapa", etapa.id);
      if (error) { setErro("Não deu para mover os cards. Nada foi excluído."); return; }
    }
    const { error } = await supabase.from("etapas_funil").delete().eq("id", etapa.id);
    if (error) { setErro("Não deu para excluir a coluna. Confira se ainda tem card nela."); await carregarEtapas(); }
    else atualizarEtapasLocal(etapas.filter((e) => e.id !== etapa.id));
    if (destino) onCardsMovidos();
  }

  async function criar(nome) {
    setErro("");
    const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "coluna";
    const nova = {
      id: `${base}_${Math.random().toString(36).slice(2, 6)}`,
      nome, tipo: "aberta", cor: "sol", dias_alerta: null,
      ordem: Math.max(0, ...abertas.map((e) => e.ordem)) + 1,
    };
    const { data, error } = await supabase.from("etapas_funil").insert(nova).select().single();
    if (error) { setErro("Não deu para criar a coluna."); return false; }
    atualizarEtapasLocal([...etapas, data]);
    return true;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-tinta-suave">
        Arraste pela alça para mudar a ordem (aqui ou direto no quadro). As alterações são salvas na hora.
      </p>

      <DndContext sensors={sensores} collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => over && active.id !== over.id && reordenarAbertas(active.id, over.id)}>
        <SortableContext items={abertas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {abertas.map((e) => (
              <LinhaColuna key={e.id} etapa={e} cards={contagem[e.id]?.length ?? 0}
                destinos={etapas.filter((x) => x.id !== e.id)} onSalvar={salvar} onExcluir={excluir} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <NovaColuna onCriar={criar} />

      <div>
        <h3 className="text-sm font-semibold mb-1">Colunas padrão</h3>
        <p className="text-xs text-tinta-suave mb-2">Ficam sempre no fim do funil e não podem ser excluídas. Dá para mudar o nome e a cor.</p>
        <ul className="space-y-2">
          {fixas.map((e) => <LinhaColuna key={e.id} etapa={e} fixa onSalvar={salvar} />)}
        </ul>
      </div>

      {erro && <p role="alert" className="text-sm text-alerta">{erro}</p>}
    </div>
  );
}

function LinhaColuna({ etapa, fixa, cards = 0, destinos = [], onSalvar, onExcluir }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: etapa.id, disabled: fixa });
  const [nome, setNome] = useState(etapa.nome);
  const [dias, setDias] = useState(etapa.dias_alerta ?? "");
  const [excluindo, setExcluindo] = useState(false);
  const [destino, setDestino] = useState("");
  useEffect(() => setNome(etapa.nome), [etapa.nome]);
  useEffect(() => setDias(etapa.dias_alerta ?? ""), [etapa.dias_alerta]);

  function salvarNome() {
    const limpo = nome.trim();
    if (!limpo) { setNome(etapa.nome); return; }
    if (limpo !== etapa.nome) onSalvar(etapa.id, { nome: limpo });
  }
  function salvarDias() {
    const n = parseInt(dias, 10);
    const valor = n > 0 ? n : null;
    setDias(valor ?? "");
    if (valor !== etapa.dias_alerta) onSalvar(etapa.id, { dias_alerta: valor });
  }

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl border border-linha bg-superficie p-3 ${isDragging ? "relative z-10 shadow-lg" : ""}`}>
      <div className="flex items-center gap-2">
        {fixa ? (
          <span className="h-10 w-8 grid place-items-center text-tinta-suave" title="Coluna padrão">
            <IconeCadeado className="w-4 h-4" />
          </span>
        ) : (
          <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
            aria-label={`Arrastar coluna ${etapa.nome}`}
            className="h-10 w-8 grid place-items-center text-tinta-suave cursor-grab active:cursor-grabbing touch-none">
            <IconeAlca className="w-5 h-5" />
          </button>
        )}
        <input value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarNome}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label="Nome da coluna" maxLength={40}
          className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-linha bg-fundo text-base font-medium" />
        {!fixa && (
          <button type="button" onClick={() => setExcluindo(!excluindo)} aria-label={`Excluir coluna ${etapa.nome}`}
            className={`h-10 w-10 grid place-items-center rounded-lg ${excluindo ? "bg-alerta/10 text-alerta" : "text-tinta-suave hover:bg-fundo"}`}>
            <IconeLixeira className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 pl-10">
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Cor da coluna">
          {CORES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={etapa.cor === c.id} aria-label={c.nome} title={c.nome}
              onClick={() => etapa.cor !== c.id && onSalvar(etapa.id, { cor: c.id })}
              className={`h-6 w-6 rounded-full ${c.classe} ${etapa.cor === c.id ? "ring-2 ring-offset-2 ring-tinta" : ""}`} />
          ))}
        </div>
        {etapa.tipo === "aberta" && (
          <label className="flex items-center gap-2 text-sm text-tinta-suave">
            Alerta após
            <input type="number" min="1" inputMode="numeric" value={dias} placeholder="—"
              onChange={(e) => setDias(e.target.value)} onBlur={salvarDias}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-16 h-9 px-2 rounded-lg border border-linha bg-fundo text-base text-tinta" />
            dias parado
          </label>
        )}
      </div>

      {excluindo && (
        <div className="mt-3 ml-10 p-3 rounded-lg bg-alerta/5 border border-alerta/30 space-y-2">
          {cards > 0 ? (
            <>
              <p className="text-sm">
                Essa coluna tem <strong>{cards} {cards === 1 ? "card" : "cards"}</strong>. Para onde eles vão?
              </p>
              <Selecao variante="compacto" opcoes={destinos} vazio="Escolha a coluna" value={destino}
                onChange={(e) => setDestino(e.target.value)} aria-label="Mover cards para" />
            </>
          ) : (
            <p className="text-sm">Excluir a coluna “{etapa.nome}”? Ela está vazia.</p>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={cards > 0 && !destino} onClick={() => onExcluir(etapa, cards > 0 ? destino : null)}
              className="h-10 px-4 rounded-lg bg-alerta text-white font-semibold text-sm disabled:opacity-50">
              {cards > 0 ? "Mover e excluir" : "Excluir coluna"}
            </button>
            <button type="button" onClick={() => setExcluindo(false)}
              className="h-10 px-4 rounded-lg border border-linha bg-superficie text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </li>
  );
}

function NovaColuna({ onCriar }) {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function enviar(e) {
    e.preventDefault();
    const limpo = nome.trim();
    if (!limpo) return;
    setSalvando(true);
    if (await onCriar(limpo)) setNome("");
    setSalvando(false);
  }
  return (
    <form onSubmit={enviar} className="flex gap-2">
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da nova coluna" maxLength={40}
        aria-label="Nome da nova coluna"
        className="flex-1 min-w-0 h-12 px-3 rounded-lg border border-linha bg-fundo text-base" />
      <BotaoPrimario disabled={salvando || !nome.trim()}>Adicionar</BotaoPrimario>
    </form>
  );
}

function CamposCard({ campos, onCampos }) {
  const [erro, setErro] = useState("");

  async function alternar(id) {
    setErro("");
    const novos = campos.includes(id) ? campos.filter((c) => c !== id) : [...campos, id];
    const anteriores = campos;
    onCampos(novos);
    const { error } = await supabase.from("funil_config").upsert({ id: 1, campos_card: novos });
    if (error) { onCampos(anteriores); setErro("Não deu para salvar. Tente de novo."); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-tinta-suave">
        Escolha o que aparece em cada card do funil. O nome do cliente aparece sempre.
      </p>
      <ul className="divide-y divide-linha rounded-xl border border-linha bg-superficie">
        {CAMPOS_CARD.map((c) => (
          <li key={c.id}>
            <label className="flex items-center justify-between gap-3 px-4 h-12 cursor-pointer">
              <span>{c.nome}</span>
              <input type="checkbox" checked={campos.includes(c.id)} onChange={() => alternar(c.id)}
                className="h-5 w-5 accent-[var(--color-sol)]" />
            </label>
          </li>
        ))}
      </ul>
      {erro && <p role="alert" className="text-sm text-alerta">{erro}</p>}
    </div>
  );
}

export function IconeAlca(p) {
  return (<svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>);
}
export function IconeCadeado(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>);
}
function IconeLixeira(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>);
}
