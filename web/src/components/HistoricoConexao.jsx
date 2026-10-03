import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { EsqueletoLinhas } from "./Esqueletos";
import { CartaoSecao } from "./ui";

const QUANTOS = 30;

const ROTULOS = {
  online: { texto: "Conectou", cor: "bg-ok" },
  conectando: { texto: "Conectando", cor: "bg-sol" },
  offline: { texto: "Desconectou", cor: "bg-alerta" },
};
const ORIGENS = {
  webhook: "aviso da UAZAPI",
  verificacao: "verificação automática",
  ajustes: "tela de Ajustes",
  envio: "falha ao enviar",
};

const dataHora = (iso) => new Date(iso).toLocaleString("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** Ajustes: quando o WhatsApp conectou e desconectou (mais recente primeiro), em tempo real. */
export default function HistoricoConexao() {
  const [lista, setLista] = useState(null);

  useEffect(() => {
    const carregar = () => supabase.from("whatsapp_conexao_log").select("id, estado, momento, motivo, origem")
      .order("momento", { ascending: false }).limit(QUANTOS).then(({ data }) => setLista(data ?? []));
    carregar();
    const canal = supabase.channel("historico-conexao")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_conexao_log" }, carregar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  return (
    <CartaoSecao titulo="Histórico da conexão"
      descricao="Quando o WhatsApp conectou e caiu. Enquanto estiver desconectado, nenhuma mensagem chega nem sai pelo CRM.">
      {lista === null ? <EsqueletoLinhas n={3} foto={false} />
        : lista.length === 0 ? <p className="text-sm text-tinta-suave py-2">Nenhum registro ainda. Aparece aqui a partir da próxima mudança.</p> : (
        <ol className="max-h-80 overflow-y-auto divide-y divide-linha">
          {lista.map((r) => {
            const e = ROTULOS[r.estado] ?? ROTULOS.offline;
            return (
              <li key={r.id} className="flex items-start gap-3 py-2.5">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.cor}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{e.texto}</span>
                    <span className="text-sm tabular-nums text-tinta-suave">{dataHora(r.momento)}</span>
                  </div>
                  {(r.motivo || r.origem) && (
                    <p className="text-xs text-tinta-suave break-words">
                      {[r.motivo, ORIGENS[r.origem] && `detectado por ${ORIGENS[r.origem]}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </CartaoSecao>
  );
}
