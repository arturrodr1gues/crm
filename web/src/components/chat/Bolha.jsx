import { useEffect, useRef, useState } from "react";
import { formatarTelefone, hora } from "../../lib/format";
import { rotuloMensagem, tamanhoLegivel, useUrlMidia } from "../../lib/whatsapp";
import { IconeDoc, IconeMenu, Tiques } from "./Icones";

const TIPOS_MIDIA = ["imagem", "video", "audio", "documento", "figurinha"];
// Largura fixa das mídias, como no WhatsApp.
const LARGURA_MIDIA = "w-56 md:w-64";

export default function Bolha({ m, grupo, citada, autorDe, onAcoes, onIrPara, onVotar, destacada }) {
  const minha = m.direcao === "out";
  const pressao = useRef(null);

  // Toque longo no celular abre as ações, como no WhatsApp.
  const toque = {
    onTouchStart: () => { pressao.current = setTimeout(() => onAcoes(m), 450); },
    onTouchEnd: () => clearTimeout(pressao.current),
    onTouchMove: () => clearTimeout(pressao.current),
    onContextMenu: (e) => { e.preventDefault(); onAcoes(m); },
  };

  const reacoes = Object.entries(m.reacoes ?? {});
  const contagem = reacoes.reduce((acc, [, e]) => ({ ...acc, [e]: (acc[e] ?? 0) + 1 }), {});

  // Como a hora aparece: junto do texto ou numa linha própria, na borda de baixo (nunca sobre a foto).
  const midiaVisual = (m.tipo === "imagem" || m.tipo === "video") && !m.apagada;
  const semBolha = m.tipo === "figurinha" && !m.apagada;
  const horaEmLinha = !m.apagada && (semBolha || (midiaVisual && !m.texto) ||
    ["audio", "documento", "contato", "enquete"].includes(m.tipo));

  const meta = <Meta m={m} minha={minha} neutro={semBolha} />;

  return (
    <div id={m.message_id ? `msg-${m.message_id}` : undefined}
      className={`flex ${minha ? "justify-end" : "justify-start"} ${reacoes.length ? "mb-3" : ""}`}>
      <div className="group relative max-w-[82%] md:max-w-[62%]" {...toque}>
        <div className={`relative rounded-xl break-words text-[15px] leading-snug transition-shadow shadow-sm ${
          destacada ? "ring-4 ring-sol/60" : ""} ${semBolha ? "shadow-none" :
          `${midiaVisual ? "p-1" : "px-2.5 py-1.5"} ${minha ? "bg-tinta text-white rounded-tr-sm" : "bg-superficie rounded-tl-sm"}`}`}>
          {grupo && !minha && (
            <div className={`text-[13px] font-semibold text-sol-escuro ${midiaVisual ? "px-1.5 pt-0.5 pb-1" : "mb-0.5"}`}>
              {m.autor_nome || formatarTelefone(m.autor_telefone) || "Participante"}
            </div>
          )}

          {m.resposta_a && !m.apagada && (
            <button type="button" onClick={() => onIrPara(m.resposta_a)}
              className={`block w-full min-w-0 text-left mb-1 px-2 py-1 rounded-md border-l-[3px] border-sol text-[13px] leading-tight ${
                minha ? "bg-white/10" : "bg-fundo"}`}>
              <span className="block font-semibold text-sol-escuro">{citada ? autorDe(citada) : "Mensagem"}</span>
              <span className="block truncate opacity-75">{citada ? rotuloMensagem(citada) : "Mensagem anterior"}</span>
            </button>
          )}

          {m.apagada ? (
            <div className="italic opacity-70">
              🚫 {minha ? "Você apagou esta mensagem" : "Esta mensagem foi apagada"}
              {m.texto && <div className="text-xs line-through whitespace-pre-wrap">{m.texto}</div>}
              <Espaco meta={meta} />
            </div>
          ) : <Conteudo m={m} minha={minha} meta={meta} onVotar={onVotar} />}

          {!horaEmLinha && <div className="absolute right-2 bottom-1">{meta}</div>}
          {horaEmLinha && (
            <div className={`flex justify-end ${midiaVisual ? "px-1.5 pt-1 pb-0.5" : semBolha ? "pt-0.5" : "-mb-0.5"}`}>{meta}</div>
          )}
        </div>

        {!m.apagada && m.status !== "falhou" && m.status !== "pendente" && (
          <button type="button" onClick={() => onAcoes(m)} aria-label="Ações da mensagem"
            className={`absolute top-0.5 ${minha ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"}
              h-7 w-8 hidden md:grid place-items-center text-tinta-suave opacity-0 group-hover:opacity-100 focus:opacity-100`}>
            <span className="h-6 w-6 grid place-items-center rounded-full bg-superficie border border-linha shadow-sm">
              <IconeMenu className="w-4 h-4" />
            </span>
          </button>
        )}

        {reacoes.length > 0 && (
          <button type="button" onClick={() => onAcoes(m)}
            title={reacoes.map(([autor, e]) => `${e} ${autor === "eu" ? "Você" : formatarTelefone(autor) || "Participante"}`).join("\n")}
            className={`absolute -bottom-3.5 ${minha ? "right-2" : "left-2"} h-6 px-1.5 rounded-full bg-superficie border border-linha shadow-sm text-[13px] flex items-center gap-0.5`}>
            {Object.entries(contagem).map(([e, n]) => <span key={e}>{e}{n > 1 && <span className="text-[11px] text-tinta-suave">{n}</span>}</span>)}
          </button>
        )}
      </div>
    </div>
  );
}

/** Hora, "Editada", etiqueta "Fora do CRM" e tiques. */
function Meta({ m, minha, neutro }) {
  const cor = minha && !neutro ? "text-white/60" : "text-tinta-suave";
  // Enviada pelo número conectado, mas direto no WhatsApp (celular, WhatsApp Web), não pelo CRM.
  const foraDoCrm = minha && !m.enviado_por && m.status !== "pendente" && !String(m.id).startsWith("local-");
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap ${cor}`}>
      {foraDoCrm && (
        <span title="Enviada pelo WhatsApp do número conectado, fora do CRM"
          className={`px-1 py-0.5 rounded text-[10px] font-medium ${neutro ? "bg-linha text-tinta" : "bg-white/15 text-white/80"}`}>
          Fora do CRM
        </span>
      )}
      {m.editada_em && !m.apagada && <span>Editada</span>}
      {m.status === "falhou"
        ? <span className="text-sol font-medium" title={m.erro ?? ""}>Não enviada</span>
        : <span>{hora(m.momento)}</span>}
      {minha && m.status !== "falhou" && <Tiques status={m.status} />}
    </span>
  );
}

// Reserva no fim do texto o lugar da hora, que fica por cima no canto (como no WhatsApp).
const Espaco = ({ meta }) => <span aria-hidden="true" className="invisible inline-block ml-2 align-bottom">{meta}</span>;

function Conteudo({ m, minha, meta, onVotar }) {
  const legenda = (classe = "") => m.texto && (
    <div className={`whitespace-pre-wrap ${classe}`}>{m.texto}<Espaco meta={meta} /></div>
  );

  switch (m.tipo) {
    case "imagem":
    case "video":
      return <><Midia m={m} minha={minha} />{legenda("px-1.5 pt-1 pb-0.5")}</>;
    case "figurinha":
    case "audio":
      return <Midia m={m} minha={minha} />;
    case "documento":
      return <><Midia m={m} minha={minha} />{m.texto && m.texto !== m.midia_nome && legenda("mt-1")}</>;
    case "contato":
      return <Contato m={m} minha={minha} />;
    case "enquete":
      return <Enquete m={m} minha={minha} onVotar={onVotar} />;
    default:
      return m.texto
        ? <div className="whitespace-pre-wrap">{m.texto}<Espaco meta={meta} /></div>
        : <div><em className="opacity-70">[{m.tipo}]</em><Espaco meta={meta} /></div>;
  }
}

function Midia({ m, minha }) {
  const url = useUrlMidia(m._url_local ? null : m.midia_path);
  const download = useUrlMidia(m.tipo === "documento" && !m._url_local ? m.midia_path : null, m.midia_nome || "arquivo");
  const src = m._url_local ?? url;

  if (!src && TIPOS_MIDIA.includes(m.tipo) && m.tipo !== "documento") {
    // Mídia recebida é copiada para o Storage logo depois que chega.
    const antiga = Date.now() - new Date(m.momento).getTime() > 5 * 60 * 1000;
    const rotulo = `${rotuloMensagem({ ...m, texto: null })} · ${m.midia_path || !antiga ? "carregando…" : "indisponível"}`;
    if (m.tipo === "audio") return <div className="w-56 text-sm italic opacity-70 py-1">{rotulo}</div>;
    return (
      <div className={`${m.tipo === "figurinha" ? "w-28 h-28" : `${LARGURA_MIDIA} h-40`} rounded-lg grid place-items-center text-xs italic text-center p-2 ${
        minha ? "bg-white/10 text-white/70" : "bg-fundo text-tinta-suave"}`}>{rotulo}</div>
    );
  }

  switch (m.tipo) {
    case "imagem":
      return (
        <a href={src} target="_blank" rel="noreferrer" className={`block ${LARGURA_MIDIA}`}>
          <img src={src} alt={m.texto || "Foto"} loading="lazy" className="block w-full h-auto max-h-64 md:max-h-72 object-cover rounded-lg" />
        </a>
      );
    case "video":
      return <video src={src} controls preload="metadata" playsInline className={`block ${LARGURA_MIDIA} max-h-64 md:max-h-72 rounded-lg bg-black`} />;
    case "figurinha":
      return <img src={src} alt="Figurinha" loading="lazy" className="block w-28 h-28 object-contain" />;
    case "audio":
      return <Audio src={src} minha={minha} />;
    default:
      return (
        <a href={download ?? src ?? undefined} target="_blank" rel="noreferrer" download={m.midia_nome || true}
          className={`flex items-center gap-2 p-2 rounded-lg w-60 max-w-full ${minha ? "bg-white/10" : "bg-fundo"}`}>
          <IconeDoc className="w-7 h-7 shrink-0 opacity-80" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{m.midia_nome || "Arquivo"}</span>
            <span className="block text-[11px] opacity-70">
              {[tamanhoLegivel(m.midia_tamanho), src || download ? "Baixar" : "carregando…"].filter(Boolean).join(" · ")}
            </span>
          </span>
        </a>
      );
  }
}

const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/** Player de áudio compacto (o nativo do navegador é largo demais para a bolha). */
function Audio({ src, minha }) {
  const el = useRef(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);

  useEffect(() => { setTocando(false); setAtual(0); }, [src]);

  function alternar() {
    const a = el.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  }

  function pular(e) {
    const a = el.current;
    if (!a || !duracao) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duracao;
  }

  const progresso = duracao ? (atual / duracao) * 100 : 0;

  return (
    <div className="flex items-center gap-2 w-56 max-w-full py-0.5">
      <audio ref={el} src={src} preload="metadata"
        onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
        onEnded={() => { setTocando(false); setAtual(0); }}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuracao(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuracao(e.currentTarget.duration)} />
      <button type="button" onClick={alternar} aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}
        className={`h-9 w-9 shrink-0 grid place-items-center rounded-full ${minha ? "bg-white/15 text-white" : "bg-tinta text-white"}`}>
        {tocando
          ? <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          : <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>}
      </button>
      <div className="flex-1 min-w-0">
        <div role="slider" aria-label="Posição do áudio" aria-valuemin={0} aria-valuemax={Math.round(duracao)} aria-valuenow={Math.round(atual)}
          tabIndex={0} onClick={pular}
          className="relative h-4 flex items-center cursor-pointer">
          <div className={`h-1 w-full rounded-full ${minha ? "bg-white/25" : "bg-linha"}`}>
            <div className="h-full rounded-full bg-sol" style={{ width: `${progresso}%` }} />
          </div>
          <div className="absolute h-3 w-3 rounded-full bg-sol -translate-x-1/2" style={{ left: `${progresso}%` }} />
        </div>
        <div className={`text-[11px] leading-none ${minha ? "text-white/60" : "text-tinta-suave"}`}>
          {mmss(tocando || atual ? atual : duracao)}
        </div>
      </div>
    </div>
  );
}

function Contato({ m, minha }) {
  const c = m.extra ?? {};
  const nome = c.nome || m.texto || "Contato";
  return (
    <div className="w-56 max-w-full">
      <div className="flex items-center gap-2">
        <span className={`h-8 w-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${minha ? "bg-white/15" : "bg-fundo"}`}>
          {nome.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{nome}</span>
          {(c.telefones ?? []).map((t) => (
            <a key={t} href={`https://wa.me/${t}`} target="_blank" rel="noreferrer"
              className="block text-[13px] underline opacity-80">{formatarTelefone(t) || t}</a>
          ))}
        </span>
      </div>
    </div>
  );
}

function Enquete({ m, minha, onVotar }) {
  const e = m.extra ?? {};
  const opcoes = e.opcoes ?? [];
  const votos = Object.values(e.votos ?? {});
  const porOpcao = Object.fromEntries(opcoes.map((o) => [o, votos.filter((v) => v.includes(o)).length]));
  const maior = Math.max(1, ...Object.values(porOpcao));
  const meuVoto = e.votos?.eu ?? [];
  // Só dá para votar depois que a enquete chegou ao WhatsApp.
  const podeVotar = onVotar && m.message_id && !["pendente", "falhou"].includes(m.status);

  return (
    <div className="w-60 max-w-full">
      <div className="font-semibold whitespace-pre-wrap">{e.pergunta || m.texto}</div>
      <div className="text-[11px] opacity-70 mb-1.5">
        {e.multipla ? "Uma ou mais opções" : "Uma opção"} · {votos.length} {votos.length === 1 ? "voto" : "votos"}
      </div>
      <ul className="space-y-0.5">
        {opcoes.map((o) => {
          const marcada = meuVoto.includes(o);
          return (
            <li key={o}>
              <button type="button" disabled={!podeVotar} onClick={() => !marcada && onVotar(m, o)}
                aria-pressed={marcada} aria-label={`Votar em ${o}`}
                className={`w-full text-left text-[13px] flex items-center gap-2 py-1 -mx-1 px-1 rounded-md ${
                  podeVotar ? (minha ? "hover:bg-white/10" : "hover:bg-fundo") : "cursor-default"}`}>
                <span className={`h-4 w-4 shrink-0 rounded-full border-2 grid place-items-center ${
                  marcada ? "border-sol bg-sol" : minha ? "border-white/50" : "border-tinta-suave/60"}`}>
                  {marcada && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-tinta" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.5 5 9l4.5-6" /></svg>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between gap-3"><span className="min-w-0 break-words">{o}</span><span className="opacity-70">{porOpcao[o]}</span></span>
                  <span className={`block h-1 rounded-full mt-0.5 ${minha ? "bg-white/15" : "bg-fundo"}`}>
                    <span className="block h-full rounded-full bg-sol" style={{ width: `${(porOpcao[o] / maior) * 100}%` }} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
