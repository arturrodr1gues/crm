import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import NovoContato from "./NovoContato";
import { usePreferencia } from "../lib/preferencias";

const itens = [
  { to: "/", nome: "Hoje", icone: IconeSol },
  { to: "/funil", nome: "Funil", icone: IconeFunil },
  { to: "/conversas", nome: "Conversas", icone: IconeChat, badge: true },
  { to: "/agenda", nome: "Agenda", icone: IconeAgenda },
  { to: "/dashboard", nome: "Dashboard", icone: IconeGrafico },
  { to: "/configuracoes", nome: "Ajustes", icone: IconeAjustes },
];

export default function Layout({ children }) {
  const [naoLidas, setNaoLidas] = useState(0);
  const [novoAberto, setNovoAberto] = useState(false);
  const { pathname } = useLocation();
  const naFichaDoCliente = /^\/conversas\/[^/]+/.test(pathname);
  // Menu do computador recolhido: só os ícones.
  const [recolhido, setRecolhido] = usePreferencia("crm-menu-recolhido", false);

  async function contar() {
    // Grupos ficam fora do contador para não esconder as mensagens de clientes.
    const { data } = await supabase.from("contatos").select("nao_lidas").gt("nao_lidas", 0).eq("is_grupo", false);
    setNaoLidas((data ?? []).reduce((s, c) => s + c.nao_lidas, 0));
  }

  useEffect(() => {
    contar();
    const canal = supabase.channel("badge-nao-lidas")
      .on("postgres_changes", { event: "*", schema: "public", table: "contatos" }, contar)
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden">
      {/* Menu lateral no computador */}
      <aside className={`hidden md:flex md:flex-col ${recolhido ? "w-16 px-2" : "w-56 px-4"} shrink-0 bg-tinta text-white py-4 gap-1 h-full overflow-y-auto`}>
        <div className={`flex items-center gap-2 mb-6 ${recolhido ? "flex-col" : "px-2"}`}>
          <span className="h-3 w-3 shrink-0 rounded-full bg-sol" />
          {!recolhido && <span className="font-bold text-lg flex-1">CRM Solar</span>}
          <button type="button" onClick={() => setRecolhido(!recolhido)}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"} title={recolhido ? "Expandir menu" : "Recolher menu"}
            className="h-8 w-8 grid place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
            <IconeRecolher className={`w-5 h-5 ${recolhido ? "rotate-180" : ""}`} />
          </button>
        </div>
        {itens.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/"} title={recolhido ? i.nome : undefined} aria-label={i.nome}
            className={({ isActive }) =>
              `relative flex items-center gap-3 h-11 rounded-lg ${recolhido ? "justify-center" : "px-3"} ${
                isActive ? "bg-white/15 font-semibold" : "text-white/75 hover:bg-white/10"}`}>
            <i.icone className="w-5 h-5 shrink-0" />
            {!recolhido && <span className="flex-1">{i.nome}</span>}
            {i.badge && naoLidas > 0 && (recolhido
              ? <span className="absolute -top-1 -right-1"><Badge n={naoLidas} /></span>
              : <Badge n={naoLidas} />)}
          </NavLink>
        ))}
        <button onClick={() => setNovoAberto(true)} aria-label="Novo contato" title={recolhido ? "Novo contato" : undefined}
          className={`mt-4 h-11 rounded-lg bg-sol text-tinta font-semibold ${recolhido ? "text-2xl font-light" : ""}`}>
          {recolhido ? "+" : "Novo contato"}
        </button>
        <button onClick={() => supabase.auth.signOut()} title={recolhido ? "Sair" : undefined}
          className={`mt-auto text-white/60 text-sm ${recolhido ? "text-center" : "text-left px-3"}`}>
          Sair
        </button>
      </aside>

      {/* Só o conteúdo rola; menu lateral e barra inferior ficam sempre no lugar */}
      <main className={`flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain md:pb-0 ${naFichaDoCliente ? "" : "pb-20"}`}>
        {/* Troca de página entra suave. A chave é a seção, então trocar de conversa não pisca. */}
        <div key={pathname.split("/")[1]} className="h-full animate-entrada">{children}</div>
      </main>

      {/* Botão flutuante no celular (escondido na conversa para não cobrir o campo de texto) */}
      {!naFichaDoCliente && <button onClick={() => setNovoAberto(true)} aria-label="Novo contato"
        className="md:hidden fixed right-4 z-30 h-14 w-14 rounded-full bg-sol text-tinta text-3xl font-light shadow-lg"
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
        +
      </button>}

      {/* Barra inferior no celular */}
      <nav className="md:hidden shrink-0 z-30 bg-superficie border-t border-linha grid grid-cols-6"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {itens.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/"}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center h-16 text-xs ${isActive ? "text-tinta font-semibold" : "text-tinta-suave"}`}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-1 w-10 rounded-b bg-sol animate-aparecer" />}
                <i.icone className="w-6 h-6 mb-0.5" />
                {i.nome}
                {i.badge && naoLidas > 0 && <span className="absolute top-2 right-[28%]"><Badge n={naoLidas} /></span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {novoAberto && <NovoContato onFechar={() => setNovoAberto(false)} />}
    </div>
  );
}

function Badge({ n }) {
  return (
    <span className="min-w-5 h-5 px-1.5 rounded-full bg-alerta text-white text-[11px] font-bold grid place-items-center">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function IconeRecolher(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M16 10l-2 2 2 2" />
  </svg>);
}
function IconeSol(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>);
}
function IconeFunil(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" />
  </svg>);
}
function IconeChat(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>);
}
function IconeAgenda(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>);
}
function IconeGrafico(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 3v18h18M8 16v-5M13 16V7M18 16v-8" />
  </svg>);
}
function IconeAjustes(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </svg>);
}
