// Tudo que é específico da UAZAPI fica aqui. Se o formato do payload
// mudar, só este arquivo precisa ser ajustado.
// Docs: https://docs.uazapi.com/

import type { UazapiConfig } from "./config.ts";

export type TipoMensagem =
  | "texto" | "imagem" | "video" | "audio" | "documento" | "figurinha" | "contato" | "enquete" | "outro";

/** Dados comuns a tudo que chega pelo evento `messages`. */
type Origem = {
  messageId: string;
  chatId: string;            // id do chat como a UAZAPI entrega (grupo termina em @g.us)
  idsChat: string[];         // chatId e os outros ids do mesmo chat (telefone e "@lid")
  telefone: string | null;   // só dígitos, quando disponível (sempre null em grupo)
  nomeContato: string | null; // nome da pessoa ou, em grupo, nome do grupo
  nomeAgenda: string | null;  // nome salvo na agenda do número conectado (só conversa individual)
  fotoChat: string | null;    // link (temporário) da foto do chat que veio junto no webhook
  autorNome: string | null;  // só em grupo: quem escreveu
  autorTelefone: string | null;
  autor: string;             // chave de quem agiu (reação/voto): "eu" ou telefone/id do remetente
  fromMe: boolean;
  isGroup: boolean;
  momento: Date;
};

export type MensagemNormalizada = Origem & {
  tipo: TipoMensagem;
  texto: string | null;
  respostaA: string | null;  // message_id da mensagem citada
  midia: { mime: string | null; nome: string | null; tamanho: number | null } | null;
  extra: Record<string, unknown> | null; // contato ou enquete
  editada: boolean;          // a UAZAPI reenviou a mesma mensagem com o texto editado
};

export type StatusRecibo = "entregue" | "lida" | "reproduzida";

export type EventoWhatsApp =
  | { kind: "mensagem"; m: MensagemNormalizada }
  | { kind: "reacao"; o: Origem; alvo: string; emoji: string }
  | { kind: "voto"; o: Origem; alvo: string; opcoes: string[] }
  | { kind: "edicao"; o: Origem; alvo: string; texto: string }
  | { kind: "apagada"; ids: string[] }
  | { kind: "status"; ids: string[]; status: StatusRecibo };

const soDigitos = (v: unknown) =>
  typeof v === "string" ? v.replace(/@.*$/, "").replace(/\D/g, "") : "";

const primeiro = (...vals: unknown[]) =>
  vals.find((v) => v !== undefined && v !== null && v !== "");

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** `content` pode vir como objeto ou como JSON em string. */
function conteudoDe(msg: any): any {
  const c = msg?.content;
  if (c && typeof c === "object") return c;
  if (typeof c === "string" && c.trim().startsWith("{")) {
    try { return JSON.parse(c); } catch { /* texto puro */ }
  }
  return {};
}

function tipoDaMensagem(t: string): TipoMensagem {
  if (!t || t.includes("text") || t.includes("conversation")) return "texto";
  if (t.includes("sticker")) return "figurinha";
  if (t.includes("image")) return "imagem";
  if (t.includes("video") || t.includes("ptv")) return "video";
  if (t.includes("audio") || t.includes("ptt")) return "audio";
  if (t.includes("document")) return "documento";
  if (t.includes("contact")) return "contato";
  if (t.includes("poll")) return "enquete";
  return "outro";
}

/** Telefones de um vCard (prefere o `waid`, que é o número do WhatsApp). */
function telefonesDoVcard(vcard: unknown): string[] {
  if (typeof vcard !== "string") return [];
  const waid = [...vcard.matchAll(/waid=(\d+)/g)].map((x) => x[1]);
  if (waid.length) return [...new Set(waid)];
  return [...new Set([...vcard.matchAll(/TEL[^:\n]*:([+\d\s().-]+)/g)].map((x) => soDigitos(x[1])).filter(Boolean))];
}

/** Voto de enquete: aceita lista de nomes, lista de objetos ou JSON em string. */
function opcoesDoVoto(v: unknown): string[] | null {
  if (v === undefined || v === null || v === "") return null;
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x : primeiro(x?.name, x?.optionName, x?.option)))
      .filter((x): x is string => typeof x === "string");
  }
  if (typeof v === "string") {
    try { return opcoesDoVoto(JSON.parse(v)); } catch { return [v]; }
  }
  if (typeof v === "object") {
    const o = v as any;
    return opcoesDoVoto(primeiro(o.selectedOptions, o.options, o.votes, o.selected) ?? []);
  }
  return null;
}

const ESTADOS: Record<string, StatusRecibo | "apagada"> = {
  delivered: "entregue", read: "lida", played: "reproduzida", deleted: "apagada",
};

/**
 * Interpreta o webhook da UAZAPI. É defensivo de propósito: aceita variações
 * de nome de campo e ignora o que não reconhece. Retorna null para eventos
 * que o CRM não usa.
 */
export function interpretarWebhook(body: any): EventoWhatsApp | null {
  const evento = String(primeiro(body?.EventType, body?.event?.EventType, typeof body?.event === "string" ? body.event : undefined, body?.type) ?? "").toLowerCase();

  // Entrega, leitura e exclusão chegam como atualização de mensagens já existentes.
  if (evento === "messages_update") {
    const ev = body?.event ?? body?.data ?? {};
    const ids = (primeiro(ev.MessageIDs, ev.messageIds, ev.MessageIds) ?? []) as string[];
    const estado = ESTADOS[String(primeiro(body?.state, ev.Type, ev.type) ?? "").toLowerCase()];
    if (!Array.isArray(ids) || !ids.length || !estado) return null;
    return estado === "apagada" ? { kind: "apagada", ids } : { kind: "status", ids, status: estado };
  }

  const msg = body?.message ?? body?.data?.message ?? body?.data ?? null;
  if (!msg || (evento && !evento.includes("message"))) return null;

  const chatId = String(primeiro(msg.chatid, msg.chatId, msg.remoteJid, msg.key?.remoteJid) ?? "");
  if (!chatId) return null;

  const isGroup = Boolean(msg.isGroup || body?.chat?.wa_isGroup) || chatId.endsWith("@g.us");

  // O WhatsApp pode usar ids "@lid" que não são telefone. Só confiamos em
  // campos que sejam número de verdade.
  const telefoneDe = (...vals: unknown[]) =>
    vals.map(soDigitos).find((d) => d.length >= 10 && d.length <= 15) ?? null;

  const sender = typeof msg.sender === "string" ? msg.sender : "";
  const telefoneRemetente = telefoneDe(
    msg.sender_pn, msg.senderPn, sender.endsWith("@s.whatsapp.net") ? sender : undefined,
  );

  const fromMe = Boolean(primeiro(msg.fromMe, msg.key?.fromMe) ?? false);
  const ts = Number(primeiro(msg.messageTimestamp, msg.timestamp, body?.timestamp) ?? 0);

  // Telefone da CONVERSA, não de quem mandou: primeiro o próprio chat. O remetente só vale
  // quando foi a pessoa quem escreveu; em mensagem minha o remetente é o número conectado,
  // e usar ele juntava conversas diferentes no mesmo contato.
  // Em grupo, o telefone de quem escreveu é do participante, não da conversa.
  const telefone = isGroup ? null : telefoneDe(
    chatId.endsWith("@s.whatsapp.net") ? chatId : undefined,
    body?.chat?.wa_chatid, body?.chat?.phone, msg.wa_chatid,
    fromMe ? undefined : msg.sender_pn, fromMe ? undefined : msg.senderPn,
  );

  // O mesmo chat pode chegar com o id de telefone (@s.whatsapp.net) ou o id "@lid".
  const idsChat = [...new Set([chatId, texto(body?.chat?.wa_chatid), texto(body?.chat?.wa_chatlid)]
    .filter((x): x is string => !!x))];

  const o: Origem = {
    messageId: String(primeiro(msg.messageid, msg.messageId, msg.id, msg.key?.id) ?? crypto.randomUUID()),
    chatId,
    idsChat,
    telefone,
    // Pessoa: primeiro o nome da agenda do celular conectado, depois o nome do perfil dela.
    nomeContato: ((isGroup
      ? primeiro(body?.chat?.name, body?.chat?.wa_name, body?.chat?.wa_contactName, msg.groupName)
      : primeiro(body?.chat?.wa_contactName, msg.senderName, msg.pushName, body?.chat?.name, body?.chat?.wa_name)) as string) ?? null,
    nomeAgenda: isGroup ? null : texto(body?.chat?.wa_contactName),
    fotoChat: [body?.chat?.imagePreview, body?.chat?.image]
      .find((u): u is string => typeof u === "string" && u.startsWith("http")) ?? null,
    autorNome: isGroup ? (primeiro(msg.senderName, msg.pushName) as string) ?? telefoneRemetente : null,
    autorTelefone: isGroup ? telefoneRemetente : null,
    autor: fromMe ? "eu" : String(primeiro(telefoneRemetente, telefone, sender, chatId)),
    fromMe,
    isGroup,
    momento: ts > 0 ? new Date(ts > 1e12 ? ts : ts * 1000) : new Date(),
  };

  const t = String(primeiro(msg.messageType, msg.type) ?? "").toLowerCase();
  const c = conteudoDe(msg);
  const chaveDe = (k: any) => texto(primeiro(k?.ID, k?.Id, k?.id));

  // Reação: `reaction` traz o id da mensagem reagida; emoji vazio = reação removida.
  if (t.includes("reaction") || texto(msg.reaction)) {
    const alvo = texto(msg.reaction) ?? chaveDe(c.key ?? c.Key);
    if (!alvo) return null;
    return { kind: "reacao", o, alvo, emoji: String(primeiro(c.text, msg.text) ?? "") };
  }

  // Voto em enquete.
  if (t.includes("pollupdate") || t.includes("pollvote") || texto(msg.vote)) {
    const alvo = chaveDe(c.pollCreationMessageKey ?? c.PollCreationMessageKey) ?? texto(msg.quoted);
    const opcoes = opcoesDoVoto(primeiro(msg.vote, c.vote, c.selectedOptions));
    if (!alvo || !opcoes) return null;
    return { kind: "voto", o, alvo, opcoes };
  }

  // Mensagens de protocolo: apagar para todos (REVOKE = 0) e editar (MESSAGE_EDIT = 14).
  if (t.includes("protocol") || t.includes("revoke") || t.includes("edited")) {
    const alvo = chaveDe(c.key ?? c.Key) ?? (texto(msg.edited) ? o.messageId : null);
    const tipoProto = String(primeiro(c.type, c.Type) ?? "").toUpperCase();
    const editado = c.editedMessage ?? c.EditedMessage;
    if (t.includes("revoke") || tipoProto === "0" || tipoProto === "REVOKE") {
      return alvo ? { kind: "apagada", ids: [alvo] } : null;
    }
    if (editado || t.includes("edited") || tipoProto === "14" || tipoProto === "MESSAGE_EDIT") {
      const novo = texto(primeiro(
        editado?.conversation, editado?.extendedTextMessage?.text, editado?.text,
        editado?.imageMessage?.caption, editado?.videoMessage?.caption, msg.text,
      ));
      return alvo && novo ? { kind: "edicao", o, alvo, texto: novo } : null;
    }
    return null; // outras mensagens de sistema (mensagens temporárias, sincronização etc.)
  }

  const tipo = tipoDaMensagem(t);
  let corpo = texto(primeiro(
    msg.text, msg.body, c.text, c.caption, c.Caption,
    typeof msg.content === "string" && !msg.content.trim().startsWith("{") ? msg.content : undefined,
    msg.message?.conversation, msg.message?.extendedTextMessage?.text,
  ));

  let extra: Record<string, unknown> | null = null;
  if (tipo === "contato") {
    const lista = Array.isArray(c.contacts) ? c.contacts : [c];
    const nome = texto(primeiro(lista[0]?.displayName, lista[0]?.DisplayName, corpo)) ?? "Contato";
    extra = {
      nome: lista.length > 1 ? `${nome} e mais ${lista.length - 1}` : nome,
      telefones: lista.flatMap((x: any) => telefonesDoVcard(primeiro(x?.vcard, x?.Vcard))),
    };
    corpo = extra.nome as string;
  } else if (tipo === "enquete") {
    const opcoes = (Array.isArray(c.options) ? c.options : Array.isArray(c.Options) ? c.Options : [])
      .map((x: any) => (typeof x === "string" ? x : primeiro(x?.optionName, x?.OptionName, x?.name)))
      .filter(Boolean);
    const pergunta = texto(primeiro(c.name, c.Name, corpo)) ?? "Enquete";
    extra = {
      pergunta, opcoes,
      multipla: Number(primeiro(c.selectableOptionsCount, c.SelectableOptionsCount) ?? 1) !== 1,
      votos: {},
    };
    corpo = pergunta;
  }

  const temMidia = ["imagem", "video", "audio", "documento", "figurinha"].includes(tipo);
  const tamanho = Number(primeiro(c.fileLength, c.FileLength, c.size));

  return {
    kind: "mensagem",
    m: {
      ...o,
      tipo,
      texto: corpo,
      respostaA: texto(primeiro(
        msg.quoted, c.contextInfo?.stanzaID, c.contextInfo?.stanzaId, c.ContextInfo?.StanzaID,
      )),
      midia: temMidia
        ? {
          mime: (primeiro(c.mimetype, c.mimeType, c.Mimetype) as string) ?? null,
          nome: (primeiro(c.fileName, c.FileName, c.title) as string) ?? null,
          tamanho: Number.isFinite(tamanho) && tamanho > 0 ? tamanho : null,
        }
        : null,
      extra,
      editada: Boolean(texto(msg.edited)),
    },
  };
}

export class ErroUazapi extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Chamada genérica à API da instância (header `token`). */
export async function chamar(cfg: UazapiConfig, method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(`${cfg.url.replace(/\/$/, "")}${path}`, {
    method,
    headers: body === undefined
      ? { token: cfg.token }
      : { "Content-Type": "application/json", token: cfg.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bruto = await res.text();
  let data: any = {};
  try { data = bruto ? JSON.parse(bruto) : {}; } catch { /* resposta não é JSON */ }
  if (!res.ok) {
    console.warn("UAZAPI", method, path, res.status, bruto.slice(0, 300));
    const motivo = data?.error ?? data?.message ?? (bruto.slice(0, 120) || "sem detalhes");
    throw new ErroUazapi(`HTTP ${res.status}: ${typeof motivo === "string" ? motivo : JSON.stringify(motivo)}`, res.status);
  }
  return data;
}


/** Envia pela UAZAPI e devolve o id curto da mensagem (o mesmo que chega nos recibos). */
async function enviar(cfg: UazapiConfig, path: string, body: Record<string, unknown>) {
  const limpo = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const data = await chamar(cfg, "POST", path, limpo);
  const messageId = primeiro(data?.messageid, data?.messageId, data?.key?.id, data?.id) as string | undefined;
  return { messageId: messageId ?? null, raw: data };
}

/** `number` pode ser telefone (só dígitos) ou chatid. `replyid` responde a uma mensagem. */
export const enviarTexto = (cfg: UazapiConfig, number: string, text: string, replyid?: string | null) =>
  enviar(cfg, "/send/text", { number, text, replyid });

export type TipoMidiaUazapi = "image" | "video" | "document" | "audio" | "ptt" | "sticker";

export const enviarMidia = (cfg: UazapiConfig, number: string, m: {
  type: TipoMidiaUazapi; file: string; text?: string | null; docName?: string | null;
  mimetype?: string | null; replyid?: string | null;
}) => enviar(cfg, "/send/media", { number, ...m });

export const enviarContato = (cfg: UazapiConfig, number: string, fullName: string, telefone: string, replyid?: string | null) =>
  enviar(cfg, "/send/contact", { number, fullName, phoneNumber: telefone, replyid });

export const enviarEnquete = (cfg: UazapiConfig, number: string, pergunta: string, opcoes: string[], multipla: boolean, replyid?: string | null) =>
  enviar(cfg, "/send/menu", {
    number, type: "poll", text: pergunta, choices: opcoes,
    selectableCount: multipla ? opcoes.length : 1, replyid,
  });

/** Emoji vazio remove a reação. */
export const reagir = (cfg: UazapiConfig, id: string, emoji: string) =>
  chamar(cfg, "POST", "/message/react", { id, text: emoji });

export const editarMensagem = (cfg: UazapiConfig, id: string, text: string) =>
  chamar(cfg, "POST", "/message/edit", { id, text });

export const apagarMensagem = (cfg: UazapiConfig, id: string) =>
  chamar(cfg, "POST", "/message/delete", { id });

/** Manda o "visto" (✓✓ azul) para quem escreveu. */
export const marcarLidas = (cfg: UazapiConfig, ids: string[]) =>
  chamar(cfg, "POST", "/message/markread", { id: ids });

/** Link temporário (2 dias) da mídia recebida. Áudio vem em MP3 para tocar em qualquer navegador. */
export async function linkDaMidia(cfg: UazapiConfig, id: string) {
  const data = await chamar(cfg, "POST", "/message/download", { id, generate_mp3: true });
  return {
    url: (primeiro(data?.fileURL, data?.fileUrl, data?.url) as string) ?? null,
    mime: (primeiro(data?.mimetype, data?.mimeType) as string) ?? null,
  };
}


/**
 * Dados do chat no WhatsApp: foto (`imagePreview`/`image`, link temporário),
 * nome salvo na agenda do número conectado (`wa_contactName`) e nome do perfil (`wa_name`).
 */
export async function detalhesChat(cfg: UazapiConfig, number: string) {
  const d = await chamar(cfg, "POST", "/chat/details", { number, preview: true });
  return {
    foto: (primeiro(d?.imagePreview, d?.image) as string) || null,
    nomeAgenda: texto(d?.wa_contactName),
    nomePerfil: texto(d?.wa_name),
    nome: texto(d?.name),
  };
}


export type StatusInstancia = {
  status: "disconnected" | "connecting" | "connected" | "hibernated" | string;
  qrcode: string | null;
  paircode: string | null;
  nomePerfil: string | null;
  numero: string | null;
  fotoPerfil: string | null;
  ultimaDesconexao: string | null;
  motivoDesconexao: string | null;
};

/** GET /instance/status (e o retorno de /instance/connect, que tem o mesmo formato). */
export function lerStatus(data: any): StatusInstancia {
  const inst = data?.instance ?? {};
  const jid = data?.status?.jid ?? data?.jid;
  return {
    status: inst.status ?? (data?.status?.connected ? "connected" : "disconnected"),
    qrcode: inst.qrcode || null,
    paircode: inst.paircode || null,
    nomePerfil: inst.profileName || null,
    numero: (typeof jid === "object" ? jid?.user : soDigitos(jid)) || null,
    fotoPerfil: inst.profilePicUrl || null,
    ultimaDesconexao: inst.lastDisconnect || null,
    motivoDesconexao: inst.lastDisconnectReason || null,
  };
}

export const statusInstancia = async (cfg: UazapiConfig) => lerStatus(await chamar(cfg, "GET", "/instance/status"));

/** Sem `phone` a UAZAPI devolve QR Code; com `phone`, código de pareamento. */
export const conectarInstancia = async (cfg: UazapiConfig, phone?: string) =>
  lerStatus(await chamar(cfg, "POST", "/instance/connect", phone ? { phone } : {}));

export const desconectarInstancia = (cfg: UazapiConfig) => chamar(cfg, "POST", "/instance/disconnect");

/** Webhook no "modo simples" da UAZAPI: um único webhook por instância. */
export const configurarWebhook = (cfg: UazapiConfig, url: string) =>
  chamar(cfg, "POST", "/webhook", {
    enabled: true,
    url,
    events: ["messages", "messages_update"], // mensagens + entrega/leitura/exclusão
    // Mensagens que o próprio CRM envia já são gravadas pelo whatsapp-send.
    excludeMessages: ["wasSentByApi"],
  });

/** O webhook cadastrado ainda serve? (versões antigas excluíam grupos ou não recebiam recibos de leitura) */
export const webhookAtual = (w: { enabled?: boolean; events?: string[]; excludeMessages?: string[] }) =>
  Boolean(w.enabled) &&
  ["messages", "messages_update"].every((e) => (w.events ?? []).includes(e)) &&
  !(w.excludeMessages ?? []).includes("isGroupYes");

export async function lerWebhook(cfg: UazapiConfig) {
  const lista = await chamar(cfg, "GET", "/webhook");
  return (Array.isArray(lista) ? lista : [lista]).filter(Boolean) as
    { id?: string; enabled?: boolean; url?: string; events?: string[]; excludeMessages?: string[] }[];
}
