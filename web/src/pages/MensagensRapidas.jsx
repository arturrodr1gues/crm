import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { EditarMensagem, ListaMensagensRapidas } from "../components/ConfigAtendimento";
import { EsqueletoLinhas } from "../components/Esqueletos";

/** Página das mensagens rápidas (também ficam em Ajustes). `?nova=1` já abre o formulário de nova mensagem. */
export default function MensagensRapidas() {
  const [params, setParams] = useSearchParams();
  const [respostas, setRespostas] = useState(null);
  const [editando, setEditando] = useState(params.get("nova") === "1" ? {} : null); // null | {} (nova) | resposta

  async function carregar() {
    const { data } = await supabase.from("respostas_rapidas").select("id, atalho, texto, ordem").order("ordem");
    setRespostas(data ?? []);
  }
  useEffect(() => { carregar(); }, []);

  function fechar() {
    setEditando(null);
    if (params.has("nova")) setParams({}, { replace: true }); // recarregar a página não reabre o formulário
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Mensagens rápidas</h1>
          <p className="text-tinta-suave">
            Atalhos acima do campo de mensagem. Arraste para mudar a ordem; use {"{primeiro_nome}"} ou {"{nome}"} para sair com o nome do contato.
          </p>
        </div>
        <button type="button" onClick={() => setEditando({})} aria-label="Nova mensagem rápida"
          className="shrink-0 h-11 px-3 md:px-4 rounded-lg bg-sol text-tinta font-semibold flex items-center gap-2">
          <span className="text-2xl leading-none font-light">+</span>
          <span className="hidden sm:inline">Nova mensagem</span>
        </button>
      </header>

      {respostas === null ? <div className="bg-superficie rounded-2xl border border-linha px-4"><EsqueletoLinhas n={5} foto={false} /></div>
        : <ListaMensagensRapidas respostas={respostas} onMudou={carregar} onEditar={setEditando} />}

      {/* Espera a lista carregar para a nova mensagem entrar no fim */}
      {editando && respostas && (
        <EditarMensagem resposta={editando} proximaOrdem={respostas.length}
          onFechar={fechar} onSalvo={() => { fechar(); carregar(); }} />
      )}
    </div>
  );
}
