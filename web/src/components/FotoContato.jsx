import { useState } from "react";
import { useUrlMidia } from "../lib/whatsapp";

/**
 * Foto de perfil do WhatsApp (copiada para o Storage). Sem foto, mostra a
 * inicial do nome ou o ícone de grupo. `className` define o tamanho (ex.: "h-11 w-11").
 */
export default function FotoContato({ contato, className = "h-10 w-10", texto = "" }) {
  const url = useUrlMidia(contato?.foto_path ?? null);
  const [falhou, setFalhou] = useState(null); // path que não abriu
  const grupo = contato?.is_grupo;

  if (url && falhou !== contato.foto_path) {
    return (
      <img src={url} alt="" loading="lazy" onError={() => setFalhou(contato.foto_path)}
        className={`${className} shrink-0 rounded-full object-cover bg-linha animate-aparecer`} />
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
