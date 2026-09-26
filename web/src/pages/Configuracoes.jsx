import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { BotaoPrimario, BotaoSecundario, Campo, Entrada } from "../components/ui";

// Enquanto o QR Code está na tela, consulta o status até o celular conectar.
const INTERVALO_STATUS_MS = 3000;

async function chamar(acao, extra = {}) {
  const { data, error } = await supabase.functions.invoke("whatsapp-config", { body: { acao, ...extra } });
  if (error) {
    let msg = "Não foi possível falar com o servidor.";
    try { msg = (await error.context.json()).error ?? msg; } catch { /* mantém padrão */ }
    throw new Error(msg);
  }
  return data;
}

export default function Configuracoes() {
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState("");

  async function executar(acao, extra) {
    setOcupado(acao); setErro("");
    try {
      setInfo(await chamar(acao, extra));
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    } finally {
      setOcupado("");
    }
  }

  useEffect(() => { executar("status"); }, []);

  const status = info?.instancia?.status;
  useEffect(() => {
    if (status !== "connecting") return;
    const t = setInterval(() => chamar("status").then(setInfo).catch(() => {}), INTERVALO_STATUS_MS);
    return () => clearInterval(t);
  }, [status]);

  if (!info && !erro) return <div className="p-6 text-tinta-suave">Carregando…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-8">
      <h1 className="text-3xl font-bold mb-4">Configurações</h1>

      {erro && (
        <p role="alert" className="mb-4 rounded-lg bg-alerta/10 text-alerta px-4 py-3 text-sm">{erro}</p>
      )}

      <Servidor info={info} ocupado={ocupado === "salvar"}
        onSalvar={(url, token) => executar("salvar", { url, token })} />

      {info?.configurado && !info.erro && (
        <>
          <Conexao instancia={info.instancia} ocupado={ocupado}
            onConectar={(telefone) => executar("conectar", { telefone })}
            onDesconectar={() => executar("desconectar")} />
          <Webhook webhook={info.webhook} ocupado={ocupado === "webhook"}
            onRefazer={() => executar("webhook")} />
        </>
      )}
    </div>
  );
}

function Cartao({ titulo, children }) {
  return (
    <section className="bg-superficie rounded-2xl border border-linha p-5 mb-5">
      <h2 className="text-lg font-semibold mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

function Servidor({ info, ocupado, onSalvar }) {
  const [editando, setEditando] = useState(!info?.configurado);
  const [url, setUrl] = useState(info?.url ?? "");
  const [token, setToken] = useState("");

  useEffect(() => {
    setEditando(!info?.configurado);
    setUrl(info?.url ?? "");
  }, [info?.configurado, info?.url]);

  async function salvar(e) {
    e.preventDefault();
    if (await onSalvar(url, token)) { setToken(""); setEditando(false); }
  }

  if (!editando) {
    return (
      <Cartao titulo="Servidor UAZAPI">
        <dl className="text-sm space-y-1 mb-4">
          <div className="flex gap-2"><dt className="text-tinta-suave w-16">Servidor</dt><dd className="break-all">{info.url}</dd></div>
          <div className="flex gap-2"><dt className="text-tinta-suave w-16">Token</dt><dd>•••• {info.tokenFinal}</dd></div>
        </dl>
        {info.erro && <p className="text-sm text-alerta mb-4">{info.erro}</p>}
        <BotaoSecundario onClick={() => setEditando(true)}>Alterar</BotaoSecundario>
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Servidor UAZAPI">
      <p className="text-sm text-tinta-suave mb-4">
        Os dois dados ficam no painel da UAZAPI, na sua instância. O token fica guardado só no servidor
        do CRM e não aparece mais depois de salvo.
      </p>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Endereço do servidor" dica="Ex.: https://suaconta.uazapi.com">
          <Entrada type="url" required value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://suaconta.uazapi.com" autoComplete="off" />
        </Campo>
        <Campo rotulo="Token da instância"
          dica={info?.configurado ? "Deixe em branco para manter o token atual." : undefined}>
          <Entrada type="password" required={!info?.configurado} value={token}
            onChange={(e) => setToken(e.target.value)} autoComplete="off"
            placeholder={info?.configurado ? `•••• ${info.tokenFinal}` : ""} />
        </Campo>
        <div className="flex gap-3">
          <BotaoPrimario type="submit" disabled={ocupado}>{ocupado ? "Testando…" : "Salvar e testar"}</BotaoPrimario>
          {info?.configurado && (
            <BotaoSecundario type="button" onClick={() => setEditando(false)}>Cancelar</BotaoSecundario>
          )}
        </div>
      </form>
    </Cartao>
  );
}

const ROTULOS = {
  connected: { texto: "Conectado", cor: "bg-ok" },
  connecting: { texto: "Aguardando o celular", cor: "bg-sol" },
  hibernated: { texto: "Pausado", cor: "bg-tinta-suave" },
  disconnected: { texto: "Desconectado", cor: "bg-alerta" },
};

function Conexao({ instancia, ocupado, onConectar, onDesconectar }) {
  const [porCodigo, setPorCodigo] = useState(false);
  const [telefone, setTelefone] = useState("");
  const rotulo = ROTULOS[instancia?.status] ?? ROTULOS.disconnected;

  function desconectar() {
    if (confirm("Desconectar o WhatsApp do CRM? Para voltar, será preciso ler o QR Code de novo.")) onDesconectar();
  }

  return (
    <Cartao titulo="WhatsApp">
      <p className="flex items-center gap-2 mb-4">
        <span className={`h-2.5 w-2.5 rounded-full ${rotulo.cor}`} />
        <span className="font-medium">{rotulo.texto}</span>
      </p>

      {instancia?.status === "connected" && (
        <>
          <div className="flex items-center gap-3 mb-4">
            {instancia.fotoPerfil && <img src={instancia.fotoPerfil} alt="" className="h-12 w-12 rounded-full" />}
            <div>
              <div className="font-semibold">{instancia.nomePerfil ?? "WhatsApp"}</div>
              {instancia.numero && <div className="text-sm text-tinta-suave">+{instancia.numero}</div>}
            </div>
          </div>
          <BotaoSecundario onClick={desconectar} disabled={ocupado === "desconectar"}>
            {ocupado === "desconectar" ? "Desconectando…" : "Desconectar"}
          </BotaoSecundario>
        </>
      )}

      {instancia?.status === "connecting" && (
        <div>
          {instancia.paircode ? (
            <>
              <p className="text-sm text-tinta-suave mb-2">
                No celular: WhatsApp → Aparelhos conectados → Conectar aparelho →
                Conectar com número de telefone, e digite:
              </p>
              <p className="text-3xl font-bold tracking-widest mb-4">{instancia.paircode}</p>
            </>
          ) : instancia.qrcode ? (
            <>
              <p className="text-sm text-tinta-suave mb-3">
                No celular: WhatsApp → Aparelhos conectados → Conectar aparelho, e aponte para o código.
              </p>
              <img alt="QR Code para conectar o WhatsApp"
                src={instancia.qrcode.startsWith("data:") ? instancia.qrcode : `data:image/png;base64,${instancia.qrcode}`}
                className="w-64 h-64 bg-white p-2 rounded-lg border border-linha mb-4" />
            </>
          ) : (
            <p className="text-sm text-tinta-suave mb-4">Gerando o código…</p>
          )}
          <p className="text-xs text-tinta-suave">A tela atualiza sozinha quando o celular conectar.</p>
        </div>
      )}

      {instancia?.status !== "connected" && instancia?.status !== "connecting" && (
        <div className="space-y-4">
          {instancia?.motivoDesconexao && (
            <p className="text-sm text-tinta-suave">Última desconexão: {instancia.motivoDesconexao}</p>
          )}
          {porCodigo ? (
            <form onSubmit={(e) => { e.preventDefault(); onConectar(telefone); }} className="space-y-4">
              <Campo rotulo="Número do WhatsApp" dica="Com DDI e DDD, só números. Ex.: 5584999999999">
                <Entrada inputMode="numeric" required value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </Campo>
              <div className="flex flex-wrap gap-3">
                <BotaoPrimario type="submit" disabled={ocupado === "conectar"}>
                  {ocupado === "conectar" ? "Gerando…" : "Gerar código"}
                </BotaoPrimario>
                <BotaoSecundario type="button" onClick={() => setPorCodigo(false)}>Usar QR Code</BotaoSecundario>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-3">
              <BotaoPrimario onClick={() => onConectar()} disabled={ocupado === "conectar"}>
                {ocupado === "conectar" ? "Gerando…" : "Conectar com QR Code"}
              </BotaoPrimario>
              <BotaoSecundario onClick={() => setPorCodigo(true)}>Conectar pelo número</BotaoSecundario>
            </div>
          )}
          <p className="text-xs text-tinta-suave">
            A UAZAPI recomenda usar WhatsApp Business: o WhatsApp comum desconecta com mais frequência.
          </p>
        </div>
      )}
    </Cartao>
  );
}

function Webhook({ webhook, ocupado, onRefazer }) {
  return (
    <Cartao titulo="Recebimento de mensagens">
      {webhook?.ok ? (
        <p className="text-sm mb-4">
          <span className="text-ok font-semibold">Ativo.</span> Mensagens que chegam no WhatsApp aparecem em Conversas.
        </p>
      ) : (
        <p className="text-sm mb-4">
          <span className="text-alerta font-semibold">Não configurado.</span> As mensagens recebidas não estão
          chegando ao CRM.
        </p>
      )}
      {webhook?.outros > 0 && (
        <p className="text-xs text-tinta-suave mb-4">
          Há {webhook.outros} outro(s) webhook(s) cadastrado(s) nesta instância da UAZAPI.
        </p>
      )}
      <BotaoSecundario onClick={onRefazer} disabled={ocupado}>
        {ocupado ? "Configurando…" : webhook?.ok ? "Configurar de novo" : "Configurar agora"}
      </BotaoSecundario>
    </Cartao>
  );
}
