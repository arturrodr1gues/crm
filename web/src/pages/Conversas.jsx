import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { nomeOuTelefone, quando, soDigitos } from "../lib/format";

export default function Conversas() {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  async function carregar() {
    let q = supabase.from("contatos")
      .select("id, nome, telefone, ultima_mensagem, ultima_mensagem_em, nao_lidas")
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
    const canal = supabase.channel("lista-conversas")
      .on("postgres_changes", { event: "*", schema: "public", table: "contatos" }, () => carregar())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [busca, soNaoLidas]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6">
      <h1 className="text-3xl font-bold mb-4">Conversas</h1>
      <div className="flex gap-2 mb-4">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone"
          className="flex-1 h-12 px-3 rounded-lg border border-linha bg-superficie" />
        <button onClick={() => setSoNaoLidas(!soNaoLidas)} aria-pressed={soNaoLidas}
          className={`h-12 px-4 rounded-lg border font-medium ${soNaoLidas ? "bg-tinta text-white border-tinta" : "bg-superficie border-linha"}`}>
          Não lidas
        </button>
      </div>

      {!lista ? <p className="text-tinta-suave">Carregando…</p> : lista.length === 0 ? (
        <p className="text-tinta-suave py-8 text-center">
          {busca || soNaoLidas ? "Nenhuma conversa encontrada." : "As conversas do WhatsApp aparecem aqui assim que alguém mandar mensagem."}
        </p>
      ) : (
        <ul className="bg-superficie rounded-2xl border border-linha divide-y divide-linha">
          {lista.map((c) => (
            <li key={c.id}>
              <Link to={`/contatos/${c.id}`} className="flex items-center gap-3 px-4 py-3">
                <div className="h-11 w-11 shrink-0 rounded-full bg-tinta text-white grid place-items-center font-semibold">
                  {(c.nome || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate ${c.nao_lidas ? "font-semibold" : "font-medium"}`}>{nomeOuTelefone(c)}</div>
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
  );
}
