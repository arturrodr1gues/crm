import { useState } from "react";
import { bloquearContatos, excluirContatos } from "../lib/contatos";
import { Modal } from "./ui";

const TEXTOS = {
  bloquear: {
    titulo: (n) => (n === 1 ? "Bloquear esta conversa?" : `Bloquear ${n} conversas?`),
    corpo: "Mensagens novas deixam de chegar ao CRM e não dá para enviar daqui. A conversa sai da lista e vai para Ajustes, em Contatos bloqueados, de onde você pode desbloquear. No WhatsApp do celular nada muda.",
    botao: "Bloquear",
  },
  desbloquear: {
    titulo: (n) => (n === 1 ? "Desbloquear esta conversa?" : `Desbloquear ${n} conversas?`),
    corpo: "As mensagens novas voltam a chegar ao CRM. O que foi enviado enquanto estava bloqueado não aparece.",
    botao: "Desbloquear",
  },
  excluir: {
    titulo: (n) => (n === 1 ? "Excluir este contato?" : `Excluir ${n} contatos?`),
    corpo: "Apaga as mensagens, fotos e arquivos da conversa e a venda no funil. Não dá para desfazer. Se a pessoa escrever de novo, a conversa volta como nova; para não receber mais, use Bloquear.",
    botao: "Excluir",
  },
};

/** Confirma e executa bloquear, desbloquear ou excluir para um ou vários contatos. */
export default function ConfirmarAcaoContatos({ acao, ids, onFechar, onFeito }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const t = TEXTOS[acao];
  const perigo = acao !== "desbloquear";

  async function confirmar() {
    setOcupado(true); setErro("");
    try {
      if (acao === "excluir") await excluirContatos(ids);
      else await bloquearContatos(ids, acao === "bloquear");
      onFeito?.();
      onFechar();
    } catch (e) {
      setErro(e.message);
      setOcupado(false);
    }
  }

  return (
    <Modal titulo={t.titulo(ids.length)} onFechar={ocupado ? () => {} : onFechar}>
      <div className="space-y-4">
        <p>{t.corpo}</p>
        {erro && <p className="text-alerta text-sm">{erro}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={confirmar} disabled={ocupado}
            className={`flex-1 h-12 px-5 rounded-lg font-semibold disabled:opacity-60 ${perigo ? "bg-alerta text-white" : "bg-sol text-tinta"}`}>
            {ocupado ? "Aguarde…" : t.botao}
          </button>
          <button type="button" onClick={onFechar} disabled={ocupado}
            className="h-12 px-5 rounded-lg border border-linha bg-superficie font-medium disabled:opacity-60">Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}
