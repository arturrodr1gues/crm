export const soDigitos = (v) => (v ?? "").replace(/\D/g, "");

// Guarda sempre com DDI 55. Aceita "(84) 99999-9999", "84999999999" etc.
export function normalizarTelefone(v) {
  const d = soDigitos(v);
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

export function formatarTelefone(d) {
  if (!d) return "";
  const n = d.startsWith("55") ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return d;
}

const tz = { timeZone: "America/Fortaleza" };
export const hora = (iso) =>
  new Date(iso).toLocaleTimeString("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" });
export const dataCurta = (iso) =>
  new Date(iso).toLocaleDateString("pt-BR", { ...tz, day: "2-digit", month: "2-digit" });
export const diaSemana = (iso) =>
  new Date(iso).toLocaleDateString("pt-BR", { ...tz, weekday: "long", day: "numeric", month: "long" });

export function quando(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia ? hora(iso) : dataCurta(iso);
}

export const diasDesde = (iso) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export function inicioDoDia(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
export function fimDoDia(d = new Date()) {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}

// Converte ISO para o valor de <input type="datetime-local"> no horário local
export function paraInputLocal(iso) {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export const nomeOuTelefone = (c) => c?.nome || formatarTelefone(c?.telefone) || "Sem nome";
