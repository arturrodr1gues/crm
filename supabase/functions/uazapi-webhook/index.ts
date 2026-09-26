// Recebe eventos da UAZAPI e grava no CRM.
// A tela de Configurações cadastra a URL na UAZAPI automaticamente:
//   https://<projeto>.supabase.co/functions/v1/uazapi-webhook?secret=<webhook_secret>
// Deploy com: supabase functions deploy uazapi-webhook --no-verify-jwt

import { admin as supabase, lerConfig } from "../_shared/config.ts";
import { normalizarEvento } from "../_shared/uazapi.ts";

const ok = (msg = "ok") => new Response(msg, { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

  // O secret é gerado e cadastrado na UAZAPI pela tela de Configurações.
  const esperado = (await lerConfig())?.webhookSecret;
  const secret = new URL(req.url).searchParams.get("secret");
  if (!esperado || secret !== esperado) {
    return new Response("não autorizado", { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return ok("ignorado: json inválido"); }

  const m = normalizarEvento(body);
  // Sempre 200 para eventos ignorados, senão a UAZAPI fica reenviando.
  if (!m) return ok("ignorado: não é mensagem");
  if (m.isGroup) return ok("ignorado: grupo");

  // 1) Localiza o contato pelo chat ou pelo telefone
  let { data: contato } = await supabase
    .from("contatos").select("id, nome, telefone, whatsapp_chatid")
    .eq("whatsapp_chatid", m.chatId).maybeSingle();

  if (!contato && m.telefone) {
    ({ data: contato } = await supabase
      .from("contatos").select("id, nome, telefone, whatsapp_chatid")
      .eq("telefone", m.telefone).maybeSingle());
  }

  // 2) Cria contato novo (e oportunidade, se foi o cliente quem chamou)
  if (!contato) {
    const { data: novo, error } = await supabase.from("contatos").insert({
      nome: m.fromMe ? null : m.nomeContato,
      telefone: m.telefone,
      whatsapp_chatid: m.chatId,
      origem: "whatsapp",
    }).select("id, nome, telefone, whatsapp_chatid").single();

    if (error) {
      console.error("erro ao criar contato", error);
      return new Response("erro ao criar contato", { status: 500 }); // UAZAPI tenta de novo
    }
    contato = novo;

    if (!m.fromMe) {
      await supabase.from("oportunidades").insert({ contato_id: contato.id, etapa: "novo" });
    }
  } else {
    // Completa dados que faltavam
    const patch: Record<string, unknown> = {};
    if (!contato.whatsapp_chatid) patch.whatsapp_chatid = m.chatId;
    if (!contato.telefone && m.telefone) patch.telefone = m.telefone;
    if (!contato.nome && !m.fromMe && m.nomeContato) patch.nome = m.nomeContato;
    if (Object.keys(patch).length) await supabase.from("contatos").update(patch).eq("id", contato.id);
  }

  // 3) Grava a mensagem (message_id único evita duplicados em reenvios)
  const { error: errMsg } = await supabase.from("mensagens").upsert({
    contato_id: contato.id,
    direcao: m.fromMe ? "out" : "in",
    tipo: m.tipo,
    texto: m.texto,
    message_id: m.messageId,
    status: m.fromMe ? "enviada" : "recebida",
    momento: m.momento.toISOString(),
    raw: body,
  }, { onConflict: "message_id", ignoreDuplicates: true });

  if (errMsg) {
    console.error("erro ao gravar mensagem", errMsg);
    return new Response("erro ao gravar mensagem", { status: 500 });
  }

  return ok();
});
