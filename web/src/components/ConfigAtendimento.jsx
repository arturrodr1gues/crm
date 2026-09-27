import { useEffect, useRef, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../lib/supabase";
import { BotaoPrimario, BotaoSecundario, Campo, Entrada, Modal, Selecao } from "./ui";
import { IconeAlca } from "./GerenciadorFunil";
import { VARIAVEIS, aplicarVariaveis, duracaoCurta, recarregarConfig, useAtendimentoConfig } from "../lib/atendimento";

const OPCOES_SLA = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const OPCOES_FOLLOWUP = [2, 4, 6, 8, 12, 24, 48, 72];
const EXEMPLO = { nome: "Maria Souza" };

function Cartao({ titulo, descricao, children }) {
  return (
    <section className="bg-superficie rounded-2xl border border-linha p-5 mb-5">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {descricao && <p className="text-sm text-tinta-suave mt-0.5 mb-4">{descricao}</p>}
      {children}
    </section>
  );
}

/** Cartões de Atendimento (SLA e follow-up) e Mensagens rápidas, na tela de Ajustes. */
export default function ConfigAtendimento() {
  const [respostas, setRespostas] = useState(null);

  async function carregarRespostas() {
    const { data } = await supabase.from("respostas_rapidas").select("id, atalho, texto, ordem").order("ordem");
    setRespostas(data ?? []);
  }
  useEffect(() => { carregarRespostas(); }, []);

  return (<>
    <Atendimento respostas={respostas ?? []} />
    <MensagensRapidas respostas={respostas} onMudou={carregarRespostas} />
  </>);
}

// ---------------------------------------------------------------------
// SLA e follow-up
// ---------------------------------------------------------------------
function Atendimento({ respostas }) {
  const config = useAtendimentoConfig();
  const [f, setF] = useState(config);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => setF(config), [config]);
  const mudou = f.sla_resposta_min !== config.sla_resposta_min || f.followup_horas !== config.followup_horas
    || (f.followup_resposta_id ?? "") !== (config.followup_resposta_id ?? "");

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setAviso("");
    const { error } = await supabase.from("atendimento_config").update({
      sla_resposta_min: f.sla_resposta_min,
      followup_horas: f.followup_horas,
      followup_resposta_id: f.followup_resposta_id || null,
    }).eq("id", true);
    if (!error) await recarregarConfig();
    setSalvando(false);
    setAviso(error ? "Não foi possível salvar." : "Salvo.");
  }

  return (
    <Cartao titulo="Atendimento"
      descricao="Prazos que destacam as conversas em Conversas. Grupos e conversas encerradas ficam de fora.">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="SLA de resposta"
          dica="Quando o cliente escreve e ninguém responde nesse prazo, a conversa fica vermelha e entra no filtro SLA crítico.">
          <Selecao value={f.sla_resposta_min} onChange={(e) => setF({ ...f, sla_resposta_min: Number(e.target.value) })}
            opcoes={OPCOES_SLA.map((m) => ({ id: m, nome: `${duracaoCurta(m)}${m === 60 ? " (padrão)" : ""}` }))} />
        </Campo>
        <Campo rotulo="Follow-up"
          dica="Quando você manda uma mensagem e o cliente não responde nesse prazo, a conversa entra no filtro Follow-up.">
          <Selecao value={f.followup_horas} onChange={(e) => setF({ ...f, followup_horas: Number(e.target.value) })}
            opcoes={OPCOES_FOLLOWUP.map((h) => ({ id: h, nome: `${h} horas${h === 12 ? " (padrão)" : ""}` }))} />
        </Campo>
        <Campo rotulo="Mensagem sugerida no follow-up"
          dica="Aparece num botão dentro da conversa. Você revisa antes de enviar; nada é mandado sozinho.">
          <Selecao value={f.followup_resposta_id ?? ""} onChange={(e) => setF({ ...f, followup_resposta_id: e.target.value || null })}
            vazio="Nenhuma" opcoes={respostas.map((r) => ({ id: r.id, nome: r.atalho }))} />
        </Campo>
        <div className="flex items-center gap-3">
          <BotaoPrimario disabled={!mudou || salvando}>{salvando ? "Salvando…" : "Salvar"}</BotaoPrimario>
          {aviso && <span className={`text-sm ${aviso === "Salvo." ? "text-ok" : "text-alerta"}`}>{aviso}</span>}
        </div>
      </form>
    </Cartao>
  );
}

// ---------------------------------------------------------------------
// Mensagens rápidas (templates)
// ---------------------------------------------------------------------
function MensagensRapidas({ respostas, onMudou }) {
  const [editando, setEditando] = useState(null); // null | {} (nova) | resposta

  return (
    <Cartao titulo="Mensagens rápidas"
      descricao="Atalhos que aparecem acima do campo de mensagem. Use {primeiro_nome} ou {nome} para já sair com o nome do contato.">
      {!respostas ? <p className="text-sm text-tinta-suave">Carregando…</p> : (
        <div className="mb-4"><ListaMensagensRapidas respostas={respostas} onMudou={onMudou} onEditar={setEditando} /></div>
      )}
      <BotaoSecundario type="button" onClick={() => setEditando({})}>Nova mensagem rápida</BotaoSecundario>

      {editando && (
        <EditarMensagem resposta={editando} proximaOrdem={respostas?.length ?? 0}
          onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); onMudou(); }} />
      )}
    </Cartao>
  );
}

/** Lista das mensagens rápidas; arraste pela alça para mudar a ordem dos atalhos na conversa. */
export function ListaMensagensRapidas({ respostas, onMudou, onEditar }) {
  const [lista, setLista] = useState(respostas);
  const [erro, setErro] = useState("");
  useEffect(() => setLista(respostas), [respostas]);

  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Regrava a posição de todas (1, 2, 3...) sem empates; só o que mudou vai para o banco.
  async function soltar({ active, over }) {
    if (!over || active.id === over.id) return;
    const nova = arrayMove(lista, lista.findIndex((r) => r.id === active.id), lista.findIndex((r) => r.id === over.id));
    setLista(nova); setErro("");
    const res = await Promise.all(nova.map((r, k) => (r.ordem === k + 1 ? null
      : supabase.from("respostas_rapidas").update({ ordem: k + 1 }).eq("id", r.id))));
    if (res.some((r) => r?.error)) setErro("Não foi possível salvar a nova ordem.");
    onMudou();
  }

  async function excluir(r) {
    if (!window.confirm(`Excluir a mensagem "${r.atalho}"?`)) return;
    const { error } = await supabase.from("respostas_rapidas").delete().eq("id", r.id);
    if (error) { setErro("Não foi possível excluir."); return; }
    await recarregarConfig(); // se era a mensagem de follow-up, ela sai da configuração
    onMudou();
  }

  return (
    <>
      {erro && <p role="alert" className="text-alerta text-sm mb-3">{erro}</p>}
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={soltar}>
        <SortableContext items={lista.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-linha border border-linha rounded-xl bg-superficie">
            {lista.length === 0 && <li className="p-4 text-sm text-tinta-suave">Nenhuma mensagem rápida ainda.</li>}
            {lista.map((r) => <LinhaMensagem key={r.id} r={r} onEditar={onEditar} onExcluir={excluir} />)}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

function LinhaMensagem({ r, onEditar, onExcluir }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: r.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`p-3 flex gap-2 bg-superficie first:rounded-t-xl last:rounded-b-xl ${isDragging ? "relative z-10 shadow-lg rounded-xl" : ""}`}>
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Arrastar ${r.atalho}`}
        className="h-8 w-7 shrink-0 grid place-items-center text-tinta-suave cursor-grab active:cursor-grabbing touch-none">
        <IconeAlca className="w-5 h-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{r.atalho}</div>
        <p className="text-sm text-tinta-suave whitespace-pre-wrap break-words"><ComVariaveis texto={r.texto} /></p>
      </div>
      <div className="flex flex-col sm:flex-row gap-1 shrink-0">
        <button type="button" onClick={() => onEditar(r)} className="h-8 px-3 rounded-lg border border-linha text-sm hover:bg-fundo">Editar</button>
        <button type="button" onClick={() => onExcluir(r)} className="h-8 px-3 rounded-lg border border-linha text-sm text-alerta hover:bg-fundo">Excluir</button>
      </div>
    </li>
  );
}

/** Mostra {primeiro_nome}/{nome} destacados no texto. */
function ComVariaveis({ texto }) {
  return texto.split(/(\{primeiro_nome\}|\{nome\})/g).map((p, i) => (i % 2
    ? <span key={i} className="px-1 rounded bg-sol/20 text-sol-escuro font-medium">{p}</span>
    : p));
}

export function EditarMensagem({ resposta, proximaOrdem, onFechar, onSalvo }) {
  const nova = !resposta.id;
  const [atalho, setAtalho] = useState(resposta.atalho ?? "");
  const [texto, setTexto] = useState(resposta.texto ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const campo = useRef(null);

  // Insere a variável onde está o cursor.
  function inserir(chave) {
    const el = campo.current;
    const ini = el?.selectionStart ?? texto.length, fim = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + chave + texto.slice(fim));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + chave.length, ini + chave.length); });
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    const dados = { atalho: atalho.trim(), texto: texto.trim() };
    const { error } = nova
      ? await supabase.from("respostas_rapidas").insert({ ...dados, ordem: proximaOrdem + 1 })
      : await supabase.from("respostas_rapidas").update(dados).eq("id", resposta.id);
    setSalvando(false);
    if (error) {
      setErro(error.code === "23505" ? "Já existe uma mensagem com esse atalho." : "Não foi possível salvar.");
      return;
    }
    onSalvo();
  }

  return (
    <Modal titulo={nova ? "Nova mensagem rápida" : "Editar mensagem rápida"} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Atalho" dica="Nome curto do botão, ex.: Boas-vindas.">
          <Entrada value={atalho} onChange={(e) => setAtalho(e.target.value)} maxLength={30} autoFocus={nova} required />
        </Campo>
        <div>
          <Campo rotulo="Mensagem">
            <textarea ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={1000} required
              className="mt-1 w-full p-3 rounded-lg border border-linha bg-fundo text-base" />
          </Campo>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs text-tinta-suave">Inserir:</span>
            {VARIAVEIS.map((v) => (
              <button key={v.chave} type="button" onClick={() => inserir(v.chave)}
                className="h-8 px-2.5 rounded-full border border-linha text-[13px] hover:bg-fundo">
                {v.descricao} <code className="text-tinta-suave">{v.chave}</code>
              </button>
            ))}
          </div>
        </div>
        {texto.trim() && (
          <div className="rounded-xl bg-fundo p-3 text-sm">
            <div className="text-xs text-tinta-suave mb-1">Como fica para "{EXEMPLO.nome}":</div>
            <p className="whitespace-pre-wrap">{aplicarVariaveis(texto, EXEMPLO)}</p>
            {/\{(primeiro_nome|nome)\}/.test(texto) && (
              <>
                <div className="text-xs text-tinta-suave mt-2 mb-1">Contato sem nome cadastrado:</div>
                <p className="whitespace-pre-wrap">{aplicarVariaveis(texto, {})}</p>
              </>
            )}
          </div>
        )}
        {erro && <p className="text-alerta text-sm">{erro}</p>}
        <div className="flex gap-2 justify-end">
          <BotaoSecundario type="button" onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario disabled={salvando || !atalho.trim() || !texto.trim()}>{salvando ? "Salvando…" : "Salvar"}</BotaoPrimario>
        </div>
      </form>
    </Modal>
  );
}
