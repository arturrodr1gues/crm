// Tudo que é específico da UAZAPI fica aqui. Se o formato do payload
// mudar, só este arquivo precisa ser ajustado.
// Docs: https://docs.uazapi.com/

import type { UazapiConfig } from "./config.ts";

export type MensagemNormalizada = {
  messageId: string;
  chatId: string;            // id do chat como a UAZAPI entrega
  telefone: string | null;   // só dígitos, quando disponível
  nomeContato: string | null;
  fromMe: boolean;
  isGroup: boolean;
  tipo: "texto" | "imagem" | "audio" | "documento" | "outro";
  texto: string | null;
  momento: Date;
};

const soDigitos = (v: unknown) =>
  typeof v === "string" ? v.replace(/@.*$/, "").replace(/\D/g, "") : "";

const primeiro = (...vals: unknown[]) =>
  vals.find((v) => v !== undefined && v !== null && v !== "");

function tipoDaMensagem(raw: string | undefined): MensagemNormalizada["tipo"] {
  const t = (raw ?? "").toLowerCase();
  if (!t || t.includes("text") || t.includes("conversation")) return "texto";
  if (t.includes("image")) return "imagem";
  if (t.includes("audio") || t.includes("ptt")) return "audio";
  if (t.includes("document")) return "documento";
  return "outro";
}

/**
 * Normaliza o evento de mensagem da UAZAPI. É defensivo de propósito:
 * aceita variações de nome de campo e ignora o que não reconhece.
 * Retorna null para eventos que não são mensagens.
 */
export function normalizarEvento(body: any): MensagemNormalizada | null {
  const evento = String(primeiro(body?.EventType, body?.event, body?.type) ?? "").toLowerCase();
  const msg = body?.message ?? body?.data?.message ?? body?.data ?? null;
  if (!msg || (evento && !evento.includes("message"))) return null;

  const chatId = String(primeiro(msg.chatid, msg.chatId, msg.remoteJid, msg.key?.remoteJid) ?? "");
  if (!chatId) return null;

  const isGroup = Boolean(msg.isGroup) || chatId.endsWith("@g.us");

  // O WhatsApp pode usar ids "@lid" que não são telefone. Só confiamos em
  // campos que sejam número de verdade.
  const candidatosTelefone = [
    msg.sender_pn, msg.senderPn, msg.wa_chatid,
    chatId.endsWith("@s.whatsapp.net") ? chatId : undefined,
    body?.chat?.phone, body?.chat?.wa_chatid,
  ];
  const telefone = candidatosTelefone.map(soDigitos).find((d) => d.length >= 10 && d.length <= 15) ?? null;

  const texto = primeiro(
    msg.text, msg.body, msg.content?.text, msg.content?.caption,
    typeof msg.content === "string" ? msg.content : undefined,
    msg.message?.conversation, msg.message?.extendedTextMessage?.text,
  ) as string | undefined;

  const ts = Number(primeiro(msg.messageTimestamp, msg.timestamp, body?.timestamp) ?? 0);
  const momento = ts > 0 ? new Date(ts > 1e12 ? ts : ts * 1000) : new Date();

  return {
    messageId: String(primeiro(msg.messageid, msg.messageId, msg.id, msg.key?.id) ?? crypto.randomUUID()),
    chatId,
    telefone,
    nomeContato: (primeiro(msg.senderName, msg.pushName, body?.chat?.name, body?.chat?.wa_name) as string) ?? null,
    fromMe: Boolean(primeiro(msg.fromMe, msg.key?.fromMe) ?? false),
    isGroup,
    tipo: tipoDaMensagem(primeiro(msg.messageType, msg.type) as string | undefined),
    texto: texto ?? null,
    momento,
  };
}

export class ErroUazapi extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Chamada genérica à API da instância (header `token`). */
export async function chamar(cfg: UazapiConfig, method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(`${cfg.url.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", token: cfg.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErroUazapi(data?.error ?? data?.message ?? `UAZAPI respondeu ${res.status}`, res.status);
  }
  return data;
}

/** Envia texto pela UAZAPI. `number` pode ser telefone (só dígitos) ou chatid. */
export async function enviarTexto(cfg: UazapiConfig, number: string, text: string) {
  const data = await chamar(cfg, "POST", "/send/text", { number, text });
  const messageId = primeiro(data?.messageid, data?.messageId, data?.id, data?.key?.id) as string | undefined;
  return { messageId: messageId ?? null, raw: data };
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
    events: ["messages"],
    // Mensagens que o próprio CRM envia já são gravadas pelo whatsapp-send.
    excludeMessages: ["wasSentByApi", "isGroupYes"],
  });

export async function lerWebhook(cfg: UazapiConfig) {
  const lista = await chamar(cfg, "GET", "/webhook");
  return (Array.isArray(lista) ? lista : [lista]).filter(Boolean) as
    { id?: string; enabled?: boolean; url?: string; events?: string[] }[];
}
