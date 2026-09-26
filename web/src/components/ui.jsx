import { useEffect } from "react";

export function Modal({ titulo, onFechar, children }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 bg-tinta/50 flex items-end md:items-center justify-center"
      onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto"
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

export function Selecao({ opcoes, vazio, ...props }) {
  return (
    <select {...props} className={`${baseInput} ${props.className ?? ""}`}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
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
