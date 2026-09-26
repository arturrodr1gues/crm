import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { dataCurta, formatarTelefone, nomeOuTelefone } from "../lib/format";
import { chamarWhatsapp, subirMidia, tipoDoArquivo } from "../lib/whatsapp";
import Bolha from "./chat/Bolha";
import Compositor from "./chat/Compositor";
import { AcoesMensagem, EnviarContato, NovaEnquete, PreviaArquivo } from "./chat/Modais";

const COLUNAS = "id, direcao, tipo, texto, status, erro, momento, autor_nome, autor_telefone, message_id, " +
  "midia_path, midia_mime, midia_nome, midia_tamanho, resposta_a, reacoes, extra, editada_em, apagada, enviado_por";

const ordenar = (lista) => [...lista].sort((a, b) => new Date(a.momento) - new Date(b.momento));

export default function Chat({ contato }) {
  const [msgs, setMsgs] = useState([]);
  const [erro, setErro] = useState("");
  const [respostas, setRespostas] = useState([]);
  const [respondendo, setRespondendo] = useState(null);
  const [acoes, setAcoes] = useState(null);       // mensagem com o menu aberto
  const [modal, setModal] = useState(null);       // { tipo: "arquivo" | "contato" | "enquete", ... }
  const [destacada, setDestacada] = useState(null);
  const fim = useRef(null);
  const vistoPendente = useRef(null);

  // Zera o contador e manda o "visto" para quem escreveu (✓✓ azul no celular da pessoa).
  function marcarLida() {
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
    setMsgs([]); setRespondendo(null); setErro("");
    // As 300 mais recentes, em ordem cronológica.
    supabase.from("mensagens").select(COLUNAS)
      .eq("contato_id", contato.id).order("momento", { ascending: false }).limit(300)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErro("Não foi possível carregar as mensagens. Recarregue a página.");
        setMsgs((l) => ordenar([...(data ?? []), ...l.filter((x) => !(data ?? []).some((d) => d.id === x.id))]));
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
      supabase.removeChannel(canal);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [contato.id]);

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const porMessageId = useMemo(
    () => Object.fromEntries(msgs.filter((m) => m.message_id).map((m) => [m.message_id, m])), [msgs]);

  const autorDe = (m) => (m.direcao === "out" ? "Você"
    : contato.is_grupo ? m.autor_nome || formatarTelefone(m.autor_telefone) || "Participante"
    : nomeOuTelefone(contato));

  function irPara(messageId) {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
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

  const enviarFigurinha = (path) =>
    enviar({ tipo: "figurinha", midia_path: path }, () => ({ acao: "midia", tipo: "figurinha", path, mime: "image/webp" }));

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-2.5 md:px-4 pt-6 pb-3 space-y-1 bg-fundo"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) arquivoEscolhido(f); }}>
        {msgs.length === 0 && (
          <p className="text-center text-sm text-tinta-suave py-8">Nenhuma mensagem ainda.</p>
        )}
        {msgs.map((m) => {
          const dia = dataCurta(m.momento);
          const mostrarDia = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <div key={m.id}>
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
        <div ref={fim} />
      </div>

      {erro && (
        <div className="flex items-start gap-2 px-3 py-2 bg-superficie border-t border-linha">
          <p className="flex-1 text-alerta text-sm">{erro}</p>
          <button type="button" onClick={() => setErro("")} className="text-sm underline text-tinta-suave">Fechar</button>
        </div>
      )}

      <Compositor grupo={contato.is_grupo} respostas={respostas} respondendo={respondendo} autorDe={autorDe}
        onCancelarResposta={() => setRespondendo(null)}
        onTexto={enviarTexto} onArquivo={arquivoEscolhido} onFigurinha={enviarFigurinha}
        onContato={() => setModal({ tipo: "contato" })} onEnquete={() => setModal({ tipo: "enquete" })} />

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
