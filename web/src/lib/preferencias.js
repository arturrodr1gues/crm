import { useState } from "react";

/**
 * Preferência de tela guardada neste navegador (ex.: barra recolhida).
 * Se o navegador bloquear o storage, funciona só durante a sessão.
 */
export function usePreferencia(chave, padrao) {
  const [valor, setValor] = useState(() => {
    try {
      const salvo = localStorage.getItem(chave);
      return salvo === null ? padrao : JSON.parse(salvo);
    } catch { return padrao; }
  });

  function mudar(novo) {
    setValor((atual) => {
      const v = typeof novo === "function" ? novo(atual) : novo;
      try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem storage */ }
      return v;
    });
  }

  return [valor, mudar];
}
