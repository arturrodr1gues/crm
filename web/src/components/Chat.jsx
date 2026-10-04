import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { dataCurta, formatarTelefone, nomeOuTelefone } from "../lib/format";
import { chamarWhatsapp, subirMidia, tipoDoArquivo } from "../lib/whatsapp";
import { useMembro } from "../lib/equipe";
import { SeloEtapa } from "./ui";
import SeletorEtapa from "./SeletorEtapa";
import { duracaoCurta, estadoAtendimento, useAgora, useAtendimentoConfig } from "../lib/atendimento";
import Bolha from "./chat/Bolha";
import Compositor from "./chat/Compositor";
import { AcoesMensagem, EnviarContato, NovaEnquete, PreviaArquivo } from "./chat/Modais";
import ConfirmarAcaoContatos from "./ConfirmarAcaoContatos";
import { EsqueletoBolhas } from "./Esqueletos";

const COLUNAS = "id, direcao, tipo, texto, status, erro, momento, autor_nome, autor_telefone, message_id, " +
  "midia_path, midia_mime, midia_nome, midia_tamanho, resposta_a, reacoes, extra, editada_em, apagada, enviado_por";

const ordenar = (lista) => [...lista].sort((a, b) => new Date(a.momento) - new Date(b.momento));

// Mensagens por página: a conversa abre com as mais recentes e busca as antigas ao rolar para cima.
const PAGINA = 15;
const PERTO_DO_TOPO = 60;       // px do topo em que conta como "chegou lá"
const PERTO_DO_FIM = 80;        // px do fim em que ainda conta como "vendo a última mensagem"
const ESPERA_NO_TOPO_MS = 300;  // quanto tempo parado no topo antes de buscar
const GIRO_MINIMO_MS = 450;     // tempo mínimo do indicador de carregando
const maisRecentes = (contatoId) => supabase.from("mensagens").select(COLUNAS).eq("contato_id", contatoId)
  .order("momento", { ascending: false }).order("id", { ascending: false }).limit(PAGINA);

// `irParaMensagem`: message_id vindo da busca; a conversa abre rolada até ela.
export default function Chat({ contato, etapa, onMudarEtapa, irParaMensagem }) {
  const [msgs, setMsgs] = useState([]);
  const [erro, setErro] = useState("");
  const [respostas, setRespostas] = useState([]);
  const [respondendo, setRespondendo] = useState(null);
  const [acoes, setAcoes] = useState(null);       // mensagem com o menu aberto
  const [modal, setModal] = useState(null);       // { tipo: "arquivo" | "contato" | "enquete", ... }
  const [destacada, setDestacada] = useState(null);
  const [sugestao, setSugestao] = useState(null);  // texto que vai para o campo (follow-up)
  const config = useAtendimentoConfig();
  const agora = useAgora();
  const { followup } = estadoAtendimento(contato, config, agora);
  const modeloFollowup = respostas.find((r) => r.id === config.followup_resposta_id);
  const vistoPendente = useRef(null);
  const [temMais, setTemMais] = useState(false);          // ainda há mensagens mais antigas no banco
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [iniciada, setIniciada] = useState(false);        // primeira página já chegou
  const rolagem = useRef(null);
  const ajuste = useRef(null);       // distância do fim antes de pôr mensagens antigas em cima
  const carregando = useRef(false);
  const ultimoTopo = useRef(0);      // para saber se a rolagem é para cima
  const noFim = useRef(true);        // a pessoa está vendo a última mensagem
  const conteudoRef = useRef(null);
  const esperaTopo = useRef(null);
  const irDepois = useRef(null);     // mensagem citada para mostrar quando a página dela chegar
  const contatoAtual = useRef(contato.id);
  contatoAtual.current = contato.id;
  const { leitura_silenciosa: silenciosa } = useMembro();

  // Zera o contador e manda o "visto" para quem escreveu (✓✓ azul no celular da pessoa).
  // No login de leitura silenciosa (admin acompanhando), a conversa fica como estava.
  function marcarLida() {
    if (silenciosa) return;
    supabase.from("contatos").update({ nao_lidas: 0 }).eq("id", contato.id).then(() => {});
    clearTimeout(vistoPendente.current);
    vistoPendente.current = setTimeout(() => {
      if (document.visibilityState === "visible") {
        chamarWhatsapp({ acao: "marcar_lidas", contato_id: contato.id }).catch(() => { /* visto é opcional */ });
      }
    }, 800);
  }

  useEffect(() => {
    let ativo = true;
    setMsgs([]); setRespondendo(null); setErro(""); setTemMais(false); setIniciada(false);
    noFim.current = true; // conversa nova abre na última mensagem
    // Só a página mais recente; as anteriores vêm ao rolar para cima.
    maisRecentes(contato.id)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErro("Não foi possível carregar as mensagens. Recarregue a página.");
        setMsgs((l) => ordenar([...(data ?? []), ...l.filter((x) => !(data ?? []).some((d) => d.id === x.id))]));
        setTemMais((data?.length ?? 0) === PAGINA);
        setIniciada(true);
      });
    supabase.from("respostas_rapidas").select("id, atalho, texto").order("ordem")
      .then(({ data }) => ativo && setRespostas(data ?? []));
    marcarLida();

    const filtro = { schema: "public", table: "mensagens", filter: `contato_id=eq.${contato.id}` };
    const canal = supabase.channel(`chat-${contato.id}`)
      .on("postgres_changes", { event: "INSERT", ...filtro }, ({ new: m }) => {
        setMsgs((l) => (l.some((x) => x.id === m.id) ? l : ordenar([...l, m])));
        if (m.direcao === "in") marcarLida();
      })
      // Recibos de leitura, reações, votos, edições, exclusões e mídia que terminou de baixar.
      .on("postgres_changes", { event: "UPDATE", ...filtro }, ({ new: m }) => {
        setMsgs((l) => l.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      .subscribe();

    const aoVoltar = () => document.visibilityState === "visible" && marcarLida();
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      ativo = false;
      clearTimeout(vistoPendente.current);
      clearTimeout(esperaTopo.current);
      supabase.removeChannel(canal);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [contato.id]);

  // ---------------------------------------------------------------------
  // Paginação: páginas de PAGINA mensagens, as mais antigas carregam ao chegar no topo.
  // ---------------------------------------------------------------------
  const ultimaId = msgs[msgs.length - 1]?.id;
  // Mensagem nova no fim (ou a primeira página): desce até ela antes de desenhar a tela.
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (el && ajuste.current === null) el.scrollTop = el.scrollHeight;
  }, [ultimaId]);

  // Presa no fim: fotos, vídeos e figurinhas terminam de carregar depois e aumentam a conversa.
  // Enquanto a pessoa estiver no fim (ao abrir, ou se não subiu), continua mostrando a última mensagem.
  useEffect(() => {
    const el = rolagem.current, conteudo = conteudoRef.current;
    if (!el || !conteudo) return;
    const obs = new ResizeObserver(() => { if (noFim.current) el.scrollTop = el.scrollHeight; });
    obs.observe(conteudo);
    return () => obs.disconnect();
  }, []);

  // Mensagens antigas entraram em cima: mantém na tela o que a pessoa estava lendo.
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el || ajuste.current === null) return;
    el.scrollTop = el.scrollHeight - ajuste.current;
    ajuste.current = null;
    if (irDepois.current) { const id = irDepois.current; irDepois.current = null; irPara(id); }
  }, [msgs]);

  // Veio da busca por mensagens: depois da primeira página, vai até a mensagem achada
  // (buscando as páginas anteriores se ela for mais antiga).
  const jaFoi = useRef(null);
  useEffect(() => {
    if (!iniciada || !irParaMensagem || jaFoi.current === `${contato.id}|${irParaMensagem}`) return;
    jaFoi.current = `${contato.id}|${irParaMensagem}`;
    irPara(irParaMensagem); // roda antes do "busca mais sozinho" abaixo, que espera ele terminar
  }, [iniciada, irParaMensagem, contato.id]);

  // Se a primeira página não enche a tela, não há como rolar: busca mais sozinho.
  useEffect(() => {
    const el = rolagem.current;
    if (iniciada && temMais && el && el.scrollHeight <= el.clientHeight + 80) carregarAnteriores();
  }, [iniciada, temMais, msgs.length]);

  // Busca a página anterior à mensagem mais antiga da tela. `ate` (message_id) carrega até ela de uma vez.
  async function carregarAnteriores(ate = null) {
    const primeira = msgs.find((m) => !String(m.id).startsWith("local-"));
    if (!primeira || carregando.current) return;
    carregando.current = true;
    setCarregandoMais(true);
    const conversa = contato.id;
    let q = supabase.from("mensagens").select(COLUNAS).eq("contato_id", conversa)
      .or(`momento.lt."${primeira.momento}",and(momento.eq."${primeira.momento}",id.lt.${primeira.id})`)
      .order("momento", { ascending: false }).order("id", { ascending: false });
    if (ate) {
      const { data: alvo } = await supabase.from("mensagens").select("momento")
        .eq("contato_id", conversa).eq("message_id", ate).maybeSingle();
      q = alvo ? q.gte("momento", alvo.momento).limit(1000) : q.limit(PAGINA);
      if (alvo) irDepois.current = ate;
    } else {
      q = q.limit(PAGINA);
    }
    // O indicador fica um mínimo na tela, para a página nova não "pular" do nada.
    const [{ data }] = await Promise.all([q, ate ? null : new Promise((r) => setTimeout(r, GIRO_MINIMO_MS))]);
    carregando.current = false;
    setCarregandoMais(false);
    if (conversa !== contatoAtual.current) return; // trocou de conversa no meio
    const el = rolagem.current;
    ajuste.current = el ? el.scrollHeight - el.scrollTop : 0;
    setMsgs((l) => ordenar([...(data ?? []).filter((d) => !l.some((x) => x.id === d.id)), ...l]));
    if (!ate || !irDepois.current) setTemMais((data?.length ?? 0) === PAGINA);
  }

  // Só busca quando a pessoa sobe até o topo e para ali um instante. Rolagens do próprio
  // sistema (descer ao abrir, manter a posição) são para baixo e não contam.
  function aoRolar(e) {
    const topo = e.currentTarget.scrollTop;
    const { scrollHeight, clientHeight } = e.currentTarget;
    noFim.current = scrollHeight - topo - clientHeight < PERTO_DO_FIM;
    const subindo = topo < ultimoTopo.current;
    ultimoTopo.current = topo;
    clearTimeout(esperaTopo.current);
    if (!subindo || topo > PERTO_DO_TOPO || !temMais || carregando.current) return;
    esperaTopo.current = setTimeout(() => {
      if ((rolagem.current?.scrollTop ?? Infinity) <= PERTO_DO_TOPO) carregarAnteriores();
    }, ESPERA_NO_TOPO_MS);
  }

  const porMessageId = useMemo(
    () => Object.fromEntries(msgs.filter((m) => m.message_id).map((m) => [m.message_id, m])), [msgs]);

  const autorDe = (m) => (m.direcao === "out" ? "Você"
    : contato.is_grupo ? m.autor_nome || formatarTelefone(m.autor_telefone) || "Participante"
    : nomeOuTelefone(contato));

  function irPara(messageId) {
    const el = document.getElementById(`msg-${messageId}`);
    // Mensagem citada numa página que ainda não carregou: busca até ela e volta aqui.
    if (!el) { if (temMais) carregarAnteriores(messageId); return; }
    noFim.current = false; // vai até a mensagem, não volta sozinho para o fim
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setDestacada(messageId);
    setTimeout(() => setDestacada(null), 1500);
  }

  // ---------------------------------------------------------------------
  // Envio: mostra a mensagem na hora (com relógio) e troca pela gravada quando o servidor confirma.
  // ---------------------------------------------------------------------
  async function enviar(previa, montarPedido) {
    const idLocal = `local-${crypto.randomUUID()}`;
    const respostaA = respondendo?.message_id ?? null;
    setRespondendo(null); setErro("");
    setMsgs((l) => [...l, {
      id: idLocal, direcao: "out", status: "pendente", momento: new Date().toISOString(),
      reacoes: {}, resposta_a: respostaA, ...previa,
    }]);
    try {
      const pedido = await montarPedido();
      const { mensagem } = await chamarWhatsapp({ contato_id: contato.id, resposta_a: respostaA, ...pedido });
      setMsgs((l) => {
        const sem = l.filter((x) => x.id !== idLocal);
        return sem.some((x) => x.id === mensagem.id) ? sem : ordenar([...sem, mensagem]);
      });
    } catch (e) {
      // Se chegou a tentar, o servidor grava a mensagem como "Não enviada" e ela chega pelo realtime.
      setMsgs((l) => l.filter((x) => x.id !== idLocal));
      setErro(e.message);
    } finally {
      if (previa._url_local) setTimeout(() => URL.revokeObjectURL(previa._url_local), 60_000);
    }
  }

  const enviarTexto = (texto) => enviar({ tipo: "texto", texto }, () => ({ acao: "texto", texto }));

  function enviarArquivo(file, tipo, legenda = "", voz = false) {
    enviar(
      { tipo, texto: legenda || null, midia_nome: file.name, midia_tamanho: file.size, _url_local: URL.createObjectURL(file) },
      async () => {
        const { path, mime } = await subirMidia(contato.id, file);
        return { acao: "midia", tipo, path, mime, nome: file.name, tamanho: file.size, legenda, voz };
      },
    );
  }

  function arquivoEscolhido(file, forcar, opcoes = {}) {
    const tipo = forcar ?? tipoDoArquivo(file);
    if (opcoes.direto) enviarArquivo(file, tipo, "", opcoes.voz);
    else setModal({ tipo: "arquivo", file, tipoMidia: tipo });
  }

  const enviarFigurinha = (path, mime = "image/webp") =>
    enviar({ tipo: "figurinha", midia_path: path }, () => ({ acao: "midia", tipo: "figurinha", path, mime }));

  function enviarContato({ nome, telefone }) {
    setModal(null);
    enviar({ tipo: "contato", texto: nome, extra: { nome, telefones: [telefone] } },
      () => ({ acao: "contato", nome, telefone }));
  }

  function enviarEnquete({ pergunta, opcoes, multipla }) {
    setModal(null);
    enviar({ tipo: "enquete", texto: pergunta, extra: { pergunta, opcoes, multipla, votos: {} } },
      () => ({ acao: "enquete", pergunta, opcoes, multipla }));
  }

  // ---------------------------------------------------------------------
  // Ações sobre uma mensagem
  // ---------------------------------------------------------------------
  const atualizar = (m) => setMsgs((l) => l.map((x) => (x.id === m.id ? { ...x, ...m } : x)));

  async function reagir(m, emoji) {
    const reacoes = { ...(m.reacoes ?? {}) };
    if (emoji) reacoes.eu = emoji; else delete reacoes.eu;
    atualizar({ id: m.id, reacoes });
    try {
      await chamarWhatsapp({ acao: "reagir", mensagem_id: m.id, emoji });
    } catch (e) {
      atualizar({ id: m.id, reacoes: m.reacoes });
      throw e;
    }
  }

  // Voto na enquete: aparece na hora e volta atrás se o WhatsApp recusar.
  async function votar(m, opcao) {
    const extra = { ...(m.extra ?? {}), votos: { ...(m.extra?.votos ?? {}), eu: [opcao] } };
    atualizar({ id: m.id, extra });
    try {
      await chamarWhatsapp({ acao: "votar", mensagem_id: m.id, opcao });
    } catch (e) {
      atualizar({ id: m.id, extra: m.extra });
      setErro(e.message);
    }
  }

  async function editar(m, texto) {
    const { mensagem } = await chamarWhatsapp({ acao: "editar", mensagem_id: m.id, texto });
    atualizar(mensagem);
  }

  async function apagar(m) {
    const { mensagem } = await chamarWhatsapp({ acao: "apagar", mensagem_id: m.id });
    atualizar(mensagem);
  }

  // Versão mais recente da mensagem com o menu aberto (pode ter mudado pelo realtime).
  const emAcao = acoes && (msgs.find((x) => x.id === acoes.id) ?? acoes);

  let diaAnterior = "";
  let autorAnterior = null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0">
      <div ref={rolagem} onScroll={aoRolar}
        className={`h-full overflow-y-auto overscroll-contain px-2.5 md:px-4 pt-6 ${etapa ? "pb-12" : "pb-3"} bg-fundo`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) arquivoEscolhido(f); }}>
        <div ref={conteudoRef}>
        {!iniciada && <EsqueletoBolhas />}
        {iniciada && msgs.length === 0 && (
          <p className="text-center text-sm text-tinta-suave py-8 animate-aparecer">Nenhuma mensagem ainda.</p>
        )}
        {/* Topo da conversa: carregando as antigas, ou início de tudo */}
        {iniciada && msgs.length > 0 && (
          <div className="flex justify-center h-8">
            {carregandoMais ? <Girando />
              : temMais ? (
                <button type="button" onClick={() => carregarAnteriores()}
                  className="text-xs px-3 rounded-full bg-superficie text-tinta-suave shadow-sm hover:text-tinta">
                  Carregar mensagens anteriores
                </button>
              ) : <span className="text-[11px] text-tinta-suave self-center">Início da conversa</span>}
          </div>
        )}
        {msgs.map((m) => {
          const dia = dataCurta(m.momento);
          const mostrarDia = dia !== diaAnterior;
          diaAnterior = dia;
          // Como no WhatsApp: mensagens seguidas da mesma pessoa ficam mais perto; trocou quem fala, abre mais espaço.
          const autor = m.direcao === "out" ? "eu" : m.autor_telefone || m.autor_nome || "ele";
          const seguida = !mostrarDia && autor === autorAnterior;
          autorAnterior = autor;
          return (
            <div key={m.id} className={`animate-mensagem ${seguida ? "mt-1.5" : "mt-4"}`}>
              {mostrarDia && (
                <div className="flex justify-center my-2.5">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-superficie text-tinta-suave shadow-sm">{dia}</span>
                </div>
              )}
              <Bolha m={m} grupo={contato.is_grupo} citada={m.resposta_a ? porMessageId[m.resposta_a] : null}
                autorDe={autorDe} onAcoes={setAcoes} onIrPara={irPara} onVotar={votar}
                destacada={destacada && destacada === m.message_id} />
            </div>
          );
        })}
        </div>
      </div>
      {/* Onde o lead está no funil, sempre à vista no canto da conversa; clicar muda a etapa */}
      {etapa && (
        <div className="absolute bottom-3 right-4">
          {onMudarEtapa ? <SeletorEtapa etapa={etapa} onMudar={onMudarEtapa} /> : (
            <div className="pointer-events-none rounded-full bg-superficie shadow-md"><SeloEtapa etapa={etapa} grande /></div>
          )}
        </div>
      )}
      </div>

      {/* Follow-up: mandamos a última mensagem e o cliente ainda não respondeu */}
      {followup && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-sol/15 border-t border-sol/40 text-sm">
          <span className="flex-1 min-w-48">
            <strong className="font-semibold">Follow-up:</strong> sem resposta do cliente há {duracaoCurta(followup.minutos)}.
          </span>
          {modeloFollowup && (
            <button type="button" onClick={() => setSugestao({ texto: modeloFollowup.texto, em: Date.now() })}
              className="h-8 px-3 rounded-lg bg-sol text-tinta text-[13px] font-semibold">
              Usar mensagem de follow-up
            </button>
          )}
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 px-3 py-2 bg-superficie border-t border-linha">
          <p className="flex-1 text-alerta text-sm">{erro}</p>
          <button type="button" onClick={() => setErro("")} className="text-sm underline text-tinta-suave">Fechar</button>
        </div>
      )}

      {contato.bloqueado ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-superficie border-t border-linha text-sm">
          <span className="flex-1 min-w-48 text-tinta-suave">
            Você bloqueou {contato.is_grupo ? "este grupo" : "este contato"}. Mensagens novas não chegam ao CRM.
          </span>
          <button type="button" onClick={() => setModal({ tipo: "desbloquear" })}
            className="h-9 px-4 rounded-lg bg-sol text-tinta font-semibold">Desbloquear</button>
        </div>
      ) : (
        <Compositor contato={contato} grupo={contato.is_grupo} respostas={respostas} respondendo={respondendo} autorDe={autorDe}
          sugestao={sugestao}
          onCancelarResposta={() => setRespondendo(null)}
          onTexto={enviarTexto} onArquivo={arquivoEscolhido} onFigurinha={enviarFigurinha}
          onContato={() => setModal({ tipo: "contato" })} onEnquete={() => setModal({ tipo: "enquete" })} />
      )}
      {modal?.tipo === "desbloquear" && (
        <ConfirmarAcaoContatos acao="desbloquear" ids={[contato.id]} onFechar={() => setModal(null)} />
      )}

      {emAcao && (
        <AcoesMensagem m={emAcao} grupo={contato.is_grupo}
          onFechar={() => setAcoes(null)}
          onResponder={setRespondendo}
          onReagir={(emoji) => reagir(emAcao, emoji)}
          onEditar={(texto) => editar(emAcao, texto)}
          onApagar={() => apagar(emAcao)} />
      )}
      {modal?.tipo === "arquivo" && (
        <PreviaArquivo arquivo={modal.file} tipo={modal.tipoMidia} onFechar={() => setModal(null)}
          onEnviar={(legenda) => { setModal(null); enviarArquivo(modal.file, modal.tipoMidia, legenda); }} />
      )}
      {modal?.tipo === "contato" && <EnviarContato onFechar={() => setModal(null)} onEnviar={enviarContato} />}
      {modal?.tipo === "enquete" && <NovaEnquete onFechar={() => setModal(null)} onEnviar={enviarEnquete} />}
    </div>
  );
}

function Girando() {
  return (
    <span role="status" aria-label="Carregando mensagens anteriores"
      className="self-center h-5 w-5 rounded-full border-2 border-linha border-t-sol animate-spin" />
  );
}
