// Recebe eventos da UAZAPI e grava no CRM.
// A tela de Configurações cadastra a URL na UAZAPI automaticamente:
//   https://<projeto>.supabase.co/functions/v1/uazapi-webhook?secret=<webhook_secret>
// Deploy com: supabase functions deploy uazapi-webhook --no-verify-jwt

import { admin as supabase, lerConfig, type UazapiConfig } from "../_shared/config.ts";
import { interpretarWebhook, linkDaMidia, type MensagemNormalizada } from "../_shared/uazapi.ts";
import { fotoVencida, salvarFotoPerfil } from "../_shared/fotos.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const ok = (msg = "ok") => new Response(msg, { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

  // O secret é gerado e cadastrado na UAZAPI pela tela de Configurações.
  const cfg = await lerConfig();
  const secret = new URL(req.url).searchParams.get("secret");
  if (!cfg?.webhookSecret || secret !== cfg.webhookSecret) {
    return new Response("não autorizado", { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return ok("ignorado: json inválido"); }

  const ev = interpretarWebhook(body);
  // Sempre 200 para eventos ignorados, senão a UAZAPI fica reenviando.
  if (!ev) return ok("ignorado");

  // Atualizações de mensagens que já estão no CRM
  switch (ev.kind) {
    case "status":
      await supabase.rpc("avancar_status", { p_ids: ev.ids, p_status: ev.status });
      return ok();
    case "apagada":
      await supabase.from("mensagens").update({ apagada: true }).in("message_id", ev.ids);
      return ok();
    case "reacao":
      await supabase.rpc("definir_reacao", { p_message_id: ev.alvo, p_autor: ev.o.autor, p_emoji: ev.emoji });
      return ok();
    case "voto":
      await supabase.rpc("definir_voto", { p_message_id: ev.alvo, p_autor: ev.o.autor, p_opcoes: ev.opcoes });
      return ok();
    case "edicao":
      await supabase.from("mensagens").update({ texto: ev.texto, editada_em: new Date().toISOString() })
        .eq("message_id", ev.alvo);
      return ok();
  }

  const m = ev.m;

  // Mesma mensagem reenviada com o texto editado
  if (m.editada && m.texto) {
    const { data } = await supabase.from("mensagens")
      .update({ texto: m.texto, editada_em: new Date().toISOString() })
      .eq("message_id", m.messageId).select("id");
    if (data?.length) return ok();
  }

  // 1) Localiza a conversa pelo chat (qualquer um dos ids dele) ou, só em conversa
  //    individual, pelo telefone da conversa
  let { data: contato } = await supabase
    .from("contatos").select("id, nome, nome_editado, telefone, whatsapp_chatid, bloqueado, foto_path, foto_em")
    .in("whatsapp_chatid", m.idsChat).limit(1).maybeSingle();

  if (!contato && m.telefone && !m.isGroup) {
    // Celular pode estar cadastrado com o 9 e chegar sem ele (ou o contrário).
    ({ data: contato } = await supabase
      .from("contatos").select("id, nome, nome_editado, telefone, whatsapp_chatid, bloqueado, foto_path, foto_em")
      .in("telefone", variantesTelefone(m.telefone)).limit(1).maybeSingle());
  }

  // Contato bloqueado: a mensagem não entra no CRM (200 para a UAZAPI não reenviar).
  if (contato?.bloqueado) return ok("ignorado: contato bloqueado");

  // 2) Cria a conversa nova. Ela só entra no funil quando alguém marca "Novo lead" na conversa.
  if (!contato) {
    const { data: novo, error } = await supabase.from("contatos").insert({
      // Em grupo o nome é o do grupo. Pessoa: nome da agenda do celular conectado; sem ele, o do
      // perfil (que só vale quando foi a pessoa quem escreveu, senão seria o meu nome).
      nome: m.isGroup ? m.nomeContato : m.nomeAgenda ?? (m.fromMe ? null : m.nomeContato),
      telefone: m.telefone,
      whatsapp_chatid: m.chatId,
      origem: "whatsapp",
      is_grupo: m.isGroup,
    }).select("id, nome, nome_editado, telefone, whatsapp_chatid, bloqueado, foto_path, foto_em").single();

    if (error) {
      console.error("erro ao criar contato", error);
      return new Response("erro ao criar contato", { status: 500 }); // UAZAPI tenta de novo
    }
    contato = novo;
  } else {
    // Completa dados que faltavam
    const patch: Record<string, unknown> = {};
    if (!contato.whatsapp_chatid) patch.whatsapp_chatid = m.chatId;
    if (!contato.telefone && m.telefone) patch.telefone = m.telefone;
    if (m.isGroup) {
      // Acompanha quando o grupo é renomeado.
      if (m.nomeContato && m.nomeContato !== contato.nome) patch.nome = m.nomeContato;
    } else if (m.nomeAgenda && !contato.nome_editado && m.idsChat.includes(contato.whatsapp_chatid)) {
      // Acompanha o nome da agenda do celular, a não ser que a equipe tenha trocado no CRM.
      if (m.nomeAgenda !== contato.nome) patch.nome = m.nomeAgenda;
    } else if (!contato.nome && !m.fromMe && m.nomeContato) {
      patch.nome = m.nomeContato;
    }
    if (Object.keys(patch).length) await supabase.from("contatos").update(patch).eq("id", contato.id);
  }

  // Foto de perfil: o link vem junto com a mensagem. Copia se o contato ainda não tem
  // ou se a última está velha (depois da resposta, para não segurar a fila).
  if (m.fotoChat && fotoVencida(contato)) {
    const tarefa = salvarFotoPerfil(contato, m.fotoChat);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(tarefa); else await tarefa;
  }

  // 3) Grava a mensagem (message_id único evita duplicados em reenvios)
  const { data: gravadas, error: errMsg } = await supabase.from("mensagens").upsert({
    contato_id: contato.id,
    direcao: m.fromMe ? "out" : "in",
    tipo: m.tipo,
    texto: m.texto,
    message_id: m.messageId,
    autor_nome: m.fromMe ? null : m.autorNome,
    autor_telefone: m.fromMe ? null : m.autorTelefone,
    status: m.fromMe ? "enviada" : "recebida",
    momento: m.momento.toISOString(),
    resposta_a: m.respostaA,
    midia_mime: m.midia?.mime ?? null,
    midia_nome: m.midia?.nome ?? null,
    midia_tamanho: m.midia?.tamanho ?? null,
    extra: m.extra,
    raw: body,
  }, { onConflict: "message_id", ignoreDuplicates: true }).select("id");

  if (errMsg) {
    console.error("erro ao gravar mensagem", errMsg);
    return new Response("erro ao gravar mensagem", { status: 500 });
  }

  // 4) Mídia: o link da UAZAPI expira em 2 dias, então copia para o Storage.
  //    Roda depois da resposta para não segurar a fila de webhooks.
  if (m.midia && gravadas?.length) {
    const tarefa = copiarMidia(cfg, gravadas[0].id, contato.id, m);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(tarefa); else await tarefa;
  }

  return ok();
});

/**
 * O mesmo celular brasileiro com e sem o nono dígito. O WhatsApp mantém números
 * antigos no formato de 8 dígitos (55 84 9619-7515); no CRM se digita com o 9.
 * Só vale para celular (9 seguido de 6 a 9), como a função telefone_chave do banco.
 */
function variantesTelefone(t: string) {
  const sem9 = t.match(/^55([1-9]\d)([6-9]\d{7})$/);
  if (sem9) return [t, `55${sem9[1]}9${sem9[2]}`];
  const com9 = t.match(/^55([1-9]\d)9([6-9]\d{7})$/);
  if (com9) return [t, `55${com9[1]}${com9[2]}`];
  return [t];
}

function extensao(mime: string, nome: string | null) {
  const doNome = nome?.match(/\.([\w]{1,8})$/)?.[1];
  if (doNome) return doNome.toLowerCase();
  const sub = mime.split("/")[1]?.split(";")[0] ?? "bin";
  return ({ mpeg: "mp3", quicktime: "mov", "x-m4a": "m4a", jpeg: "jpg" } as Record<string, string>)[sub] ?? sub;
}

async function copiarMidia(cfg: UazapiConfig, id: string, contatoId: string, m: MensagemNormalizada) {
  try {
    const { url, mime } = await linkDaMidia(cfg, m.messageId);
    if (!url) throw new Error("UAZAPI não devolveu fileURL");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const arquivo = await res.blob();
    const tipo = (mime ?? res.headers.get("content-type") ?? m.midia?.mime ?? "application/octet-stream").split(";")[0];
    const path = `${contatoId}/${m.messageId.replace(/[^\w-]/g, "")}.${extensao(tipo, m.midia?.nome ?? null)}`;

    const { error } = await supabase.storage.from("whatsapp-midia")
      .upload(path, arquivo, { contentType: tipo, upsert: true });
    if (error) throw error;

    await supabase.from("mensagens")
      .update({ midia_path: path, midia_mime: tipo, midia_tamanho: arquivo.size }).eq("id", id);
  } catch (e) {
    console.error("erro ao copiar mídia", m.messageId, e);
  }
}
