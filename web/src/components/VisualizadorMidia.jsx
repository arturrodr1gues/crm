import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { dataCurta, hora } from "../lib/format";
import { useUrlMidia } from "../lib/whatsapp";
import { IconeFechar } from "./chat/Icones";

/**
 * Foto ou vídeo em tela cheia, dentro do CRM (nunca em outra aba).
 * Vai direto para o <body>, por cima de tudo. Fecha no ×, no Esc ou clicando fora;
 * com mais de um item, navega pelas setas (← → no teclado).
 * `itens` em ordem da mais nova para a mais antiga; `m._url_local` serve para a prévia de um envio em andamento.
 */
export default function VisualizadorMidia({ itens, indice = 0, onMudar, onFechar }) {
  const m = itens[indice];
  const assinada = useUrlMidia(m._url_local ? null : m.midia_path);
  const download = useUrlMidia(m._url_local ? null : m.midia_path, m.midia_nome || (m.tipo === "video" ? "video.mp4" : "foto.jpg"));
  const url = m._url_local ?? assinada;
  const fechar = useRef(null);

  const anterior = onMudar && indice < itens.length - 1 ? () => onMudar(indice + 1) : null;
  const proxima = onMudar && indice > 0 ? () => onMudar(indice - 1) : null;

  useEffect(() => {
    fechar.current?.focus();
    const tecla = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onFechar(); }
      if (e.key === "ArrowLeft") anterior?.();
      if (e.key === "ArrowRight") proxima?.();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [indice, onFechar]);

  // Pelo portal, os eventos ainda sobem na árvore do React até a bolha da mensagem
  // (que abre o menu no toque longo). Aqui eles param.
  const isolar = (e) => e.stopPropagation();

  const seta = "absolute top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl grid place-items-center";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={m.tipo === "video" ? "Vídeo" : "Foto"}
      onClick={isolar} onTouchStart={isolar} onTouchEnd={isolar} onTouchMove={isolar} onContextMenu={isolar}
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center gap-3 px-4 h-14 shrink-0 text-white">
        <span className="flex-1 min-w-0 text-sm">
          <span className="block">{m.direcao === "out" ? "Você" : "Recebida"} · {dataCurta(m.momento)} {hora(m.momento)}</span>
          {m.texto && <span className="block truncate text-white/70">{m.texto}</span>}
        </span>
        {download && <a href={download} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-sm grid place-items-center">Baixar</a>}
        <button ref={fechar} type="button" onClick={onFechar} aria-label="Fechar"
          className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">
          <IconeFechar className="w-5 h-5" />
        </button>
      </div>
      <div className="relative flex-1 min-h-0 grid place-items-center p-4" onClick={(e) => e.target === e.currentTarget && onFechar()}>
        {!url ? <span className="text-white/70 text-sm">Carregando…</span>
          : m.tipo === "video"
            ? <video key={url} src={url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
            : <img src={url} alt={m.texto || "Foto"} className="max-h-full max-w-full object-contain rounded-lg" />}
        {anterior && <button type="button" onClick={anterior} aria-label="Mais antiga" className={`${seta} left-3`}>‹</button>}
        {proxima && <button type="button" onClick={proxima} aria-label="Mais recente" className={`${seta} right-3`}>›</button>}
      </div>
      {itens.length > 1 && <p className="text-center text-xs text-white/50 pb-3">{itens.length - indice} de {itens.length}</p>}
    </div>,
    document.body,
  );
}
