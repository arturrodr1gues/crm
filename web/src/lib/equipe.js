import { createContext, useContext } from "react";

// Quem está logado: { nome, papel, leitura_silenciosa }. Preenchido no App.
export const MembroContext = createContext({});
export const useMembro = () => useContext(MembroContext);
