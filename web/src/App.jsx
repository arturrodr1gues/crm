import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { sair, supabase } from "./lib/supabase";
import { MembroContext } from "./lib/equipe";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import RedefinirSenha from "./pages/RedefinirSenha";
import Hoje from "./pages/Hoje";
import Funil from "./pages/Funil";
import FunilTabela from "./pages/FunilTabela";
import Conversas from "./pages/Conversas";
import Contato from "./pages/Contato";
import Lead from "./pages/Lead";
import Agenda from "./pages/Agenda";
import Dashboard from "./pages/Dashboard";
import Configuracoes from "./pages/Configuracoes";
import MensagensRapidas from "./pages/MensagensRapidas";

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [membro, setMembro] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) { setMembro(undefined); return; }
    supabase.from("equipe").select("nome, papel, leitura_silenciosa").eq("user_id", sessao.user.id).maybeSingle()
      .then(({ data }) => setMembro(data ?? null));
  }, [sessao]);

  if (sessao === undefined) return null;
  // Link do e-mail de recuperação: com sessão, pede a senha nova; sem, avisa que expirou.
  if (window.location.pathname === "/redefinir-senha") return <RedefinirSenha sessao={sessao} />;
  if (!sessao) return <Login />;
  if (membro === undefined) return null;

  if (membro === null) {
    return (
      <div className="min-h-full grid place-items-center p-6">
        <div className="max-w-md bg-superficie rounded-2xl p-6 border border-linha">
          <h1 className="text-xl font-semibold mb-2">Acesso ainda não liberado</h1>
          <p className="text-tinta-suave">
            Sua conta ({sessao.user.email}) entrou, mas ainda não faz parte da equipe do CRM.
            Peça ao administrador para liberar o seu acesso.
          </p>
          <button onClick={sair} className="mt-4 underline text-tinta-suave">
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <MembroContext.Provider value={membro}>
    <Layout>
      <Routes>
        <Route path="/" element={<Hoje />} />
        <Route path="/funil" element={<Funil />} />
        <Route path="/funil/tabela" element={<FunilTabela />} />
        <Route path="/conversas" element={<Conversas />} />
        <Route path="/conversas/:id" element={<Contato />} />
        <Route path="/leads/:id" element={<Lead />} />
        {/* Endereço antigo: links salvos continuam funcionando */}
        <Route path="/contatos/:id" element={<RedirecionaContato />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/mensagens-rapidas" element={<MensagensRapidas />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
    </MembroContext.Provider>
  );
}

function RedirecionaContato() {
  const { id } = useParams();
  return <Navigate to={`/conversas/${id}`} replace />;
}
