// Skeleton screens: a prévia da página enquanto o conteúdo carrega, no mesmo
// formato do que vai aparecer (cabeçalho, cards, linhas), para a tela não "pular".

/** Um bloco cinza com brilho. `redondo` para fotos e selos; `raio` troca o arredondamento. */
export function Osso({ className = "", redondo = false, raio = "rounded-md", style }) {
  return <span aria-hidden="true" style={style} className={`osso ${redondo ? "rounded-full" : raio} ${className}`} />;
}

/** Envolve o skeleton e avisa leitores de tela que a página está carregando. */
function Carregando({ className = "", children }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Carregando…</span>
      {children}
    </div>
  );
}

const Cartao = ({ className = "", children }) => (
  <div className={`bg-superficie rounded-2xl border border-linha ${className}`}>{children}</div>
);

const repetir = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// Larguras variadas para parecer texto de verdade
const LARGURAS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5", "w-3/5"];

/** Linhas com foto redonda, título e subtítulo (listas de contatos, mensagens rápidas etc.). */
export function EsqueletoLinhas({ n = 4, foto = true, lado = false, className = "" }) {
  return (
    <Carregando className={`divide-y divide-linha ${className}`}>
      {repetir(n, (i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          {foto && <Osso redondo className="h-10 w-10 shrink-0" />}
          <div className="flex-1 min-w-0 space-y-2">
            <Osso className={`h-3.5 ${LARGURAS[i % LARGURAS.length]}`} />
            <Osso className={`h-3 ${LARGURAS[(i + 3) % LARGURAS.length]} opacity-70`} />
          </div>
          {lado && <Osso className="h-3 w-10 shrink-0" />}
        </div>
      ))}
    </Carregando>
  );
}

// ---------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------

/** Lista de conversas (página e coluna ao lado do chat). */
export function EsqueletoListaConversas({ lateral = false }) {
  return (
    <Carregando className={lateral ? "" : "bg-superficie rounded-2xl border border-linha"}>
      {repetir(lateral ? 9 : 7, (i) => (
        <div key={i} className={`flex items-center gap-3 border-b border-linha last:border-b-0 ${lateral ? "px-3 py-2.5" : "px-4 py-3"}`}>
          <Osso redondo className={`${lateral ? "h-10 w-10" : "h-11 w-11"} shrink-0`} />
          <div className="flex-1 min-w-0 space-y-2">
            <Osso className={`h-3.5 ${LARGURAS[i % 4]}`} />
            <Osso className={`h-3 ${LARGURAS[(i + 2) % LARGURAS.length]} opacity-70`} />
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Osso className="h-3 w-9" />
            {i % 3 === 0 && <Osso redondo className="h-4 w-14 opacity-70" />}
          </div>
        </div>
      ))}
    </Carregando>
  );
}

/** Balões de mensagem, alternando cliente e você. */
export function EsqueletoBolhas() {
  const bolhas = [["w-40", false, "h-9"], ["w-56", true, "h-9"], ["w-64", false, "h-16"], ["w-32", true, "h-9"],
    ["w-48", false, "h-9"], ["w-60", true, "h-14"], ["w-36", false, "h-9"]];
  return (
    <Carregando className="space-y-3 pt-2">
      {bolhas.map(([largura, minha, altura], i) => (
        <div key={i} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
          <Osso raio="rounded-xl" className={`${altura} ${largura} max-w-[75%] ${minha ? "opacity-60" : ""}`} />
        </div>
      ))}
    </Carregando>
  );
}

/** Conversa aberta: cabeçalho, balões e campo de mensagem. */
export function EsqueletoConversa() {
  return (
    <Carregando className="flex flex-col h-full">
      <div className="bg-superficie border-b border-linha px-4 md:px-5 py-2.5 flex items-center gap-3">
        <Osso redondo className="h-10 w-10 shrink-0" />
        <div className="flex-1 space-y-2">
          <Osso className="h-4 w-40" />
          <Osso className="h-3 w-28 opacity-70" />
        </div>
        <Osso className="h-9 w-32 hidden sm:block" />
        <Osso className="h-9 w-20" />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden bg-fundo px-2.5 md:px-4 pt-6">
        <EsqueletoBolhas />
      </div>
      <div className="bg-superficie border-t border-linha px-3 py-2.5 flex items-center gap-2">
        <Osso redondo className="h-9 w-9 shrink-0" />
        <Osso redondo className="h-10 flex-1" />
        <Osso redondo className="h-10 w-10 shrink-0" />
      </div>
    </Carregando>
  );
}

/** Grade de miniaturas (mídia da conversa). */
export function EsqueletoMiniaturas({ colunas = "grid-cols-3", n = 6 }) {
  return (
    <Carregando className={`grid ${colunas} gap-1`}>
      {repetir(n, (i) => <Osso key={i} className="aspect-square" />)}
    </Carregando>
  );
}

// ---------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------

function Titulo({ sub = true, largura = "w-48" }) {
  return (
    <div className="space-y-2.5">
      <Osso className={`h-8 ${largura}`} />
      {sub && <Osso className="h-4 w-56 opacity-70" />}
    </div>
  );
}

export function EsqueletoHoje() {
  return (
    <Carregando className="max-w-3xl mx-auto px-4 md:px-8 pt-6">
      <div className="mb-6 space-y-3">
        <Osso className="h-4 w-44 opacity-70" />
        <Osso className="h-8 w-80 max-w-full" />
      </div>
      {repetir(3, (i) => (
        <Cartao key={i} className="px-4 py-3 mb-4">
          <div className="flex items-center justify-between py-1">
            <Osso className="h-5 w-40" />
            <Osso className="h-3.5 w-16 opacity-70" />
          </div>
          <EsqueletoLinhas n={i === 0 ? 3 : 2} foto={false} lado />
        </Cartao>
      ))}
    </Carregando>
  );
}

function CabecalhoFunil() {
  return (
    <div className="px-4 md:px-8 mb-4 shrink-0 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <Titulo largura="w-32" />
        <div className="flex gap-2">
          <Osso className="h-11 w-36" />
          <Osso className="h-11 w-11 sm:w-40" />
        </div>
      </div>
      <Osso className="h-11 w-full max-w-md" />
    </div>
  );
}

export function EsqueletoFunil() {
  return (
    <Carregando className="pt-6 h-full flex flex-col">
      <CabecalhoFunil />
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden px-4 md:px-8 pb-4">
        {repetir(5, (c) => (
          <div key={c} className="shrink-0 w-[82vw] sm:w-72 bg-superficie/60 rounded-2xl border border-linha p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Osso className="h-4 w-28" />
              <Osso redondo className="h-5 w-8" />
            </div>
            {repetir(4 - (c % 3), (i) => (
              <div key={i} className="bg-superficie rounded-xl border border-linha p-3 space-y-2">
                <Osso className={`h-4 ${LARGURAS[(c + i) % LARGURAS.length]}`} />
                <Osso className="h-3 w-1/2 opacity-70" />
                <div className="flex gap-2 pt-1">
                  <Osso redondo className="h-4 w-16 opacity-70" />
                  <Osso redondo className="h-4 w-12 opacity-70" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Carregando>
  );
}

export function EsqueletoTabela() {
  return (
    <Carregando className="pt-6 h-full flex flex-col">
      <CabecalhoFunil />
      <Cartao className="flex-1 min-h-0 mx-4 md:mx-8 mb-4 overflow-hidden">
        <div className="flex gap-6 px-3 h-10 items-center bg-fundo border-b border-linha">
          {repetir(6, (i) => <Osso key={i} className={`h-3.5 ${i === 0 ? "w-32" : "w-20"} shrink-0`} />)}
        </div>
        {repetir(9, (l) => (
          <div key={l} className="flex gap-6 px-3 h-12 items-center border-b border-linha">
            {repetir(6, (i) => (
              <Osso key={i} className={`h-3.5 shrink-0 ${i === 0 ? (l % 2 ? "w-28" : "w-32") : "w-20 opacity-70"}`} />
            ))}
          </div>
        ))}
      </Cartao>
    </Carregando>
  );
}

export function EsqueletoLead() {
  return (
    <Carregando className="min-h-full bg-fundo">
      <div className="bg-superficie border-b border-linha">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <Osso className="h-8 w-8" />
          <Osso redondo className="h-11 w-11 shrink-0" />
          <div className="flex-1 space-y-2">
            <Osso className="h-5 w-48" />
            <Osso className="h-3.5 w-32 opacity-70" />
          </div>
          <Osso className="h-9 w-40 hidden sm:block" />
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-4">
        <Cartao className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {repetir(6, (i) => (
            <div key={i} className="space-y-2">
              <Osso className="h-3 w-16 opacity-70" />
              <Osso className="h-4 w-24" />
            </div>
          ))}
        </Cartao>
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <div className="space-y-4">
            {repetir(3, (i) => <EsqueletoCartao key={i} linhas={i === 0 ? 4 : 2} />)}
          </div>
          <EsqueletoCartao linhas={7} />
        </div>
      </div>
    </Carregando>
  );
}

/** Card com título e campos (fichas, configurações). */
export function EsqueletoCartao({ linhas = 3, className = "" }) {
  return (
    <Cartao className={`p-5 space-y-4 ${className}`}>
      <Osso className="h-5 w-40" />
      {repetir(linhas, (i) => (
        <div key={i} className="space-y-2">
          <Osso className="h-3 w-24 opacity-70" />
          <Osso className="h-11 w-full" />
        </div>
      ))}
    </Cartao>
  );
}

export function EsqueletoConfiguracoes() {
  return (
    <Carregando className="max-w-3xl mx-auto px-4 md:px-8 pt-6 pb-8 space-y-5">
      <Osso className="h-8 w-52" />
      <EsqueletoCartao linhas={2} />
      <Cartao className="p-5 flex items-center gap-4">
        <Osso redondo className="h-14 w-14 shrink-0" />
        <div className="flex-1 space-y-2">
          <Osso className="h-4 w-40" />
          <Osso className="h-3.5 w-28 opacity-70" />
        </div>
        <Osso className="h-10 w-28" />
      </Cartao>
      <EsqueletoCartao linhas={3} />
    </Carregando>
  );
}

const ALTURAS_BARRAS = [40, 65, 30, 80, 55, 90, 45, 70, 35, 60, 75, 50];

/** Só a área dos painéis do dashboard (o cabeçalho com o período já está na tela). */
export function EsqueletoDashboard() {
  const grupo = (g) => (
    <div key={g} className="space-y-3">
      <Osso className="h-5 w-32" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {repetir(4, (i) => (
          <Cartao key={i} className="p-4 space-y-3">
            <Osso className="h-3.5 w-24 opacity-70" />
            <Osso className="h-8 w-20" />
            <Osso className="h-3 w-28 opacity-70" />
          </Cartao>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-3">
        <Cartao className="p-4 lg:col-span-2 space-y-4">
          <Osso className="h-4 w-32" />
          <div className="h-40 flex items-end gap-2">
            {ALTURAS_BARRAS.map((h, i) => (
              <Osso key={i} raio="rounded-t-md" className="flex-1" style={{ height: `${h}%` }} />
            ))}
          </div>
        </Cartao>
        <Cartao className="p-4 space-y-3">
          <Osso className="h-4 w-28" />
          {repetir(4, (i) => (
            <div key={i} className="space-y-1.5">
              <Osso className="h-3 w-20 opacity-70" />
              <Osso className={`h-3 ${LARGURAS[i]}`} />
            </div>
          ))}
        </Cartao>
      </div>
    </div>
  );
  return <Carregando className="space-y-8">{repetir(2, grupo)}</Carregando>;
}

/** Área do calendário, no formato da visão escolhida. */
export function EsqueletoAgenda({ visao }) {
  if (visao === "ano") {
    return (
      <Carregando className="flex-1 min-h-0 overflow-hidden grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 content-start">
        {repetir(8, (m) => (
          <Cartao key={m} className="p-3 space-y-2">
            <Osso className="h-4 w-20" />
            <div className="grid grid-cols-7 gap-1.5">
              {repetir(35, (d) => <Osso key={d} redondo className={`h-6 w-6 mx-auto ${d % 9 === 3 ? "" : "opacity-40"}`} />)}
            </div>
          </Cartao>
        ))}
      </Carregando>
    );
  }
  if (visao === "mes") {
    return (
      <Carregando className="flex-1 min-h-[34rem] flex flex-col">
        <Cartao className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
          {repetir(42, (i) => (
            <div key={i} className={`p-1.5 space-y-1.5 border-linha ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""}`}>
              <Osso redondo className="h-5 w-5 mx-auto opacity-60" />
              {i % 4 === 1 && <Osso className="h-3 w-full" />}
              {i % 9 === 2 && <Osso className="h-3 w-4/5 opacity-70" />}
            </div>
          ))}
        </Cartao>
      </Carregando>
    );
  }
  const colunas = visao === "dia" ? 1 : 7;
  return (
    <Carregando className="flex-1 min-h-80 flex flex-col">
      <Cartao className="flex-1 overflow-hidden flex flex-col">
        <div className="flex border-b border-linha py-2">
          <div className="w-12 md:w-14 shrink-0" />
          {repetir(colunas, (i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <Osso className="h-2.5 w-7 opacity-70" />
              <Osso redondo className="h-8 w-8" />
            </div>
          ))}
        </div>
        <div className="flex-1 flex">
          <div className="w-12 md:w-14 shrink-0 space-y-10 pt-10 pr-2 flex flex-col items-end">
            {repetir(6, (i) => <Osso key={i} className="h-2.5 w-8 opacity-60" />)}
          </div>
          {repetir(colunas, (i) => (
            <div key={i} className="flex-1 relative border-l border-linha">
              <Osso className="absolute left-1 right-1"
                style={{ top: `${12 + ((i * 37) % 60)}%`, height: `${visao === "dia" ? 14 : 10}%` }} />
            </div>
          ))}
        </div>
      </Cartao>
    </Carregando>
  );
}
