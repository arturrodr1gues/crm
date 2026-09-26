import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ORIGENS } from "../lib/constantes";
import { nomeEtapa, useEtapas } from "../lib/etapas";
import { dataCurta, diasDesde, formatarTelefone, nomeOuTelefone, quando } from "../lib/format";
import { SeloEtapa, Vazio } from "../components/ui";
import { Card, Ficha } from "./Contato";

// Página do lead, aberta pelo card do funil: tudo sobre o cliente, com atalho para a conversa.
export default function Lead() {
  useEtapas(); // nomes das etapas acompanham o gerenciador do funil
  const { id } = useParams();
  const [contato, setContato] = useState(null);
  const [op, setOp] = useState(null);

  async function carregar() {
    const [{ data: c, error }, { data: o }] = await Promise.all([
      supabase.from("contatos").select("*, indicador:contatos!indicado_por(id, nome, telefone)").eq("id", id).single(),
      supabase.from("oportunidades").select("*").eq("contato_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error) console.error("erro ao carregar lead", error);
    setContato(error ? false : c); setOp(o);
  }

  useEffect(() => { carregar(); }, [id]);

  if (contato === false) {
    return (
      <div className="p-6">
        <p className="text-alerta mb-3">Não foi possível abrir esse lead.</p>
        <Link to="/funil" className="underline text-tinta-suave">Voltar para o Funil</Link>
      </div>
    );
  }
  if (!contato) return <div className="p-6 text-tinta-suave">Carregando…</div>;

  const dias = op ? diasDesde(op.etapa_desde) : null;

  return (
    <div className="max-w-5xl mx-auto pb-6">
      <div className="px-4 md:px-8 pt-4">
        <Link to="/funil" className="inline-flex items-center gap-1 h-10 -ml-1 text-tinta-suave hover:text-tinta">
          <span className="text-2xl leading-none">‹</span> Funil
        </Link>
      </div>

      <header className="px-4 md:px-8 pt-1 pb-2 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="h-14 w-14 shrink-0 rounded-full bg-tinta text-white grid place-items-center text-xl font-semibold">
            {(contato.nome || "?").trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{nomeOuTelefone(contato)}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-sm text-tinta-suave">
              {contato.telefone && <span>{formatarTelefone(contato.telefone)}</span>}
              {op && <SeloEtapa etapa={op.etapa} grande />}
              {op && <span>{dias === 0 ? "desde hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/conversas/${contato.id}`}
            className="flex-1 md:flex-none h-12 px-5 rounded-lg bg-sol text-tinta font-semibold inline-flex items-center justify-center gap-2">
            <IconeChat className="w-5 h-5" />
            Abrir conversa
            {contato.nao_lidas > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-alerta text-white text-[11px] font-bold grid place-items-center">
                {contato.nao_lidas > 99 ? "99+" : contato.nao_lidas}
              </span>
            )}
          </Link>
          {contato.telefone && (
            <a href={`tel:+${contato.telefone}`}
              className="h-12 px-5 rounded-lg border border-linha bg-superficie font-medium inline-flex items-center justify-center">
              Ligar
            </a>
          )}
        </div>
      </header>

      <div className="px-4 md:px-8 pt-2 grid md:grid-cols-2 gap-4 items-start">
        <Resumo contato={contato} />
        <Historico op={op} />
      </div>
      <Ficha contato={contato} op={op} onSalvo={carregar}
        className="px-4 md:px-8 pt-4 grid md:grid-cols-2 gap-4 items-start" />
    </div>
  );
}

function Resumo({ contato: c }) {
  const origem = ORIGENS.find((o) => o.id === c.origem)?.nome ?? c.origem;
  return (
    <Card titulo="Resumo">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-tinta-suave">Origem</dt>
        <dd>
          {origem}
          {c.indicador && <> por <Link to={`/funil/${c.indicador.id}`} className="underline">{nomeOuTelefone(c.indicador)}</Link></>}
        </dd>
        <dt className="text-tinta-suave">Local</dt>
        <dd>{[c.bairro, c.cidade].filter(Boolean).join(", ") || "Não informado"}</dd>
        <dt className="text-tinta-suave">Consumo</dt>
        <dd>{c.consumo_kwh ? `${c.consumo_kwh} kWh` : "Sem conta de luz ainda"}</dd>
        <dt className="text-tinta-suave">No CRM desde</dt>
        <dd>{dataCurta(c.created_at)}</dd>
      </dl>
      <div className="mt-4 pt-3 border-t border-linha">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Última mensagem</span>
          {c.ultima_mensagem_em && <span className="text-tinta-suave">{quando(c.ultima_mensagem_em)}</span>}
        </div>
        {c.ultima_mensagem
          ? <p className="text-sm text-tinta-suave mt-1 line-clamp-3">{c.ultima_mensagem}</p>
          : <Vazio>Nenhuma conversa ainda.</Vazio>}
      </div>
    </Card>
  );
}

function Historico({ op }) {
  const [itens, setItens] = useState(null);
  useEffect(() => {
    if (!op) { setItens([]); return; }
    supabase.from("historico_etapas").select("id, de, para, em").eq("oportunidade_id", op.id)
      .order("em", { ascending: false }).limit(20)
      .then(({ data }) => setItens(data ?? []));
  }, [op?.id, op?.etapa]);

  return (
    <Card titulo="Caminho no funil">
      {itens === null ? <Vazio>Carregando…</Vazio>
        : itens.length === 0 ? <Vazio>Ainda não está no funil.</Vazio>
        : (
          <ol className="space-y-2.5">
            {itens.map((h, i) => (
              <li key={h.id} className="flex items-start gap-3 text-sm">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${i === 0 ? "bg-sol" : "bg-linha"}`} />
                <span className="flex-1">
                  {h.de ? <>{nomeEtapa(h.de)} → <strong>{nomeEtapa(h.para)}</strong></> : <>Entrou em <strong>{nomeEtapa(h.para)}</strong></>}
                </span>
                <span className="text-tinta-suave shrink-0">{dataCurta(h.em)}</span>
              </li>
            ))}
          </ol>
        )}
    </Card>
  );
}

function IconeChat(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>);
}
