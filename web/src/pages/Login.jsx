import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(""); setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) setErro("E-mail ou senha incorretos.");
  }

  async function enviarLink(e) {
    e.preventDefault();
    setErro(""); setAviso(""); setCarregando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setCarregando(false);
    if (error?.status === 429) { setErro("Muitos pedidos seguidos. Espere alguns minutos e tente de novo."); return; }
    if (error) { setErro("Não foi possível enviar o e-mail. Tente de novo."); return; }
    // Mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados.
    setAviso("Se esse e-mail tiver conta, chega em instantes um link para criar uma senha nova. Confira também o spam.");
  }

  function alternar() {
    setRecuperando(!recuperando); setErro(""); setAviso("");
  }

  return (
    <div className="min-h-full grid place-items-center p-6 bg-tinta">
      <form onSubmit={recuperando ? enviarLink : entrar} className="w-full max-w-sm bg-superficie rounded-2xl p-6 space-y-4">
        <div>
          <div className="h-1.5 w-12 rounded-full bg-sol mb-4" />
          <h1 className="text-2xl font-bold">{recuperando ? "Recuperar senha" : "CRM Solar"}</h1>
          <p className="text-tinta-suave">
            {recuperando ? "Enviamos um link para você criar uma senha nova." : "Entre para ver o seu dia."}
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-medium">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full h-12 px-3 rounded-lg border border-linha bg-fundo" />
        </label>
        {!recuperando && (
          <label className="block">
            <span className="text-sm font-medium">Senha</span>
            <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full h-12 px-3 rounded-lg border border-linha bg-fundo" />
          </label>
        )}
        {erro && <p role="alert" className="text-alerta text-sm">{erro}</p>}
        {aviso && <p className="text-ok text-sm">{aviso}</p>}
        <button disabled={carregando}
          className="w-full h-12 rounded-lg bg-sol text-tinta font-semibold disabled:opacity-60">
          {recuperando
            ? (carregando ? "Enviando..." : "Enviar link")
            : (carregando ? "Entrando..." : "Entrar")}
        </button>
        <button type="button" onClick={alternar} className="w-full text-sm underline text-tinta-suave">
          {recuperando ? "Voltar para entrar" : "Esqueci minha senha"}
        </button>
      </form>
    </div>
  );
}
