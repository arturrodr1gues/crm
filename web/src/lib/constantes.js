// Etapas iniciais do funil. As colunas de verdade ficam na tabela etapas_funil
// e são editadas no gerenciador do funil (ver lib/etapas.js).
export const ETAPAS = [
  { id: "novo",        nome: "Novo contato" },
  { id: "qualificado", nome: "Conta de luz recebida" },
  { id: "visita",      nome: "Visita técnica" },
  { id: "proposta",    nome: "Proposta enviada" },
  { id: "negociacao",  nome: "Negociação" },
  { id: "fechado",     nome: "Fechado" },
];
export const ETAPA_PERDIDO = { id: "perdido", nome: "Perdido" };

export const ORIGENS = [
  { id: "whatsapp", nome: "WhatsApp" },
  { id: "indicacao", nome: "Indicação" },
  { id: "instagram", nome: "Instagram" },
  { id: "porta_a_porta", nome: "Porta a porta" },
  { id: "evento", nome: "Evento" },
  { id: "outro", nome: "Outro" },
];

export const FAIXAS = [
  { id: "ate_500", nome: "Até 500 kWh" },
  { id: "500_700", nome: "500 a 700 kWh" },
  { id: "700_1000", nome: "700 a 1.000 kWh" },
  { id: "1000_1200", nome: "1.000 a 1.200 kWh" },
  { id: "acima_1200", nome: "Acima de 1.200 kWh" },
];
export const faixaPorConsumo = (kwh) => {
  if (!kwh) return null;
  if (kwh <= 500) return "ate_500";
  if (kwh <= 700) return "500_700";
  if (kwh <= 1000) return "700_1000";
  if (kwh <= 1200) return "1000_1200";
  return "acima_1200";
};

export const FINANCIAMENTO = [
  { id: "nao_precisa", nome: "Não precisa" },
  { id: "em_analise", nome: "Em análise" },
  { id: "aprovado", nome: "Aprovado" },
  { id: "recusado", nome: "Recusado" },
];

export const TIPOS_AGENDA = [
  { id: "visita", nome: "Visita" },
  { id: "instalacao", nome: "Instalação" },
  { id: "manutencao", nome: "Manutenção" },
  { id: "followup", nome: "Retorno" },
  { id: "outro", nome: "Outro" },
];
export const nomeTipo = (id) => TIPOS_AGENDA.find((t) => t.id === id)?.nome ?? id;

// Dias parado numa etapa antes de acender o alerta
export const DIAS_ALERTA_PROPOSTA = 3;
