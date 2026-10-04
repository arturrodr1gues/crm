import { useCallback, useRef, useState } from "react";
import { classeCor, nomeEtapa, tipoEtapa, useEtapas } from "../lib/etapas";
import { BotaoPrimario, BotaoSecundario, Campo, Entrada, Flutuante, ItemLista, Modal, SeloEtapa } from "./ui";

/**
 * Selo da etapa que abre a lista de etapas do funil, para mudar o lead de coluna sem sair da conversa.
 * Indo para Perdido, pergunta o motivo (opcional), como no quadro do funil.
 * `onMudar(etapa, motivo)` pode lançar erro; a mensagem aparece abaixo do selo.
 */
export default function SeletorEtapa({ etapa, onMudar }) {
  const etapas = useEtapas();
  const botao = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [perdendo, setPerdendo] = useState(null); // etapa de perda escolhida, esperando o motivo
  const [erro, setErro] = useState("");
  const [sobre, setSobre] = useState(null); // opção sob o mouse
  const fechar = useCallback(() => setAberto(false), []);

  async function mudar(id, motivo = null) {
    setErro("");
    try { await onMudar(id, motivo); } catch (e) { setErro(e.message); }
  }

  function escolher(id) {
    setAberto(false);
    if (id === etapa) return;
    if (tipoEtapa(id) === "perdido") setPerdendo(id);
    else mudar(id);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button ref={botao} type="button" onClick={() => setAberto(!aberto)}
        aria-haspopup="listbox" aria-expanded={aberto} title="Mudar a etapa do funil"
        className="flex items-center gap-1 rounded-full bg-superficie shadow-md pr-2 hover:shadow-lg">
        <SeloEtapa etapa={etapa} grande />
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className={`w-3.5 h-3.5 text-tinta-suave transition-transform ${aberto ? "rotate-180" : ""}`}>
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {erro && <span role="alert" className="text-xs text-alerta bg-superficie rounded px-2 py-0.5 shadow-sm">{erro}</span>}

      {aberto && (
        <Flutuante ancora={botao} onFechar={fechar} direita role="listbox" aria-label="Etapa do funil" className="w-56">
          <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta-suave">Mover para</p>
          {etapas.map((e) => (
            <ItemLista key={e.id} role="option" aria-selected={e.id === etapa} selecionado={e.id === etapa}
              ativo={e.id === sobre} onMouseEnter={() => setSobre(e.id)} onMouseLeave={() => setSobre(null)}
              onClick={() => escolher(e.id)}>
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${classeCor(e.cor)}`} />
                <span className="truncate">{e.nome}</span>
              </span>
            </ItemLista>
          ))}
        </Flutuante>
      )}

      {perdendo && (
        <MotivoPerda etapa={perdendo} onFechar={() => setPerdendo(null)}
          onSalvar={(motivo) => { setPerdendo(null); mudar(perdendo, motivo); }} />
      )}
    </div>
  );
}

function MotivoPerda({ etapa, onFechar, onSalvar }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal titulo="Por que não fechou?" onFechar={onFechar}>
      <form onSubmit={(e) => { e.preventDefault(); onSalvar(motivo.trim() || null); }} className="space-y-4">
        <p className="text-sm text-tinta-suave">
          O lead vai para {nomeEtapa(etapa)}. Anotar o motivo ajuda a entender o funil depois.
        </p>
        <Campo rotulo="Motivo (opcional)">
          <Entrada autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: preferiu esperar" />
        </Campo>
        <div className="flex gap-3 justify-end">
          <BotaoSecundario type="button" onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario>Mover</BotaoPrimario>
        </div>
      </form>
    </Modal>
  );
}
