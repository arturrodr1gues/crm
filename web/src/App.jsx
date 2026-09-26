import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Hoje from "./pages/Hoje";
import Funil from "./pages/Funil";
import Conversas from "./pages/Conversas";
import Contato from "./pages/Contato";
import Agenda from "./pages/Agenda";

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
    supabase.from("equipe").select("nome").eq("user_id", sessao.user.id).maybeSingle()
      .then(({ data }) => setMembro(data ?? null));
  }, [sessao]);

  if (sessao === undefined) return null;
  if (!sessao) return <Login />;
  if (membro === undefined) return null;

  if (membro === null) {
    return (
      <div className="min-h-full grid place-items-center p-6">
        <div className="max-w-md bg-superficie rounded-2xl p-6 border border-linha">
          <h1 className="text-xl font-semibold mb-2">Acesso ainda não liberado</h1>
          <p className="text-tinta-suave mb-4">
            Sua conta entrou, mas ainda não faz parte da equipe do CRM. Rode no SQL Editor do Supabase:
          </p>
          <pre className="bg-fundo rounded-lg p-3 text-sm overflow-x-auto">
{`insert into equipe (user_id, nome)
values ('${sessao.user.id}', 'Artur');`}
          </pre>
          <button onClick={() => supabase.auth.signOut()} className="mt-4 underline text-tinta-suave">
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Hoje />} />
        <Route path="/funil" element={<Funil />} />
        <Route path="/conversas" element={<Conversas />} />
        <Route path="/contatos/:id" element={<Contato />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
