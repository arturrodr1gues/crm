import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Sai só deste aparelho. Sem `scope`, o Supabase usa "global" e derruba a conta
// em todos os dispositivos conectados.
export const sair = () => supabase.auth.signOut({ scope: "local" });
