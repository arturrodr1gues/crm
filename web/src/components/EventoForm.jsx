import { useState } from "react";
import { supabase } from "../lib/supabase";
import { TIPOS_AGENDA, nomeTipo } from "../lib/constantes";
import { paraInputLocal, nomeOuTelefone } from "../lib/format";
import { Modal, Campo, Entrada, Selecao, AreaTexto, BotaoPrimario } from "./ui";
import BuscaContato from "./BuscaContato";

// Cria ou edita um compromisso. `contatoFixo` vem preenchido quando aberto pela ficha do cliente;
// `inicioPadrao` quando aberto clicando num horário da agenda.
export default function EventoForm({ evento, contatoFixo, oportunidadeId, inicioPadrao, onFechar, onSalvo }) {
  const [contato, setContato] = useState(contatoFixo ?? evento?.contato ?? null);
  const [f, setF] = useState({
    tipo: evento?.tipo ?? "visita",
    titulo: evento?.titulo ?? "",
    inicio: paraInputLocal(evento?.inicio ?? inicioPadrao ?? proximaHoraCheia()),
    termina: evento?.fim ? paraInputLocal(evento.fim).slice(11, 16) : "",
    local: evento?.local ?? "",
    notas: evento?.notas ?? "",
    concluido: evento?.concluido ?? false,
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    // O término é só a hora; vale para o mesmo dia do início
    const fim = f.termina ? new Date(`${f.inicio.slice(0, 10)}T${f.termina}`) : null;
    if (fim && fim <= new Date(f.inicio)) { setErro("O horário de término precisa ser depois do início."); return; }
    setSalvando(true);
    const titulo = f.titulo.trim() || `${nomeTipo(f.tipo)}${contato ? ` com ${nomeOuTelefone(contato)}` : ""}`;
    const dados = {
      tipo: f.tipo, titulo,
      inicio: new Date(f.inicio).toISOString(),
      fim: fim?.toISOString() ?? null,
      concluido: f.concluido,
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
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <Campo rotulo="Quando"><Entrada type="datetime-local" required value={f.inicio} onChange={set("inicio")} /></Campo>
          </div>
          <div className="w-32 shrink-0">
            <Campo rotulo="Termina às"><Entrada type="time" value={f.termina} onChange={set("termina")} /></Campo>
          </div>
        </div>
        <Campo rotulo="Título" dica="Se deixar em branco, uso o tipo e o nome do cliente.">
          <Entrada value={f.titulo} onChange={set("titulo")} />
        </Campo>
        <Campo rotulo="Local"><Entrada value={f.local} onChange={set("local")} placeholder="Endereço ou bairro" /></Campo>
        <Campo rotulo="Anotações"><AreaTexto rows={3} value={f.notas} onChange={set("notas")} /></Campo>
        {evento?.id && (
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-ok" checked={f.concluido}
              onChange={(e) => setF({ ...f, concluido: e.target.checked })} />
            <span className="font-medium">Concluído</span>
          </label>
        )}
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
