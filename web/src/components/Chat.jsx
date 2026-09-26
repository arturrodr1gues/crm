import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { dataCurta, hora } from "../lib/format";

export default function Chat({ contato }) {
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [respostas, setRespostas] = useState([]);
  const fim = useRef(null);

  const marcarLida = () => supabase.from("contatos").update({ nao_lidas: 0 }).eq("id", contato.id);

  useEffect(() => {
    let ativo = true;
    supabase.from("mensagens").select("id, direcao, tipo, texto, status, erro, momento")
      .eq("contato_id", contato.id).order("momento", { ascending: true }).limit(300)
      .then(({ data }) => ativo && setMsgs(data ?? []));
    supabase.from("respostas_rapidas").select("id, atalho, texto").order("ordem")
      .then(({ data }) => ativo && setRespostas(data ?? []));
    marcarLida();

    const canal = supabase.channel(`chat-${contato.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `contato_id=eq.${contato.id}` },
        ({ new: m }) => {
          setMsgs((lista) => (lista.some((x) => x.id === m.id) ? lista : [...lista, m]));
          if (m.direcao === "in") marcarLida();
        })
      .subscribe();

    return () => { ativo = false; supabase.removeChannel(canal); };
  }, [contato.id]);

  useEffect(() => { const lista = fim.current?.parentElement; if (lista) lista.scrollTop = lista.scrollHeight; }, [msgs.length]);

  async function enviar(e) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true); setErro("");
    const { data, error } = await supabase.functions.invoke("whatsapp-send", {
      body: { contato_id: contato.id, texto: t },
    });
    setEnviando(false);
    if (error) {
      let msg = "Não foi possível enviar.";
      try { msg = (await error.context.json()).error ?? msg; } catch { /* mantém padrão */ }
      setErro(msg);
      return;
    }
    setTexto("");
    if (data?.mensagem) setMsgs((l) => (l.some((x) => x.id === data.mensagem.id) ? l : [...l, data.mensagem]));
  }

  let diaAnterior = "";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1.5 bg-fundo">
        {msgs.length === 0 && (
          <p className="text-center text-sm text-tinta-suave py-8">Nenhuma mensagem ainda.</p>
        )}
        {msgs.map((m) => {
          const dia = dataCurta(m.momento);
          const mostrarDia = dia !== diaAnterior;
          diaAnterior = dia;
          const minha = m.direcao === "out";
          return (
            <div key={m.id}>
              {mostrarDia && <div className="text-center text-xs text-tinta-suave my-3">{dia}</div>}
              <div className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap break-words ${
                  minha ? "bg-tinta text-white rounded-br-md" : "bg-superficie border border-linha rounded-bl-md"}`}>
                  {m.texto ?? <em className="opacity-70">[{m.tipo}]</em>}
                  <div className={`text-[11px] mt-1 text-right ${minha ? "text-white/60" : "text-tinta-suave"}`}>
                    {m.status === "falhou" ? <span className="text-sol">Não enviada</span> : hora(m.momento)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>

      <div className="border-t border-linha bg-superficie p-2">
        {respostas.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {respostas.map((r) => (
              <button key={r.id} type="button" onClick={() => setTexto(r.texto)}
                className="shrink-0 text-sm px-3 h-9 rounded-full border border-linha bg-fundo">
                {r.atalho}
              </button>
            ))}
          </div>
        )}
        {erro && <p className="text-alerta text-sm px-1 pb-2">{erro}</p>}
        <form onSubmit={enviar} className="flex items-end gap-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) enviar(e); }}
            placeholder="Escreva uma mensagem"
            className="flex-1 resize-none max-h-32 min-h-12 px-3 py-3 rounded-xl border border-linha bg-fundo text-base" />
          <button disabled={enviando || !texto.trim()}
            className="h-12 px-4 rounded-xl bg-sol text-tinta font-semibold disabled:opacity-50">
            {enviando ? "…" : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
