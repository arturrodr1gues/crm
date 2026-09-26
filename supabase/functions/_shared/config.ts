// Lê a configuração da UAZAPI salva pela tela de Configurações.
// Se ainda não houver nada salvo, usa os secrets antigos (UAZAPI_URL etc.).

import { createClient } from "npm:@supabase/supabase-js@2";

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export type UazapiConfig = { url: string; token: string; webhookSecret: string | null };

export async function lerConfig(): Promise<UazapiConfig | null> {
  const { data } = await admin.from("whatsapp_config")
    .select("uazapi_url, uazapi_token, webhook_secret").maybeSingle();
  if (data) return { url: data.uazapi_url, token: data.uazapi_token, webhookSecret: data.webhook_secret };

  const url = Deno.env.get("UAZAPI_URL");
  const token = Deno.env.get("UAZAPI_TOKEN");
  if (!url || !token) return null;
  return { url, token, webhookSecret: Deno.env.get("WEBHOOK_SECRET") ?? null };
}

/** Endereço público do webhook para cadastrar na UAZAPI. */
export const urlDoWebhook = (secret: string) =>
  `${Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "")}/functions/v1/uazapi-webhook?secret=${secret}`;
