import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) setErro("E-mail ou senha incorretos.");
  }

  return (
    <div className="min-h-full grid place-items-center p-6 bg-tinta">
      <form onSubmit={entrar} className="w-full max-w-sm bg-superficie rounded-2xl p-6 space-y-4">
        <div>
          <div className="h-1.5 w-12 rounded-full bg-sol mb-4" />
          <h1 className="text-2xl font-bold">CRM Solar</h1>
          <p className="text-tinta-suave">Entre para ver o seu dia.</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full h-12 px-3 rounded-lg border border-linha bg-fundo" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Senha</span>
          <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full h-12 px-3 rounded-lg border border-linha bg-fundo" />
        </label>
        {erro && <p className="text-alerta text-sm">{erro}</p>}
        <button disabled={carregando}
          className="w-full h-12 rounded-lg bg-sol text-tinta font-semibold disabled:opacity-60">
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
