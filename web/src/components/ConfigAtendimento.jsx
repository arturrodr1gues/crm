import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { BotaoPrimario, BotaoSecundario, Campo, Entrada, Modal } from "./ui";
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

  const seletor = "mt-1 w-full h-12 px-3 rounded-lg border border-linha bg-fundo text-base";

  return (
    <Cartao titulo="Atendimento"
      descricao="Prazos que destacam as conversas em Conversas. Grupos e conversas encerradas ficam de fora.">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="SLA de resposta"
          dica="Quando o cliente escreve e ninguém responde nesse prazo, a conversa fica vermelha e entra no filtro SLA crítico.">
          <select value={f.sla_resposta_min} onChange={(e) => setF({ ...f, sla_resposta_min: Number(e.target.value) })} className={seletor}>
            {OPCOES_SLA.map((m) => <option key={m} value={m}>{duracaoCurta(m)}{m === 60 ? " (padrão)" : ""}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Follow-up"
          dica="Quando você manda uma mensagem e o cliente não responde nesse prazo, a conversa entra no filtro Follow-up.">
          <select value={f.followup_horas} onChange={(e) => setF({ ...f, followup_horas: Number(e.target.value) })} className={seletor}>
            {OPCOES_FOLLOWUP.map((h) => <option key={h} value={h}>{h} horas{h === 12 ? " (padrão)" : ""}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Mensagem sugerida no follow-up"
          dica="Aparece num botão dentro da conversa. Você revisa antes de enviar; nada é mandado sozinho.">
          <select value={f.followup_resposta_id ?? ""} onChange={(e) => setF({ ...f, followup_resposta_id: e.target.value || null })} className={seletor}>
            <option value="">Nenhuma</option>
            {respostas.map((r) => <option key={r.id} value={r.id}>{r.atalho}</option>)}
          </select>
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
  const [erro, setErro] = useState("");

  async function mover(i, direcao) {
    const j = i + direcao;
    if (j < 0 || j >= respostas.length) return;
    // Troca as duas de lugar e regrava a posição de todas (1, 2, 3...), sem empates.
    const nova = [...respostas];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    await Promise.all(nova.map((r, k) => (r.ordem === k + 1 ? null
      : supabase.from("respostas_rapidas").update({ ordem: k + 1 }).eq("id", r.id))));
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
    <Cartao titulo="Mensagens rápidas"
      descricao="Atalhos que aparecem acima do campo de mensagem. Use {primeiro_nome} ou {nome} para já sair com o nome do contato.">
      {erro && <p className="text-alerta text-sm mb-3">{erro}</p>}
      {!respostas ? <p className="text-sm text-tinta-suave">Carregando…</p> : (
        <ul className="divide-y divide-linha border border-linha rounded-xl mb-4">
          {respostas.length === 0 && <li className="p-4 text-sm text-tinta-suave">Nenhuma mensagem rápida ainda.</li>}
          {respostas.map((r, i) => (
            <li key={r.id} className="p-3 flex gap-3">
              <div className="flex flex-col">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${r.atalho}`}
                  className="h-6 w-6 rounded text-tinta-suave hover:bg-fundo disabled:opacity-30">▲</button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === respostas.length - 1} aria-label={`Descer ${r.atalho}`}
                  className="h-6 w-6 rounded text-tinta-suave hover:bg-fundo disabled:opacity-30">▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{r.atalho}</div>
                <p className="text-sm text-tinta-suave whitespace-pre-wrap break-words"><ComVariaveis texto={r.texto} /></p>
              </div>
              <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                <button type="button" onClick={() => setEditando(r)} className="h-8 px-3 rounded-lg border border-linha text-sm hover:bg-fundo">Editar</button>
                <button type="button" onClick={() => excluir(r)} className="h-8 px-3 rounded-lg border border-linha text-sm text-alerta hover:bg-fundo">Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <BotaoSecundario type="button" onClick={() => setEditando({})}>Nova mensagem rápida</BotaoSecundario>

      {editando && (
        <EditarMensagem resposta={editando} proximaOrdem={respostas?.length ?? 0}
          onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); onMudou(); }} />
      )}
    </Cartao>
  );
}

/** Mostra {primeiro_nome}/{nome} destacados no texto. */
function ComVariaveis({ texto }) {
  return texto.split(/(\{primeiro_nome\}|\{nome\})/g).map((p, i) => (i % 2
    ? <span key={i} className="px-1 rounded bg-sol/20 text-sol-escuro font-medium">{p}</span>
    : p));
}

function EditarMensagem({ resposta, proximaOrdem, onFechar, onSalvo }) {
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
