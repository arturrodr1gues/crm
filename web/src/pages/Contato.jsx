import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { FAIXAS, FINANCIAMENTO, ORIGENS, faixaPorConsumo, nomeTipo } from "../lib/constantes";
import { nomeEtapa, tipoEtapa, useEtapas } from "../lib/etapas";
import { dataCurta, formatarTelefone, hora, nomeOuTelefone, normalizarTelefone, paraInputLocal } from "../lib/format";
import { Campo, Entrada, Selecao, AreaTexto, BotaoPrimario, BotaoSecundario, Vazio, PreviaImagem } from "../components/ui";
import Chat from "../components/Chat";
import ListaConversas from "../components/ListaConversas";
import useMidia, { TELA_LARGA } from "../lib/useMidia";
import { usePreferencia } from "../lib/preferencias";
import DetalhesConversa from "../components/DetalhesConversa";
import EventoForm from "../components/EventoForm";

export default function Contato() {
  useEtapas(); // nome da etapa no cabeçalho acompanha o gerenciador do funil
  const { id } = useParams();
  const [contato, setContato] = useState(null);
  const [op, setOp] = useState(null);
  const [aba, setAba] = useState("conversa"); // celular: conversa | detalhes | dados
  const larga = useMidia(TELA_LARGA);
  const md = useMidia("(min-width: 768px)");
  // Computador: painel da direita (detalhes ou ficha) e lista de conversas à esquerda. Lembra a escolha.
  const [painel, setPainel] = usePreferencia("crm-painel-conversa", "ficha");
  const [listaRecolhida, setListaRecolhida] = usePreferencia("crm-conversas-recolhidas", false);

  // Computador: lista de todas as conversas ao lado, como no WhatsApp Web.
  const comLista = (conteudo) => (larga ? (
    <div className="flex h-full">
      {listaRecolhida ? (
        <div className="w-12 shrink-0 border-r border-linha bg-superficie flex flex-col items-center pt-3">
          <button type="button" onClick={() => setListaRecolhida(false)} aria-label="Mostrar conversas" title="Mostrar conversas"
            className="h-9 w-9 rounded-lg grid place-items-center text-tinta-suave hover:bg-fundo">
            <IconeLista className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <aside className="w-80 xl:w-96 shrink-0 border-r border-linha bg-superficie">
          <ListaConversas lateral ativa={id} onRecolher={() => setListaRecolhida(true)} />
        </aside>
      )}
      <div className="flex-1 min-w-0 h-full">{conteudo}</div>
    </div>
  ) : conteudo);

  async function carregar() {
    const [{ data: c, error }, { data: o }] = await Promise.all([
      supabase.from("contatos").select("*, indicador:contatos!indicado_por(id, nome, telefone)").eq("id", id).single(),
      supabase.from("oportunidades").select("*").eq("contato_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error) console.error("erro ao carregar contato", error);
    setContato(error ? false : c); setOp(o);
  }

  useEffect(() => { setAba("conversa"); carregar(); }, [id]);

  if (contato === false) {
    return comLista(
      <div className="p-6">
        <p className="text-alerta mb-3">Não foi possível abrir essa conversa.</p>
        <Link to="/conversas" className="underline text-tinta-suave">Voltar para Conversas</Link>
      </div>
    );
  }
  if (!contato) return comLista(<div className="p-6 text-tinta-suave">Carregando…</div>);

  // Grupo não é cliente: tem detalhes, mas não tem ficha de venda.
  const grupo = contato.is_grupo;
  const painelAtual = grupo && painel === "ficha" ? "detalhes" : painel;
  const alternar = (p) => setPainel(painelAtual === p ? null : p);
  const abrirDetalhes = () => (md ? setPainel("detalhes") : setAba("detalhes"));
  const qual = md ? painelAtual : aba;
  const abas = grupo
    ? [["conversa", "Conversa"], ["detalhes", "Detalhes"]]
    : [["conversa", "Conversa"], ["detalhes", "Detalhes"], ["dados", "Venda"]];

  const etapa = op && nomeEtapa(op.etapa);
  const botaoPainel = (p, nome) => (
    <button type="button" onClick={() => alternar(p)} aria-pressed={painelAtual === p}
      className={`hidden md:grid h-9 px-3 rounded-lg border place-items-center text-sm font-medium ${
        painelAtual === p ? "bg-tinta text-white border-tinta" : "border-linha hover:bg-fundo"}`}>
      {nome}
    </button>
  );

  return comLista(
    <div className="flex flex-col h-full">
      <header className="bg-superficie border-b border-linha px-4 md:px-5 py-2.5 flex items-center gap-2">
        <Link to="/conversas" className="md:hidden h-10 w-10 -ml-2 grid place-items-center text-2xl" aria-label="Voltar">‹</Link>
        {/* Tocar no nome abre os detalhes, como no WhatsApp */}
        <button type="button" onClick={abrirDetalhes} className="min-w-0 flex-1 flex items-center gap-3 text-left">
          <span className={`h-10 w-10 shrink-0 rounded-full grid place-items-center font-semibold ${
            grupo ? "bg-linha text-tinta" : "bg-tinta text-white"}`}>
            {grupo ? "👥" : (contato.nome || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold truncate">{grupo ? contato.nome || "Grupo sem nome" : nomeOuTelefone(contato)}</span>
            <span className="block text-sm text-tinta-suave truncate">
              {grupo ? "Grupo do WhatsApp" : [formatarTelefone(contato.telefone), etapa].filter(Boolean).join(", ")}
            </span>
          </span>
        </button>
        {!grupo && contato.telefone && (
          <a href={`tel:+${contato.telefone}`} className="h-9 px-3 rounded-lg border border-linha grid place-items-center text-sm font-medium hover:bg-fundo">Ligar</a>
        )}
        {botaoPainel("detalhes", "Detalhes")}
        {!grupo && botaoPainel("ficha", "Ficha")}
      </header>

      {/* Abas no celular; lado a lado no computador */}
      <div className={`md:hidden grid ${abas.length === 3 ? "grid-cols-3" : "grid-cols-2"} bg-superficie border-b border-linha`} role="tablist">
        {abas.map(([k, n]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`h-11 font-medium border-b-2 ${aba === k ? "border-sol text-tinta" : "border-transparent text-tinta-suave"}`}>{n}</button>
        ))}
      </div>

      <div className={`flex-1 min-h-0 md:grid md:grid-rows-[minmax(0,1fr)] ${
        painelAtual ? "md:grid-cols-[minmax(0,1fr)_360px]" : "md:grid-cols-[minmax(0,1fr)]"}`}>
        <div className={`h-full min-h-0 ${aba === "conversa" ? "block" : "hidden"} md:block`}>
          <Chat contato={contato} etapa={grupo ? null : op?.etapa} />
        </div>
        {qual && qual !== "conversa" && (
          <div className={`relative h-full overflow-y-auto overscroll-contain border-l border-linha bg-fundo ${aba !== "conversa" ? "block" : "hidden"} md:block`}>
            {md && (
              <div className="sticky top-0 z-10 flex items-center justify-between h-12 px-4 bg-superficie border-b border-linha">
                <span className="font-semibold">{qual === "detalhes" ? "Dados da conversa" : "Ficha do cliente"}</span>
                <button type="button" onClick={() => setPainel(null)} aria-label="Fechar painel"
                  className="h-8 w-8 -mr-2 grid place-items-center rounded-lg text-tinta-suave hover:bg-fundo text-xl">×</button>
              </div>
            )}
            {qual === "detalhes"
              ? <DetalhesConversa contato={contato} />
              : <Ficha contato={contato} op={op} onSalvo={carregar} />}
          </div>
        )}
      </div>
    </div>
  );
}

function IconeLista(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M9 10h6M9 13.5h4" />
  </svg>);
}

// Também usada na página do lead (Funil → card), com as seções lado a lado no computador
export function Ficha({ contato, op, onSalvo, className = "p-4 space-y-4" }) {
  return (
    <div className={className}>
      {op ? <CardVenda op={op} onSalvo={onSalvo} /> : <SemOportunidade contatoId={contato.id} onSalvo={onSalvo} />}
      <CardAgenda contato={contato} opId={op?.id} />
      <CardDados contato={contato} onSalvo={onSalvo} />
      <CardIndicacoes contato={contato} />
    </div>
  );
}

export function Card({ titulo, children }) {
  return (
    <section className="bg-superficie rounded-2xl border border-linha p-4">
      <h2 className="font-semibold mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

function CardVenda({ op, onSalvo }) {
  const etapas = useEtapas();
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
      motivo_perda: tipoEtapa(f.etapa) === "perdido" ? f.motivo_perda.trim() || null : null,
    }).eq("id", op.id);
    setSalvo(true); onSalvo();
  }

  return (
    <Card titulo="Venda">
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Etapa"><Selecao opcoes={etapas} value={f.etapa} onChange={set("etapa")} /></Campo>
        {tipoEtapa(f.etapa) === "perdido" && (
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
  const [previa, setPrevia] = useState(null);
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
    if (!data?.signedUrl) return;
    // Foto abre em pré-visualização aqui mesmo; PDF continua abrindo no leitor do navegador
    if (/\.pdf$/i.test(contato.conta_luz_path)) window.open(data.signedUrl, "_blank", "noopener");
    else setPrevia(data.signedUrl);
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
            <label className="relative h-12 px-4 rounded-lg border border-linha bg-superficie font-medium grid place-items-center cursor-pointer">
              {enviandoConta ? "Enviando..." : contato.conta_luz_path ? "Trocar foto" : "Enviar foto"}
              <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={enviarConta} />
            </label>
          </div>
        </div>

        {previa && <PreviaImagem src={previa} alt="Conta de luz" onFechar={() => setPrevia(null)} />}
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
          Indicado por <Link className="underline font-medium" to={`/conversas/${contato.indicador.id}`}>{nomeOuTelefone(contato.indicador)}</Link>
        </p>
      )}
      {indicados.length === 0 ? <Vazio>Ainda não indicou ninguém.</Vazio> : (
        <>
          <p className="text-sm text-tinta-suave mb-1">Indicou {indicados.length} {indicados.length === 1 ? "pessoa" : "pessoas"}:</p>
          <ul className="text-sm space-y-1">
            {indicados.map((i) => (
              <li key={i.id}><Link className="underline" to={`/conversas/${i.id}`}>{nomeOuTelefone(i)}</Link></li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
