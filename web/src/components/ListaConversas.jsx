import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { nomeOuTelefone, quando, soDigitos } from "../lib/format";

/**
 * Lista de conversas com busca e filtro de não lidas, em tempo real.
 * `lateral`: versão compacta com rolagem própria, para ficar ao lado do chat no computador.
 * `onRecolher`: mostra o botão que esconde a lista.
 */
export default function ListaConversas({ lateral = false, ativa, onRecolher }) {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  async function carregar() {
    let q = supabase.from("contatos")
      .select("id, nome, telefone, ultima_mensagem, ultima_mensagem_em, nao_lidas, is_grupo")
      .not("ultima_mensagem_em", "is", null)
      .order("ultima_mensagem_em", { ascending: false })
      .limit(100);
    const t = busca.trim();
    if (t) {
      const d = soDigitos(t);
      q = d.length >= 4 ? q.ilike("telefone", `%${d}%`) : q.ilike("nome", `%${t}%`);
    }
    if (soNaoLidas) q = q.gt("nao_lidas", 0);
    const { data } = await q;
    setLista(data ?? []);
  }

  useEffect(() => {
    const id = setTimeout(carregar, 200);
    return () => clearTimeout(id);
  }, [busca, soNaoLidas]);

  useEffect(() => {
    const canal = supabase.channel(`lista-conversas-${lateral ? "lateral" : "pagina"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contatos" }, () => carregar())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [busca, soNaoLidas]);

  const campo = lateral ? "h-10 text-sm" : "h-12";

  return (
    <div className={lateral ? "flex flex-col h-full min-h-0" : ""}>
      <div className={lateral ? "px-3 pt-4 pb-3 border-b border-linha" : ""}>
        <div className={`flex items-center justify-between ${lateral ? "mb-3 px-1" : "mb-4"}`}>
          <h1 className={lateral ? "text-xl font-bold" : "text-3xl font-bold"}>Conversas</h1>
          {onRecolher && (
            <button type="button" onClick={onRecolher} aria-label="Recolher conversas" title="Recolher conversas"
              className="h-8 w-8 -mr-1 grid place-items-center rounded-lg text-tinta-suave hover:bg-fundo">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M16 10l-2 2 2 2" />
              </svg>
            </button>
          )}
        </div>
        <div className={`flex gap-2 ${lateral ? "" : "mb-4"}`}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone"
            aria-label="Buscar conversa"
            className={`flex-1 min-w-0 px-3 rounded-lg border border-linha ${lateral ? "bg-fundo" : "bg-superficie"} ${campo}`} />
          <button onClick={() => setSoNaoLidas(!soNaoLidas)} aria-pressed={soNaoLidas}
            className={`px-3 rounded-lg border font-medium ${campo} ${soNaoLidas ? "bg-tinta text-white border-tinta" : "bg-superficie border-linha"}`}>
            Não lidas
          </button>
        </div>
      </div>

      <div className={lateral ? "flex-1 min-h-0 overflow-y-auto" : ""}>
        {!lista ? <p className="text-tinta-suave p-4">Carregando…</p> : lista.length === 0 ? (
          <p className="text-tinta-suave py-8 px-4 text-center text-sm">
            {busca || soNaoLidas ? "Nenhuma conversa encontrada." : "As conversas e grupos do WhatsApp aparecem aqui assim que chegar uma mensagem."}
          </p>
        ) : (
          <ul className={lateral ? "divide-y divide-linha" : "bg-superficie rounded-2xl border border-linha divide-y divide-linha"}>
            {lista.map((c) => (
              <li key={c.id}>
                <Link to={`/conversas/${c.id}`} aria-current={c.id === ativa ? "page" : undefined}
                  className={`flex items-center gap-3 ${lateral ? "px-3 py-2.5" : "px-4 py-3"} ${
                    c.id === ativa ? "bg-fundo" : lateral ? "hover:bg-fundo/60" : ""}`}>
                  <div className={`${lateral ? "h-10 w-10" : "h-11 w-11"} shrink-0 rounded-full grid place-items-center font-semibold ${
                    c.is_grupo ? "bg-linha text-tinta" : "bg-tinta text-white"}`}>
                    {c.is_grupo ? <IconeGrupo className="w-5 h-5" /> : (c.nome || "?").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate ${lateral ? "text-[15px]" : ""} ${c.nao_lidas ? "font-semibold" : "font-medium"}`}>{nomeOuTelefone(c)}</span>
                      {c.is_grupo && <span className="shrink-0 text-[11px] px-1.5 rounded bg-fundo border border-linha text-tinta-suave">Grupo</span>}
                    </div>
                    <div className={`text-sm truncate ${c.nao_lidas ? "text-tinta" : "text-tinta-suave"}`}>{c.ultima_mensagem}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-tinta-suave">{quando(c.ultima_mensagem_em)}</span>
                    {c.nao_lidas > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-sol text-tinta text-[11px] font-bold grid place-items-center">{c.nao_lidas}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IconeGrupo(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.6" />
  </svg>);
}
