// Tudo que é específico da UAZAPI fica aqui. Se o formato do payload
// mudar, só este arquivo precisa ser ajustado.
// Docs: https://docs.uazapi.com/

export const UAZAPI_URL = Deno.env.get("UAZAPI_URL")!;     // ex.: https://suaconta.uazapi.com
export const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN")!; // token da instância

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

/** Envia texto pela UAZAPI. `number` pode ser telefone (só dígitos) ou chatid. */
export async function enviarTexto(number: string, text: string) {
  const res = await fetch(`${UAZAPI_URL.replace(/\/$/, "")}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({ number, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? data?.message ?? `UAZAPI respondeu ${res.status}`);
  }
  const messageId = primeiro(data?.messageid, data?.messageId, data?.id, data?.key?.id) as string | undefined;
  return { messageId: messageId ?? null, raw: data };
}
