// Tela de Configurações → conexão do WhatsApp pela UAZAPI.
// Chamado pelo front com o JWT do usuário logado (só admins da equipe).
//
// Ações (POST { acao, ... }):
//   status       situação da instância e do webhook
//   salvar       { url, token? } valida na UAZAPI, grava e cadastra o webhook
//   conectar     { telefone? } devolve QR Code (ou código de pareamento com telefone)
//   desconectar  encerra a sessão do WhatsApp
//   webhook      cadastra de novo o webhook na UAZAPI

import { admin, lerConfig, urlDoWebhook, type UazapiConfig } from "../_shared/config.ts";
import {
  configurarWebhook, conectarInstancia, desconectarInstancia, ErroUazapi, lerWebhook, statusInstancia,
} from "../_shared/uazapi.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const mensagemDeErro = (e: unknown) =>
  e instanceof ErroUazapi && e.status === 401
    ? "Token recusado pela UAZAPI. Confira o token da instância."
    : `A UAZAPI não respondeu como esperado: ${(e as Error).message ?? e}`;

async function situacao(cfg: UazapiConfig | null) {
  if (!cfg) return { configurado: false };

  const base = { configurado: true, url: cfg.url, tokenFinal: cfg.token.slice(-4) };
  let instancia = null, erro = null, webhook = null;
  try {
    instancia = await statusInstancia(cfg);
  } catch (e) {
    erro = mensagemDeErro(e);
  }
  if (!erro && cfg.webhookSecret) {
    try {
      const esperado = urlDoWebhook(cfg.webhookSecret);
      const lista = await lerWebhook(cfg);
      const nosso = lista.find((w) => w.url === esperado);
      webhook = { ok: Boolean(nosso?.enabled), outros: lista.filter((w) => w !== nosso).length };
    } catch {
      webhook = { ok: false, outros: 0 };
    }
  }
  return { ...base, instancia, erro, webhook };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método não permitido" }, 405);

  // 1) Só admins da equipe mexem na conexão do WhatsApp
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "sessão inválida" }, 401);

  const { data: membro } = await admin.from("equipe").select("papel").eq("user_id", user.id).maybeSingle();
  if (membro?.papel !== "admin") return json({ error: "Só administradores podem mudar a conexão do WhatsApp." }, 403);

  const body = await req.json().catch(() => ({}));
  const cfg = await lerConfig();

  try {
    switch (body.acao) {
      case "status":
        return json(await situacao(cfg));

      case "salvar": {
        const url = String(body.url ?? "").trim().replace(/\/+$/, "");
        const token = String(body.token ?? "").trim() || cfg?.token || "";
        if (!/^https:\/\/\S+$/.test(url)) {
          return json({ error: "Informe o endereço do servidor, ex.: https://suaconta.uazapi.com" }, 400);
        }
        if (!token) return json({ error: "Informe o token da instância." }, 400);

        // Testa antes de gravar, para não salvar dado errado.
        try {
          await statusInstancia({ url, token, webhookSecret: null });
        } catch (e) {
          return json({ error: mensagemDeErro(e) }, 400);
        }

        const { error } = await admin.from("whatsapp_config")
          .upsert({ id: true, uazapi_url: url, uazapi_token: token }, { onConflict: "id" });
        if (error) throw error;

        const nova = (await lerConfig())!;
        await configurarWebhook(nova, urlDoWebhook(nova.webhookSecret!));
        return json(await situacao(nova));
      }

      case "conectar": {
        if (!cfg) return json({ error: "Salve o servidor e o token primeiro." }, 409);
        const telefone = String(body.telefone ?? "").replace(/\D/g, "");
        if (telefone && (telefone.length < 10 || telefone.length > 15)) {
          return json({ error: "Telefone com DDI e DDD, só números. Ex.: 5584999999999" }, 400);
        }
        try {
          await conectarInstancia(cfg, telefone || undefined);
        } catch (e) {
          // 409 = já existe uma conexão em andamento; seguimos mostrando o status dela.
          if (!(e instanceof ErroUazapi && e.status === 409)) throw e;
        }
        return json(await situacao(cfg));
      }

      case "desconectar":
        if (!cfg) return json({ error: "WhatsApp não configurado." }, 409);
        await desconectarInstancia(cfg);
        return json(await situacao(cfg));

      case "webhook":
        if (!cfg?.webhookSecret) return json({ error: "Salve o servidor e o token primeiro." }, 409);
        await configurarWebhook(cfg, urlDoWebhook(cfg.webhookSecret));
        return json(await situacao(cfg));

      default:
        return json({ error: "ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error("whatsapp-config", e);
    return json({ error: mensagemDeErro(e) }, 502);
  }
});
