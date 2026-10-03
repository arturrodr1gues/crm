import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ETAPAS, ORIGENS } from "../lib/constantes";
import { duracaoCurta } from "../lib/atendimento";
import { usePreferencia } from "../lib/preferencias";
import { Vazio } from "../components/ui";
import { EsqueletoDashboard } from "../components/Esqueletos";

// ---------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------
const MODOS = [
  { id: "semana", nome: "Semana" },
  { id: "mes", nome: "Mês" },
  { id: "ano", nome: "Ano" },
  { id: "livre", nome: "Personalizado" },
];

const DIA = 86400000;
const meiaNoite = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const paraInputData = (d) => {
  const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
const deInputData = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };

/** Período [inicio, fim) do modo, deslocado `passo` vezes para trás/frente. */
function calcularPeriodo(modo, passo, livre) {
  const hoje = meiaNoite(new Date());
  if (modo === "semana") {
    const segunda = somaDias(hoje, -((hoje.getDay() + 6) % 7) + passo * 7);
    return { inicio: segunda, fim: somaDias(segunda, 7) };
  }
  if (modo === "mes") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + passo, 1);
    return { inicio, fim: new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1) };
  }
  if (modo === "ano") {
    const inicio = new Date(hoje.getFullYear() + passo, 0, 1);
    return { inicio, fim: new Date(inicio.getFullYear() + 1, 0, 1) };
  }
  const inicio = deInputData(livre.de);
  const fim = somaDias(deInputData(livre.ate), 1);
  return { inicio, fim: fim > inicio ? fim : somaDias(inicio, 1) };
}

/** Período anterior de mesmo tamanho, para comparar. */
function periodoAnterior({ inicio, fim }, modo) {
  if (modo === "mes") return { inicio: new Date(inicio.getFullYear(), inicio.getMonth() - 1, 1), fim: inicio };
  if (modo === "ano") return { inicio: new Date(inicio.getFullYear() - 1, 0, 1), fim: inicio };
  const dias = Math.round((fim - inicio) / DIA);
  return { inicio: somaDias(inicio, -dias), fim: inicio };
}

const agrupamento = ({ inicio, fim }) => {
  const dias = Math.round((fim - inicio) / DIA);
  return dias <= 62 ? "day" : dias <= 190 ? "week" : "month";
};

const fmtData = (d, opcoes) => d.toLocaleDateString("pt-BR", opcoes);
function rotuloPeriodo(modo, { inicio, fim }) {
  const ultimo = somaDias(fim, -1);
  if (modo === "mes") return fmtData(inicio, { month: "long", year: "numeric" });
  if (modo === "ano") return String(inicio.getFullYear());
  const mesmoAno = inicio.getFullYear() === ultimo.getFullYear();
  return `${fmtData(inicio, { day: "numeric", month: "short", ...(mesmoAno ? {} : { year: "numeric" }) })} a ${fmtData(ultimo, { day: "numeric", month: "short", year: "numeric" })}`;
}

function rotuloBarra(iso, agrupar) {
  const d = deInputData(iso);
  if (agrupar === "month") return fmtData(d, { month: "short" }).replace(".", "");
  return fmtData(d, { day: "2-digit", month: "2-digit" });
}

// ---------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------
const numero = (n) => (n ?? 0).toLocaleString("pt-BR");
const dinheiro = (n) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const tempo = (min) => (min === null || min === undefined ? "—" : min < 1 ? "< 1 min" : duracaoCurta(Math.round(min)));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const nomeOrigem = (id) => ORIGENS.find((o) => o.id === id)?.nome ?? id;

// ---------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------
export default function Dashboard() {
  const [modo, setModo] = usePreferencia("crm-dashboard-modo", "mes");
  const [passo, setPasso] = useState(0);
  const [livre, setLivre] = useState(() => ({
    de: paraInputData(somaDias(new Date(), -29)), ate: paraInputData(new Date()),
  }));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const periodo = useMemo(() => calcularPeriodo(modo, passo, livre), [modo, passo, livre]);
  const agrupar = agrupamento(periodo);
  const noFuturo = modo !== "livre" && passo >= 0;

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const anterior = periodoAnterior(periodo, modo);
    const chamar = (p, g) => supabase.rpc("dashboard_kpis", {
      p_inicio: p.inicio.toISOString(), p_fim: p.fim.toISOString(), p_agrupar: g,
    });
    Promise.all([chamar(periodo, agrupar), chamar(anterior, agrupamento(anterior))]).then(([atual, ant]) => {
      if (!ativo) return;
      setCarregando(false);
      if (atual.error) { setErro(atual.error.message); return; }
      setErro(null);
      setDados({ atual: atual.data, anterior: ant.data ?? null });
    });
    return () => { ativo = false; };
  }, [periodo, agrupar, modo]);

  function trocarModo(m) { setModo(m); setPasso(0); }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-tinta-suave mt-1 first-letter:uppercase">{rotuloPeriodo(modo, periodo)}</p>
        </div>
      </header>

      {/* Filtros de período */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div role="tablist" aria-label="Período" className="inline-flex rounded-lg border border-linha bg-superficie p-1">
          {MODOS.map((m) => (
            <button key={m.id} role="tab" aria-selected={modo === m.id} onClick={() => trocarModo(m.id)}
              className={`h-9 px-3 rounded-md text-sm ${modo === m.id ? "bg-tinta text-white font-semibold" : "text-tinta-suave hover:bg-fundo"}`}>
              {m.nome}
            </button>
          ))}
        </div>

        {modo === "livre" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={livre.de} max={livre.ate} aria-label="Data inicial"
              onChange={(e) => e.target.value && setLivre((l) => ({ ...l, de: e.target.value }))}
              className="h-11 px-3 rounded-lg border border-linha bg-superficie" />
            <span className="text-tinta-suave">até</span>
            <input type="date" value={livre.ate} min={livre.de} aria-label="Data final"
              onChange={(e) => e.target.value && setLivre((l) => ({ ...l, ate: e.target.value }))}
              className="h-11 px-3 rounded-lg border border-linha bg-superficie" />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <BotaoSeta onClick={() => setPasso(passo - 1)} rotulo="Período anterior">‹</BotaoSeta>
            <BotaoSeta onClick={() => setPasso(passo + 1)} rotulo="Próximo período" disabled={noFuturo}>›</BotaoSeta>
            {passo !== 0 && (
              <button onClick={() => setPasso(0)} className="ml-1 text-sm underline text-tinta-suave">
                Voltar para o atual
              </button>
            )}
          </div>
        )}
        {carregando && dados && <span className="text-sm text-tinta-suave">Atualizando…</span>}
      </div>

      {erro ? <AvisoErro />
        : !dados ? <EsqueletoDashboard />
        : <Paineis d={dados.atual} ant={dados.anterior} agrupar={agrupar} />}
    </div>
  );
}

function Paineis({ d, ant, agrupar }) {
  const { leads, atendimento: at, sla } = d;
  const decididos = leads.ganhos + leads.perdidos;
  const noPrazoPct = pct(sla.no_prazo, sla.no_prazo + sla.fora_prazo);
  const noPrazoAnt = ant && pct(ant.sla.no_prazo, ant.sla.no_prazo + ant.sla.fora_prazo);

  return (
    <div className="space-y-8">
      <Grupo titulo="Leads">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi rotulo="Novos leads" valor={numero(leads.novos)} atual={leads.novos} anterior={ant?.leads.novos} />
          <Kpi rotulo="Vendas fechadas" valor={numero(leads.ganhos)} atual={leads.ganhos} anterior={ant?.leads.ganhos}
            detalhe={leads.valor_ganho > 0 ? dinheiro(leads.valor_ganho) : null} />
          <Kpi rotulo="Perdidos" valor={numero(leads.perdidos)} atual={leads.perdidos} anterior={ant?.leads.perdidos} menorMelhor />
          <Kpi rotulo="Taxa de fechamento" valor={decididos ? `${pct(leads.ganhos, decididos)}%` : "—"}
            detalhe={decididos ? `${leads.ganhos} de ${decididos} decididos` : "Nenhum ganho ou perda no período"} />
        </div>
        <div className="grid lg:grid-cols-3 gap-3 mt-3">
          <Cartao titulo="Novos leads" className="lg:col-span-2">
            <GraficoBarras serie={d.serie} campo="leads" agrupar={agrupar} formatar={numero} />
          </Cartao>
          <Cartao titulo="Por origem">
            <BarrasHorizontais itens={leads.por_origem.map((o) => ({ nome: nomeOrigem(o.origem), total: o.total }))}
              vazio="Nenhum lead no período." />
          </Cartao>
        </div>
      </Grupo>

      <Grupo titulo="Atendimento">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi rotulo="Conversas atendidas" valor={numero(at.conversas)} atual={at.conversas} anterior={ant?.atendimento.conversas} />
          <Kpi rotulo="Mensagens recebidas" valor={numero(at.recebidas)} atual={at.recebidas} anterior={ant?.atendimento.recebidas}
            detalhe={`${numero(at.enviadas)} enviadas`} />
          <Kpi rotulo="Conversas fechadas" valor={numero(at.fechadas)} atual={at.fechadas} anterior={ant?.atendimento.fechadas} />
          <Kpi rotulo="Esperando resposta agora" valor={numero(at.aguardando_agora)}
            detalhe={at.atrasadas_agora > 0 ? `${at.atrasadas_agora} fora do prazo` : "Nenhuma fora do prazo"}
            alerta={at.atrasadas_agora > 0} />
        </div>
        <Cartao titulo="Conversas por período" className="mt-3">
          <GraficoBarras serie={d.serie} campo="conversas" agrupar={agrupar} formatar={numero} />
        </Cartao>
      </Grupo>

      <Grupo titulo="SLA de resposta" dica={`Tempo entre a mensagem do cliente e a nossa primeira resposta. Prazo: ${tempo(sla.limite_min)}.`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi rotulo="Tempo médio" valor={tempo(sla.media_min)} atual={sla.media_min} anterior={ant?.sla.media_min} menorMelhor
            formatarDif={(v) => tempo(Math.abs(v))} />
          <Kpi rotulo="Tempo mediano" valor={tempo(sla.mediana_min)} detalhe="Metade respondida até esse tempo" />
          <Kpi rotulo="Dentro do prazo" valor={noPrazoPct === null ? "—" : `${noPrazoPct}%`}
            atual={noPrazoPct} anterior={noPrazoAnt} formatarDif={(v) => `${Math.abs(v)} p.p.`}
            detalhe={`${numero(sla.no_prazo)} de ${numero(sla.no_prazo + sla.fora_prazo)}`} />
          <Kpi rotulo="Sem resposta" valor={numero(sla.sem_resposta)} detalhe={`de ${numero(sla.esperas)} mensagens de clientes`}
            alerta={sla.sem_resposta > 0} />
        </div>
        <Cartao titulo="Tempo médio de resposta" className="mt-3">
          <GraficoBarras serie={d.serie} campo="sla_media_min" agrupar={agrupar} formatar={tempo} limite={sla.limite_min} />
        </Cartao>
      </Grupo>

      <Grupo titulo="Funil agora" dica="Negociações em aberto hoje, independente do período.">
        <Cartao>
          <BarrasHorizontais
            itens={ETAPAS.filter((e) => e.id !== "fechado").map((e) => {
              const x = d.funil_atual.find((f) => f.etapa === e.id);
              return { nome: e.nome, total: x?.total ?? 0, extra: x?.valor ? dinheiro(x.valor) : null };
            })}
            vazio="Nenhuma negociação em aberto." />
        </Cartao>
      </Grupo>
    </div>
  );
}

// ---------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------
function Grupo({ titulo, dica, children }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {dica && <p className="text-sm text-tinta-suave">{dica}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Cartao({ titulo, className = "", children }) {
  return (
    <div className={`bg-superficie rounded-2xl border border-linha p-4 ${className}`}>
      {titulo && <h3 className="text-sm font-semibold text-tinta-suave mb-3">{titulo}</h3>}
      {children}
    </div>
  );
}

function BotaoSeta({ rotulo, children, ...props }) {
  return (
    <button {...props} aria-label={rotulo} title={rotulo}
      className="h-11 w-11 rounded-lg border border-linha bg-superficie text-xl disabled:opacity-40">
      {children}
    </button>
  );
}

/** Número grande + comparação com o período anterior. */
function Kpi({ rotulo, valor, detalhe, atual, anterior, menorMelhor, formatarDif, alerta }) {
  let comparacao = null;
  if (atual !== undefined && atual !== null && anterior !== undefined && anterior !== null) {
    const dif = atual - anterior;
    const bom = menorMelhor ? dif < 0 : dif > 0;
    const texto = dif === 0 ? "igual ao anterior"
      : formatarDif ? `${dif > 0 ? "▲" : "▼"} ${formatarDif(dif)}`
      : anterior > 0 ? `${dif > 0 ? "▲" : "▼"} ${Math.abs(Math.round((dif / anterior) * 100))}%`
      : `${dif > 0 ? "▲" : "▼"} ${numero(Math.abs(dif))}`;
    comparacao = (
      <span className={`text-xs font-semibold ${dif === 0 ? "text-tinta-suave" : bom ? "text-ok" : "text-alerta"}`}
        title={`Período anterior: ${anterior}`}>
        {texto}{dif !== 0 && <span className="sr-only"> em relação ao período anterior</span>}
      </span>
    );
  }
  return (
    <div className="bg-superficie rounded-2xl border border-linha p-4 min-w-0">
      <p className="text-sm text-tinta-suave truncate">{rotulo}</p>
      <p className={`text-2xl md:text-3xl font-bold mt-1 tabular-nums ${alerta ? "text-alerta" : ""}`}>{valor}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-h-4">
        {comparacao}
        {detalhe && <span className="text-xs text-tinta-suave">{detalhe}</span>}
      </div>
    </div>
  );
}

/** Colunas verticais de uma série só. Passe o mouse (ou toque) para ver o valor. */
function GraficoBarras({ serie, campo, agrupar, formatar, limite }) {
  const [foco, setFoco] = useState(null);
  const valores = serie.map((s) => s[campo] ?? 0);
  const max = Math.max(...valores, limite ?? 0, 0);
  if (max === 0) return <Vazio>Nada registrado no período.</Vazio>;

  // Com muitas barras, mostra só parte dos rótulos do eixo.
  const cadaQuantos = Math.ceil(serie.length / 12);
  const selecionado = foco !== null ? serie[foco] : null;
  const limitePct = limite ? (limite / max) * 100 : null;

  return (
    <div>
      <p className="text-sm h-5 mb-1 tabular-nums">
        {selecionado
          ? <><span className="text-tinta-suave">{rotuloBarra(selecionado.inicio, agrupar)}{agrupar === "week" && " (semana)"}: </span>
              <span className="font-semibold">{selecionado[campo] === null ? "—" : formatar(selecionado[campo])}</span></>
          : <span className="text-tinta-suave">Máximo: {formatar(Math.max(...valores))}</span>}
      </p>
      <div className="relative h-40" onMouseLeave={() => setFoco(null)}>
        {/* linhas de fundo */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          <div className="border-t border-linha/70" /><div className="border-t border-linha/70" /><div className="border-t border-linha" />
        </div>
        {limitePct !== null && (
          <div className="absolute inset-x-0 border-t-2 border-dashed border-alerta/60 pointer-events-none"
            style={{ bottom: `${limitePct}%` }}>
            <span className="absolute right-0 -top-5 text-[11px] text-alerta bg-superficie px-1">Prazo {formatar(limite)}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {serie.map((s, i) => {
            const v = s[campo] ?? 0;
            const acima = limite && v > limite;
            return (
              <button key={s.inicio} type="button"
                onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} onClick={() => setFoco(i)}
                aria-label={`${rotuloBarra(s.inicio, agrupar)}: ${s[campo] === null ? "sem dados" : formatar(v)}`}
                className="flex-1 h-full flex items-end min-w-0 group">
                <span className={`w-full rounded-t-[4px] transition-opacity ${acima ? "bg-alerta/80" : "bg-sol"} ${
                  foco !== null && foco !== i ? "opacity-40" : ""}`}
                  style={{ height: v ? `max(${(v / max) * 100}%, 2px)` : 0 }} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-[2px] mt-1">
        {serie.map((s, i) => (
          <span key={s.inicio} className="flex-1 min-w-0 text-center text-[10px] text-tinta-suave whitespace-nowrap overflow-visible">
            {i % cadaQuantos === 0 ? rotuloBarra(s.inicio, agrupar) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarrasHorizontais({ itens, vazio }) {
  const max = Math.max(...itens.map((i) => i.total), 0);
  if (max === 0) return <Vazio>{vazio}</Vazio>;
  return (
    <ul className="space-y-3">
      {itens.map((i) => (
        <li key={i.nome}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{i.nome}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{numero(i.total)}</span>
              {i.extra && <span className="text-tinta-suave"> · {i.extra}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-fundo">
            <div className="h-2 rounded-full bg-sol" style={{ width: i.total ? `max(${(i.total / max) * 100}%, 4px)` : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AvisoErro() {
  return (
    <div className="bg-superficie rounded-2xl border border-linha p-5">
      <p className="font-semibold">Não foi possível carregar os indicadores.</p>
      <p className="text-sm text-tinta-suave mt-1">Recarregue a página. Se continuar, avise o administrador.</p>
    </div>
  );
}
