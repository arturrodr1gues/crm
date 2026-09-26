import { useEffect, useState } from "react";

/** true enquanto a media query casar, ex.: useMidia("(min-width: 1024px)"). */
export default function useMidia(query) {
  const [casa, setCasa] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const mudou = () => setCasa(mq.matches);
    mudou();
    mq.addEventListener("change", mudou);
    return () => mq.removeEventListener("change", mudou);
  }, [query]);
  return casa;
}

// Largura a partir da qual a lista de conversas fica ao lado do chat (lg do Tailwind).
export const TELA_LARGA = "(min-width: 1024px)";
