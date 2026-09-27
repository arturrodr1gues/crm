import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { FAIXAS, FINANCIAMENTO, ORIGENS, faixaPorConsumo, nomeTipo } from "../lib/constantes";
import { tipoEtapa, useEtapas } from "../lib/etapas";
import { dataCurta, formatarTelefone, hora, nomeOuTelefone, normalizarTelefone, paraInputLocal } from "../lib/format";
import { Campo, Entrada, Selecao, AreaTexto, BotaoPrimario, BotaoSecundario, Vazio, PreviaImagem, Modal } from "./ui";
import EventoForm from "./EventoForm";

/** Ficha do cliente (venda, agenda, dados, indicações), usada no painel da conversa e na página do lead. */
export function Ficha({ contato, op, onSalvo }) {
  return (
    <div className="p-4 space-y-4">
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

export function CardVenda({ op, onSalvo }) {
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

// NOVO LEAD / NORMAL. Nenhum marcado = conversa ainda não classificada. Toda troca passa pelo modal de confirmação.
// `noFunil`: o contato já tem venda no funil (marcar "Normal" apaga a venda).
export function SeletorTipo({ tipo, noFunil, onEscolher }) {
  const [confirmando, setConfirmando] = useState(null); // lead | normal

  return (
    <>
      <div role="group" aria-label="Tipo de contato" className="shrink-0 flex p-0.5 rounded-lg border border-linha bg-fundo">
        {[["lead", "Novo lead", "Lead"], ["normal", "Normal", "Normal"]].map(([k, n, curto]) => (
          <button key={k} type="button" onClick={() => tipo !== k && setConfirmando(k)} aria-pressed={tipo === k}
            title={k === "lead" ? "Colocar no funil em \"Novo contato\"" : "Conversa normal, fora do funil e do dashboard"}
            className={`h-8 px-2.5 rounded-md text-[12px] font-bold uppercase tracking-wide transition-colors ${
              tipo === k ? (k === "lead" ? "bg-sol text-tinta shadow-sm" : "bg-tinta text-white shadow-sm") : "text-tinta-suave hover:text-tinta"}`}>
            <span className="hidden sm:inline">{n}</span><span className="sm:hidden">{curto}</span>
          </button>
        ))}
      </div>
      {confirmando && (
        <ConfirmarTipo tipo={confirmando} noFunil={noFunil} onFechar={() => setConfirmando(null)}
          onConfirmar={() => onEscolher(confirmando)} />
      )}
    </>
  );
}

function ConfirmarTipo({ tipo, noFunil, onFechar, onConfirmar }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const lead = tipo === "lead";
  const apagaVenda = !lead && noFunil;

  async function confirmar() {
    setOcupado(true); setErro("");
    try { await onConfirmar(); onFechar(); } catch (e) { setErro(e.message); setOcupado(false); }
  }

  return (
    <Modal titulo={lead ? "Marcar como novo lead?" : "Marcar como conversa normal?"} onFechar={onFechar}>
      <div className="space-y-4">
        <span className={`inline-block text-[12px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md ${
          lead ? "bg-sol text-tinta" : "bg-tinta text-white"}`}>{lead ? "Novo lead" : "Normal"}</span>
        {lead ? (
          <p>O contato entra no funil em <strong className="font-semibold">Novo contato</strong>, aparece na aba Leads e passa a contar no dashboard.</p>
        ) : (
          <p>A conversa continua aqui normalmente, mas fica fora do funil, da aba Leads e do dashboard.</p>
        )}
        {apagaVenda && (
          <p className="text-sm px-3 py-2 rounded-lg bg-alerta/10 text-alerta">
            Esse contato já está no funil. A venda e o histórico de etapas dele serão apagados.
          </p>
        )}
        {erro && <p className="text-alerta text-sm">{erro}</p>}
        <div className="flex gap-2 justify-end">
          <BotaoSecundario type="button" onClick={onFechar}>Cancelar</BotaoSecundario>
          {apagaVenda ? (
            <button type="button" disabled={ocupado} onClick={confirmar}
              className="h-12 px-5 rounded-lg bg-alerta text-white font-semibold disabled:opacity-60">
              {ocupado ? "Salvando…" : "Tirar do funil"}
            </button>
          ) : (
            <BotaoPrimario type="button" disabled={ocupado} onClick={confirmar}>
              {ocupado ? "Salvando…" : lead ? "Marcar como lead" : "Marcar como normal"}
            </BotaoPrimario>
          )}
        </div>
      </div>
    </Modal>
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

export function SemOportunidade({ contatoId, onSalvo }) {
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

export function CardAgenda({ contato, opId }) {
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

export function CardDados({ contato, onSalvo }) {
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

// `rota` decide para onde os links levam: conversa ("/conversas") ou página do lead ("/leads").
export function CardIndicacoes({ contato, rota = "/conversas" }) {
  const [indicados, setIndicados] = useState([]);
  useEffect(() => {
    supabase.from("contatos").select("id, nome, telefone").eq("indicado_por", contato.id)
      .then(({ data }) => setIndicados(data ?? []));
  }, [contato.id]);

  return (
    <Card titulo="Indicações">
      {contato.indicador && (
        <p className="text-sm mb-2">
          Indicado por <Link className="underline font-medium" to={`${rota}/${contato.indicador.id}`}>{nomeOuTelefone(contato.indicador)}</Link>
        </p>
      )}
      {indicados.length === 0 ? <Vazio>Ainda não indicou ninguém.</Vazio> : (
        <>
          <p className="text-sm text-tinta-suave mb-1">Indicou {indicados.length} {indicados.length === 1 ? "pessoa" : "pessoas"}:</p>
          <ul className="text-sm space-y-1">
            {indicados.map((i) => (
              <li key={i.id}><Link className="underline" to={`${rota}/${i.id}`}>{nomeOuTelefone(i)}</Link></li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
