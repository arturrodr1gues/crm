import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { chamarWhatsapp } from "./whatsapp";

// Confere de novo com a UAZAPI se a última verificação passou desse tempo.
const INTERVALO_MS = 2 * 60 * 1000;

const vencida = (c) => !c?.verificado_em || Date.now() - new Date(c.verificado_em).getTime() > INTERVALO_MS;

/**
 * Situação da conexão com o WhatsApp, em tempo real: { estado, desde, motivo, verificado_em }.
 * estado: online | conectando | offline (null enquanto carrega ou se nunca foi verificado).
 */
export function useConexaoWhatsapp() {
  const [conexao, setConexao] = useState(null);
  const atual = useRef(null);
  atual.current = conexao;

  useEffect(() => {
    let ativo = true;
    let pedindo = false;
    async function verificar() {
      if (pedindo || document.visibilityState !== "visible" || !vencida(atual.current)) return;
      pedindo = true;
      try { await chamarWhatsapp({ acao: "verificar_conexao" }); } catch { /* a bolinha fica como está */ }
      pedindo = false;
    }

    supabase.from("whatsapp_conexao").select("estado, desde, motivo, verificado_em").maybeSingle()
      .then(({ data }) => {
        if (!ativo) return;
        setConexao(data ?? { estado: null });
        atual.current = data;
        verificar();
      });

    const canal = supabase.channel(`whatsapp-conexao-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conexao" },
        ({ new: n }) => n && setConexao(n))
      .subscribe();
    const t = setInterval(verificar, INTERVALO_MS);
    document.addEventListener("visibilitychange", verificar);
    return () => {
      ativo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", verificar);
      supabase.removeChannel(canal);
    };
  }, []);

  return conexao;
}
