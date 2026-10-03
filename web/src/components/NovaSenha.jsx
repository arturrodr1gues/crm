import { useState } from "react";
import { supabase } from "../lib/supabase";
import { AvisoErro, BotaoPrimario, Campo, Entrada } from "./ui";

const MINIMO = 8;

/** Formulário de nova senha para o usuário logado (Ajustes e link de recuperação). */
export default function NovaSenha({ onSalva, rotuloBotao = "Salvar nova senha" }) {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salva, setSalva] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro(""); setSalva(false);
    if (senha.length < MINIMO) { setErro(`A senha precisa ter pelo menos ${MINIMO} caracteres.`); return; }
    if (senha !== confirma) { setErro("As duas senhas não são iguais."); return; }

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro(error.code === "same_password"
        ? "A nova senha precisa ser diferente da atual."
        : error.code === "weak_password"
          ? "Senha fraca demais. Use uma senha mais longa, misturando letras e números."
          : "Não foi possível trocar a senha. Tente de novo.");
      return;
    }
    setSenha(""); setConfirma(""); setSalva(true);
    onSalva?.();
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <Campo rotulo="Nova senha" dica={`Pelo menos ${MINIMO} caracteres.`}>
        <Entrada type="password" required autoComplete="new-password" value={senha}
          onChange={(e) => setSenha(e.target.value)} />
      </Campo>
      <Campo rotulo="Repita a nova senha">
        <Entrada type="password" required autoComplete="new-password" value={confirma}
          onChange={(e) => setConfirma(e.target.value)} />
      </Campo>
      <AvisoErro>{erro}</AvisoErro>
      {salva && <p className="text-ok text-sm">Senha trocada.</p>}
      <BotaoPrimario type="submit" disabled={salvando}>{salvando ? "Salvando…" : rotuloBotao}</BotaoPrimario>
    </form>
  );
}
