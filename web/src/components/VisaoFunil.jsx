import { NavLink } from "react-router-dom";

/** Alterna o funil entre o quadro (kanban) e a tabela. */
export default function VisaoFunil() {
  const opcoes = [
    { to: "/funil", nome: "Quadro", icone: IconeQuadro },
    { to: "/funil/tabela", nome: "Tabela", icone: IconeTabela },
  ];
  return (
    <div role="group" aria-label="Visualização do funil" className="flex p-0.5 h-11 rounded-lg border border-linha bg-fundo">
      {opcoes.map((o) => (
        <NavLink key={o.to} to={o.to} end title={o.nome} aria-label={o.nome}
          className={({ isActive }) => `h-full px-2.5 sm:px-3 rounded-md flex items-center gap-2 text-sm font-medium ${
            isActive ? "bg-superficie text-tinta shadow-sm" : "text-tinta-suave hover:text-tinta"}`}>
          <o.icone className="w-5 h-5" />
          <span className="hidden sm:inline">{o.nome}</span>
        </NavLink>
      ))}
    </div>
  );
}

function IconeQuadro(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" />
  </svg>);
}
function IconeTabela(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 10v10" />
  </svg>);
}
