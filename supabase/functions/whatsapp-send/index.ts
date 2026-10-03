// Tudo que o CRM faz no WhatsApp a partir do chat. Chamado pelo front com o JWT do usuário logado.
//
// Mensagens novas (acao):  texto · midia · contato · enquete
// Sobre uma mensagem já existente:  reagir · editar · apagar · votar (enquete)
// Conversa:  marcar_lidas (manda o "visto" para quem escreveu)
// Contatos:  atualizar_contatos (foto de perfil de até 10 contatos por vez)
// Conexão:   verificar_conexao (confere se o WhatsApp está no ar)

import { admin, lerConfig, type UazapiConfig } from "../_shared/config.ts";
import { fotoDoUltimoWebhook, salvarFotoPerfil } from "../_shared/fotos.ts";
import { erroDeDesconexao, estadoDe, registrarConexao } from "../_shared/conexao.ts";
import {
  apagarMensagem, detalhesChat, editarMensagem, enviarContato, enviarEnquete, enviarMidia, enviarTexto,
  marcarLidas, reagir, statusInstancia, type TipoMidiaUazapi,
} from "../_shared/uazapi.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Intervalo mínimo entre envios pela API. Ajuda a não parecer robô.
const INTERVALO_MIN_MS = 4000;
// O WhatsApp só deixa editar mensagem por 15 minutos.
const PRAZO_EDICAO_MS = 15 * 60 * 1000;

const TIPOS_MIDIA: Record<string, TipoMidiaUazapi> = {
  imagem: "image", video: "video", documento: "document", audio: "audio", figurinha: "sticker",
};

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

class ErroEntrada extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);

  // 1) Quem está pedindo? Precisa ser da equipe.
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "sessão inválida" }, 401);

  const { data: membro } = await admin.from("equipe").select("user_id, leitura_silenciosa").eq("user_id", user.id).maybeSingle();
  if (!membro) return json({ error: "sem permissão" }, 403);

  const body = await req.json().catch(() => ({}));
  const acao = body.acao ?? "texto";

  const cfg = await lerConfig();
  if (!cfg) return json({ error: "WhatsApp ainda não configurado. Vá em Configurações." }, 409);

  try {
    if (["reagir", "editar", "apagar", "votar"].includes(acao)) return json(await sobreMensagem(cfg, acao, body));
    if (acao === "marcar_lidas") {
      // Login de leitura silenciosa só acompanha: não manda o "visto".
      if (membro.leitura_silenciosa) return json({ marcadas: 0 });
      return json(await marcarConversaLida(cfg, body.contato_id));
    }
    if (acao === "atualizar_contatos") return json(await atualizarContatos(cfg, body.ids));
    if (acao === "verificar_conexao") return json(await verificarConexao(cfg));
    return await novaMensagem(cfg, user.id, acao, body);
  } catch (e) {
    if (e instanceof ErroEntrada) return json({ error: e.message }, e.status);
    if (erroDeDesconexao(e)) await registrarConexao("offline", "envio", { motivo: (e as Error).message });
    console.error(acao, e);
    return json({ error: "A UAZAPI recusou o pedido. Verifique se o WhatsApp está conectado." }, 502);
  }
});

// ---------------------------------------------------------------------
// Mensagens novas
// ---------------------------------------------------------------------

async function novaMensagem(cfg: UazapiConfig, userId: string, acao: string, body: any) {
  const { data: contato } = await admin.from("contatos")
    .select("id, telefone, whatsapp_chatid, consentimento_lgpd, is_grupo, bloqueado").eq("id", body.contato_id ?? "").maybeSingle();
  if (!contato) throw new ErroEntrada("contato não encontrado", 404);
  if (contato.bloqueado) throw new ErroEntrada("Contato bloqueado. Desbloqueie para voltar a conversar.", 409);

  const destino = contato.whatsapp_chatid ?? contato.telefone;
  if (!destino) throw new ErroEntrada("contato sem WhatsApp cadastrado");

  const respostaA = str(body.resposta_a, 200) || null;

  // Monta o envio e o registro de cada tipo
  let registro: Record<string, unknown>;
  let envio: () => Promise<{ messageId: string | null; raw: unknown }>;

  switch (acao) {
    case "texto": {
      const texto = str(body.texto);
      if (!texto) throw new ErroEntrada("escreva a mensagem");
      registro = { tipo: "texto", texto };
      envio = () => enviarTexto(cfg, destino, texto, respostaA);
      break;
    }
    case "midia": {
      const tipo = str(body.tipo, 20);
      const path = str(body.path, 500);
      if (!TIPOS_MIDIA[tipo]) throw new ErroEntrada("tipo de mídia inválido");
      // O arquivo já está no Storage: enviado agora pelo navegador ou, no caso de
      // figurinha, reaproveitado de outra conversa.
      if (!path || path.includes("..")) throw new ErroEntrada("arquivo inválido");
      const { data: link, error } = await admin.storage.from("whatsapp-midia").createSignedUrl(path, 600);
      if (error || !link) throw new ErroEntrada("arquivo não encontrado");

      const legenda = str(body.legenda) || null;
      const nome = str(body.nome, 200) || null;
      const mime = str(body.mime, 100) || null;
      registro = {
        tipo, texto: tipo === "audio" || tipo === "figurinha" ? null : legenda,
        midia_path: path, midia_mime: mime, midia_nome: nome,
        midia_tamanho: Number(body.tamanho) || null,
      };
      envio = () => enviarMidia(cfg, destino, {
        type: tipo === "audio" && body.voz ? "ptt" : TIPOS_MIDIA[tipo],
        file: link.signedUrl,
        text: registro.texto as string | null,
        docName: tipo === "documento" ? nome : null,
        mimetype: tipo === "documento" ? mime : null,
        replyid: respostaA,
      });
      break;
    }
    case "contato": {
      const nome = str(body.nome, 120);
      const telefone = str(body.telefone, 20).replace(/\D/g, "");
      if (!nome || telefone.length < 10) throw new ErroEntrada("informe nome e telefone com DDD");
      registro = { tipo: "contato", texto: nome, extra: { nome, telefones: [telefone] } };
      envio = () => enviarContato(cfg, destino, nome, telefone, respostaA);
      break;
    }
    case "enquete": {
      const pergunta = str(body.pergunta, 255);
      const opcoes = [...new Set((Array.isArray(body.opcoes) ? body.opcoes : []).map((o: unknown) => str(o, 100)).filter(Boolean))] as string[];
      if (!pergunta || opcoes.length < 2 || opcoes.length > 12) throw new ErroEntrada("a enquete precisa de pergunta e de 2 a 12 opções");
      const multipla = Boolean(body.multipla);
      registro = { tipo: "enquete", texto: pergunta, extra: { pergunta, opcoes, multipla, votos: {} } };
      envio = () => enviarEnquete(cfg, destino, pergunta, opcoes, multipla, respostaA);
      break;
    }
    default:
      throw new ErroEntrada("ação desconhecida");
  }

  // 3) Proteção do número: só puxa conversa com quem já falou com você
  //    ou autorizou contato (consentimento). Nada de mensagem fria pela API.
  //    Grupo não entra nessa regra: você já participa dele (o id @g.us vai no `number`).
  if (!contato.consentimento_lgpd && !contato.is_grupo) {
    const { count } = await admin.from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("contato_id", contato.id).eq("direcao", "in");
    if (!count) {
      throw new ErroEntrada(
        "Esse contato ainda não falou com você. Marque que ele autorizou o contato antes de enviar pelo CRM.", 409);
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
  const base = { ...registro, contato_id: contato.id, direcao: "out", resposta_a: respostaA, enviado_por: userId };
  try {
    const { messageId, raw } = await envio();
    const { data: gravada, error } = await admin.from("mensagens").upsert({
      ...base,
      message_id: messageId ?? `api-${crypto.randomUUID()}`,
      status: "enviada",
      raw,
    }, { onConflict: "message_id" }).select().single();
    if (error) throw error;
    return json({ mensagem: gravada });
  } catch (e) {
    if (erroDeDesconexao(e)) await registrarConexao("offline", "envio", { motivo: (e as Error).message });
    await admin.from("mensagens").insert({ ...base, status: "falhou", erro: String((e as Error).message ?? e) });
    return json({ error: "Não foi possível enviar. Verifique se o WhatsApp está conectado na UAZAPI." }, 502);
  }
}

// ---------------------------------------------------------------------
// Reagir, editar, apagar e votar
// ---------------------------------------------------------------------

async function sobreMensagem(cfg: UazapiConfig, acao: string, body: any) {
  const { data: msg } = await admin.from("mensagens")
    .select("id, contato_id, message_id, direcao, tipo, momento, status, apagada, extra").eq("id", body.mensagem_id ?? "").maybeSingle();
  if (!msg) throw new ErroEntrada("mensagem não encontrada", 404);
  if (!msg.message_id || msg.message_id.startsWith("api-") || msg.status === "falhou") {
    throw new ErroEntrada("essa mensagem não chegou ao WhatsApp");
  }
  if (msg.apagada) throw new ErroEntrada("essa mensagem foi apagada");

  switch (acao) {
    case "reagir": {
      const emoji = str(body.emoji, 16);
      await reagir(cfg, msg.message_id, emoji);
      await admin.rpc("definir_reacao", { p_message_id: msg.message_id, p_autor: "eu", p_emoji: emoji });
      break;
    }
    case "editar": {
      const texto = str(body.texto);
      if (!texto) throw new ErroEntrada("escreva o novo texto");
      if (msg.direcao !== "out" || msg.tipo !== "texto") throw new ErroEntrada("só dá para editar texto que você enviou");
      if (Date.now() - new Date(msg.momento).getTime() > PRAZO_EDICAO_MS) {
        throw new ErroEntrada("o WhatsApp só permite editar nos primeiros 15 minutos");
      }
      await editarMensagem(cfg, msg.message_id, texto);
      await admin.from("mensagens").update({ texto, editada_em: new Date().toISOString() }).eq("id", msg.id);
      break;
    }
    case "apagar": {
      if (msg.direcao !== "out") throw new ErroEntrada("só dá para apagar para todos o que você enviou");
      await apagarMensagem(cfg, msg.message_id);
      await admin.from("mensagens").update({ apagada: true }).eq("id", msg.id);
      break;
    }
    case "votar": {
      // A UAZAPI vota respondendo à enquete com ">N" (posição da opção, a partir de 1).
      // Pela API pública vai uma opção por voto; um voto novo substitui o anterior.
      if (msg.tipo !== "enquete") throw new ErroEntrada("essa mensagem não é uma enquete");
      const opcao = str(body.opcao, 100);
      const posicao = ((msg.extra?.opcoes ?? []) as string[]).indexOf(opcao) + 1;
      if (!posicao) throw new ErroEntrada("opção inválida");
      const { data: contato } = await admin.from("contatos")
        .select("telefone, whatsapp_chatid").eq("id", msg.contato_id).single();
      const destino = contato?.whatsapp_chatid ?? contato?.telefone;
      if (!destino) throw new ErroEntrada("contato sem WhatsApp cadastrado");
      await enviarTexto(cfg, destino, `>${posicao}`, msg.message_id);
      await admin.rpc("definir_voto", { p_message_id: msg.message_id, p_autor: "eu", p_opcoes: [opcao] });
      break;
    }
  }

  const { data: atual } = await admin.from("mensagens").select().eq("id", msg.id).single();
  return { mensagem: atual };
}

// ---------------------------------------------------------------------
// Foto de perfil e nome da agenda: a lista de conversas pede para os contatos que
// estão na tela (10 por vez). O link da foto expira, então ela é copiada para o Storage.
// ---------------------------------------------------------------------

const MAX_CONTATOS = 10;

async function atualizarContatos(cfg: UazapiConfig, ids: unknown) {
  const lista = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string").slice(0, MAX_CONTATOS);
  if (!lista.length) return { atualizados: 0 };
  const { data: contatos } = await admin.from("contatos")
    .select("id, nome, nome_editado, is_grupo, telefone, whatsapp_chatid, bloqueado, foto_path").in("id", lista);

  const feitos = await Promise.all((contatos ?? []).filter((c) => !c.bloqueado).map(async (c) => {
    const numero = c.whatsapp_chatid ?? c.telefone;
    if (!numero) return false;
    try {
      const d = await detalhesChat(cfg, numero);
      // Nome igual ao da agenda do celular conectado (se a equipe não trocou no CRM)
      const extra = !c.is_grupo && !c.nome_editado && d.nomeAgenda && d.nomeAgenda !== c.nome ? { nome: d.nomeAgenda } : {};
      return await salvarFotoPerfil(c, d.foto, extra);
    } catch (e) {
      // WhatsApp fora do ar (ex.: desconectado): usa o link que veio no último webhook desse chat.
      // Se nem isso der, o contato não é marcado e tenta de novo na próxima vez.
      console.warn("foto de perfil: chat/details", c.id, e);
      const url = await fotoDoUltimoWebhook(c.id, c.whatsapp_chatid);
      return url ? await salvarFotoPerfil(c, url) : false;
    }
  }));
  return { atualizados: feitos.filter(Boolean).length };
}

// ---------------------------------------------------------------------
// Conexão: a bolinha de Conversas pede de tempos em tempos para conferir se o
// WhatsApp está no ar. Qualquer pessoa da equipe pode (Ajustes é só para admin).
// ---------------------------------------------------------------------

async function verificarConexao(cfg: UazapiConfig) {
  try {
    const s = await statusInstancia(cfg);
    const estado = estadoDe(s.status);
    await registrarConexao(estado, "verificacao", { motivo: s.motivoDesconexao, momento: s.ultimaDesconexao });
    return { estado };
  } catch (e) {
    await registrarConexao("offline", "verificacao", { motivo: (e as Error).message });
    return { estado: "offline" };
  }
}

// ---------------------------------------------------------------------
// Visto: marca como lidas as mensagens recebidas que ainda não foram vistas
// ---------------------------------------------------------------------

async function marcarConversaLida(cfg: UazapiConfig, contatoId: unknown) {
  const { data: pendentes } = await admin.from("mensagens")
    .select("id, message_id").eq("contato_id", contatoId ?? "").eq("direcao", "in").eq("status", "recebida")
    .not("message_id", "is", null).order("momento", { ascending: false }).limit(50);
  if (!pendentes?.length) return { marcadas: 0 };

  await marcarLidas(cfg, pendentes.map((m) => m.message_id));
  await admin.from("mensagens").update({ status: "lida" }).in("id", pendentes.map((m) => m.id));
  return { marcadas: pendentes.length };
}
