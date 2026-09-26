import { duracaoCurta } from "../lib/atendimento";

const Relogio = () => (
  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);

/** Tempo que o cliente está esperando resposta; vermelho quando passa do SLA. */
export function SeloSla({ sla, compacto = false }) {
  const tempo = duracaoCurta(sla.minutos);
  return (
    <span title={sla.critico ? `SLA estourado: cliente sem resposta há ${tempo}` : `Cliente aguardando resposta há ${tempo}`}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${
        compacto ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-1"} ${
        sla.critico ? "bg-alerta text-white" : "bg-sol/20 text-sol-escuro"}`}>
      <Relogio />{sla.critico && !compacto ? `SLA · ${tempo}` : tempo}
    </span>
  );
}

/** Cliente sem responder à nossa última mensagem há mais que o limite de follow-up. */
export function SeloFollowup({ followup }) {
  return (
    <span title={`Cliente sem responder há ${duracaoCurta(followup.minutos)}`}
      className="shrink-0 inline-flex items-center gap-1 rounded-full text-[11px] px-1.5 py-0.5 font-semibold whitespace-nowrap bg-sky-100 text-sky-800">
      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
      </svg>
      Follow-up
    </span>
  );
}
