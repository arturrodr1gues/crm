import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { nomeEtapa, tipoEtapa, useEtapas } from "../lib/etapas";
import { semAcento } from "../lib/funil";

export function Modal({ titulo, onFechar, children, estreito }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 bg-tinta/50 flex items-end md:items-center justify-center animate-aparecer"
      onClick={onFechar}>
      {/* Celular: sobe da borda de baixo. Computador: aparece crescendo no meio. */}
      <div role="dialog" aria-modal="true" aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={`bg-superficie w-full ${estreito ? "md:max-w-xs" : "md:max-w-lg"} rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-subir md:animate-escala`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="h-10 w-10 -mr-2 text-2xl text-tinta-suave">×</button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

const baseInput = "mt-1 w-full h-12 px-3 rounded-lg border border-linha bg-fundo text-base";

export function Campo({ rotulo, dica, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{rotulo}</span>
      {children}
      {dica && <span className="block text-xs text-tinta-suave mt-1">{dica}</span>}
    </label>
  );
}

export const Entrada = (props) => <input {...props} className={`${baseInput} ${props.className ?? ""}`} />;

// Painel flutuante preso a um elemento (opções de um seletor, sugestões de busca).
// Vai para o <body> para não ser cortado por modais ou áreas com rolagem, e abre
// para cima quando não cabe embaixo.
export function Flutuante({ ancora, onFechar, children, className = "", ...props }) {
  const painel = useRef(null);
  const [pos, setPos] = useState(null);

  const posicionar = useRef();
  posicionar.current = () => {
    const el = ancora.current;
    if (!el || !painel.current) return;
    const r = el.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom - 12;
    const acima = r.top - 12;
    const desejada = Math.min(painel.current.scrollHeight, ALTURA_PAINEL);
    const paraCima = abaixo < desejada && acima > abaixo;
    const novo = {
      left: r.left, width: r.width,
      maxHeight: Math.min(ALTURA_PAINEL, paraCima ? acima : abaixo),
      ...(paraCima ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    };
    setPos((p) => (JSON.stringify(p) === JSON.stringify(novo) ? p : novo));
  };

  useLayoutEffect(() => posicionar.current());

  useEffect(() => {
    const mover = () => posicionar.current();
    const fora = (e) => {
      if (painel.current?.contains(e.target) || ancora.current?.contains(e.target)) return;
      onFechar();
    };
    window.addEventListener("resize", mover);
    window.addEventListener("scroll", mover, true);
    document.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("resize", mover);
      window.removeEventListener("scroll", mover, true);
      document.removeEventListener("pointerdown", fora);
    };
  }, [ancora, onFechar]);

  return createPortal(
    <div ref={painel} {...props}
      onMouseDown={(e) => e.preventDefault()} // mantém o foco no campo
      style={pos ?? { visibility: "hidden", top: 0, left: 0 }}
      className={`fixed z-[60] py-1 overflow-y-auto overscroll-contain rounded-xl bg-superficie border border-linha shadow-lg ${pos ? "animate-menu" : ""} ${className}`}>
      {children}
    </div>,
    document.body,
  );
}

const ALTURA_PAINEL = 288;

// Item de lista dentro de um Flutuante
export function ItemLista({ ativo, selecionado, apagado, children, ...props }) {
  return (
    <div {...props}
      className={`min-h-10 px-3 py-2 flex items-center gap-2 cursor-pointer text-base ${ativo ? "bg-fundo" : ""} ${
        selecionado ? "font-semibold" : ""} ${apagado ? "text-tinta-suave" : ""}`}>
      <span className="flex-1 min-w-0">{children}</span>
      {selecionado && <IconeCheck className="w-4 h-4 shrink-0 text-sol-escuro" />}
    </div>
  );
}

const ALTURA_SELECAO = {
  campo: "h-12 bg-fundo",        // dentro de formulários, igual às outras entradas
  barra: "h-11 bg-superficie",   // barras de filtro
  compacto: "h-10 bg-superficie",
};

/**
 * Seletor com a cara do sistema. Mesmo uso do <select>: `onChange` recebe
 * `{ target: { value } }`, então `onChange={set("campo")}` continua funcionando.
 * `vazio` adiciona uma primeira opção com valor "".
 */
export function Selecao({ opcoes, vazio, value, onChange, variante = "campo", className = "", disabled, ...props }) {
  const botao = useRef(null);
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const digitado = useRef({ texto: "", quando: 0 });

  const lista = vazio !== undefined ? [{ id: "", nome: vazio, vazio: true }, ...opcoes] : opcoes;
  const atual = lista.findIndex((o) => String(o.id) === String(value ?? ""));
  const escolhido = lista[atual];

  const fechar = useCallback(() => setAberto(false), []);
  function abrir() { setAtivo(Math.max(atual, 0)); setAberto(true); }
  function escolher(i) {
    setAberto(false);
    const o = lista[i];
    if (o && i !== atual) onChange?.({ target: { value: o.id } });
  }

  useEffect(() => {
    if (aberto) document.getElementById(`${base}-${ativo}`)?.scrollIntoView({ block: "nearest" });
  }, [aberto, ativo, base]);

  // Digitar pula para a opção que começa com o texto, como no <select>
  function buscar(letra) {
    const d = digitado.current;
    const agora = Date.now();
    d.texto = agora - d.quando > 700 ? letra : d.texto + letra;
    d.quando = agora;
    const de = aberto ? ativo : atual;
    const passo = d.texto.length === 1 ? 1 : 0;
    for (let n = 0; n < lista.length; n++) {
      const i = (de + passo + n + lista.length) % lista.length;
      if (semAcento(String(lista[i].nome)).startsWith(semAcento(d.texto))) return aberto ? setAtivo(i) : escolher(i);
    }
  }

  function tecla(e) {
    const k = e.key;
    if (k === "Tab") { setAberto(false); return; }
    if (k.length === 1 && k !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) { buscar(k); return; }
    if (!aberto) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(k)) { e.preventDefault(); abrir(); }
      return;
    }
    e.preventDefault();
    if (k === "Escape") { e.stopPropagation(); setAberto(false); } // não fecha o modal junto
    else if (k === "ArrowDown") setAtivo((a) => Math.min(a + 1, lista.length - 1));
    else if (k === "ArrowUp") setAtivo((a) => Math.max(a - 1, 0));
    else if (k === "Home") setAtivo(0);
    else if (k === "End") setAtivo(lista.length - 1);
    else if (k === "Enter" || k === " ") escolher(ativo);
  }

  return (
    <div className={`relative ${variante === "campo" ? "mt-1" : ""} ${className}`}>
      <button ref={botao} type="button" disabled={disabled} {...props}
        role="combobox" aria-haspopup="listbox" aria-expanded={aberto} aria-controls={aberto ? `${base}-lista` : undefined}
        aria-activedescendant={aberto ? `${base}-${ativo}` : undefined}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={tecla} onKeyUp={(e) => e.key === " " && e.preventDefault()}
        className={`w-full flex items-center gap-2 px-3 rounded-lg border text-base text-left transition-colors disabled:opacity-60 ${
          ALTURA_SELECAO[variante]} ${aberto ? "border-sol ring-2 ring-sol/30" : "border-linha hover:border-tinta-suave/50"}`}>
        <span className={`flex-1 min-w-0 truncate ${!escolhido || escolhido.vazio ? "text-tinta-suave" : ""}`}>
          {escolhido?.nome ?? "Escolha"}
        </span>
        <IconeSeta className={`w-4 h-4 shrink-0 text-tinta-suave transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <Flutuante ancora={botao} onFechar={fechar} role="listbox" id={`${base}-lista`}>
          {lista.map((o, i) => (
            <ItemLista key={String(o.id)} id={`${base}-${i}`} role="option" aria-selected={i === atual}
              ativo={i === ativo} selecionado={i === atual} apagado={o.vazio}
              onMouseEnter={() => setAtivo(i)} onClick={() => escolher(i)}>
              {o.nome}
            </ItemLista>
          ))}
        </Flutuante>
      )}
    </div>
  );
}

function IconeSeta(p) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

function IconeCheck(p) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export const AreaTexto = (props) => (
  <textarea {...props} className={`mt-1 w-full p-3 rounded-lg border border-linha bg-fundo text-base ${props.className ?? ""}`} />
);

export function BotaoPrimario({ children, ...props }) {
  return (
    <button {...props}
      className={`h-12 px-5 rounded-lg bg-sol text-tinta font-semibold disabled:opacity-60 ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function BotaoSecundario({ children, ...props }) {
  return (
    <button {...props}
      className={`h-12 px-5 rounded-lg border border-linha bg-superficie font-medium disabled:opacity-60 ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function Vazio({ children }) {
  return <p className="text-tinta-suave text-sm py-3">{children}</p>;
}

// Mostra uma imagem em tela cheia, sem sair do sistema. Fecha no ×, no Esc ou clicando fora.
export function PreviaImagem({ src, alt = "", onFechar }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Imagem" onClick={onFechar}
      className="fixed inset-0 z-50 bg-tinta/90 grid place-items-center p-4 animate-aparecer">
      <button type="button" onClick={onFechar} aria-label="Fechar"
        className="absolute top-3 right-3 h-11 w-11 rounded-full bg-white/15 text-white text-3xl leading-none grid place-items-center">×</button>
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl animate-escala" />
    </div>
  );
}

// Selo com a etapa do funil em que o lead está
export function SeloEtapa({ etapa, grande = false }) {
  useEtapas(); // redesenha quando as colunas carregam ou mudam de nome
  const tipo = tipoEtapa(etapa);
  const cor = tipo === "ganho" ? "bg-ok/15 text-ok"
    : tipo === "perdido" ? "bg-alerta/10 text-alerta"
    : "bg-sol/20 text-sol-escuro";
  return (
    <span className={`block max-w-40 truncate rounded-full font-semibold ${grande ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]"} ${cor}`}>
      {nomeEtapa(etapa)}
    </span>
  );
}
