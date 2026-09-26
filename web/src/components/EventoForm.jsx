import { useState } from "react";
import { supabase } from "../lib/supabase";
import { TIPOS_AGENDA, nomeTipo } from "../lib/constantes";
import { paraInputLocal, nomeOuTelefone } from "../lib/format";
import { Modal, Campo, Entrada, Selecao, AreaTexto, BotaoPrimario } from "./ui";
import BuscaContato from "./BuscaContato";

// Cria ou edita um compromisso. `contatoFixo` vem preenchido quando aberto pela ficha do cliente.
export default function EventoForm({ evento, contatoFixo, oportunidadeId, onFechar, onSalvo }) {
  const [contato, setContato] = useState(contatoFixo ?? evento?.contato ?? null);
  const [f, setF] = useState({
    tipo: evento?.tipo ?? "visita",
    titulo: evento?.titulo ?? "",
    inicio: paraInputLocal(evento?.inicio ?? proximaHoraCheia()),
    local: evento?.local ?? "",
    notas: evento?.notas ?? "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    const titulo = f.titulo.trim() || `${nomeTipo(f.tipo)}${contato ? ` com ${nomeOuTelefone(contato)}` : ""}`;
    const dados = {
      tipo: f.tipo, titulo,
      inicio: new Date(f.inicio).toISOString(),
      local: f.local.trim() || null,
      notas: f.notas.trim() || null,
      contato_id: contato?.id ?? null,
      oportunidade_id: oportunidadeId ?? evento?.oportunidade_id ?? null,
    };
    const q = evento?.id
      ? supabase.from("agenda").update(dados).eq("id", evento.id)
      : supabase.from("agenda").insert(dados);
    const { error } = await q;
    setSalvando(false);
    if (error) { setErro("Não foi possível salvar o compromisso."); return; }
    onSalvo?.(); onFechar();
  }

  async function excluir() {
    if (!confirm("Excluir este compromisso?")) return;
    await supabase.from("agenda").delete().eq("id", evento.id);
    onSalvo?.(); onFechar();
  }

  return (
    <Modal titulo={evento?.id ? "Editar compromisso" : "Novo compromisso"} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Tipo"><Selecao opcoes={TIPOS_AGENDA} value={f.tipo} onChange={set("tipo")} /></Campo>
        {contatoFixo ? null : <BuscaContato valor={contato} onEscolher={setContato} rotulo="Cliente (opcional)" />}
        <Campo rotulo="Quando"><Entrada type="datetime-local" required value={f.inicio} onChange={set("inicio")} /></Campo>
        <Campo rotulo="Título" dica="Se deixar em branco, uso o tipo e o nome do cliente.">
          <Entrada value={f.titulo} onChange={set("titulo")} />
        </Campo>
        <Campo rotulo="Local"><Entrada value={f.local} onChange={set("local")} placeholder="Endereço ou bairro" /></Campo>
        <Campo rotulo="Anotações"><AreaTexto rows={3} value={f.notas} onChange={set("notas")} /></Campo>
        {erro && <p className="text-alerta text-sm">{erro}</p>}
        <div className="flex gap-3">
          <BotaoPrimario disabled={salvando} className="flex-1">{salvando ? "Salvando..." : "Salvar"}</BotaoPrimario>
          {evento?.id && (
            <button type="button" onClick={excluir} className="h-12 px-4 rounded-lg text-alerta font-medium">Excluir</button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function proximaHoraCheia() {
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
  return d.toISOString();
}
