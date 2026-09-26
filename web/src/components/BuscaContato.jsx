import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { nomeOuTelefone, soDigitos } from "../lib/format";

// Campo de busca de contato por nome ou telefone. Usado em indicação e agenda.
export default function BuscaContato({ valor, onEscolher, rotulo = "Contato", placeholder = "Nome ou telefone" }) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState([]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) { setResultados([]); return; }
    const id = setTimeout(async () => {
      const digitos = soDigitos(t);
      let q = supabase.from("contatos").select("id, nome, telefone").eq("is_grupo", false).limit(6);
      q = digitos.length >= 4 ? q.ilike("telefone", `%${digitos}%`) : q.ilike("nome", `%${t}%`);
      const { data } = await q;
      setResultados(data ?? []);
    }, 250);
    return () => clearTimeout(id);
  }, [termo]);

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
    <div className="relative">
      <label className="block">
        <span className="text-sm font-medium">{rotulo}</span>
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder={placeholder}
          className="mt-1 w-full h-12 px-3 rounded-lg border border-linha bg-fundo text-base" />
      </label>
      {resultados.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-superficie border border-linha rounded-lg overflow-hidden shadow-md">
          {resultados.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onEscolher(c); setTermo(""); }}
                className="w-full text-left px-3 h-11 hover:bg-fundo">
                {nomeOuTelefone(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
