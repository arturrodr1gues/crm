import { useState } from "react";
import { useUrlMidia } from "../lib/whatsapp";
import { PreviaImagem } from "./ui";

/**
 * Foto de perfil do WhatsApp (copiada para o Storage). Sem foto, mostra a
 * inicial do nome ou o ícone de grupo. `className` define o tamanho (ex.: "h-11 w-11").
 * `ampliavel`: clicar na foto abre ela grande.
 */
export default function FotoContato({ contato, className = "h-10 w-10", texto = "", ampliavel = false }) {
  const url = useUrlMidia(contato?.foto_path ?? null);
  const [falhou, setFalhou] = useState(null); // path que não abriu
  const [aberta, setAberta] = useState(false);
  const grupo = contato?.is_grupo;

  if (url && falhou !== contato.foto_path) {
    const img = (
      <img src={url} alt="" loading="lazy" onError={() => setFalhou(contato.foto_path)}
        className={`${className} shrink-0 rounded-full object-cover bg-linha animate-aparecer`} />
    );
    if (!ampliavel) return img;
    return (
      <>
        <button type="button" onClick={() => setAberta(true)} aria-label="Ver foto de perfil" title="Ver foto de perfil"
          className="shrink-0 rounded-full cursor-zoom-in hover:ring-2 hover:ring-sol/60 transition-shadow">
          {img}
        </button>
        {aberta && <PreviaImagem src={url} alt="Foto de perfil" onFechar={() => setAberta(false)} />}
      </>
    );
  }
  return (
    <span aria-hidden="true" className={`${className} shrink-0 rounded-full grid place-items-center font-semibold ${texto} ${
      grupo ? "bg-linha text-tinta" : "bg-tinta text-white"}`}>
      {grupo ? <IconeGrupo className="w-1/2 h-1/2" /> : (contato?.nome || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function IconeGrupo(p) {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.6" />
  </svg>);
}
