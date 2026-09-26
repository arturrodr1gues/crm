import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { dataCurta, formatarTelefone, nomeOuTelefone } from "../lib/format";
import { tamanhoLegivel, useUrlMidia } from "../lib/whatsapp";
import { IconeDoc } from "./chat/Icones";
import VisualizadorMidia from "./VisualizadorMidia";

const LINK = /https?:\/\/[^\s<>"')]+/gi;

/**
 * Dados da conversa, como no WhatsApp: contato, ficha do cliente (passada em `children`),
 * mídia, arquivos e links trocados. Em grupo, mostra também quem já escreveu.
 */
export default function DetalhesConversa({ contato, children }) {
  const [aba, setAba] = useState("midia");
  const [midias, setMidias] = useState(null);
  const [arquivos, setArquivos] = useState(null);
  const [links, setLinks] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [aberta, setAberta] = useState(null); // índice da mídia no visualizador

  useEffect(() => {
    let ativo = true;
    const base = (colunas) => supabase.from("mensagens").select(colunas)
      .eq("contato_id", contato.id).eq("apagada", false).order("momento", { ascending: false });

    async function carregar() {
      const colunas = "id, tipo, texto, midia_path, midia_nome, midia_tamanho, midia_mime, momento, direcao";
      const [m, a, l, p] = await Promise.all([
        base(colunas).in("tipo", ["imagem", "video"]).not("midia_path", "is", null).limit(90),
        base(colunas).eq("tipo", "documento").not("midia_path", "is", null).limit(60),
        base("id, texto, momento, direcao").ilike("texto", "%http%").limit(100),
        contato.is_grupo
          ? base("autor_nome, autor_telefone").eq("direcao", "in").limit(1000)
          : Promise.resolve({ data: [] }),
      ]);
      if (!ativo) return;
      setMidias(m.data ?? []);
      setArquivos(a.data ?? []);
      setLinks((l.data ?? []).flatMap((x) => (x.texto.match(LINK) ?? []).map((url, i) => ({ id: `${x.id}-${i}`, url, momento: x.momento }))));
      const porAutor = new Map();
      for (const x of p.data ?? []) {
        const chave = x.autor_telefone || x.autor_nome;
        if (!chave) continue;
        const atual = porAutor.get(chave) ?? { nome: x.autor_nome, telefone: x.autor_telefone, total: 0 };
        atual.total += 1;
        porAutor.set(chave, atual);
      }
      setParticipantes([...porAutor.values()].sort((x, y) => y.total - x.total));
    }

    carregar();
    // Atualiza quando chega mensagem nova ou uma mídia termina de baixar.
    let espera;
    const canal = supabase.channel(`detalhes-${contato.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensagens", filter: `contato_id=eq.${contato.id}` },
        () => { clearTimeout(espera); espera = setTimeout(carregar, 800); })
      .subscribe();
    return () => { ativo = false; clearTimeout(espera); supabase.removeChannel(canal); };
  }, [contato.id]);

  const abas = [
    { id: "midia", nome: "Mídia", n: midias?.length },
    { id: "arquivos", nome: "Arquivos", n: arquivos?.length },
    { id: "links", nome: "Links", n: links?.length },
  ];

  return (
    <div className="bg-fundo min-h-full">
      <section className="bg-superficie px-4 pt-6 pb-5 text-center border-b border-linha">
        <div className={`mx-auto h-20 w-20 rounded-full grid place-items-center text-3xl font-semibold ${
          contato.is_grupo ? "bg-linha text-tinta" : "bg-tinta text-white"}`}>
          {contato.is_grupo ? "👥" : (contato.nome || "?").trim().charAt(0).toUpperCase()}
        </div>
        <h2 className="mt-3 text-lg font-semibold break-words">{contato.is_grupo ? contato.nome || "Grupo sem nome" : nomeOuTelefone(contato)}</h2>
        <p className="text-sm text-tinta-suave">
          {contato.is_grupo ? "Grupo do WhatsApp" : formatarTelefone(contato.telefone) || "Sem telefone"}
        </p>
        {!contato.is_grupo && contato.telefone && (
          <div className="mt-4 flex justify-center gap-2">
            <a href={`https://wa.me/${contato.telefone}`} target="_blank" rel="noreferrer"
              className="h-9 px-3 rounded-lg border border-linha text-sm font-medium grid place-items-center">Abrir no WhatsApp</a>
          </div>
        )}
      </section>

      {/* Ficha do cliente (venda, agenda, dados, indicações) entra aqui, entre o contato e as mídias */}
      {children}

      <section className="bg-superficie mt-2 border-y border-linha">
        <div role="tablist" className="grid grid-cols-3 border-b border-linha">
          {abas.map((a) => (
            <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
              className={`h-10 text-sm font-medium border-b-2 ${aba === a.id ? "border-sol text-tinta" : "border-transparent text-tinta-suave"}`}>
              {a.nome}{a.n ? <span className="ml-1 text-xs text-tinta-suave">{a.n}</span> : null}
            </button>
          ))}
        </div>

        <div className="p-2">
          {aba === "midia" && (midias === null ? <Carregando /> : midias.length === 0 ? <Vazio>Nenhuma foto ou vídeo ainda.</Vazio> : (
            <div className="grid grid-cols-3 gap-1">
              {midias.map((m, i) => <Miniatura key={m.id} m={m} onClick={() => setAberta(i)} />)}
            </div>
          ))}

          {aba === "arquivos" && (arquivos === null ? <Carregando /> : arquivos.length === 0 ? <Vazio>Nenhum arquivo ainda.</Vazio> : (
            <ul className="divide-y divide-linha">{arquivos.map((a) => <Arquivo key={a.id} a={a} />)}</ul>
          ))}

          {aba === "links" && (links === null ? <Carregando /> : links.length === 0 ? <Vazio>Nenhum link ainda.</Vazio> : (
            <ul className="divide-y divide-linha">
              {links.map((l) => (
                <li key={l.id} className="px-2 py-2">
                  <a href={l.url} target="_blank" rel="noreferrer" className="block text-sm text-sky-700 underline truncate">{l.url}</a>
                  <span className="text-[11px] text-tinta-suave">{dataCurta(l.momento)}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      {contato.is_grupo && participantes.length > 0 && (
        <section className="bg-superficie mt-2 border-y border-linha">
          <h3 className="px-4 pt-3 pb-1 text-sm font-semibold">Quem já escreveu <span className="text-tinta-suave font-normal">{participantes.length}</span></h3>
          <ul className="divide-y divide-linha">
            {participantes.map((p) => (
              <li key={p.telefone || p.nome} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.nome || formatarTelefone(p.telefone)}</span>
                  {p.nome && p.telefone && <span className="block text-xs text-tinta-suave">{formatarTelefone(p.telefone)}</span>}
                </span>
                <span className="text-xs text-tinta-suave shrink-0">{p.total} {p.total === 1 ? "mensagem" : "mensagens"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {aberta !== null && midias?.[aberta] && (
        <VisualizadorMidia itens={midias} indice={aberta} onMudar={setAberta} onFechar={() => setAberta(null)} />
      )}
    </div>
  );
}

const Carregando = () => <p className="text-sm text-tinta-suave p-3">Carregando…</p>;
const Vazio = ({ children }) => <p className="text-sm text-tinta-suave p-3 text-center">{children}</p>;

function Miniatura({ m, onClick }) {
  const url = useUrlMidia(m.midia_path);
  return (
    <button type="button" onClick={onClick} aria-label={m.tipo === "video" ? "Abrir vídeo" : "Abrir foto"}
      className="relative aspect-square overflow-hidden rounded-md bg-linha">
      {url && (m.tipo === "video"
        ? <video src={`${url}#t=0.1`} muted preload="metadata" playsInline className="w-full h-full object-cover pointer-events-none" />
        : <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />)}
      {m.tipo === "video" && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="h-8 w-8 rounded-full bg-black/50 text-white grid place-items-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
          </span>
        </span>
      )}
    </button>
  );
}

function Arquivo({ a }) {
  const url = useUrlMidia(a.midia_path, a.midia_nome || "arquivo");
  return (
    <li>
      <a href={url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-2 py-2 hover:bg-fundo rounded-md">
        <IconeDoc className="w-7 h-7 shrink-0 text-tinta-suave" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{a.midia_nome || "Arquivo"}</span>
          <span className="block text-[11px] text-tinta-suave">
            {[tamanhoLegivel(a.midia_tamanho), dataCurta(a.momento), a.direcao === "out" ? "enviado" : "recebido"].filter(Boolean).join(" · ")}
          </span>
        </span>
      </a>
    </li>
  );
}
