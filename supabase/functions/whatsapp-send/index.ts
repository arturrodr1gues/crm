// Envia uma mensagem de texto para um contato, a partir do CRM.
// Chamado pelo front com o JWT do usuário logado.

import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarTexto } from "../_shared/uazapi.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Intervalo mínimo entre envios pela API. Ajuda a não parecer robô.
const INTERVALO_MIN_MS = 4000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);

  // 1) Quem está pedindo? Precisa ser da equipe.
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "sessão inválida" }, 401);

  const { data: membro } = await admin.from("equipe").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!membro) return json({ error: "sem permissão" }, 403);

  // 2) Valida entrada
  const { contato_id, texto } = await req.json().catch(() => ({}));
  const msg = typeof texto === "string" ? texto.trim() : "";
  if (!contato_id || !msg) return json({ error: "informe contato_id e texto" }, 400);
  if (msg.length > 4000) return json({ error: "mensagem longa demais" }, 400);

  const { data: contato } = await admin.from("contatos")
    .select("id, telefone, whatsapp_chatid, consentimento_lgpd").eq("id", contato_id).maybeSingle();
  if (!contato) return json({ error: "contato não encontrado" }, 404);

  const destino = contato.whatsapp_chatid ?? contato.telefone;
  if (!destino) return json({ error: "contato sem WhatsApp cadastrado" }, 400);

  // 3) Proteção do número: só puxa conversa com quem já falou com você
  //    ou autorizou contato (consentimento). Nada de mensagem fria pela API.
  if (!contato.consentimento_lgpd) {
    const { count } = await admin.from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("contato_id", contato.id).eq("direcao", "in");
    if (!count) {
      return json({
        error: "Esse contato ainda não falou com você. Marque que ele autorizou o contato antes de enviar pelo CRM.",
      }, 409);
    }
  }

  // 4) Ritmo mínimo entre envios
  const { data: ultima } = await admin.from("mensagens")
    .select("momento").eq("direcao", "out").not("enviado_por", "is", null)
    .order("momento", { ascending: false }).limit(1).maybeSingle();
  if (ultima) {
    const espera = INTERVALO_MIN_MS - (Date.now() - new Date(ultima.momento).getTime());
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  }

  // 5) Envia e registra
  try {
    const { messageId, raw } = await enviarTexto(destino, msg);
    const { data: gravada, error } = await admin.from("mensagens").upsert({
      contato_id: contato.id,
      direcao: "out",
      texto: msg,
      message_id: messageId ?? `api-${crypto.randomUUID()}`,
      status: "enviada",
      enviado_por: user.id,
      raw,
    }, { onConflict: "message_id" }).select().single();
    if (error) throw error;
    return json({ mensagem: gravada });
  } catch (e) {
    await admin.from("mensagens").insert({
      contato_id: contato.id, direcao: "out", texto: msg,
      status: "falhou", erro: String((e as Error).message ?? e), enviado_por: user.id,
    });
    return json({ error: "Não foi possível enviar. Verifique se o WhatsApp está conectado na UAZAPI." }, 502);
  }
});
