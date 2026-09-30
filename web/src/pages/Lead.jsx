import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ORIGENS } from "../lib/constantes";
import { nomeEtapa, useEtapas } from "../lib/etapas";
import { dataCurta, diasDesde, formatarTelefone, nomeOuTelefone } from "../lib/format";
import useContato from "../lib/useContato";
import { estadoAtendimento, useAgora, useAtendimentoConfig } from "../lib/atendimento";
import { SeloSla } from "../components/SelosAtendimento";
import { ConteudoConversa } from "../components/DetalhesConversa";
import { CardAgenda, CardDados, CardIndicacoes, CardVenda, SemOportunidade, SeletorTipo } from "../components/FichaCliente";
import { EsqueletoLead } from "../components/Esqueletos";
import FotoContato from "../components/FotoContato";

/**
 * Página do lead: a mesma ficha do painel da conversa, em tela cheia.
 * Venda, compromissos e indicações de um lado, dados do cliente do outro, e o que foi trocado na conversa embaixo.
 */
export default function Lead() {
  useEtapas(); // nome da etapa acompanha o gerenciador do funil
  const { id } = useParams();
  const navegar = useNavigate();
  const { contato, op, carregar, alternarEncerrada, classificar } = useContato(id);
  const config = useAtendimentoConfig();
  const agora = useAgora();

  // Veio de outra tela do CRM: volta para ela. Abriu o link direto: vai para o funil.
  const voltar = () => (window.history.state?.idx > 0 ? navegar(-1) : navegar("/funil"));

  if (contato === false) {
    return (
      <div className="p-6">
        <p className="text-alerta mb-3">Não foi possível abrir esse lead.</p>
        <Link to="/funil" className="underline text-tinta-suave">Voltar para o Funil</Link>
      </div>
    );
  }
  if (!contato) return <EsqueletoLead />;
  // Grupo não tem ficha: a página dele é a conversa.
  if (contato.is_grupo) return <Navigate to={`/conversas/${contato.id}`} replace />;

  const { sla } = estadoAtendimento(contato, config, agora);
  const origem = ORIGENS.find((o) => o.id === contato.origem)?.nome ?? contato.origem;
  const naEtapa = op?.etapa_desde ? diasDesde(op.etapa_desde) : null;

  const resumo = [
    ["Etapa", op ? nomeEtapa(op.etapa) : "Fora do funil"],
    ["Na etapa há", naEtapa === null ? "—" : naEtapa === 0 ? "Hoje" : `${naEtapa} ${naEtapa === 1 ? "dia" : "dias"}`],
    ["Consumo", contato.consumo_kwh ? `${contato.consumo_kwh} kWh/mês` : "—"],
    ["Origem", origem || "—"],
    ["Próximo retorno", op?.proximo_followup ? dataCurta(op.proximo_followup) : "—"],
    ["Cliente desde", dataCurta(contato.created_at)],
  ];

  return (
    <div className="min-h-full bg-fundo">
      <header className="sticky top-0 z-20 bg-superficie border-b border-linha">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={voltar} aria-label="Voltar" title="Voltar"
            className="h-10 w-10 -ml-2 grid place-items-center rounded-lg text-2xl hover:bg-fundo">‹</button>
          <FotoContato contato={contato} className="h-11 w-11" texto="text-lg" ampliavel />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-xl font-semibold truncate">{nomeOuTelefone(contato)}</h1>
            <p className="text-sm text-tinta-suave truncate">{formatarTelefone(contato.telefone) || "Sem telefone"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {sla && <SeloSla sla={sla} />}
            {contato.conversa_fechada && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-linha text-tinta-suave font-medium">Conversa encerrada</span>
            )}
            <SeletorTipo tipo={contato.tipo_contato} noFunil={!!op} onEscolher={classificar} />
            <button type="button" onClick={alternarEncerrada}
              title={contato.conversa_fechada ? "Voltar para as conversas em aberto" : "Mover para as conversas fechadas"}
              className="h-9 px-3 rounded-lg border border-linha text-sm font-medium hover:bg-fundo">
              {contato.conversa_fechada ? "Reabrir" : "Encerrar"}
            </button>
            <Link to={`/conversas/${contato.id}`}
              className="h-9 px-3 rounded-lg bg-sol text-tinta text-sm font-semibold grid place-items-center">Abrir conversa</Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4">
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-2xl overflow-hidden border border-linha bg-linha">
          {resumo.map(([rotulo, valor]) => (
            <div key={rotulo} className="bg-superficie px-4 py-3 min-w-0">
              <dt className="text-xs text-tinta-suave">{rotulo}</dt>
              <dd className="font-semibold truncate">{valor}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <div className="space-y-4">
            {op ? <CardVenda op={op} onSalvo={carregar} /> : <SemOportunidade contatoId={contato.id} onSalvo={carregar} />}
            <CardAgenda contato={contato} opId={op?.id} />
            <CardIndicacoes contato={contato} rota="/leads" />
          </div>
          <CardDados contato={contato} onSalvo={carregar} />
        </div>

        <section>
          <h2 className="font-semibold mb-2 px-1">Na conversa</h2>
          <ConteudoConversa contato={contato} cartao colunas="grid-cols-3 sm:grid-cols-5 lg:grid-cols-8" />
        </section>
      </div>
    </div>
  );
}
