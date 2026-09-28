import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { DIAS_ALERTA_PROPOSTA, nomeTipo } from "../lib/constantes";
import { nomeEtapa, useEtapas } from "../lib/etapas";
import { diaSemana, diasDesde, fimDoDia, hora, inicioDoDia, nomeOuTelefone, quando } from "../lib/format";
import { Vazio } from "../components/ui";
import { EsqueletoHoje } from "../components/Esqueletos";

export default function Hoje() {
  useEtapas(); // nomes das etapas vêm do gerenciador do funil
  const [d, setD] = useState(null);

  async function carregar() {
    const agora = new Date();
    const limiteProposta = new Date(Date.now() - DIAS_ALERTA_PROPOSTA * 86400000).toISOString();

    const [agenda, retornos, conversas, paradas, novos] = await Promise.all([
      supabase.from("agenda").select("id, titulo, tipo, inicio, local, concluido, contato:contatos(id, nome, telefone)")
        .gte("inicio", inicioDoDia(agora).toISOString()).lte("inicio", fimDoDia(agora).toISOString())
        .order("inicio"),
      supabase.from("oportunidades").select("id, etapa, proximo_followup, contato:contatos(id, nome, telefone)")
        .lte("proximo_followup", fimDoDia(agora).toISOString())
        .not("etapa", "in", "(fechado,perdido)").order("proximo_followup"),
      supabase.from("contatos").select("id, nome, telefone, nao_lidas, ultima_mensagem, ultima_mensagem_em")
        .gt("nao_lidas", 0).eq("is_grupo", false).order("ultima_mensagem_em", { ascending: false }),
      supabase.from("oportunidades").select("id, etapa, etapa_desde, contato:contatos(id, nome, telefone)")
        .eq("etapa", "proposta").lte("etapa_desde", limiteProposta).order("etapa_desde"),
      supabase.from("oportunidades").select("id", { count: "exact", head: true }).eq("etapa", "novo"),
    ]);

    setD({
      agenda: agenda.data ?? [],
      retornos: retornos.data ?? [],
      conversas: conversas.data ?? [],
      paradas: paradas.data ?? [],
      novos: novos.count ?? 0,
    });
  }

  useEffect(() => { carregar(); }, []);

  async function concluir(item) {
    await supabase.from("agenda").update({ concluido: !item.concluido }).eq("id", item.id);
    carregar();
  }

  if (!d) return <EsqueletoHoje />;

  const pendencias = d.retornos.length + d.conversas.length + d.paradas.length;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6">
      <header className="mb-6">
        <p className="text-tinta-suave first-letter:uppercase">{diaSemana(new Date().toISOString())}</p>
        <h1 className="text-3xl font-bold mt-1">
          {pendencias === 0 ? "Tudo em dia." : `${pendencias} ${pendencias === 1 ? "coisa pede" : "coisas pedem"} sua atenção`}
        </h1>
        {d.novos > 0 && (
          <Link to="/funil" className="inline-block mt-2 text-tinta-suave underline">
            {d.novos} {d.novos === 1 ? "contato novo" : "contatos novos"} no funil
          </Link>
        )}
      </header>

      <Secao titulo="Agenda de hoje" acao={<Link to="/agenda" className="text-sm underline text-tinta-suave">Ver agenda</Link>}>
        {d.agenda.length === 0 ? <Vazio>Nenhum compromisso hoje.</Vazio> : (
          <ul className="divide-y divide-linha">
            {d.agenda.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <button onClick={() => concluir(a)} aria-label={a.concluido ? "Marcar como pendente" : "Marcar como feito"}
                  className={`h-7 w-7 shrink-0 rounded-full border-2 grid place-items-center ${a.concluido ? "bg-ok border-ok text-white" : "border-linha"}`}>
                  {a.concluido && "✓"}
                </button>
                <div className="w-14 shrink-0 font-semibold">{hora(a.inicio)}</div>
                <div className={`min-w-0 flex-1 ${a.concluido ? "line-through text-tinta-suave" : ""}`}>
                  <div className="truncate">{a.titulo}</div>
                  <div className="text-sm text-tinta-suave truncate">
                    {nomeTipo(a.tipo)}{a.contato && <>, <Link className="underline" to={`/conversas/${a.contato.id}`}>{nomeOuTelefone(a.contato)}</Link></>}
                    {a.local && <>, {a.local}</>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Mensagens sem resposta">
        {d.conversas.length === 0 ? <Vazio>Nenhuma mensagem esperando.</Vazio> : (
          <ul className="divide-y divide-linha">
            {d.conversas.map((c) => (
              <LinhaContato key={c.id} id={c.id} titulo={nomeOuTelefone(c)} sub={c.ultima_mensagem}
                lado={<span className="text-sm text-tinta-suave">{quando(c.ultima_mensagem_em)}</span>} />
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Retornos para fazer">
        {d.retornos.length === 0 ? <Vazio>Nenhum retorno marcado para hoje.</Vazio> : (
          <ul className="divide-y divide-linha">
            {d.retornos.map((o) => {
              const atrasado = new Date(o.proximo_followup) < inicioDoDia();
              return (
                <LinhaContato key={o.id} id={o.contato.id} titulo={nomeOuTelefone(o.contato)} sub={nomeEtapa(o.etapa)}
                  lado={<span className={`text-sm ${atrasado ? "text-alerta font-semibold" : "text-tinta-suave"}`}>
                    {atrasado ? `Atrasado ${diasDesde(o.proximo_followup)}d` : hora(o.proximo_followup)}
                  </span>} />
              );
            })}
          </ul>
        )}
      </Secao>

      <Secao titulo={`Propostas sem resposta há ${DIAS_ALERTA_PROPOSTA}+ dias`}>
        {d.paradas.length === 0 ? <Vazio>Nenhuma proposta parada.</Vazio> : (
          <ul className="divide-y divide-linha">
            {d.paradas.map((o) => (
              <LinhaContato key={o.id} id={o.contato.id} titulo={nomeOuTelefone(o.contato)} sub="Proposta enviada"
                lado={<span className="text-sm text-alerta font-semibold">{diasDesde(o.etapa_desde)} dias</span>} />
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

function Secao({ titulo, acao, children }) {
  return (
    <section className="bg-superficie rounded-2xl border border-linha px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function LinhaContato({ id, titulo, sub, lado }) {
  return (
    <li>
      <Link to={`/conversas/${id}`} className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{titulo}</div>
          {sub && <div className="text-sm text-tinta-suave truncate">{sub}</div>}
        </div>
        {lado}
      </Link>
    </li>
  );
}
