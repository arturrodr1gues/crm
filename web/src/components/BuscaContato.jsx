import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatarTelefone, nomeOuTelefone, soDigitos } from "../lib/format";
import { Flutuante, ItemLista } from "./ui";

// Campo de busca de contato por nome ou telefone. Usado em indicação e agenda.
export default function BuscaContato({ valor, onEscolher, rotulo = "Contato", placeholder = "Nome ou telefone" }) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const campo = useRef(null);
  const base = useId();

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) { setResultados([]); return; }
    const id = setTimeout(async () => {
      const digitos = soDigitos(t);
      let q = supabase.from("contatos").select("id, nome, telefone").eq("is_grupo", false).limit(6);
      q = digitos.length >= 4 ? q.ilike("telefone", `%${digitos}%`) : q.ilike("nome", `%${t}%`);
      const { data } = await q;
      setResultados(data ?? []);
      setAtivo(0);
      setAberto(true);
    }, 250);
    return () => clearTimeout(id);
  }, [termo]);

  const fechar = useCallback(() => setAberto(false), []);
  function escolher(c) { onEscolher(c); setTermo(""); setAberto(false); }

  const mostrando = aberto && resultados.length > 0;

  function tecla(e) {
    if (!mostrando) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(a + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); escolher(resultados[ativo]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAberto(false); } // não fecha o modal junto
  }

  if (valor) {
    return (
      <div>
        <span className="text-sm font-medium">{rotulo}</span>
        <div className="mt-1 h-12 px-3 rounded-lg border border-linha bg-fundo flex items-center justify-between">
          <span>{nomeOuTelefone(valor)}</span>
          <button type="button" onClick={() => onEscolher(null)} className="text-sm underline text-tinta-suave">Trocar</button>
        </div>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="text-sm font-medium">{rotulo}</span>
      <input ref={campo} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder={placeholder}
        onKeyDown={tecla} onFocus={() => setAberto(true)}
        role="combobox" aria-autocomplete="list" aria-expanded={mostrando}
        aria-controls={mostrando ? `${base}-lista` : undefined}
        aria-activedescendant={mostrando ? `${base}-${ativo}` : undefined}
        className={`mt-1 w-full h-12 px-3 rounded-lg border bg-fundo text-base transition-colors ${
          mostrando ? "border-sol ring-2 ring-sol/30" : "border-linha"}`} />
      {mostrando && (
        <Flutuante ancora={campo} onFechar={fechar} role="listbox" id={`${base}-lista`}>
          {resultados.map((c, i) => (
            <ItemLista key={c.id} id={`${base}-${i}`} role="option" aria-selected={i === ativo} ativo={i === ativo}
              onMouseEnter={() => setAtivo(i)} onClick={() => escolher(c)}>
              <span className="block truncate">{nomeOuTelefone(c)}</span>
              {c.nome && c.telefone && <span className="block text-xs text-tinta-suave">{formatarTelefone(c.telefone)}</span>}
            </ItemLista>
          ))}
        </Flutuante>
      )}
    </label>
  );
}
