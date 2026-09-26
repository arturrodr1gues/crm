import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useUrlMidia } from "../../lib/whatsapp";
import { CATEGORIAS_EMOJI, emojisRecentes, guardarRecente } from "../../lib/emojis";

/**
 * Emojis por categoria, com os recentes no topo. Com `onFigurinha`, mostra também
 * a aba de figurinhas (as últimas recebidas ou enviadas, para reaproveitar).
 */
export default function PainelEmoji({ onEmoji, onFigurinha }) {
  const [aba, setAba] = useState(() => (emojisRecentes().length ? "recentes" : CATEGORIAS_EMOJI[0].nome));
  const recentes = emojisRecentes();

  const escolher = (e) => { guardarRecente(e); onEmoji(e); };
  const lista = aba === "recentes" ? recentes : CATEGORIAS_EMOJI.find((c) => c.nome === aba)?.emojis ?? [];

  const abas = [
    ...(recentes.length ? [{ nome: "recentes", icone: "🕘", rotulo: "Recentes" }] : []),
    ...CATEGORIAS_EMOJI.map((c) => ({ ...c, rotulo: c.nome })),
    ...(onFigurinha ? [{ nome: "figurinhas", icone: "💟", rotulo: "Figurinhas" }] : []),
  ];

  return (
    <div className="bg-superficie">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-linha px-1">
        {abas.map((a) => (
          <button key={a.nome} type="button" role="tab" aria-selected={aba === a.nome} title={a.rotulo}
            onClick={() => setAba(a.nome)}
            className={`shrink-0 h-10 w-10 text-xl border-b-2 ${aba === a.nome ? "border-sol" : "border-transparent opacity-70"}`}>
            {a.icone}
          </button>
        ))}
      </div>
      <div className="h-56 overflow-y-auto p-1">
        {aba === "figurinhas" ? <Figurinhas onEscolher={onFigurinha} /> : (
          <div className="grid grid-cols-8 md:grid-cols-10">
            {lista.map((e) => (
              <button key={e} type="button" onClick={() => escolher(e)} className="h-10 text-2xl rounded-lg hover:bg-fundo">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Figurinhas({ onEscolher }) {
  const [lista, setLista] = useState(null);

  useEffect(() => {
    supabase.from("mensagens").select("midia_path").eq("tipo", "figurinha").not("midia_path", "is", null)
      .order("momento", { ascending: false }).limit(80)
      .then(({ data }) => setLista([...new Set((data ?? []).map((x) => x.midia_path))].slice(0, 30)));
  }, []);

  if (!lista) return <p className="text-sm text-tinta-suave p-3">Carregando…</p>;
  if (!lista.length) {
    return <p className="text-sm text-tinta-suave p-3">As figurinhas que você receber aparecem aqui. Para mandar uma imagem como figurinha, use o clipe → Figurinha.</p>;
  }
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-1">
      {lista.map((p) => <MiniFigurinha key={p} path={p} onClick={() => onEscolher(p)} />)}
    </div>
  );
}

function MiniFigurinha({ path, onClick }) {
  const url = useUrlMidia(path);
  return (
    <button type="button" onClick={onClick} className="aspect-square rounded-lg hover:bg-fundo p-1" aria-label="Enviar figurinha">
      {url && <img src={url} alt="" loading="lazy" className="w-full h-full object-contain" />}
    </button>
  );
}
