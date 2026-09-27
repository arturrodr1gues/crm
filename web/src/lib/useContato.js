import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Contato + oportunidade mais recente, em tempo real. Usado pela conversa e pela página do lead.
 * `contato` é null enquanto carrega e false se deu erro.
 */
export default function useContato(id) {
  const [contato, setContato] = useState(null);
  const [op, setOp] = useState(null);

  async function carregar() {
    const [{ data: c, error }, { data: o }] = await Promise.all([
      supabase.from("contatos").select("*, indicador:contatos!indicado_por(id, nome, telefone)").eq("id", id).single(),
      supabase.from("oportunidades").select("*").eq("contato_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (error) console.error("erro ao carregar contato", error);
    setContato(error ? false : c); setOp(o);
  }

  useEffect(() => { carregar(); }, [id]);

  // Mantém SLA, follow-up e conversa aberta/fechada em dia enquanto a tela está aberta.
  useEffect(() => {
    const canal = supabase.channel(`contato-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contatos", filter: `id=eq.${id}` },
        ({ new: c }) => setContato((atual) => (atual ? { ...atual, ...c } : atual)))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [id]);

  // Encerrar tira a conversa da aba "Em aberto" (e do SLA/follow-up). Se o cliente escrever, ela reabre sozinha.
  async function alternarEncerrada() {
    const fechar = !contato.conversa_fechada;
    const patch = { conversa_fechada: fechar, conversa_fechada_em: fechar ? new Date().toISOString() : null };
    setContato((c) => ({ ...c, ...patch }));
    const { error } = await supabase.from("contatos").update(patch).eq("id", contato.id);
    if (error) setContato((c) => ({ ...c, conversa_fechada: !fechar }));
  }

  // "Novo lead" entra no funil em "Novo contato"; "Normal" fica só como conversa (sai do funil e do dashboard).
  // A confirmação fica no modal do seletor; se der erro, o modal mostra a mensagem.
  async function classificar(tipo) {
    if (contato.tipo_contato === tipo) return;
    const { error } = await supabase.rpc("classificar_contato", { p_contato: contato.id, p_tipo: tipo });
    if (error) throw new Error("Não foi possível mudar a classificação. Tente de novo.");
    setContato((c) => ({ ...c, tipo_contato: tipo }));
    await carregar();
  }

  return { contato, op, carregar, alternarEncerrada, classificar };
}
