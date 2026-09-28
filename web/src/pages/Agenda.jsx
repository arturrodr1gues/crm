import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { nomeTipo, TIPOS_AGENDA } from "../lib/constantes";
import { inicioDoDia, nomeOuTelefone } from "../lib/format";
import { usePreferencia } from "../lib/preferencias";
import EventoForm from "../components/EventoForm";
import { EsqueletoAgenda } from "../components/Esqueletos";

const HORA_PX = 48;
const DURACAO_PADRAO = 60; // minutos, para compromisso sem horário de término
const MAX_NO_DIA = 3; // compromissos visíveis por dia na visão do mês
const SEL = "id, titulo, tipo, inicio, fim, local, notas, concluido, oportunidade_id, contato:contatos(id, nome, telefone)";

const VISOES = [
  { id: "dia", nome: "Dia", tecla: "d" },
  { id: "semana", nome: "Semana", tecla: "s" },
  { id: "mes", nome: "Mês", tecla: "m" },
  { id: "ano", nome: "Ano", tecla: "a" },
];

const COR_TIPO = {
  visita:     { bloco: "bg-sol/25 border-sol", ponto: "bg-sol" },
  instalacao: { bloco: "bg-ok/15 border-ok", ponto: "bg-ok" },
  manutencao: { bloco: "bg-tinta-suave/15 border-tinta-suave", ponto: "bg-tinta-suave" },
  followup:   { bloco: "bg-sky-500/15 border-sky-600", ponto: "bg-sky-600" },
  outro:      { bloco: "bg-tinta/10 border-tinta/40", ponto: "bg-tinta/40" },
};
const cor = (tipo) => COR_TIPO[tipo] ?? COR_TIPO.outro;

// Datas no horário do aparelho, como o campo de data do formulário
const somarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const inicioSemana = (d) => { const x = inicioDoDia(d); return somarDias(x, -x.getDay()); };
const chave = (d) => new Date(d).toDateString();
const mesmoDia = (a, b) => chave(a) === chave(b);
const minutosDoDia = (d) => d.getHours() * 60 + d.getMinutes();
const hm = (d) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const mesCurto = (d) => d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
const NOMES_DIA = Array.from({ length: 7 }, (_, i) =>
  new Date(2023, 0, 1 + i).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""));

function intervalo(visao, ref) {
  if (visao === "dia") { const i = inicioDoDia(ref); return [i, somarDias(i, 1)]; }
  if (visao === "semana") { const i = inicioSemana(ref); return [i, somarDias(i, 7)]; }
  if (visao === "mes") { const i = inicioSemana(new Date(ref.getFullYear(), ref.getMonth(), 1)); return [i, somarDias(i, 42)]; }
  return [new Date(ref.getFullYear(), 0, 1), new Date(ref.getFullYear() + 1, 0, 1)];
}

function andar(visao, ref, n) {
  if (visao === "dia") return somarDias(ref, n);
  if (visao === "semana") return somarDias(ref, 7 * n);
  if (visao === "mes") return new Date(ref.getFullYear(), ref.getMonth() + n, 1);
  return new Date(ref.getFullYear() + n, ref.getMonth(), 1);
}

function tituloPeriodo(visao, ref) {
  if (visao === "dia") return ref.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (visao === "semana") {
    const [i] = intervalo("semana", ref);
    const u = somarDias(i, 6);
    if (i.getMonth() === u.getMonth()) return `${i.getDate()} a ${u.getDate()} de ${u.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
    return `${i.getDate()} ${mesCurto(i)} a ${u.getDate()} ${mesCurto(u)} de ${u.getFullYear()}`;
  }
  if (visao === "mes") return ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return String(ref.getFullYear());
}

function agrupar(eventos) {
  const m = new Map();
  for (const e of eventos) {
    const k = chave(e.inicio);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  return m;
}

// Hora atual, atualizada a cada minuto (linha vermelha do "agora")
function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

const telaGrande = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

export default function Agenda() {
  const [visao, setVisao] = usePreferencia("crm-agenda-visao", telaGrande() ? "semana" : "dia");
  const [ref, setRef] = useState(() => inicioDoDia());
  const [itens, setItens] = useState(null);
  const [atrasados, setAtrasados] = useState([]);
  const [verAtrasados, setVerAtrasados] = useState(false);
  const [form, setForm] = useState(null);
  const pedido = useRef(0);

  const [ini, fim] = intervalo(visao, ref);
  const iniIso = ini.toISOString();
  const fimIso = fim.toISOString();

  async function carregar() {
    const n = ++pedido.current;
    const [r, atr] = await Promise.all([
      supabase.from("agenda").select(SEL).gte("inicio", iniIso).lt("inicio", fimIso).order("inicio"),
      supabase.from("agenda").select(SEL).lt("inicio", inicioDoDia().toISOString()).eq("concluido", false).order("inicio"),
    ]);
    if (n !== pedido.current) return; // o usuário já navegou para outro período
    setItens(r.data ?? []);
    setAtrasados(atr.data ?? []);
  }
  useEffect(() => { carregar(); }, [iniIso, fimIso]);

  // Atalhos como no Google Agenda: ← → navegam, T volta para hoje, D S M A trocam a visão
  useEffect(() => {
    if (form) return;
    const tecla = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      const v = VISOES.find((x) => x.tecla === k);
      if (e.key === "ArrowLeft") setRef((r) => andar(visao, r, -1));
      else if (e.key === "ArrowRight") setRef((r) => andar(visao, r, 1));
      else if (k === "t") setRef(inicioDoDia());
      else if (v) setVisao(v.id);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [form, visao]);

  async function alternar(a) {
    await supabase.from("agenda").update({ concluido: !a.concluido }).eq("id", a.id);
    carregar();
  }

  const irPara = (dia, v) => { setRef(inicioDoDia(dia)); setVisao(v); };
  const novo = (quando) => setForm({ inicioPadrao: quando.toISOString() });

  const dias = visao === "dia" ? [inicioDoDia(ref)]
    : visao === "semana" ? Array.from({ length: 7 }, (_, i) => somarDias(ini, i)) : null;

  return (
    <div className="h-full flex flex-col gap-3 px-4 md:px-8 pt-6 pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Agenda</h1>
        <button onClick={() => setForm({})} className="h-10 px-5 rounded-lg bg-sol text-tinta font-semibold">Agendar</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setRef(inicioDoDia())} title="Hoje (T)"
          className="h-10 px-4 rounded-lg border border-linha bg-superficie font-medium">Hoje</button>
        <div className="flex">
          <BotaoSeta direcao={-1} onClick={() => setRef((r) => andar(visao, r, -1))} />
          <BotaoSeta direcao={1} onClick={() => setRef((r) => andar(visao, r, 1))} />
        </div>
        <h2 className="flex-1 min-w-40 text-lg font-semibold first-letter:uppercase">{tituloPeriodo(visao, ref)}</h2>
        <div role="tablist" aria-label="Visão da agenda" className="flex rounded-lg border border-linha bg-superficie p-0.5">
          {VISOES.map((v) => (
            <button key={v.id} role="tab" aria-selected={visao === v.id} onClick={() => setVisao(v.id)}
              title={`${v.nome} (${v.tecla.toUpperCase()})`}
              className={`h-9 px-3 rounded-md text-sm font-medium ${visao === v.id ? "bg-tinta text-white" : "text-tinta-suave hover:bg-fundo"}`}>
              {v.nome}
            </button>
          ))}
        </div>
      </div>

      {atrasados.length > 0 && (
        <div className="rounded-2xl border border-alerta/30 bg-alerta/5 shrink-0">
          <button onClick={() => setVerAtrasados((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-alerta">
            <span>
              {atrasados.length === 1 ? "1 compromisso ficou para trás" : `${atrasados.length} compromissos ficaram para trás`}
            </span>
            <span className="underline">{verAtrasados ? "Esconder" : "Ver"}</span>
          </button>
          {verAtrasados && <ListaAtrasados itens={atrasados} onAlternar={alternar} onAbrir={setForm} />}
        </div>
      )}

      {!itens ? <EsqueletoAgenda visao={visao} />
        : dias ? <GradeHoras dias={dias} eventos={itens} onAbrir={setForm} onNovo={novo} onDia={(d) => irPara(d, "dia")} />
        : visao === "mes" ? <VisaoMes refMes={ref} eventos={itens} onAbrir={setForm} onNovo={novo} onDia={(d) => irPara(d, "dia")} />
        : <VisaoAno ano={ref.getFullYear()} eventos={itens} onDia={(d) => irPara(d, "dia")} onMes={(d) => irPara(d, "mes")} />}

      <Legenda />

      {form && (
        <EventoForm evento={form.id ? form : null} inicioPadrao={form.inicioPadrao}
          onFechar={() => setForm(null)} onSalvo={carregar} />
      )}
    </div>
  );
}

function BotaoSeta({ direcao, onClick }) {
  return (
    <button onClick={onClick} aria-label={direcao < 0 ? "Anterior" : "Próximo"} title={direcao < 0 ? "Anterior (←)" : "Próximo (→)"}
      className="h-10 w-10 grid place-items-center rounded-full text-xl text-tinta-suave hover:bg-superficie">
      {direcao < 0 ? "‹" : "›"}
    </button>
  );
}

function Legenda() {
  return (
    <div className="hidden md:flex flex-wrap gap-4 text-xs text-tinta-suave shrink-0">
      {TIPOS_AGENDA.map((t) => (
        <span key={t.id} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${cor(t.id).ponto}`} />{t.nome}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Dia e semana: grade de horários
// ---------------------------------------------------------------------

// Distribui compromissos que se sobrepõem lado a lado, em colunas
function dispor(blocos) {
  const ordenados = [...blocos].sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const saida = [];
  let grupo = [];
  let fimGrupo = 0;
  const fechar = () => {
    const colunas = [];
    for (const b of grupo) {
      let c = colunas.findIndex((fim) => fim <= b.ini);
      if (c < 0) { c = colunas.length; colunas.push(0); }
      colunas[c] = b.fim;
      b.col = c;
    }
    for (const b of grupo) b.ncol = colunas.length;
    saida.push(...grupo);
    grupo = [];
  };
  for (const b of ordenados) {
    if (grupo.length && b.ini >= fimGrupo) fechar();
    grupo.push(b);
    fimGrupo = Math.max(fimGrupo, b.fim);
  }
  if (grupo.length) fechar();
  return saida;
}

function GradeHoras({ dias, eventos, onAbrir, onNovo, onDia }) {
  const rolagem = useRef(null);
  const agora = useAgora();
  const porDia = agrupar(eventos);
  const primeiro = dias[0].getTime();

  // Abre já no horário útil (ou perto de agora, se hoje estiver na tela)
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const temHoje = dias.some((d) => mesmoDia(d, new Date()));
    el.scrollTop = (temHoje ? Math.max(0, new Date().getHours() - 2) : 7) * HORA_PX;
  }, [primeiro, dias.length]);

  return (
    <div ref={rolagem} className="flex-1 min-h-80 overflow-y-auto bg-superficie border border-linha rounded-2xl animate-aparecer">
      <div className="sticky top-0 z-20 flex bg-superficie border-b border-linha">
        <div className="w-12 md:w-14 shrink-0" />
        {dias.map((d) => {
          const hoje = mesmoDia(d, agora);
          return (
            <button key={d.getTime()} onClick={() => onDia(d)} className="flex-1 min-w-0 py-2 flex flex-col items-center">
              <span className={`text-[11px] uppercase font-medium ${hoje ? "text-sol-escuro" : "text-tinta-suave"}`}>{NOMES_DIA[d.getDay()]}</span>
              <span className={`mt-0.5 h-9 w-9 grid place-items-center rounded-full text-lg font-semibold ${hoje ? "bg-sol text-tinta" : "hover:bg-fundo"}`}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex" style={{ height: 24 * HORA_PX }}>
        <div className="w-12 md:w-14 shrink-0 relative">
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-tinta-suave" style={{ top: h * HORA_PX }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {dias.map((d) => (
          <ColunaDia key={d.getTime()} dia={d} eventos={porDia.get(chave(d)) ?? []} agora={agora} onAbrir={onAbrir} onNovo={onNovo} />
        ))}
      </div>
    </div>
  );
}

function ColunaDia({ dia, eventos, agora, onAbrir, onNovo }) {
  const blocos = dispor(eventos.map((e) => {
    const i = new Date(e.inicio);
    const f = e.fim ? new Date(e.fim) : null;
    const ini = minutosDoDia(i);
    let fim = !f ? ini + DURACAO_PADRAO : mesmoDia(f, i) ? minutosDoDia(f) : 24 * 60;
    fim = Math.min(Math.max(fim, ini + 20), 24 * 60);
    return { e, ini, fim };
  }));

  // Clique num horário vazio cria um compromisso ali, arredondado para a meia hora
  function clicar(ev) {
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const d = new Date(dia);
    d.setHours(0, Math.floor((y / HORA_PX) * 2) * 30, 0, 0);
    onNovo(d);
  }

  return (
    <div onClick={clicar} className="flex-1 min-w-0 relative border-l border-linha cursor-pointer"
      style={{ backgroundImage: "linear-gradient(to bottom, var(--color-linha) 1px, transparent 1px)", backgroundSize: `100% ${HORA_PX}px` }}>
      {blocos.map(({ e, ini, fim, col, ncol }) => {
        const curto = fim - ini < 45;
        return (
          <button key={e.id} onClick={(ev) => { ev.stopPropagation(); onAbrir(e); }}
            title={`${hm(e.inicio)} ${e.titulo}`}
            className="absolute z-10 rounded-md bg-superficie text-left overflow-hidden shadow-sm"
            style={{
              top: (ini / 60) * HORA_PX + 1,
              height: ((fim - ini) / 60) * HORA_PX - 2,
              left: `calc(${(col / ncol) * 100}% + 2px)`,
              width: `calc(${100 / ncol}% - 4px)`,
            }}>
            <div className={`h-full rounded-md border-l-4 px-1.5 py-0.5 text-xs leading-4 ${cor(e.tipo).bloco} ${e.concluido ? "opacity-50" : ""}`}>
              <div className={`font-semibold truncate ${e.concluido ? "line-through" : ""}`}>
                {e.titulo}{curto && <span className="font-normal text-tinta-suave">, {hm(e.inicio)}</span>}
              </div>
              {!curto && <div className="truncate text-tinta-suave">{hm(e.inicio)}{e.fim ? ` – ${hm(e.fim)}` : ""}</div>}
              {fim - ini >= 75 && (e.local || e.contato) && (
                <div className="truncate text-tinta-suave">{[e.contato && nomeOuTelefone(e.contato), e.local].filter(Boolean).join(", ")}</div>
              )}
            </div>
          </button>
        );
      })}
      {mesmoDia(dia, agora) && (
        <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: (minutosDoDia(agora) / 60) * HORA_PX }}>
          <div className="relative h-0.5 bg-alerta">
            <span className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-alerta" />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Mês
// ---------------------------------------------------------------------

function VisaoMes({ refMes, eventos, onAbrir, onNovo, onDia }) {
  const [ini] = intervalo("mes", refMes);
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(ini, i));
  const porDia = agrupar(eventos);
  const hoje = new Date();

  return (
    <div className="flex-1 min-h-[34rem] flex flex-col bg-superficie border border-linha rounded-2xl overflow-hidden animate-aparecer">
      <div className="grid grid-cols-7 border-b border-linha">
        {NOMES_DIA.map((n) => (
          <div key={n} className="py-2 text-center text-[11px] uppercase font-medium text-tinta-suave">{n}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {dias.map((d, i) => {
          const lista = porDia.get(chave(d)) ?? [];
          const fora = d.getMonth() !== refMes.getMonth();
          const eHoje = mesmoDia(d, hoje);
          const visiveis = lista.length > MAX_NO_DIA ? MAX_NO_DIA - 1 : lista.length;
          return (
            <div key={i} onClick={() => { const x = new Date(d); x.setHours(9); onNovo(x); }}
              className={`min-w-0 min-h-0 overflow-hidden p-1 cursor-pointer border-linha ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${fora ? "bg-fundo/50" : ""}`}>
              <div className="flex justify-center mb-0.5">
                <button onClick={(e) => { e.stopPropagation(); onDia(d); }}
                  className={`h-7 min-w-7 px-1.5 rounded-full text-xs font-semibold ${eHoje ? "bg-sol text-tinta" : fora ? "text-tinta-suave hover:bg-fundo" : "hover:bg-fundo"}`}>
                  {d.getDate() === 1 ? `${d.getDate()} ${mesCurto(d)}` : d.getDate()}
                </button>
              </div>
              {lista.slice(0, visiveis).map((e) => <ChipEvento key={e.id} e={e} onAbrir={onAbrir} />)}
              {lista.length > visiveis && (
                <button onClick={(ev) => { ev.stopPropagation(); onDia(d); }}
                  className="w-full px-1 text-left text-xs font-medium text-tinta-suave hover:underline">
                  +{lista.length - visiveis} mais
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChipEvento({ e, onAbrir }) {
  return (
    <button onClick={(ev) => { ev.stopPropagation(); onAbrir(e); }} title={`${hm(e.inicio)} ${e.titulo}`}
      className={`w-full flex items-center gap-1 rounded px-1 text-left text-xs leading-5 hover:bg-fundo ${e.concluido ? "opacity-50 line-through" : ""}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${cor(e.tipo).ponto}`} />
      <span className="hidden sm:inline shrink-0 text-tinta-suave">{hm(e.inicio)}</span>
      <span className="truncate">{e.titulo}</span>
    </button>
  );
}

// ---------------------------------------------------------------------
// Ano
// ---------------------------------------------------------------------

function VisaoAno({ ano, eventos, onDia, onMes }) {
  const porDia = agrupar(eventos);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto animate-aparecer">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => (
          <MiniMes key={m} mes={new Date(ano, m, 1)} porDia={porDia} onDia={onDia} onMes={onMes} />
        ))}
      </div>
    </div>
  );
}

function MiniMes({ mes, porDia, onDia, onMes }) {
  const ini = inicioSemana(mes);
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(ini, i));
  const hoje = new Date();
  return (
    <section className="bg-superficie border border-linha rounded-2xl p-3">
      <button onClick={() => onMes(mes)} className="px-1 mb-1 font-semibold first-letter:uppercase hover:underline">
        {mes.toLocaleDateString("pt-BR", { month: "long" })}
      </button>
      <div className="grid grid-cols-7 text-center text-[11px] text-tinta-suave">
        {NOMES_DIA.map((n) => <span key={n} className="h-6 leading-6">{n[0].toUpperCase()}</span>)}
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {dias.map((d, i) => {
          if (d.getMonth() !== mes.getMonth()) return <span key={i} className="h-8" />;
          const n = porDia.get(chave(d))?.length ?? 0;
          const eHoje = mesmoDia(d, hoje);
          return (
            <button key={i} onClick={() => onDia(d)}
              title={n ? (n === 1 ? "1 compromisso" : `${n} compromissos`) : undefined}
              className={`h-8 w-8 mx-auto grid place-items-center rounded-full ${
                eHoje ? "bg-sol text-tinta font-semibold" : n ? "bg-sol/20 font-semibold" : "hover:bg-fundo"}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Compromissos que passaram sem ser concluídos
// ---------------------------------------------------------------------

function ListaAtrasados({ itens, onAlternar, onAbrir }) {
  return (
    <ul className="max-h-64 overflow-y-auto bg-superficie rounded-b-2xl border-t border-alerta/20 divide-y divide-linha">
      {itens.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
          <button onClick={() => onAlternar(a)} aria-label="Marcar como feito"
            className="h-7 w-7 shrink-0 rounded-full border-2 border-linha grid place-items-center" />
          <button onClick={() => onAbrir(a)} className="flex-1 min-w-0 text-left">
            <div className="flex gap-3">
              <span className="w-12 shrink-0 font-semibold">
                {new Date(a.inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
              <span className="truncate">{a.titulo}</span>
            </div>
            <div className="text-sm text-tinta-suave truncate pl-[3.75rem]">
              {[nomeTipo(a.tipo), a.local].filter(Boolean).join(", ")}
            </div>
          </button>
          {a.contato && (
            <Link to={`/conversas/${a.contato.id}`} className="text-sm underline text-tinta-suave shrink-0">
              {nomeOuTelefone(a.contato).split(" ")[0]}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
