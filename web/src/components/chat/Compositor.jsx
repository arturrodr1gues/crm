import { useEffect, useRef, useState } from "react";
import PainelEmoji from "./PainelEmoji";
import {
  IconeAnexo, IconeDoc, IconeEmoji, IconeEnquete, IconeEnviar, IconeFechar, IconeFigurinha, IconeFoto,
  IconeLixo, IconeMic, IconeMusica, IconePessoa,
} from "./Icones";
import { rotuloMensagem } from "../../lib/whatsapp";

/**
 * Barra de escrever: texto com emojis, anexos (foto, vídeo, arquivo, áudio, figurinha,
 * contato, enquete), gravação de áudio e a citação da mensagem que está sendo respondida.
 */
export default function Compositor({
  grupo, respostas, respondendo, autorDe, onCancelarResposta,
  onTexto, onArquivo, onFigurinha, onContato, onEnquete,
}) {
  const [texto, setTexto] = useState("");
  const [painel, setPainel] = useState(null); // null | "emoji" | "anexo"
  const [gravando, setGravando] = useState(false);
  const campo = useRef(null);
  const entradas = { midia: useRef(null), documento: useRef(null), audio: useRef(null), figurinha: useRef(null) };

  useEffect(() => { if (respondendo) campo.current?.focus(); }, [respondendo]);

  // Campo começa com 2 linhas e cresce com o texto até 4; depois disso rola por dentro.
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    // Vazio: altura natural de 2 linhas (evita medir antes de o estilo carregar)
    if (!texto) { el.style.height = ""; return; }
    el.style.height = "auto";
    const max = parseFloat(getComputedStyle(el).maxHeight);
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
  }, [texto, gravando]);

  function enviar(e) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t) return;
    onTexto(t);
    setTexto(""); setPainel(null);
  }

  // Insere o emoji onde está o cursor.
  function inserirEmoji(emoji) {
    const el = campo.current;
    const ini = el?.selectionStart ?? texto.length;
    const fim = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + emoji + texto.slice(fim));
    requestAnimationFrame(() => { el?.setSelectionRange(ini + emoji.length, ini + emoji.length); });
  }

  function arquivoEscolhido(e, forcar) {
    const f = e.target.files?.[0];
    e.target.value = "";
    setPainel(null);
    if (f) onArquivo(f, forcar);
  }

  function colar(e) {
    const f = [...(e.clipboardData?.files ?? [])][0];
    if (f) { e.preventDefault(); onArquivo(f); }
  }

  const anexos = [
    { rotulo: "Foto ou vídeo", Icone: IconeFoto, cor: "bg-sky-600", acao: () => entradas.midia.current.click() },
    { rotulo: "Arquivo", Icone: IconeDoc, cor: "bg-indigo-600", acao: () => entradas.documento.current.click() },
    { rotulo: "Áudio", Icone: IconeMusica, cor: "bg-orange-600", acao: () => entradas.audio.current.click() },
    { rotulo: "Figurinha", Icone: IconeFigurinha, cor: "bg-emerald-600", acao: () => entradas.figurinha.current.click() },
    { rotulo: "Contato", Icone: IconePessoa, cor: "bg-cyan-700", acao: () => { setPainel(null); onContato(); } },
    { rotulo: "Enquete", Icone: IconeEnquete, cor: "bg-amber-600", acao: () => { setPainel(null); onEnquete(); } },
  ];

  const botao = "h-10 w-9 shrink-0 grid place-items-center rounded-full text-tinta-suave hover:bg-fundo";

  return (
    <div className="relative border-t border-linha bg-superficie">
      {painel === "emoji" && (
        <PainelEmoji onEmoji={inserirEmoji} onFigurinha={(p) => { setPainel(null); onFigurinha(p); }} />
      )}
      {painel === "anexo" && (<>
        {/* Clique fora fecha o menu */}
        <div className="fixed inset-0 z-10" onClick={() => setPainel(null)} />
        <div role="menu" className="absolute z-20 bottom-full left-2 mb-1 w-48 py-1 rounded-xl bg-superficie border border-linha shadow-lg">
          {anexos.map(({ rotulo, Icone, cor, acao }) => (
            <button key={rotulo} type="button" role="menuitem" onClick={acao}
              className="w-full h-9 px-3 flex items-center gap-2.5 text-sm hover:bg-fundo">
              <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-white ${cor}`}><Icone className="w-3.5 h-3.5" /></span>
              {rotulo}
            </button>
          ))}
        </div>
      </>)}

      <input ref={entradas.midia} type="file" accept="image/*,video/*" hidden onChange={(e) => arquivoEscolhido(e)} />
      <input ref={entradas.documento} type="file" hidden onChange={(e) => arquivoEscolhido(e, "documento")} />
      <input ref={entradas.audio} type="file" accept="audio/*" hidden onChange={(e) => arquivoEscolhido(e, "audio")} />
      <input ref={entradas.figurinha} type="file" accept="image/*" hidden onChange={(e) => arquivoEscolhido(e, "figurinha")} />

      <div className="px-2 py-1.5">
        {respostas.length > 0 && !respondendo && !gravando && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {respostas.map((r) => (
              <button key={r.id} type="button" onClick={() => setTexto(r.texto)}
                className="shrink-0 text-[13px] px-3 h-8 rounded-full border border-linha bg-fundo">
                {r.atalho}
              </button>
            ))}
          </div>
        )}

        {respondendo && (
          <div className="flex items-center gap-2 mb-2 pl-3 pr-1 py-1.5 rounded-lg bg-fundo border-l-4 border-sol">
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-xs font-semibold text-sol-escuro">Respondendo a {autorDe(respondendo)}</div>
              <div className="truncate text-tinta-suave">{rotuloMensagem(respondendo)}</div>
            </div>
            <button type="button" onClick={onCancelarResposta} aria-label="Cancelar resposta" className="h-9 w-9 grid place-items-center">
              <IconeFechar className="w-5 h-5" />
            </button>
          </div>
        )}

        {gravando ? (
          <Gravador onCancelar={() => setGravando(false)}
            onPronto={(f) => { setGravando(false); onArquivo(f, "audio", { voz: true, direto: true }); }} />
        ) : (
          <form onSubmit={enviar} className="flex items-end gap-1">
            <button type="button" onClick={() => setPainel(painel === "emoji" ? null : "emoji")} aria-label="Emojis e figurinhas"
              aria-pressed={painel === "emoji"} className={`${botao} ${painel === "emoji" ? "text-tinta" : ""}`}>
              <IconeEmoji className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setPainel(painel === "anexo" ? null : "anexo")} aria-label="Anexar"
              aria-pressed={painel === "anexo"} className={`${botao} ${painel === "anexo" ? "text-tinta" : ""}`}>
              <IconeAnexo className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => { setPainel(null); setGravando(true); }} aria-label="Gravar áudio" className={botao}>
              <IconeMic className="w-5 h-5" />
            </button>
            <textarea ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} onPaste={colar}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) enviar(e);
                if (e.key === "Escape" && respondendo) onCancelarResposta();
              }}
              placeholder={grupo ? "Escreva para o grupo" : "Escreva uma mensagem"}
              className="flex-1 min-w-0 resize-none leading-6 max-h-[7.125rem] overflow-y-auto px-3.5 py-2 rounded-2xl border border-linha bg-fundo text-base" />
            <button disabled={!texto.trim()} aria-label="Enviar"
              className="h-10 w-10 shrink-0 grid place-items-center rounded-full bg-sol text-tinta disabled:opacity-40">
              <IconeEnviar className="w-[18px] h-[18px]" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// Formatos que o navegador consegue gravar, do preferido ao último recurso (Safari só grava MP4).
const FORMATOS = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

function Gravador({ onCancelar, onPronto }) {
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState("");
  const gravador = useRef(null);
  const partes = useRef([]);
  const enviarAoParar = useRef(false);

  useEffect(() => {
    let stream, relogio, cancelado = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        const mimeType = FORMATOS.find((f) => window.MediaRecorder?.isTypeSupported?.(f));
        const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        rec.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (!enviarAoParar.current) return;
          const tipo = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
          const ext = { "audio/ogg": "ogg", "audio/mp4": "m4a" }[tipo] ?? "webm";
          onPronto(new File(partes.current, `audio-${Date.now()}.${ext}`, { type: tipo }));
        };
        rec.start(250);
        gravador.current = rec;
        relogio = setInterval(() => setSegundos((s) => s + 1), 1000);
      } catch {
        setErro("Não foi possível usar o microfone. Libere o acesso nas permissões do navegador.");
      }
    })();
    return () => {
      cancelado = true;
      clearInterval(relogio);
      if (gravador.current?.state === "recording") gravador.current.stop();
      else stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function parar(enviar) {
    enviarAoParar.current = enviar;
    if (gravador.current?.state === "recording") gravador.current.stop();
    if (!enviar) onCancelar();
  }

  const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");

  if (erro) {
    return (
      <div className="flex items-center gap-2 min-h-12">
        <p className="flex-1 text-alerta text-sm">{erro}</p>
        <button type="button" onClick={onCancelar} className="h-12 px-4 rounded-xl border border-linha">Fechar</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => parar(false)} aria-label="Descartar áudio"
        className="h-10 w-10 grid place-items-center rounded-full text-alerta hover:bg-fundo">
        <IconeLixo className="w-6 h-6" />
      </button>
      <div className="flex-1 h-10 px-3.5 rounded-3xl bg-fundo border border-linha flex items-center gap-2" aria-live="polite">
        <span className="h-3 w-3 rounded-full bg-alerta animate-pulse" />
        <span className="tabular-nums">{mm}:{ss}</span>
        <span className="text-sm text-tinta-suave">Gravando…</span>
      </div>
      <button type="button" onClick={() => parar(true)} disabled={segundos < 1} aria-label="Enviar áudio"
        className="h-10 w-10 grid place-items-center rounded-full bg-sol text-tinta disabled:opacity-50">
        <IconeEnviar className="w-5 h-5" />
      </button>
    </div>
  );
}
