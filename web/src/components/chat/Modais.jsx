import { useEffect, useState } from "react";
import { AreaTexto, BotaoPrimario, BotaoSecundario, Campo, Entrada, Modal } from "../ui";
import BuscaContato from "../BuscaContato";
import PainelEmoji from "./PainelEmoji";
import { IconeCopiar, IconeDoc, IconeLapis, IconeLixo, IconeResponder } from "./Icones";
import { formatarTelefone, normalizarTelefone } from "../../lib/format";
import { LIMITE_MIDIA, tamanhoLegivel } from "../../lib/whatsapp";
import { REACOES_RAPIDAS } from "../../lib/emojis";
import { figurinhaJaSalva, salvarFigurinhaDaMensagem } from "../../lib/figurinhas";

const PRAZO_EDICAO_MS = 15 * 60 * 1000;

// Guarda a figurinha da mensagem nas salvas, para mandar depois pelo painel de figurinhas.
function SalvarFigurinha({ m, classe }) {
  const [estado, setEstado] = useState("vendo"); // vendo | livre | salvando | salva | erro
  useEffect(() => {
    // Figurinha enviada a partir das salvas já está lá
    if (m.midia_path.startsWith("figurinhas/")) { setEstado("salva"); return; }
    figurinhaJaSalva(m.midia_path).then((ja) => setEstado(ja ? "salva" : "livre"));
  }, [m.midia_path]);

  async function salvar() {
    setEstado("salvando");
    try { await salvarFigurinhaDaMensagem(m); setEstado("salva"); } catch { setEstado("erro"); }
  }

  if (estado === "vendo") return null;
  if (estado === "salva") {
    return <p className={`${classe} text-ok cursor-default hover:bg-transparent`}><IconeEstrela className="w-4 h-4" cheia /> Figurinha salva</p>;
  }
  return (
    <button type="button" className={classe} onClick={salvar} disabled={estado === "salvando"}>
      <IconeEstrela className="w-4 h-4" />
      {estado === "salvando" ? "Salvando…" : estado === "erro" ? "Não deu para salvar. Tentar de novo" : "Salvar figurinha"}
    </button>
  );
}

function IconeEstrela({ cheia, ...p }) {
  return (<svg viewBox="0 0 24 24" fill={cheia ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" {...p}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>);
}

/** Reagir, responder, copiar, editar e apagar uma mensagem. */
export function AcoesMensagem({ m, grupo, onFechar, onResponder, onReagir, onEditar, onApagar }) {
  const [modo, setModo] = useState("menu"); // menu | emojis | editar | apagar
  const [texto, setTexto] = useState(m.texto ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const minha = m.direcao === "out";
  const minhaReacao = m.reacoes?.eu;
  const podeEditar = minha && m.tipo === "texto" && Date.now() - new Date(m.momento).getTime() < PRAZO_EDICAO_MS;

  async function executar(fn) {
    setOcupado(true); setErro("");
    try { await fn(); onFechar(); } catch (e) { setErro(e.message); setOcupado(false); }
  }
  const reagir = (e) => executar(() => onReagir(e === minhaReacao ? "" : e));

  const itens = "w-full h-10 px-2 flex items-center gap-3 rounded-lg hover:bg-fundo text-left text-[15px]";

  return (
    <Modal titulo={modo === "editar" ? "Editar mensagem" : modo === "apagar" ? "Apagar mensagem" : "Mensagem"} onFechar={onFechar} estreito={modo === "menu"}>
      {erro && <p className="text-alerta text-sm mb-3">{erro}</p>}

      {modo === "menu" && (<>
        <div className="flex items-center justify-between mb-2 p-1 rounded-full bg-fundo">
          {REACOES_RAPIDAS.map((e) => (
            <button key={e} type="button" disabled={ocupado} onClick={() => reagir(e)} aria-label={`Reagir com ${e}`}
              className={`h-8 w-8 text-lg leading-none rounded-full ${minhaReacao === e ? "bg-sol/40" : "hover:bg-superficie"}`}>{e}</button>
          ))}
          <button type="button" onClick={() => setModo("emojis")} aria-label="Mais emojis"
            className="h-8 w-8 text-lg leading-none rounded-full hover:bg-superficie text-tinta-suave">+</button>
        </div>
        {minhaReacao && !REACOES_RAPIDAS.includes(minhaReacao) && (
          <button type="button" onClick={() => reagir(minhaReacao)} className="text-sm underline text-tinta-suave mb-2">
            Remover sua reação {minhaReacao}
          </button>
        )}
        <button type="button" className={itens} onClick={() => { onResponder(m); onFechar(); }}>
          <IconeResponder className="w-4 h-4" /> Responder
        </button>
        {m.texto && (
          <button type="button" className={itens}
            onClick={() => { navigator.clipboard?.writeText(m.texto); onFechar(); }}>
            <IconeCopiar className="w-4 h-4" /> Copiar texto
          </button>
        )}
        {m.tipo === "figurinha" && m.midia_path && <SalvarFigurinha m={m} classe={itens} />}
        {podeEditar && (
          <button type="button" className={itens} onClick={() => setModo("editar")}>
            <IconeLapis className="w-4 h-4" /> Editar
          </button>
        )}
        {minha && (
          <button type="button" className={`${itens} text-alerta`} onClick={() => setModo("apagar")}>
            <IconeLixo className="w-4 h-4" /> Apagar para todos
          </button>
        )}
      </>)}

      {modo === "emojis" && <div className="-mx-5"><PainelEmoji onEmoji={reagir} /></div>}

      {modo === "editar" && (
        <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) executar(() => onEditar(texto.trim())); }} className="space-y-4">
          <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} autoFocus />
          <p className="text-xs text-tinta-suave">O WhatsApp só permite editar nos primeiros 15 minutos. A pessoa vê a marca "Editada".</p>
          <div className="flex gap-2 justify-end">
            <BotaoSecundario type="button" onClick={() => setModo("menu")}>Voltar</BotaoSecundario>
            <BotaoPrimario disabled={ocupado || !texto.trim() || texto.trim() === m.texto}>{ocupado ? "Salvando…" : "Salvar"}</BotaoPrimario>
          </div>
        </form>
      )}

      {modo === "apagar" && (
        <div className="space-y-4">
          <p>A mensagem some para você e para {grupo ? "o grupo" : "o cliente"}. No lugar aparece "Mensagem apagada".</p>
          <p className="text-sm text-tinta-suave">O WhatsApp só deixa apagar para todos por cerca de 2 dias depois do envio.</p>
          <div className="flex gap-2 justify-end">
            <BotaoSecundario type="button" onClick={() => setModo("menu")}>Voltar</BotaoSecundario>
            <button type="button" disabled={ocupado} onClick={() => executar(onApagar)}
              className="h-12 px-5 rounded-lg bg-alerta text-white font-semibold disabled:opacity-60">
              {ocupado ? "Apagando…" : "Apagar para todos"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const TITULOS = { imagem: "Enviar foto", video: "Enviar vídeo", audio: "Enviar áudio", documento: "Enviar arquivo", figurinha: "Enviar figurinha" };

/** Prévia do arquivo escolhido, com legenda, antes de enviar. */
export function PreviaArquivo({ arquivo, tipo, onFechar, onEnviar }) {
  const [legenda, setLegenda] = useState("");
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  const grande = arquivo.size > LIMITE_MIDIA;
  const temLegenda = ["imagem", "video", "documento"].includes(tipo);

  return (
    <Modal titulo={TITULOS[tipo]} onFechar={onFechar}>
      <form onSubmit={(e) => { e.preventDefault(); if (!grande) onEnviar(legenda.trim()); }} className="space-y-4">
        <div className="rounded-xl bg-fundo border border-linha p-2 grid place-items-center min-h-24">
          {url && (tipo === "imagem" || tipo === "figurinha") && (
            <img src={url} alt="" className={tipo === "figurinha" ? "w-40 h-40 object-contain" : "max-h-72 rounded-lg"} />
          )}
          {url && tipo === "video" && <video src={url} controls playsInline className="max-h-72 rounded-lg" />}
          {url && tipo === "audio" && <audio src={url} controls className="w-full" />}
          {tipo === "documento" && (
            <div className="flex items-center gap-3 w-full p-2">
              <IconeDoc className="w-10 h-10 shrink-0 text-tinta-suave" />
              <div className="min-w-0">
                <div className="font-medium truncate">{arquivo.name}</div>
                <div className="text-sm text-tinta-suave">{tamanhoLegivel(arquivo.size)}</div>
              </div>
            </div>
          )}
        </div>
        {grande && <p className="text-alerta text-sm">Esse arquivo tem {tamanhoLegivel(arquivo.size)}. O limite é 30 MB.</p>}
        {tipo === "documento" && arquivo.type.startsWith("video/") && arquivo.type !== "video/mp4" && (
          <p className="text-sm text-tinta-suave">O WhatsApp só reproduz vídeo MP4, então esse vai como arquivo.</p>
        )}
        {temLegenda && (
          <Entrada value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Legenda (opcional)" autoFocus />
        )}
        <div className="flex gap-2 justify-end">
          <BotaoSecundario type="button" onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario disabled={grande}>Enviar</BotaoPrimario>
        </div>
      </form>
    </Modal>
  );
}

/** Cartão de contato: escolhe alguém do CRM ou digita nome e telefone. */
export function EnviarContato({ onFechar, onEnviar }) {
  const [escolhido, setEscolhido] = useState(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  function escolher(c) {
    setEscolhido(c);
    if (c) { setNome(c.nome ?? ""); setTelefone(formatarTelefone(c.telefone)); }
  }
  const numero = normalizarTelefone(telefone);
  const valido = nome.trim() && numero && numero.length >= 12;

  return (
    <Modal titulo="Enviar contato" onFechar={onFechar}>
      <form onSubmit={(e) => { e.preventDefault(); if (valido) onEnviar({ nome: nome.trim(), telefone: numero }); }} className="space-y-4">
        <BuscaContato valor={escolhido} onEscolher={escolher} rotulo="Buscar no CRM" />
        <Campo rotulo="Nome"><Entrada value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Telefone com DDD"><Entrada value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(84) 99999-9999" /></Campo>
        <div className="flex gap-2 justify-end">
          <BotaoSecundario type="button" onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario disabled={!valido}>Enviar</BotaoPrimario>
        </div>
      </form>
    </Modal>
  );
}

export function NovaEnquete({ onFechar, onEnviar }) {
  const [pergunta, setPergunta] = useState("");
  const [opcoes, setOpcoes] = useState(["", ""]);
  const [multipla, setMultipla] = useState(false);

  const preenchidas = opcoes.map((o) => o.trim()).filter(Boolean);
  const valida = pergunta.trim() && preenchidas.length >= 2 && new Set(preenchidas).size === preenchidas.length;

  function mudar(i, v) {
    const nova = opcoes.map((o, j) => (j === i ? v : o));
    // Sempre deixa um campo vazio no fim para a próxima opção (até 12).
    if (nova.at(-1).trim() && nova.length < 12) nova.push("");
    setOpcoes(nova);
  }

  return (
    <Modal titulo="Criar enquete" onFechar={onFechar}>
      <form onSubmit={(e) => { e.preventDefault(); if (valida) onEnviar({ pergunta: pergunta.trim(), opcoes: preenchidas, multipla }); }} className="space-y-4">
        <Campo rotulo="Pergunta"><Entrada value={pergunta} onChange={(e) => setPergunta(e.target.value)} autoFocus /></Campo>
        <div className="space-y-2">
          <span className="text-sm font-medium">Opções</span>
          {opcoes.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input value={o} onChange={(e) => mudar(i, e.target.value)} placeholder={`Opção ${i + 1}`} maxLength={100}
                className="flex-1 h-12 px-3 rounded-lg border border-linha bg-fundo text-base" />
              {opcoes.length > 2 && (
                <button type="button" onClick={() => setOpcoes(opcoes.filter((_, j) => j !== i))} aria-label={`Remover opção ${i + 1}`}
                  className="h-12 w-12 text-2xl text-tinta-suave">×</button>
              )}
            </div>
          ))}
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={multipla} onChange={(e) => setMultipla(e.target.checked)} className="w-5 h-5" />
          Permitir mais de uma resposta
        </label>
        <div className="flex gap-2 justify-end">
          <BotaoSecundario type="button" onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario disabled={!valida}>Enviar</BotaoPrimario>
        </div>
      </form>
    </Modal>
  );
}
