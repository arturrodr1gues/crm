import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { nomeEtapa, useEtapas } from "../lib/etapas";
import { formatarTelefone, nomeOuTelefone } from "../lib/format";
import Chat from "../components/Chat";
import ListaConversas from "../components/ListaConversas";
import useMidia, { TELA_LARGA } from "../lib/useMidia";
import { usePreferencia } from "../lib/preferencias";
import useContato from "../lib/useContato";
import DetalhesConversa from "../components/DetalhesConversa";
import { Ficha, SeletorTipo } from "../components/FichaCliente";
import { estadoAtendimento, useAgora, useAtendimentoConfig } from "../lib/atendimento";
import { SeloSla } from "../components/SelosAtendimento";
import { EsqueletoConversa } from "../components/Esqueletos";

export default function Contato() {
  useEtapas(); // nome da etapa no cabeçalho acompanha o gerenciador do funil
  const { id } = useParams();
  const { contato, op, carregar, alternarEncerrada, classificar } = useContato(id);
  const [aba, setAba] = useState("conversa"); // celular: conversa | detalhes
  const larga = useMidia(TELA_LARGA);
  const md = useMidia("(min-width: 768px)");
  // Computador: painel de detalhes à direita e lista de conversas à esquerda. Lembra a escolha.
  const [painel, setPainel] = usePreferencia("crm-painel-conversa", "detalhes");
  const [listaRecolhida, setListaRecolhida] = usePreferencia("crm-conversas-recolhidas", false);
  const config = useAtendimentoConfig();
  const agora = useAgora();

  // Computador: lista de todas as conversas ao lado, como no WhatsApp Web.
  const comLista = (conteudo) => (larga ? (
    <div className="flex h-full">
      {listaRecolhida ? (
        <div className="w-12 shrink-0 border-r border-linha bg-superficie flex flex-col items-center pt-3">
          <button type="button" onClick={() => setListaRecolhida(false)} aria-label="Mostrar conversas" title="Mostrar conversas"
            className="h-9 w-9 rounded-lg grid place-items-center text-tinta-suave hover:bg-fundo">
            <IconeLista className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <aside className="w-80 xl:w-96 shrink-0 border-r border-linha bg-superficie">
          <ListaConversas lateral ativa={id} onRecolher={() => setListaRecolhida(true)} />
        </aside>
      )}
      <div className="flex-1 min-w-0 h-full">{conteudo}</div>
    </div>
  ) : conteudo);

  useEffect(() => { setAba("conversa"); }, [id]);

  if (contato === false) {
    return comLista(
      <div className="p-6">
        <p className="text-alerta mb-3">Não foi possível abrir essa conversa.</p>
        <Link to="/conversas" className="underline text-tinta-suave">Voltar para Conversas</Link>
      </div>
    );
  }
  if (!contato) return comLista(<EsqueletoConversa />);

  // Um painel só: detalhes da conversa com a ficha do cliente dentro (grupo não tem ficha).
  const grupo = contato.is_grupo;
  const painelAberto = painel !== null; // preferência antiga "ficha" também conta como aberto
  const abrirDetalhes = () => (md ? setPainel("detalhes") : setAba("detalhes"));
  const mostrarPainel = md ? painelAberto : aba === "detalhes";

  const etapa = op && nomeEtapa(op.etapa);
  const { sla } = estadoAtendimento(contato, config, agora);

  return comLista(
    <div className="flex flex-col h-full">
      <header className="bg-superficie border-b border-linha px-4 md:px-5 py-2.5 flex items-center gap-2">
        <Link to="/conversas" className="md:hidden h-10 w-10 -ml-2 grid place-items-center text-2xl" aria-label="Voltar">‹</Link>
        {/* Tocar no nome abre os detalhes, como no WhatsApp */}
        <button type="button" onClick={abrirDetalhes} className="min-w-0 flex-1 flex items-center gap-3 text-left">
          <span className={`h-10 w-10 shrink-0 rounded-full grid place-items-center font-semibold ${
            grupo ? "bg-linha text-tinta" : "bg-tinta text-white"}`}>
            {grupo ? "👥" : (contato.nome || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold truncate">{grupo ? contato.nome || "Grupo sem nome" : nomeOuTelefone(contato)}</span>
            <span className="block text-sm text-tinta-suave truncate">
              {grupo ? "Grupo do WhatsApp" : [formatarTelefone(contato.telefone), etapa].filter(Boolean).join(", ")}
            </span>
          </span>
        </button>
        {contato.bloqueado && (
          <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-alerta/10 text-alerta font-semibold">Bloqueado</span>
        )}
        {contato.conversa_fechada && (
          <span className="shrink-0 hidden sm:inline text-[11px] px-2 py-0.5 rounded-full bg-linha text-tinta-suave font-medium">Encerrada</span>
        )}
        {sla && <SeloSla sla={sla} />}
        {!grupo && <SeletorTipo tipo={contato.tipo_contato} noFunil={!!op} onEscolher={classificar} />}
        <button type="button" onClick={alternarEncerrada}
          title={contato.conversa_fechada ? "Voltar para as conversas em aberto" : "Mover para as conversas fechadas"}
          className="h-9 px-3 rounded-lg border border-linha grid place-items-center text-sm font-medium hover:bg-fundo">
          {contato.conversa_fechada ? "Reabrir" : "Encerrar"}
        </button>
        <button type="button" onClick={() => setPainel(painelAberto ? null : "detalhes")} aria-pressed={painelAberto}
          className={`hidden md:grid h-9 px-3 rounded-lg border place-items-center text-sm font-medium ${
            painelAberto ? "bg-tinta text-white border-tinta" : "border-linha hover:bg-fundo"}`}>
          Detalhes
        </button>
      </header>

      {/* Abas no celular; lado a lado no computador */}
      <div className="md:hidden grid grid-cols-2 bg-superficie border-b border-linha" role="tablist">
        {[["conversa", "Conversa"], ["detalhes", "Detalhes"]].map(([k, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`h-11 font-medium border-b-2 ${aba === k ? "border-sol text-tinta" : "border-transparent text-tinta-suave"}`}>{n}</button>
        ))}
      </div>

      <div className={`flex-1 min-h-0 md:grid md:grid-rows-[minmax(0,1fr)] ${
        painelAberto ? "md:grid-cols-[minmax(0,1fr)_380px]" : "md:grid-cols-[minmax(0,1fr)]"}`}>
        <div className={`h-full min-h-0 ${aba === "conversa" ? "block" : "hidden"} md:block`}>
          <Chat contato={contato} etapa={grupo ? null : op?.etapa} />
        </div>
        {mostrarPainel && (
          <div className={`relative h-full overflow-y-auto overscroll-contain border-l border-linha bg-fundo ${aba === "detalhes" ? "block" : "hidden"} md:block`}>
            {md && (
              <div className="sticky top-0 z-10 flex items-center justify-between h-12 px-4 bg-superficie border-b border-linha">
                <span className="font-semibold">Detalhes</span>
                <button type="button" onClick={() => setPainel(null)} aria-label="Fechar painel"
                  className="h-8 w-8 -mr-2 grid place-items-center rounded-lg text-tinta-suave hover:bg-fundo text-xl">×</button>
              </div>
            )}
            <DetalhesConversa contato={contato}>
              {!grupo && <Ficha contato={contato} op={op} onSalvo={carregar} />}
            </DetalhesConversa>
          </div>
        )}
      </div>
    </div>
  );
}

function IconeLista(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M9 10h6M9 13.5h4" />
  </svg>);
}
