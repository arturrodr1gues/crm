import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { dataCurta, formatarTelefone, nomeOuTelefone } from "../lib/format";
import ConfirmarAcaoContatos from "./ConfirmarAcaoContatos";
import { EsqueletoLinhas } from "./Esqueletos";
import { CartaoSecao } from "./ui";

/** Ajustes: contatos e grupos bloqueados, para desbloquear ou excluir (um ou vários). */
export default function ContatosBloqueados() {
  const [lista, setLista] = useState(null);
  const [selecao, setSelecao] = useState(() => new Set());
  const [confirmar, setConfirmar] = useState(null); // desbloquear | excluir

  async function carregar() {
    const { data } = await supabase.from("contatos").select("id, nome, telefone, is_grupo, bloqueado_em")
      .eq("bloqueado", true).order("bloqueado_em", { ascending: false });
    setLista(data ?? []);
    setSelecao(new Set());
  }
  useEffect(() => { carregar(); }, []);

  const escolhidos = (lista ?? []).filter((c) => selecao.has(c.id)).map((c) => c.id);
  const todas = !!lista?.length && escolhidos.length === lista.length;
  const alternar = (id) => setSelecao((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <CartaoSecao titulo="Contatos bloqueados"
      descricao={'Mensagens desses contatos não chegam ao CRM. Para bloquear, use "Selecionar" na lista de Conversas ou os detalhes da conversa.'}>

      {lista === null ? <EsqueletoLinhas n={3} />
        : lista.length === 0 ? <p className="text-sm text-tinta-suave py-2">Nenhum contato bloqueado.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button type="button" onClick={() => setSelecao(todas ? new Set() : new Set(lista.map((c) => c.id)))}
              className="h-9 px-3 rounded-lg border border-linha text-sm font-medium hover:bg-fundo">
              {todas ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            <span className="flex-1 text-sm text-tinta-suave">
              {escolhidos.length ? `${escolhidos.length} de ${lista.length}` : `${lista.length} bloqueado${lista.length === 1 ? "" : "s"}`}
            </span>
            <button type="button" disabled={!escolhidos.length} onClick={() => setConfirmar("desbloquear")}
              className="h-9 px-3 rounded-lg bg-sol text-tinta text-sm font-semibold disabled:opacity-40">Desbloquear</button>
            <button type="button" disabled={!escolhidos.length} onClick={() => setConfirmar("excluir")}
              className="h-9 px-3 rounded-lg bg-alerta text-white text-sm font-semibold disabled:opacity-40">Excluir</button>
          </div>

          <ul className="max-h-96 overflow-y-auto rounded-lg border border-linha divide-y divide-linha">
            {lista.map((c) => {
              const marcado = selecao.has(c.id);
              return (
                <li key={c.id} className={`flex items-center gap-3 px-3 py-2.5 ${marcado ? "bg-sol/15" : ""}`}>
                  <button type="button" role="checkbox" aria-checked={marcado} onClick={() => alternar(c.id)}
                    aria-label={`Selecionar ${nomeOuTelefone(c)}`}
                    className={`h-6 w-6 shrink-0 rounded-md grid place-items-center text-sm font-bold ${
                      marcado ? "bg-sol text-tinta" : "border-2 border-linha"}`}>{marcado && "✓"}</button>
                  <Link to={`/conversas/${c.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">
                      {c.is_grupo ? c.nome || "Grupo sem nome" : nomeOuTelefone(c)}
                      {c.is_grupo && <span className="ml-2 text-[11px] px-1.5 rounded bg-fundo border border-linha text-tinta-suave">Grupo</span>}
                    </span>
                    <span className="block text-xs text-tinta-suave">
                      {[!c.is_grupo && c.nome && formatarTelefone(c.telefone), c.bloqueado_em && `bloqueado em ${dataCurta(c.bloqueado_em)}`]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {confirmar && (
        <ConfirmarAcaoContatos acao={confirmar} ids={escolhidos} onFechar={() => setConfirmar(null)} onFeito={carregar} />
      )}
    </CartaoSecao>
  );
}
