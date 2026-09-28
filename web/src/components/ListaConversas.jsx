import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { nomeOuTelefone, quando, soDigitos } from "../lib/format";
import { estadoAtendimento, useAgora, useAtendimentoConfig } from "../lib/atendimento";
import { usePreferencia } from "../lib/preferencias";
import { SeloEtapa } from "./ui";
import { SeloFollowup, SeloSla } from "./SelosAtendimento";
import ConfirmarAcaoContatos from "./ConfirmarAcaoContatos";
import { EsqueletoListaConversas } from "./Esqueletos";

const COLUNAS = "id, nome, telefone, ultima_mensagem, ultima_mensagem_em, nao_lidas, is_grupo, " +
  "tipo_contato, conversa_fechada, aguardando_resposta_desde, aguardando_cliente_desde, oportunidades(etapa, created_at)";

/**
 * Lista de conversas em tempo real: abas Em aberto / Fechadas, busca e filtros
 * (não lidas, leads, SLA crítico, follow-up). "Selecionar" liga a seleção para bloquear
 * ou excluir várias de uma vez. Bloqueados não aparecem aqui: ficam em Ajustes.
 * `lateral`: versão compacta com rolagem própria, para ficar ao lado do chat no computador.
 * `onRecolher`: mostra o botão que esconde a lista.
 */
export default function ListaConversas({ lateral = false, ativa, onRecolher }) {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState("");
  const [abaSalva, setAba] = usePreferencia("crm-conversas-aba", "abertas"); // abertas | fechadas
  const aba = abaSalva === "fechadas" ? "fechadas" : "abertas"; // "leads" (aba antiga) virou filtro
  const [filtro, setFiltro] = useState(abaSalva === "leads" ? "leads" : "todas"); // todas | nao_lidas | leads | sla | followup
  const [contagem, setContagem] = useState({ sla: 0, followup: 0 });
  const [selecionando, setSelecionando] = useState(false);
  const [selecao, setSelecao] = useState(() => new Set());
  const [confirmar, setConfirmar] = useState(null); // bloquear | excluir
  const navigate = useNavigate();
  const config = useAtendimentoConfig();
  const agora = useAgora();

  // A partir de quando a espera vira SLA crítico / follow-up
  const limiteSla = new Date(agora - config.sla_resposta_min * 60_000).toISOString();
  const limiteFollowup = new Date(agora - config.followup_horas * 3_600_000).toISOString();
  // SLA e follow-up só valem para leads em aberto.
  const soLeadsAbertos = (q) => q.eq("conversa_fechada", false).eq("tipo_contato", "lead").eq("bloqueado", false);
  const f = aba === "fechadas" ? "todas" : filtro;

  async function carregar() {
    let q = supabase.from("contatos").select(COLUNAS)
      .not("ultima_mensagem_em", "is", null)
      .eq("bloqueado", false) // bloqueados só aparecem em Ajustes
      .eq("conversa_fechada", aba === "fechadas")
      .limit(100);
    const t = busca.trim();
    if (t) {
      const d = soDigitos(t);
      q = d.length >= 4 ? q.ilike("telefone", `%${d}%`) : q.ilike("nome", `%${t}%`);
    }
    if (f === "nao_lidas") q = q.gt("nao_lidas", 0);
    if (f === "leads") q = q.eq("tipo_contato", "lead");
    if (f === "sla") q = q.eq("tipo_contato", "lead").lt("aguardando_resposta_desde", limiteSla);
    if (f === "followup") q = q.eq("tipo_contato", "lead").lt("aguardando_cliente_desde", limiteFollowup);
    // No SLA, quem espera há mais tempo vem primeiro.
    q = f === "sla" ? q.order("aguardando_resposta_desde", { ascending: true })
      : q.order("ultima_mensagem_em", { ascending: false });

    const [{ data }, sla, followup] = await Promise.all([
      q,
      soLeadsAbertos(supabase.from("contatos").select("id", { count: "exact", head: true }))
        .lt("aguardando_resposta_desde", limiteSla),
      soLeadsAbertos(supabase.from("contatos").select("id", { count: "exact", head: true }))
        .lt("aguardando_cliente_desde", limiteFollowup),
    ]);
    setLista(data ?? []);
    setContagem({ sla: sla.count ?? 0, followup: followup.count ?? 0 });
  }

  // Recarrega ao mudar filtro/busca e a cada minuto (os prazos de SLA e follow-up andam sozinhos).
  useEffect(() => {
    const id = setTimeout(carregar, 200);
    return () => clearTimeout(id);
  }, [busca, aba, filtro, agora, config.sla_resposta_min, config.followup_horas]);

  // Tempo real: o canal fica aberto e sempre chama a versão atual de carregar (com os filtros de agora).
  const recarregar = useRef(carregar);
  recarregar.current = carregar;
  useEffect(() => {
    const canal = supabase.channel(`lista-conversas-${lateral ? "lateral" : "pagina"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contatos" }, () => recarregar.current())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [lateral]);

  // Trocar de aba ou filtro começa uma seleção nova.
  useEffect(() => { setSelecao(new Set()); }, [aba, filtro]);

  const escolhidos = (lista ?? []).filter((c) => selecao.has(c.id)).map((c) => c.id);
  const todasMarcadas = !!lista?.length && escolhidos.length === lista.length;
  function alternar(id) {
    setSelecao((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function sairDaSelecao() { setSelecionando(false); setSelecao(new Set()); }
  function acaoFeita() {
    if (confirmar === "excluir" && escolhidos.includes(ativa)) navigate("/conversas");
    sairDaSelecao();
    carregar();
  }

  const campo = lateral ? "h-10 text-sm" : "h-12";
  const filtros = [
    ["todas", "Todas"],
    ["nao_lidas", "Não lidas"],
    ["leads", "Leads"],
    ["sla", "SLA crítico", contagem.sla, "bg-alerta text-white"],
    ["followup", "Follow-up", contagem.followup, "bg-sky-100 text-sky-800"],
  ];

  return (
    <div className={lateral ? "flex flex-col h-full min-h-0" : ""}>
      <div className={lateral ? "px-3 pt-4 pb-2 border-b border-linha" : "mb-3"}>
        <div className={`flex items-center justify-between ${lateral ? "mb-3 px-1" : "mb-4"}`}>
          <h1 className={`flex-1 ${lateral ? "text-xl font-bold" : "text-3xl font-bold"}`}>Conversas</h1>
          <button type="button" onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}
            aria-pressed={selecionando}
            className={`h-8 px-2.5 rounded-lg text-sm font-medium ${selecionando ? "bg-tinta text-white" : "text-tinta-suave hover:bg-fundo"}`}>
            {selecionando ? "Cancelar" : "Selecionar"}
          </button>
          {onRecolher && (
            <button type="button" onClick={onRecolher} aria-label="Recolher conversas" title="Recolher conversas"
              className="h-8 w-8 -mr-1 grid place-items-center rounded-lg text-tinta-suave hover:bg-fundo">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M16 10l-2 2 2 2" />
              </svg>
            </button>
          )}
        </div>

        {/* Abas: em aberto / fechadas (leads virou um dos filtros abaixo) */}
        <div role="tablist" aria-label="Situação da conversa" className="grid grid-cols-2 p-1 mb-2 rounded-lg bg-fundo border border-linha">
          {[["abertas", "Em aberto"], ["fechadas", "Fechadas"]].map(([k, n]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
              className={`${lateral ? "h-8 text-sm" : "h-9"} rounded-md font-medium ${aba === k ? "bg-superficie shadow-sm text-tinta" : "text-tinta-suave"}`}>
              {n}
            </button>
          ))}
        </div>

        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone"
          aria-label="Buscar conversa"
          className={`w-full px-3 rounded-lg border border-linha ${lateral ? "bg-fundo" : "bg-superficie"} ${campo}`} />

        {aba !== "fechadas" && (
          <div className="flex gap-1 overflow-x-auto pt-2 pb-0.5">
            {filtros.map(([k, n, qtd, corQtd]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
                className={`shrink-0 h-6 px-2 rounded-full border text-[11px] font-medium flex items-center gap-1 ${
                  filtro === k ? "bg-tinta text-white border-tinta" : "bg-superficie border-linha text-tinta"}`}>
                {n}
                {qtd > 0 && <span className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-bold grid place-items-center ${corQtd}`}>{qtd}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Ações em massa */}
        {selecionando && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg bg-tinta text-white">
            <button type="button" onClick={() => setSelecao(todasMarcadas ? new Set() : new Set(lista.map((c) => c.id)))}
              disabled={!lista?.length}
              className="h-8 px-2 rounded-md text-[13px] font-medium hover:bg-white/10 disabled:opacity-50">
              {todasMarcadas ? "Desmarcar todas" : "Selecionar todas"}
            </button>
            <span className="flex-1 min-w-16 text-[13px] text-white/70">
              {escolhidos.length === 1 ? "1 selecionada" : `${escolhidos.length} selecionadas`}
            </span>
            <button type="button" disabled={!escolhidos.length}
              onClick={() => setConfirmar("bloquear")}
              className="h-8 px-2.5 rounded-md bg-white/15 text-[13px] font-semibold hover:bg-white/25 disabled:opacity-40">
              Bloquear
            </button>
            <button type="button" disabled={!escolhidos.length} onClick={() => setConfirmar("excluir")}
              className="h-8 px-2.5 rounded-md bg-alerta text-[13px] font-semibold hover:brightness-110 disabled:opacity-40">
              Excluir
            </button>
          </div>
        )}
      </div>

      <div className={lateral ? "flex-1 min-h-0 overflow-y-auto" : ""}>
        {!lista ? <EsqueletoListaConversas lateral={lateral} /> : lista.length === 0 ? (
          <p className="text-tinta-suave py-8 px-4 text-center text-sm">
            {busca ? "Nenhuma conversa encontrada."
              : aba === "fechadas" ? "Nenhuma conversa encerrada. Use \"Encerrar\" no topo da conversa quando o atendimento terminar."
              : filtro === "leads" ? "Nenhum lead em aberto. Marque \"Novo lead\" no topo da conversa para ele aparecer aqui."
              : filtro === "sla" ? "Nenhum lead esperando além do SLA. 👏"
              : filtro === "followup" ? "Nenhum lead com follow-up pendente."
              : filtro === "nao_lidas" ? "Nenhuma conversa não lida."
              : "As conversas e grupos do WhatsApp aparecem aqui assim que chegar uma mensagem."}
          </p>
        ) : (
          <ul className={lateral ? "divide-y divide-linha" : "bg-superficie rounded-2xl border border-linha divide-y divide-linha"}>
            {lista.map((c) => {
              const { sla, followup } = estadoAtendimento(c, config, agora);
              const marcada = selecao.has(c.id);
              const tamanho = lateral ? "h-10 w-10" : "h-11 w-11";
              const classe = `w-full text-left flex items-center gap-3 ${lateral ? "px-3 py-2.5" : "px-4 py-3"} ${
                marcada ? "bg-sol/15" : c.id === ativa && !selecionando ? "bg-fundo" : lateral ? "hover:bg-fundo/60" : ""} ${
                sla?.critico ? "border-l-4 border-alerta" : ""}`;
              const conteudo = (
                <>
                  {selecionando ? (
                    // Na seleção, a foto vira a caixa de marcar
                    <span className={`${tamanho} shrink-0 rounded-full grid place-items-center text-lg font-bold ${
                      marcada ? "bg-sol text-tinta" : "border-2 border-linha bg-superficie"}`}>{marcada && "✓"}</span>
                  ) : (
                    <div className={`${tamanho} shrink-0 rounded-full grid place-items-center font-semibold ${
                      c.is_grupo ? "bg-linha text-tinta" : "bg-tinta text-white"}`}>
                      {c.is_grupo ? <IconeGrupo className="w-5 h-5" /> : (c.nome || "?").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate ${lateral ? "text-[15px]" : ""} ${c.nao_lidas ? "font-semibold" : "font-medium"}`}>{nomeOuTelefone(c)}</span>
                        {c.is_grupo && <span className="shrink-0 text-[11px] px-1.5 rounded bg-fundo border border-linha text-tinta-suave">Grupo</span>}
                      </div>
                      <div className={`text-sm truncate ${c.nao_lidas ? "text-tinta" : "text-tinta-suave"}`}>{c.ultima_mensagem}</div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        {c.nao_lidas > 0 && (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-sol text-tinta text-[11px] font-bold grid place-items-center">{c.nao_lidas}</span>
                        )}
                        <span className="text-xs text-tinta-suave">{quando(c.ultima_mensagem_em)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {sla ? <SeloSla sla={sla} compacto /> : followup && <SeloFollowup followup={followup} />}
                        <EtapaDoFunil ops={c.oportunidades} />
                      </div>
                    </div>
                </>
              );
              return (
                <li key={c.id} className="animate-entrada">
                  {selecionando ? (
                    <button type="button" role="checkbox" aria-checked={marcada} onClick={() => alternar(c.id)} className={classe}>
                      {conteudo}
                    </button>
                  ) : (
                    <Link to={`/conversas/${c.id}`} aria-current={c.id === ativa ? "page" : undefined} className={classe}>
                      {conteudo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmar && (
        <ConfirmarAcaoContatos acao={confirmar} ids={escolhidos} onFechar={() => setConfirmar(null)} onFeito={acaoFeita} />
      )}
    </div>
  );
}

// Etapa da negociação mais recente do contato (grupo não tem)
function EtapaDoFunil({ ops }) {
  const atual = [...(ops ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return atual ? <SeloEtapa etapa={atual.etapa} /> : null;
}

function IconeGrupo(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.6" />
  </svg>);
}
