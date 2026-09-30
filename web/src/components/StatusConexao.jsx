import { Link } from "react-router-dom";
import { useConexaoWhatsapp } from "../lib/conexao";

const hm = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const ESTADOS = {
  online:     { cor: "bg-ok", rotulo: "Online", pulsa: true },
  conectando: { cor: "bg-sol", rotulo: "Conectando…", pulsa: true },
  offline:    { cor: "bg-alerta", rotulo: "Desconectado", pulsa: false },
};

/**
 * Bolinha da conexão com o WhatsApp (título de Conversas). Verde pulsando = no ar;
 * vermelha = caiu (clicar leva para Ajustes para reconectar).
 */
export default function StatusConexao({ compacto = false }) {
  const c = useConexaoWhatsapp();
  const e = ESTADOS[c?.estado];
  if (!e) return <span className="h-2.5 w-2.5 rounded-full bg-linha animate-pulse" aria-label="Verificando o WhatsApp" />;

  const dica = c.estado === "offline"
    ? `WhatsApp desconectado desde ${hm(c.desde)}${c.motivo ? ` (${c.motivo})` : ""}. Clique para reconectar em Ajustes.`
    : c.estado === "online" ? `WhatsApp conectado desde ${hm(c.desde)}` : "WhatsApp conectando…";

  const conteudo = (
    <>
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {e.pulsa && <span className={`absolute inline-flex h-full w-full rounded-full ${e.cor} opacity-60 animate-ping`} />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${e.cor}`} />
      </span>
      {!compacto && <span className={`text-xs font-medium ${c.estado === "offline" ? "" : "text-tinta-suave"}`}>{e.rotulo}</span>}
    </>
  );

  return c.estado === "offline" ? (
    <Link to="/configuracoes" title={dica} aria-label={dica}
      className="flex items-center gap-1.5 h-7 px-2 rounded-full bg-alerta/10 text-alerta hover:bg-alerta/15">
      {conteudo}
      {!compacto && <span className="text-xs font-semibold text-alerta">desde {hm(c.desde)}</span>}
    </Link>
  ) : (
    <span title={dica} aria-label={dica} role="status" className="flex items-center gap-1.5 h-7 px-1">{conteudo}</span>
  );
}
