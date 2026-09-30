import { useRef, useState } from "react";
import { useUrlMidia } from "../../lib/whatsapp";
import { removerFigurinha, subirFigurinha, useFigurinhasSalvas } from "../../lib/figurinhas";
import { CATEGORIAS_EMOJI, emojisRecentes, guardarRecente } from "../../lib/emojis";
import { EsqueletoMiniaturas, Osso } from "../Esqueletos";

/**
 * Emojis por categoria, com os recentes no topo. Com `onFigurinha`, mostra também
 * a aba das figurinhas salvas pela equipe. `abaInicial="figurinhas"` abre direto nela.
 * Com `onFechar`, mostra o × no fim da barra de abas.
 */
export default function PainelEmoji({ onEmoji, onFigurinha, abaInicial, onFechar }) {
  const [aba, setAba] = useState(() => abaInicial ?? (emojisRecentes().length ? "recentes" : CATEGORIAS_EMOJI[0].nome));
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
        {onFechar && (
          <button type="button" onClick={onFechar} aria-label="Fechar" title="Fechar (Esc)"
            className="ml-auto sticky right-0 shrink-0 h-10 w-10 grid place-items-center text-xl text-tinta-suave bg-superficie hover:text-tinta">×</button>
        )}
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

// Figurinhas salvas: clicar envia; o × tira da lista; "+" sobe uma imagem do computador.
function Figurinhas({ onEscolher }) {
  const lista = useFigurinhasSalvas();
  const [erro, setErro] = useState("");
  const [subindo, setSubindo] = useState(false);
  const entrada = useRef(null);

  async function subir(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErro(""); setSubindo(true);
    try { await subirFigurinha(f); } catch (x) { setErro(x.message); }
    setSubindo(false);
  }
  async function remover(f) {
    setErro("");
    try { await removerFigurinha(f); } catch (x) { setErro(x.message); }
  }

  if (!lista) return <div className="p-3"><EsqueletoMiniaturas colunas="grid-cols-6" n={18} /></div>;
  return (
    <div>
      {erro && <p className="text-alerta text-xs px-2 pb-1">{erro}</p>}
      <div className="grid grid-cols-4 md:grid-cols-6 gap-1">
        <button type="button" onClick={() => entrada.current.click()} disabled={subindo}
          title="Adicionar figurinha do computador"
          className="aspect-square rounded-lg border-2 border-dashed border-linha text-tinta-suave hover:border-sol hover:text-tinta grid place-items-center text-center text-[11px] leading-tight p-1">
          {subindo ? "Subindo…" : <span><span className="block text-2xl font-light leading-none">+</span>Adicionar</span>}
        </button>
        {lista.map((f) => (
          <MiniFigurinha key={f.id} path={f.midia_path} onClick={() => onEscolher(f.midia_path, f.mime)} onRemover={() => remover(f)} />
        ))}
      </div>
      {!lista.length && (
        <p className="text-sm text-tinta-suave p-2">
          Nenhuma figurinha salva. Toque numa figurinha recebida e escolha "Salvar figurinha", ou use o + para subir uma imagem.
        </p>
      )}
      <input ref={entrada} type="file" accept="image/webp,image/png,image/jpeg,image/gif" hidden onChange={subir} />
    </div>
  );
}

function MiniFigurinha({ path, onClick, onRemover }) {
  const url = useUrlMidia(path);
  return (
    <div className="group relative aspect-square">
      <button type="button" onClick={onClick} className="w-full h-full rounded-lg hover:bg-fundo p-1" aria-label="Enviar figurinha">
        {url ? <img src={url} alt="" loading="lazy" className="w-full h-full object-contain" /> : <Osso raio="rounded-lg" className="w-full h-full" />}
      </button>
      <button type="button" onClick={onRemover} aria-label="Remover das salvas" title="Remover das salvas"
        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-tinta/70 text-white text-xs leading-none grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100">
        ×
      </button>
    </div>
  );
}
