import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  closestCenter, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../lib/supabase";
import { FAIXAS } from "../lib/constantes";
import { CAMPOS_PADRAO, carregarEtapas, classeCor, reordenarAbertas, tipoEtapa, useEtapas } from "../lib/etapas";
import { dataCurta, diasDesde, formatarTelefone, inicioDoDia, nomeOuTelefone } from "../lib/format";
import { buscarOportunidades, combina } from "../lib/funil";
import { BotaoPrimario, BotaoSecundario, Campo, Entrada, Modal } from "../components/ui";
import GerenciadorFunil, { IconeAlca, IconeCadeado } from "../components/GerenciadorFunil";
import VisaoFunil from "../components/VisaoFunil";

// Depois de arrastar, o navegador ainda dispara um clique no card: esse clique não deve abrir a conversa.
let ultimoArraste = 0;

export default function Funil() {
  const etapas = useEtapas();
  const [ops, setOps] = useState(null);          // id -> oportunidade
  const [colunas, setColunas] = useState({});    // etapa -> ids na ordem do quadro
  const [campos, setCampos] = useState(CAMPOS_PADRAO);
  const [busca, setBusca] = useState("");
  const [gerenciar, setGerenciar] = useState(false);
  const [ativo, setAtivo] = useState(null);      // o que está sendo arrastado
  const [perda, setPerda] = useState(null);      // card que acabou de ir para Perdido
  const inicioArraste = useRef(null);

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // No celular: segure o card por um instante para arrastar; o toque rápido continua rolando a tela.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function carregar() {
    const [{ data }, { data: cfg }, lista] = await Promise.all([
      buscarOportunidades(),
      supabase.from("funil_config").select("campos_card").maybeSingle(),
      carregarEtapas(),
    ]);
    const mapa = {};
    const grupos = Object.fromEntries(lista.map((e) => [e.id, []]));
    (data ?? []).forEach((o) => { mapa[o.id] = o; grupos[o.etapa]?.push(o.id); });
    setOps(mapa);
    setColunas(grupos);
    if (cfg?.campos_card) setCampos(cfg.campos_card);
  }

  useEffect(() => { carregar(); }, []);

  // Coluna criada no gerenciador aparece vazia na hora
  useEffect(() => {
    setColunas((c) => {
      if (etapas.every((e) => c[e.id])) return c;
      const n = { ...c };
      etapas.forEach((e) => { n[e.id] ??= []; });
      return n;
    });
  }, [etapas]);

  const colunaDe = (id) => {
    if (id == null) return null;
    if (String(id).startsWith("area:")) return String(id).slice(5);
    return Object.keys(colunas).find((k) => colunas[k].includes(id)) ?? null;
  };

  // Arrastando coluna: só colide com colunas. Arrastando card: prefere outro card, senão a área da coluna.
  function colisao(args) {
    const tipo = args.active.data.current?.tipo;
    if (tipo === "coluna") {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.tipo === "coluna") });
    }
    const alvos = args.droppableContainers.filter((c) => c.data.current?.tipo !== "coluna");
    const dentro = pointerWithin({ ...args, droppableContainers: alvos });
    if (dentro.length) {
      const cards = dentro.filter((c) => c.data?.droppableContainer?.data.current?.tipo === "card");
      return cards.length ? cards : dentro;
    }
    return rectIntersection({ ...args, droppableContainers: alvos });
  }

  function aoComecar({ active }) {
    setAtivo(active.data.current);
    inicioArraste.current = { colunas, etapa: colunaDe(active.id) };
  }

  function aoPassar({ active, over }) {
    if (active.data.current?.tipo !== "card" || !over) return;
    const de = colunaDe(active.id);
    const para = colunaDe(over.id);
    if (!de || !para || de === para) return;
    setColunas((c) => {
      const alvo = c[para].filter((x) => x !== active.id);
      const i = String(over.id).startsWith("area:") ? alvo.length : Math.max(0, alvo.indexOf(over.id));
      alvo.splice(i, 0, active.id);
      return { ...c, [de]: c[de].filter((x) => x !== active.id), [para]: alvo };
    });
  }

  function aoSoltar({ active, over }) {
    const tipo = active.data.current?.tipo;
    setAtivo(null);
    ultimoArraste = Date.now();
    if (!over) { aoCancelar(); return; }
    if (tipo === "coluna") { moverColuna(active.id, over.id); return; }

    const para = colunaDe(active.id);
    let lista = colunas[para];
    if (lista.includes(over.id) && over.id !== active.id) {
      lista = arrayMove(lista, lista.indexOf(active.id), lista.indexOf(over.id));
      setColunas((c) => ({ ...c, [para]: lista }));
    }
    salvarCard(active.id, inicioArraste.current?.etapa, para, lista);
  }

  function aoCancelar() {
    setAtivo(null);
    if (inicioArraste.current) setColunas(inicioArraste.current.colunas);
  }

  // Grava a nova etapa do card e renumera a coluna de destino (só o que mudou vai para o banco)
  async function salvarCard(id, de, para, lista) {
    const mudouEtapa = de !== para;
    const agora = new Date().toISOString();
    const alteracoes = lista
      .map((x, i) => ({ id: x, posicao: i + 1 }))
      .filter((a) => ops[a.id].posicao !== a.posicao || (a.id === id && mudouEtapa));
    if (!alteracoes.length) return;

    setOps((m) => {
      const n = { ...m };
      alteracoes.forEach((a) => {
        n[a.id] = { ...n[a.id], posicao: a.posicao, ...(a.id === id && mudouEtapa ? { etapa: para, etapa_desde: agora } : {}) };
      });
      return n;
    });
    const res = await Promise.all(alteracoes.map((a) =>
      supabase.from("oportunidades")
        .update(a.id === id && mudouEtapa ? { posicao: a.posicao, etapa: para } : { posicao: a.posicao })
        .eq("id", a.id)));
    if (res.some((r) => r.error)) { carregar(); return; }
    if (mudouEtapa && tipoEtapa(para) === "perdido") setPerda(id);
  }

  // Botão "Avançar" (principalmente no celular): vai para o fim da próxima coluna
  function avancar(id, para) {
    const de = colunaDe(id);
    const lista = [...colunas[para].filter((x) => x !== id), id];
    setColunas((c) => ({ ...c, [de]: c[de].filter((x) => x !== id), [para]: lista }));
    salvarCard(id, de, para, lista);
  }

  function moverColuna(ativoId, sobreId) {
    reordenarAbertas(String(ativoId).slice(4), String(sobreId).slice(4));
  }

  async function salvarMotivo(motivo) {
    const id = perda;
    setPerda(null);
    if (!motivo) return;
    setOps((m) => ({ ...m, [id]: { ...m[id], motivo_perda: motivo } }));
    await supabase.from("oportunidades").update({ motivo_perda: motivo }).eq("id", id);
  }

  const visiveis = useMemo(() => {
    if (!ops) return {};
    const termo = busca.trim();
    return Object.fromEntries(Object.entries(colunas).map(([k, ids]) =>
      [k, ids.filter((id) => ops[id] && combina(ops[id], termo))]));
  }, [colunas, ops, busca]);

  if (!ops) return <div className="p-6 text-tinta-suave">Carregando…</div>;

  const emAndamento = Object.values(ops).filter((o) => tipoEtapa(o.etapa) === "aberta").length;
  const encontrados = Object.values(visiveis).reduce((s, l) => s + l.length, 0);
  const trilha = etapas.filter((e) => e.tipo !== "perdido");
  const arrastandoCard = ativo?.tipo === "card" ? ops[ativo.id] : null;
  const arrastandoColuna = ativo?.tipo === "coluna" ? etapas.find((e) => e.id === ativo.id) : null;

  return (
    <div className="pt-6 h-full flex flex-col">
      <header className="px-4 md:px-8 mb-4 shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Funil</h1>
            <p className="text-tinta-suave">{emAndamento} negociações em andamento</p>
          </div>
          <div className="flex items-center gap-2">
            <VisaoFunil />
            <button type="button" onClick={() => setGerenciar(true)} aria-label="Gerenciar funil"
              className="h-11 px-3 md:px-4 rounded-lg border border-linha bg-superficie font-medium flex items-center gap-2 hover:bg-fundo">
              <IconeAjustes className="w-5 h-5" />
              <span className="hidden sm:inline">Gerenciar funil</span>
            </button>
          </div>
        </div>
        <div className="relative max-w-md">
          <IconeBusca className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave pointer-events-none" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou bairro" aria-label="Buscar no funil"
            className="w-full h-11 pl-10 pr-10 rounded-lg border border-linha bg-superficie text-base" />
          {busca && (
            <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 text-xl text-tinta-suave">×</button>
          )}
        </div>
        {busca.trim() && (
          <p className="text-sm text-tinta-suave">
            {encontrados === 0 ? "Nenhum card encontrado" : `${encontrados} ${encontrados === 1 ? "card encontrado" : "cards encontrados"}`}
          </p>
        )}
      </header>

      <DndContext sensors={sensores} collisionDetection={colisao}
        onDragStart={aoComecar} onDragOver={aoPassar} onDragEnd={aoSoltar} onDragCancel={aoCancelar}>
        <div className={`flex-1 min-h-0 flex items-start gap-3 overflow-x-auto px-4 md:px-8 pb-4 overscroll-x-contain ${ativo ? "" : "snap-x snap-mandatory md:snap-none"}`}>
          <SortableContext items={etapas.map((e) => `col:${e.id}`)} strategy={horizontalListSortingStrategy}>
            {etapas.map((etapa) => {
              const posTrilha = trilha.findIndex((e) => e.id === etapa.id);
              const proxima = etapa.tipo === "aberta" ? trilha[posTrilha + 1] : null;
              return (
                <Coluna key={etapa.id} etapa={etapa} total={colunas[etapa.id]?.length ?? 0}
                  trilha={trilha} posTrilha={posTrilha}>
                  <SortableContext items={visiveis[etapa.id] ?? []} strategy={verticalListSortingStrategy}>
                    {(visiveis[etapa.id] ?? []).map((id) => (
                      <Cartao key={id} o={ops[id]} etapa={etapa} proxima={proxima} campos={campos} onAvancar={avancar} />
                    ))}
                  </SortableContext>
                  {(visiveis[etapa.id] ?? []).length === 0 && (
                    <li className="text-sm text-tinta-suave py-4 text-center">{busca.trim() ? "Nada aqui" : "Vazio"}</li>
                  )}
                </Coluna>
              );
            })}
          </SortableContext>
        </div>

        <DragOverlay>
          {arrastandoCard && (
            <div className="bg-superficie rounded-xl border border-sol p-3 shadow-xl rotate-2 w-[78vw] sm:w-66">
              <ConteudoCartao o={arrastandoCard} etapa={etapas.find((e) => e.id === arrastandoCard.etapa)} campos={campos} />
            </div>
          )}
          {arrastandoColuna && (
            <div className="w-[82vw] sm:w-72 h-40 bg-superficie rounded-2xl border border-sol shadow-xl p-3 rotate-1">
              <div className="flex items-center gap-2 font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${classeCor(arrastandoColuna.cor)}`} />
                {arrastandoColuna.nome}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {gerenciar && (
        <GerenciadorFunil campos={campos} onCampos={setCampos} contagem={colunas}
          onFechar={() => setGerenciar(false)} onCardsMovidos={carregar} />
      )}
      {perda && <MotivoPerda o={ops[perda]} onSalvar={salvarMotivo} />}
    </div>
  );
}

function Coluna({ etapa, total, trilha, posTrilha, children }) {
  const fixa = etapa.tipo !== "aberta";
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: `col:${etapa.id}`, data: { tipo: "coluna", id: etapa.id }, disabled: fixa });
  const area = useDroppable({ id: `area:${etapa.id}`, data: { tipo: "area" } });
  const cor = classeCor(etapa.cor);

  return (
    <section ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`snap-start shrink-0 w-[82vw] sm:w-72 bg-superficie/60 rounded-2xl border border-linha flex flex-col max-h-full ${isDragging ? "opacity-40" : ""}`}>
      <div className="p-3 pb-2">
        {/* Régua de progresso: mostra onde a etapa está no caminho até o ganho */}
        <div className="flex gap-1 mb-2" aria-hidden="true">
          {etapa.tipo === "perdido"
            ? <span className={`h-1 flex-1 rounded-full ${cor}`} />
            : trilha.map((e, i) => <span key={e.id} className={`h-1 flex-1 rounded-full ${i <= posTrilha ? cor : "bg-linha"}`} />)}
        </div>
        <div ref={setActivatorNodeRef} {...(fixa ? {} : { ...attributes, ...listeners })}
          aria-label={fixa ? undefined : `Arrastar coluna ${etapa.nome}`}
          className={`flex items-center gap-2 ${fixa ? "" : "cursor-grab active:cursor-grabbing touch-manipulation"}`}>
          {!fixa && <IconeAlca className="w-4 h-4 text-tinta-suave shrink-0" />}
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cor}`} />
          <h2 className="font-semibold flex-1 truncate">{etapa.nome}</h2>
          {fixa && <IconeCadeado className="w-3.5 h-3.5 text-tinta-suave shrink-0" aria-label="Coluna padrão" />}
          <span className="text-sm text-tinta-suave">{total}</span>
        </div>
      </div>
      <ul ref={area.setNodeRef}
        className={`flex-1 min-h-16 overflow-y-auto px-3 pb-3 space-y-2 rounded-b-2xl ${area.isOver ? "bg-sol/10" : ""}`}>
        {children}
      </ul>
    </section>
  );
}

function Cartao({ o, etapa, proxima, campos, onAvancar }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: o.id, data: { tipo: "card", id: o.id } });

  return (
    <li ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`bg-superficie rounded-xl border border-linha p-3 cursor-grab active:cursor-grabbing touch-manipulation select-none ${isDragging ? "opacity-30" : ""}`}>
      <ConteudoCartao o={o} etapa={etapa} proxima={proxima} campos={campos} onAvancar={onAvancar} />
    </li>
  );
}

function ConteudoCartao({ o, etapa, proxima, campos, onAvancar }) {
  const c = o.contato;
  const tem = (campo) => campos.includes(campo);
  const dias = diasDesde(o.etapa_desde);
  const parada = etapa?.tipo === "aberta" && etapa.dias_alerta && dias >= etapa.dias_alerta;
  const retornoAtrasado = o.proximo_followup && new Date(o.proximo_followup) < inicioDoDia();
  const faixa = FAIXAS.find((f) => f.id === o.faixa_consumo)?.nome;

  const linha = [
    tem("telefone") && c.telefone && formatarTelefone(c.telefone),
    tem("bairro") && c.bairro,
    tem("consumo") && c.consumo_kwh && `${c.consumo_kwh} kWh`,
  ].filter(Boolean).join(", ");
  const semDados = !linha && (tem("bairro") || tem("consumo")) && !c.bairro && !c.consumo_kwh;

  const etiquetas = [
    tem("faixa") && faixa && <Etiqueta key="faixa">{faixa}</Etiqueta>,
    tem("origem") && c.origem === "indicacao" && <Etiqueta key="ind">Indicação</Etiqueta>,
    tem("financiamento") && o.financiamento_status === "em_analise" && <Etiqueta key="fin">Financiamento em análise</Etiqueta>,
    tem("financiamento") && o.financiamento_status === "aprovado" && <Etiqueta key="fin" cor="ok">Financiamento aprovado</Etiqueta>,
    tem("financiamento") && o.financiamento_status === "recusado" && <Etiqueta key="fin" cor="alerta">Financiamento recusado</Etiqueta>,
    tem("retorno") && retornoAtrasado && <Etiqueta key="ret" cor="alerta">Retorno atrasado</Etiqueta>,
    tem("retorno") && o.proximo_followup && !retornoAtrasado && <Etiqueta key="ret">Retorno {dataCurta(o.proximo_followup)}</Etiqueta>,
  ].filter(Boolean);

  const mostrarDias = tem("dias_etapa");
  const mostrarAvancar = tem("avancar") && proxima && onAvancar;

  return (
    <>
      <Link to={`/conversas/${c.id}`} draggable={false} className="block"
        onClick={(e) => { if (Date.now() - ultimoArraste < 300) e.preventDefault(); }}>
        <div className="font-medium truncate">{nomeOuTelefone(c)}</div>
        {(linha || semDados) && (
          <div className="text-sm text-tinta-suave mt-0.5">{linha || "Sem conta de luz ainda"}</div>
        )}
      </Link>
      {etapa?.tipo === "perdido" && o.motivo_perda && (
        <p className="text-sm text-tinta-suave mt-1 italic">“{o.motivo_perda}”</p>
      )}
      {etiquetas.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2 text-xs">{etiquetas}</div>}
      {(mostrarDias || mostrarAvancar) && (
        <div className="flex items-center justify-between mt-3">
          {mostrarDias ? (
            <span className={`text-xs ${parada ? "text-alerta font-semibold" : "text-tinta-suave"}`}>
              {dias === 0 ? "Hoje nesta etapa" : `${dias} ${dias === 1 ? "dia" : "dias"} nesta etapa`}
            </span>
          ) : <span />}
          {mostrarAvancar && (
            <button type="button" onClick={() => onAvancar(o.id, proxima.id)}
              onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
              className="text-xs font-semibold px-2.5 h-8 rounded-lg bg-fundo hover:bg-linha">
              Avançar
            </button>
          )}
        </div>
      )}
    </>
  );
}

function MotivoPerda({ o, onSalvar }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal titulo="Por que não fechou?" onFechar={() => onSalvar(null)}>
      <form onSubmit={(e) => { e.preventDefault(); onSalvar(motivo.trim() || null); }} className="space-y-4">
        <p className="text-sm text-tinta-suave">{o ? nomeOuTelefone(o.contato) : ""} foi para Perdido. Anotar o motivo ajuda a entender o funil depois.</p>
        <Campo rotulo="Motivo (opcional)">
          <Entrada autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: preferiu esperar" />
        </Campo>
        <div className="flex gap-3">
          <BotaoPrimario>Salvar</BotaoPrimario>
          <BotaoSecundario type="button" onClick={() => onSalvar(null)}>Pular</BotaoSecundario>
        </div>
      </form>
    </Modal>
  );
}

function Etiqueta({ children, cor }) {
  const estilo = cor === "alerta" ? "bg-alerta/10 text-alerta" : cor === "ok" ? "bg-ok/15 text-ok" : "bg-fundo text-tinta-suave";
  return <span className={`px-2 py-0.5 rounded-full ${estilo}`}>{children}</span>;
}

function IconeBusca(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>);
}
function IconeAjustes(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </svg>);
}
