import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ETAPAS, ETAPA_PERDIDO, FAIXAS, FINANCIAMENTO, ORIGENS, faixaPorConsumo, nomeTipo } from "../lib/constantes";
import { dataCurta, formatarTelefone, hora, nomeOuTelefone, normalizarTelefone, paraInputLocal } from "../lib/format";
import { Campo, Entrada, Selecao, AreaTexto, BotaoPrimario, BotaoSecundario, Vazio } from "../components/ui";
import Chat from "../components/Chat";
import EventoForm from "../components/EventoForm";

export default function Contato() {
  const { id } = useParams();
  const [contato, setContato] = useState(null);
  const [op, setOp] = useState(null);
  const [aba, setAba] = useState("conversa");

  async function carregar() {
    const [{ data: c }, { data: o }] = await Promise.all([
      supabase.from("contatos").select("*, indicador:contatos!contatos_indicado_por_fkey(id, nome, telefone)").eq("id", id).single(),
      supabase.from("oportunidades").select("*").eq("contato_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setContato(c); setOp(o);
  }

  useEffect(() => { carregar(); }, [id]);

  if (!contato) return <div className="p-6 text-tinta-suave">Carregando…</div>;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-env(safe-area-inset-bottom,0px))] md:h-screen">
      <header className="bg-superficie border-b border-linha px-4 md:px-6 py-3 flex items-center gap-3">
        <Link to="/conversas" className="md:hidden h-10 w-10 -ml-2 grid place-items-center text-2xl" aria-label="Voltar">‹</Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-lg truncate">{nomeOuTelefone(contato)}</h1>
          <p className="text-sm text-tinta-suave truncate">
            {[formatarTelefone(contato.telefone), op && (op.etapa === "perdido" ? ETAPA_PERDIDO.nome : ETAPAS.find((e) => e.id === op.etapa)?.nome)].filter(Boolean).join(", ")}
          </p>
        </div>
        {contato.telefone && (
          <a href={`tel:+${contato.telefone}`} className="h-10 px-3 rounded-lg border border-linha grid place-items-center text-sm font-medium">Ligar</a>
        )}
      </header>

      {/* Abas no celular; lado a lado no computador */}
      <div className="md:hidden grid grid-cols-2 bg-superficie border-b border-linha" role="tablist">
        {[["conversa", "Conversa"], ["dados", "Dados e venda"]].map(([k, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`h-11 font-medium border-b-2 ${aba === k ? "border-sol text-tinta" : "border-transparent text-tinta-suave"}`}>{n}</button>
        ))}
      </div>

      <div className="flex-1 min-h-0 md:grid md:grid-cols-[1fr_400px]">
        <div className={`h-full min-h-0 ${aba === "conversa" ? "block" : "hidden"} md:block`}>
          <Chat contato={contato} />
        </div>
        <div className={`h-full overflow-y-auto border-l border-linha bg-fundo ${aba === "dados" ? "block" : "hidden"} md:block`}>
          <Ficha contato={contato} op={op} onSalvo={carregar} />
        </div>
      </div>
    </div>
  );
}

function Ficha({ contato, op, onSalvo }) {
  return (
    <div className="p-4 space-y-4">
      {op ? <CardVenda op={op} onSalvo={onSalvo} /> : <SemOportunidade contatoId={contato.id} onSalvo={onSalvo} />}
      <CardAgenda contato={contato} opId={op?.id} />
      <CardDados contato={contato} onSalvo={onSalvo} />
      <CardIndicacoes contato={contato} />
    </div>
  );
}

function Card({ titulo, children }) {
  return (
    <section className="bg-superficie rounded-2xl border border-linha p-4">
      <h2 className="font-semibold mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

function CardVenda({ op, onSalvo }) {
  const [f, setF] = useState(inicial(op));
  const [salvo, setSalvo] = useState(false);
  useEffect(() => setF(inicial(op)), [op]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSalvo(false); };

  async function salvar(e) {
    e.preventDefault();
    await supabase.from("oportunidades").update({
      etapa: f.etapa,
      faixa_consumo: f.faixa_consumo || null,
      financiamento_status: f.financiamento_status || null,
      financiamento_banco: f.financiamento_banco.trim() || null,
      proximo_followup: f.proximo_followup ? new Date(f.proximo_followup).toISOString() : null,
      motivo_perda: f.etapa === "perdido" ? f.motivo_perda.trim() || null : null,
    }).eq("id", op.id);
    setSalvo(true); onSalvo();
  }

  return (
    <Card titulo="Venda">
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Etapa"><Selecao opcoes={[...ETAPAS, ETAPA_PERDIDO]} value={f.etapa} onChange={set("etapa")} /></Campo>
        {f.etapa === "perdido" && (
          <Campo rotulo="Por que não fechou?"><Entrada value={f.motivo_perda} onChange={set("motivo_perda")} /></Campo>
        )}
        <Campo rotulo="Próximo retorno" dica="Aparece na tela Hoje no dia marcado.">
          <Entrada type="datetime-local" value={f.proximo_followup} onChange={set("proximo_followup")} />
        </Campo>
        <Campo rotulo="Faixa de consumo"><Selecao opcoes={FAIXAS} vazio="Não definida" value={f.faixa_consumo} onChange={set("faixa_consumo")} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Financiamento"><Selecao opcoes={FINANCIAMENTO} vazio="—" value={f.financiamento_status} onChange={set("financiamento_status")} /></Campo>
          <Campo rotulo="Banco"><Entrada value={f.financiamento_banco} onChange={set("financiamento_banco")} /></Campo>
        </div>
        <div className="flex items-center gap-3">
          <BotaoPrimario>Salvar</BotaoPrimario>
          {salvo && <span className="text-ok text-sm">Salvo</span>}
        </div>
      </form>
    </Card>
  );
}

function inicial(op) {
  return {
    etapa: op.etapa,
    faixa_consumo: op.faixa_consumo ?? "",
    financiamento_status: op.financiamento_status ?? "",
    financiamento_banco: op.financiamento_banco ?? "",
    proximo_followup: op.proximo_followup ? paraInputLocal(op.proximo_followup) : "",
    motivo_perda: op.motivo_perda ?? "",
  };
}

function SemOportunidade({ contatoId, onSalvo }) {
  async function criar() {
    await supabase.from("oportunidades").insert({ contato_id: contatoId, etapa: "novo" });
    onSalvo();
  }
  return (
    <Card titulo="Venda">
      <p className="text-sm text-tinta-suave mb-3">Esse contato ainda não está no funil.</p>
      <BotaoPrimario onClick={criar}>Colocar no funil</BotaoPrimario>
    </Card>
  );
}

function CardAgenda({ contato, opId }) {
  const [itens, setItens] = useState([]);
  const [form, setForm] = useState(null);

  async function carregar() {
    const { data } = await supabase.from("agenda").select("*").eq("contato_id", contato.id)
      .order("inicio", { ascending: false }).limit(10);
    setItens(data ?? []);
  }
  useEffect(() => { carregar(); }, [contato.id]);

  return (
    <Card titulo="Compromissos">
      {itens.length === 0 ? <Vazio>Nada agendado com esse cliente.</Vazio> : (
        <ul className="divide-y divide-linha mb-3">
          {itens.map((a) => (
            <li key={a.id}>
              <button onClick={() => setForm(a)} className="w-full text-left py-2.5 flex gap-3">
                <span className="w-24 shrink-0 text-sm font-semibold">{dataCurta(a.inicio)} {hora(a.inicio)}</span>
                <span className={`text-sm ${a.concluido ? "line-through text-tinta-suave" : ""}`}>{nomeTipo(a.tipo)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <BotaoSecundario onClick={() => setForm({})}>Agendar</BotaoSecundario>
      {form && (
        <EventoForm evento={form.id ? form : null} contatoFixo={contato} oportunidadeId={opId}
          onFechar={() => setForm(null)} onSalvo={carregar} />
      )}
    </Card>
  );
}

function CardDados({ contato, onSalvo }) {
  const [f, setF] = useState(ini(contato));
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");
  const [enviandoConta, setEnviandoConta] = useState(false);
  useEffect(() => setF(ini(contato)), [contato]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); setSalvo(false); };

  async function salvar(e) {
    e.preventDefault(); setErro("");
    const consumo = f.consumo_kwh ? Number(f.consumo_kwh) : null;
    const { error } = await supabase.from("contatos").update({
      nome: f.nome.trim() || null,
      telefone: normalizarTelefone(f.telefone),
      bairro: f.bairro.trim() || null,
      cidade: f.cidade.trim() || null,
      endereco: f.endereco.trim() || null,
      origem: f.origem,
      consumo_kwh: consumo,
      consentimento_lgpd: f.consentimento_lgpd,
      consentimento_em: f.consentimento_lgpd ? contato.consentimento_em ?? new Date().toISOString() : null,
      observacoes: f.observacoes.trim() || null,
    }).eq("id", contato.id);
    if (error) { setErro(error.code === "23505" ? "Já existe outro contato com esse telefone." : "Não foi possível salvar."); return; }

    // Consumo informado pela primeira vez: preenche a faixa e avança de "novo" para "qualificado"
    if (consumo && !contato.consumo_kwh) {
      await supabase.from("oportunidades").update({ faixa_consumo: faixaPorConsumo(consumo) })
        .eq("contato_id", contato.id).is("faixa_consumo", null);
      await supabase.from("oportunidades").update({ etapa: "qualificado" })
        .eq("contato_id", contato.id).eq("etapa", "novo");
    }
    setSalvo(true); onSalvo();
  }

  async function enviarConta(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviandoConta(true);
    const caminho = `${contato.id}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("contas-luz").upload(caminho, arquivo);
    if (!error) await supabase.from("contatos").update({ conta_luz_path: caminho }).eq("id", contato.id);
    setEnviandoConta(false);
    if (error) setErro("Não foi possível enviar a conta de luz."); else onSalvo();
  }

  async function abrirConta() {
    const { data } = await supabase.storage.from("contas-luz").createSignedUrl(contato.conta_luz_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Card titulo="Dados do cliente">
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={set("nome")} /></Campo>
        <Campo rotulo="WhatsApp"><Entrada type="tel" value={f.telefone} onChange={set("telefone")} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Bairro"><Entrada value={f.bairro} onChange={set("bairro")} /></Campo>
          <Campo rotulo="Cidade"><Entrada value={f.cidade} onChange={set("cidade")} /></Campo>
        </div>
        <Campo rotulo="Endereço"><Entrada value={f.endereco} onChange={set("endereco")} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Consumo (kWh/mês)"><Entrada type="number" inputMode="numeric" min="1" value={f.consumo_kwh} onChange={set("consumo_kwh")} /></Campo>
          <Campo rotulo="Origem"><Selecao opcoes={ORIGENS} value={f.origem} onChange={set("origem")} /></Campo>
        </div>

        <div>
          <span className="text-sm font-medium">Conta de luz</span>
          <div className="mt-1 flex gap-2">
            {contato.conta_luz_path && <BotaoSecundario type="button" onClick={abrirConta}>Ver</BotaoSecundario>}
            <label className="h-12 px-4 rounded-lg border border-linha bg-superficie font-medium grid place-items-center cursor-pointer">
              {enviandoConta ? "Enviando..." : contato.conta_luz_path ? "Trocar foto" : "Enviar foto"}
              <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={enviarConta} />
            </label>
          </div>
        </div>

        <Campo rotulo="Anotações"><AreaTexto rows={3} value={f.observacoes} onChange={set("observacoes")} /></Campo>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={f.consentimento_lgpd} onChange={set("consentimento_lgpd")} className="mt-1 h-5 w-5 accent-sol" />
          <span className="text-sm">O cliente autorizou receber mensagens pelo WhatsApp</span>
        </label>
        {erro && <p className="text-alerta text-sm">{erro}</p>}
        <div className="flex items-center gap-3">
          <BotaoPrimario>Salvar dados</BotaoPrimario>
          {salvo && <span className="text-ok text-sm">Salvo</span>}
        </div>
      </form>
    </Card>
  );
}

function ini(c) {
  return {
    nome: c.nome ?? "", telefone: formatarTelefone(c.telefone), bairro: c.bairro ?? "", cidade: c.cidade ?? "",
    endereco: c.endereco ?? "", consumo_kwh: c.consumo_kwh ?? "", origem: c.origem,
    consentimento_lgpd: c.consentimento_lgpd, observacoes: c.observacoes ?? "",
  };
}

function CardIndicacoes({ contato }) {
  const [indicados, setIndicados] = useState([]);
  useEffect(() => {
    supabase.from("contatos").select("id, nome, telefone").eq("indicado_por", contato.id)
      .then(({ data }) => setIndicados(data ?? []));
  }, [contato.id]);

  return (
    <Card titulo="Indicações">
      {contato.indicador && (
        <p className="text-sm mb-2">
          Indicado por <Link className="underline font-medium" to={`/contatos/${contato.indicador.id}`}>{nomeOuTelefone(contato.indicador)}</Link>
        </p>
      )}
      {indicados.length === 0 ? <Vazio>Ainda não indicou ninguém.</Vazio> : (
        <>
          <p className="text-sm text-tinta-suave mb-1">Indicou {indicados.length} {indicados.length === 1 ? "pessoa" : "pessoas"}:</p>
          <ul className="text-sm space-y-1">
            {indicados.map((i) => (
              <li key={i.id}><Link className="underline" to={`/contatos/${i.id}`}>{nomeOuTelefone(i)}</Link></li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
