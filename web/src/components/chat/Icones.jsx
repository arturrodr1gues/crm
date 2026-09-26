// Ícones do chat (traço simples, herdam a cor do texto).
const Svg = ({ children, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);

export const IconeAnexo = (p) => <Svg {...p}><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></Svg>;
export const IconeMic = (p) => <Svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></Svg>;
export const IconeEnviar = (p) => <Svg {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></Svg>;
export const IconeEmoji = (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></Svg>;
export const IconeFechar = (p) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconeResponder = (p) => <Svg {...p}><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></Svg>;
export const IconeCopiar = (p) => <Svg {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>;
export const IconeLapis = (p) => <Svg {...p}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></Svg>;
export const IconeLixo = (p) => <Svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>;
export const IconeDoc = (p) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Svg>;
export const IconeFoto = (p) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></Svg>;
export const IconePessoa = (p) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>;
export const IconeEnquete = (p) => <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>;
export const IconeFigurinha = (p) => <Svg {...p}><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9.5L21 14.5V5a2 2 0 0 0-2-2z" /><path d="M15 21v-4a2 2 0 0 1 2-2h4M9 10h.01M15 10h.01" /></Svg>;
export const IconeMusica = (p) => <Svg {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>;
export const IconeMenu = (p) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;

/** Relógio (enviando), ✓ (enviada), ✓✓ (entregue), ✓✓ azul (lida/ouvida). */
export function Tiques({ status }) {
  if (status === "pendente") return <Svg className="inline w-3.5 h-3.5" aria-label="Enviando"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
  const duplo = ["entregue", "lida", "reproduzida"].includes(status);
  const lida = status === "lida" || status === "reproduzida";
  const rotulo = { enviada: "Enviada", entregue: "Entregue", lida: "Lida", reproduzida: "Ouvida" }[status] ?? "";
  return (
    <svg viewBox="0 0 18 12" className={`inline w-4 h-3 ${lida ? "text-sky-300" : ""}`} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={rotulo}>
      <title>{rotulo}</title>
      <path d={duplo ? "M1 6.5 4 9.5 10 2.5" : "M4 6.5 7 9.5 13 2.5"} />
      {duplo && <path d="M7.5 9.5 14.5 2.5" />}
    </svg>
  );
}
