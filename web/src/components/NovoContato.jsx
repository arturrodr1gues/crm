import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ORIGENS, faixaPorConsumo } from "../lib/constantes";
import { normalizarTelefone } from "../lib/format";
import { Modal, Campo, Entrada, Selecao, BotaoPrimario } from "./ui";
import BuscaContato from "./BuscaContato";

export default function NovoContato({ onFechar }) {
  const navegar = useNavigate();
  const [f, setF] = useState({ nome: "", telefone: "", bairro: "", cidade: "Natal", origem: "indicacao", consumo_kwh: "", consentimento_lgpd: false });
  const [indicadoPor, setIndicadoPor] = useState(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const telefone = normalizarTelefone(f.telefone);
    if (!f.nome.trim() && !telefone) { setErro("Informe pelo menos o nome ou o telefone."); return; }

    setSalvando(true);
    const consumo = f.consumo_kwh ? Number(f.consumo_kwh) : null;
    const { data: contato, error } = await supabase.from("contatos").insert({
      nome: f.nome.trim() || null,
      telefone,
      bairro: f.bairro.trim() || null,
      cidade: f.cidade.trim() || null,
      origem: f.origem,
      indicado_por: f.origem === "indicacao" ? indicadoPor?.id ?? null : null,
      consumo_kwh: consumo,
      consentimento_lgpd: f.consentimento_lgpd,
      consentimento_em: f.consentimento_lgpd ? new Date().toISOString() : null,
    }).select("id").single();

    if (error) {
      setSalvando(false);
      setErro(error.code === "23505" ? "Já existe um contato com esse telefone." : "Não foi possível salvar. Tente de novo.");
      return;
    }

    await supabase.from("oportunidades").insert({
      contato_id: contato.id,
      etapa: consumo ? "qualificado" : "novo",
      faixa_consumo: faixaPorConsumo(consumo),
    });

    onFechar();
    navegar(`/conversas/${contato.id}`);
  }

  return (
    <Modal titulo="Novo contato" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome"><Entrada value={f.nome} onChange={set("nome")} autoFocus /></Campo>
        <Campo rotulo="WhatsApp"><Entrada type="tel" inputMode="tel" placeholder="(84) 99999-9999" value={f.telefone} onChange={set("telefone")} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Bairro"><Entrada value={f.bairro} onChange={set("bairro")} /></Campo>
          <Campo rotulo="Cidade"><Entrada value={f.cidade} onChange={set("cidade")} /></Campo>
        </div>
        <Campo rotulo="Como chegou até você"><Selecao opcoes={ORIGENS} value={f.origem} onChange={set("origem")} /></Campo>
        {f.origem === "indicacao" && (
          <BuscaContato rotulo="Quem indicou" valor={indicadoPor} onEscolher={setIndicadoPor} />
        )}
        <Campo rotulo="Consumo mensal (kWh)" dica="Se já tiver a conta de luz. Pode preencher depois.">
          <Entrada type="number" inputMode="numeric" min="1" value={f.consumo_kwh} onChange={set("consumo_kwh")} />
        </Campo>
        <label className="flex items-start gap-3 py-1">
          <input type="checkbox" checked={f.consentimento_lgpd} onChange={set("consentimento_lgpd")} className="mt-1 h-5 w-5 accent-sol" />
          <span className="text-sm">O cliente autorizou receber mensagens pelo WhatsApp</span>
        </label>
        {erro && <p className="text-alerta text-sm">{erro}</p>}
        <BotaoPrimario disabled={salvando} className="w-full">{salvando ? "Salvando..." : "Salvar contato"}</BotaoPrimario>
      </form>
    </Modal>
  );
}
