import { supabase } from "../lib/supabase";
import NovaSenha from "../components/NovaSenha";

// Aberta pelo link do e-mail de recuperação. O Supabase já entra com a sessão
// que vem no link; aqui só falta escolher a senha nova.
export default function RedefinirSenha({ sessao }) {
  const irParaInicio = () => window.location.replace("/");

  return (
    <div className="min-h-full grid place-items-center p-6 bg-tinta">
      <div className="w-full max-w-sm bg-superficie rounded-2xl p-6 space-y-4">
        <div>
          <div className="h-1.5 w-12 rounded-full bg-sol mb-4" />
          <h1 className="text-2xl font-bold">Nova senha</h1>
        </div>

        {sessao ? (
          <>
            <p className="text-tinta-suave text-sm">Escolha a nova senha para {sessao.user.email}.</p>
            <NovaSenha rotuloBotao="Salvar e entrar" onSalva={() => setTimeout(irParaInicio, 800)} />
          </>
        ) : (
          <>
            <p className="text-tinta-suave">
              Esse link expirou ou já foi usado. Peça um novo na tela de entrada, em "Esqueci minha senha".
            </p>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); irParaInicio(); }}
              className="w-full h-12 rounded-lg bg-sol text-tinta font-semibold">
              Voltar para a entrada
            </button>
          </>
        )}
      </div>
    </div>
  );
}
