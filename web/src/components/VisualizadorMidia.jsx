import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dataCurta, hora } from "../lib/format";
import { useUrlMidia } from "../lib/whatsapp";
import { IconeFechar } from "./chat/Icones";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const PASSO = 0.5;

/**
 * Foto ou vídeo numa janela centralizada, dentro do CRM (nunca em outra aba).
 * Vai direto para o <body>, por cima de tudo. Fecha no ×, no Esc ou clicando fora;
 * com mais de um item, navega pelas setas (← → no teclado).
 * Foto tem zoom no rodapé (ou + / − no teclado, duplo clique alterna 2x); com zoom, arrasta-se pela rolagem.
 * `itens` em ordem da mais nova para a mais antiga; `m._url_local` serve para a prévia de um envio em andamento.
 */
export default function VisualizadorMidia({ itens, indice = 0, onMudar, onFechar }) {
  const m = itens[indice];
  const assinada = useUrlMidia(m._url_local ? null : m.midia_path);
  const download = useUrlMidia(m._url_local ? null : m.midia_path, m.midia_nome || (m.tipo === "video" ? "video.mp4" : "foto.jpg"));
  const url = m._url_local ?? assinada;
  const foto = m.tipo !== "video";
  const fechar = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [base, setBase] = useState(null); // largura da foto ajustada à janela (zoom 1)

  const anterior = onMudar && indice < itens.length - 1 ? () => onMudar(indice + 1) : null;
  const proxima = onMudar && indice > 0 ? () => onMudar(indice - 1) : null;
  const mudarZoom = (z) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)));

  useEffect(() => { setZoom(1); setBase(null); }, [indice]);

  // Largura da foto ajustada à janela, base do zoom. Mede depois de desenhar
  // (foto em cache pode carregar antes do onLoad ser ligado) e no onLoad.
  const imgRef = useRef(null);
  const medir = () => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth) setBase(el.getBoundingClientRect().width);
  };
  useEffect(() => { if (zoom === 1) medir(); }, [url, zoom]);

  // Ao mudar o zoom, mantém o centro da foto no meio da janela.
  const area = useRef(null);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoom]);

  useEffect(() => {
    fechar.current?.focus();
    const tecla = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onFechar(); }
      if (e.key === "ArrowLeft") anterior?.();
      if (e.key === "ArrowRight") proxima?.();
      if (foto && (e.key === "+" || e.key === "=")) setZoom((z) => Math.min(ZOOM_MAX, z + PASSO));
      if (foto && e.key === "-") setZoom((z) => Math.max(ZOOM_MIN, z - PASSO));
      if (foto && e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [indice, onFechar, foto]);

  // Pelo portal, os eventos ainda sobem na árvore do React até a bolha da mensagem
  // (que abre o menu no toque longo). Aqui eles param.
  const isolar = (e) => e.stopPropagation();

  const seta = "absolute top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white text-2xl grid place-items-center";
  const botaoRodape = "h-9 min-w-9 px-2 rounded-lg grid place-items-center text-sm hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";
  const ampliada = zoom > 1 && base;

  // Janela centralizada (não a tela inteira); clicar no fundo escuro fecha.
  return createPortal(
    <div onClick={(e) => { isolar(e); if (e.target === e.currentTarget) onFechar(); }}
      onTouchStart={isolar} onTouchEnd={isolar} onTouchMove={isolar} onContextMenu={isolar}
      className="fixed inset-0 z-[100] bg-black/60 grid place-items-center p-4 md:p-8">
      <div role="dialog" aria-modal="true" aria-label={foto ? "Foto" : "Vídeo"}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-tinta shadow-2xl overflow-hidden">

        <div className="flex items-center gap-3 px-5 py-3.5 shrink-0 text-white border-b border-white/10">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">{m.direcao === "out" ? "Você" : "Recebida"} · {dataCurta(m.momento)} {hora(m.momento)}</span>
            {m.texto && <span className="block truncate text-sm text-white/70">{m.texto}</span>}
          </span>
          {download && <a href={download} className="h-9 px-3.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm grid place-items-center">Baixar</a>}
          <button ref={fechar} type="button" onClick={onFechar} aria-label="Fechar"
            className="h-9 w-9 -mr-1.5 rounded-lg hover:bg-white/10 grid place-items-center">
            <IconeFechar className="w-5 h-5" />
          </button>
        </div>

        {/* Área da mídia: com zoom, a foto passa do tamanho da janela e rola por dentro */}
        <div className="relative flex-1 min-h-0 flex flex-col bg-black/30">
          <div ref={area} className={`flex-1 min-h-0 flex p-3 ${ampliada ? "overflow-auto cursor-zoom-out" : "overflow-hidden"}`}>
            {!url ? <span className="m-auto text-white/70 text-sm py-16">Carregando…</span>
              : !foto
                ? <video key={url} src={url} controls autoPlay playsInline className="m-auto max-h-[calc(85vh-9rem)] max-w-full rounded-lg" />
                : (
                  <img ref={imgRef} src={url} alt={m.texto || "Foto"} draggable={false}
                    onLoad={() => zoom === 1 && medir()}
                    onDoubleClick={() => mudarZoom(zoom > 1 ? 1 : 2)}
                    style={ampliada ? { width: base * zoom, maxWidth: "none", maxHeight: "none" } : undefined}
                    className={`m-auto shrink-0 rounded-lg select-none ${ampliada ? "" : "max-h-[calc(85vh-9rem)] max-w-full object-contain cursor-zoom-in"}`} />
                )}
          </div>
          {anterior && <button type="button" onClick={anterior} aria-label="Mais antiga" className={`${seta} left-2`}>‹</button>}
          {proxima && <button type="button" onClick={proxima} aria-label="Mais recente" className={`${seta} right-2`}>›</button>}
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 shrink-0 text-white border-t border-white/10">
          <span className="flex-1 text-xs text-white/50">{itens.length > 1 ? `${itens.length - indice} de ${itens.length}` : ""}</span>
          {foto && (
            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <button type="button" onClick={() => mudarZoom(zoom - PASSO)} disabled={zoom <= ZOOM_MIN} aria-label="Diminuir zoom" className={botaoRodape}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" /></svg>
              </button>
              <button type="button" onClick={() => setZoom(1)} title="Ajustar à janela" className={`${botaoRodape} w-14 tabular-nums`}>
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={() => mudarZoom(zoom + PASSO)} disabled={zoom >= ZOOM_MAX} aria-label="Aumentar zoom" className={botaoRodape}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6M11 8v6" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
