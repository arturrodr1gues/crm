import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { nomeTipo } from "../lib/constantes";
import { diaSemana, hora, inicioDoDia, nomeOuTelefone } from "../lib/format";
import { BotaoPrimario } from "../components/ui";
import EventoForm from "../components/EventoForm";

const DIAS_A_FRENTE = 14;

export default function Agenda() {
  const [itens, setItens] = useState(null);
  const [atrasados, setAtrasados] = useState([]);
  const [form, setForm] = useState(null);

  async function carregar() {
    const hoje = inicioDoDia();
    const ate = new Date(hoje.getTime() + DIAS_A_FRENTE * 86400000);
    const sel = "id, titulo, tipo, inicio, local, notas, concluido, oportunidade_id, contato:contatos(id, nome, telefone)";
    const [prox, atr] = await Promise.all([
      supabase.from("agenda").select(sel).gte("inicio", hoje.toISOString()).lt("inicio", ate.toISOString()).order("inicio"),
      supabase.from("agenda").select(sel).lt("inicio", hoje.toISOString()).eq("concluido", false).order("inicio"),
    ]);
    setItens(prox.data ?? []);
    setAtrasados(atr.data ?? []);
  }
  useEffect(() => { carregar(); }, []);

  async function alternar(a) {
    await supabase.from("agenda").update({ concluido: !a.concluido }).eq("id", a.id);
    carregar();
  }

  if (!itens) return <div className="p-6 text-tinta-suave">Carregando…</div>;

  // Agrupa por dia
  const grupos = itens.reduce((acc, a) => {
    const chave = inicioDoDia(new Date(a.inicio)).toISOString();
    (acc[chave] ||= []).push(a);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold">Agenda</h1>
        <BotaoPrimario onClick={() => setForm({})}>Agendar</BotaoPrimario>
      </div>

      {atrasados.length > 0 && (
        <Dia titulo="Ficou para trás" alerta itens={atrasados} onAlternar={alternar} onAbrir={setForm} comData />
      )}

      {Object.keys(grupos).length === 0 && atrasados.length === 0 && (
        <p className="text-tinta-suave py-8 text-center">Nenhum compromisso nos próximos {DIAS_A_FRENTE} dias.</p>
      )}

      {Object.entries(grupos).map(([dia, lista]) => (
        <Dia key={dia} titulo={diaSemana(dia)} itens={lista} onAlternar={alternar} onAbrir={setForm} />
      ))}

      {form && (
        <EventoForm evento={form.id ? form : null} onFechar={() => setForm(null)} onSalvo={carregar} />
      )}
    </div>
  );
}

function Dia({ titulo, itens, onAlternar, onAbrir, alerta, comData }) {
  return (
    <section className="mb-5">
      <h2 className={`font-semibold mb-2 first-letter:uppercase ${alerta ? "text-alerta" : ""}`}>{titulo}</h2>
      <ul className="bg-superficie rounded-2xl border border-linha divide-y divide-linha">
        {itens.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => onAlternar(a)} aria-label={a.concluido ? "Marcar como pendente" : "Marcar como feito"}
              className={`h-7 w-7 shrink-0 rounded-full border-2 grid place-items-center ${a.concluido ? "bg-ok border-ok text-white" : "border-linha"}`}>
              {a.concluido && "✓"}
            </button>
            <button onClick={() => onAbrir(a)} className="flex-1 min-w-0 text-left">
              <div className="flex gap-3">
                <span className="w-14 shrink-0 font-semibold">
                  {comData ? new Date(a.inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : hora(a.inicio)}
                </span>
                <span className={`truncate ${a.concluido ? "line-through text-tinta-suave" : ""}`}>{a.titulo}</span>
              </div>
              <div className="text-sm text-tinta-suave truncate pl-[4.25rem]">
                {[nomeTipo(a.tipo), a.local].filter(Boolean).join(", ")}
              </div>
            </button>
            {a.contato && (
              <Link to={`/contatos/${a.contato.id}`} className="text-sm underline text-tinta-suave shrink-0">
                {nomeOuTelefone(a.contato).split(" ")[0]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
