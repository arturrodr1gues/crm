import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FAIXAS, FINANCIAMENTO, ORIGENS } from "../lib/constantes";
import { carregarEtapas, classeCor, useEtapas } from "../lib/etapas";
import { dataCurta, diasDesde, formatarTelefone, inicioDoDia, nomeOuTelefone } from "../lib/format";
import { buscarOportunidades, combina, semAcento } from "../lib/funil";
import VisaoFunil from "../components/VisaoFunil";
import { CampoBusca, Selecao } from "../components/ui";
import { EsqueletoTabela } from "../components/Esqueletos";

const nomeDe = (lista, id) => lista.find((x) => x.id === id)?.nome ?? "";

/**
 * O funil em tabela: o mesmo conteúdo dos cards do quadro, uma linha por lead,
 * com a coluna do quadro em que cada um está. Clique no cabeçalho para ordenar.
 */
export default function FunilTabela() {
  const etapas = useEtapas();
  const [ops, setOps] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [ordem, setOrdem] = useState({ coluna: "etapa", sobe: true });

  useEffect(() => {
    Promise.all([buscarOportunidades(), carregarEtapas()]).then(([{ data }]) => setOps(data ?? []));
  }, []);

  // Colunas da tabela: `valor` ordena, `celula` desenha.
  const colunas = useMemo(() => {
    const posEtapa = (id) => { const i = etapas.findIndex((e) => e.id === id); return i < 0 ? 999 : i; };
    return [
      { id: "nome", titulo: "Lead", valor: (o) => semAcento(nomeOuTelefone(o.contato)),
        celula: (o) => <Link to={`/conversas/${o.contato.id}`} className="font-medium hover:underline">{nomeOuTelefone(o.contato)}</Link> },
      { id: "etapa", titulo: "Coluna no quadro", valor: (o) => posEtapa(o.etapa) * 1e6 + (o.posicao ?? 0),
        celula: (o) => {
          const e = etapas.find((x) => x.id === o.etapa);
          return (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${classeCor(e?.cor)}`} />
              {e?.nome ?? o.etapa}
            </span>
          );
        } },
      { id: "telefone", titulo: "Telefone", valor: (o) => o.contato.telefone ?? "",
        celula: (o) => <span className="whitespace-nowrap">{formatarTelefone(o.contato.telefone)}</span> },
      { id: "bairro", titulo: "Bairro", valor: (o) => semAcento(o.contato.bairro), celula: (o) => o.contato.bairro },
      { id: "consumo", titulo: "Consumo", numero: true, valor: (o) => o.contato.consumo_kwh ?? -1,
        celula: (o) => o.contato.consumo_kwh ? <span className="whitespace-nowrap">{o.contato.consumo_kwh} kWh</span> : null },
      { id: "faixa", titulo: "Faixa", valor: (o) => FAIXAS.findIndex((f) => f.id === o.faixa_consumo),
        celula: (o) => <span className="whitespace-nowrap">{nomeDe(FAIXAS, o.faixa_consumo)}</span> },
      { id: "origem", titulo: "Origem", valor: (o) => nomeDe(ORIGENS, o.contato.origem), celula: (o) => nomeDe(ORIGENS, o.contato.origem) },
      { id: "financiamento", titulo: "Financiamento", valor: (o) => nomeDe(FINANCIAMENTO, o.financiamento_status),
        celula: (o) => {
          const s = o.financiamento_status;
          if (!s) return null;
          const cor = s === "aprovado" ? "text-ok" : s === "recusado" ? "text-alerta" : "";
          return <span className={`whitespace-nowrap ${cor}`}>{nomeDe(FINANCIAMENTO, s)}</span>;
        } },
      { id: "retorno", titulo: "Próximo retorno", valor: (o) => o.proximo_followup ?? "9999",
        celula: (o) => {
          if (!o.proximo_followup) return null;
          const atrasado = new Date(o.proximo_followup) < inicioDoDia();
          return <span className={`whitespace-nowrap ${atrasado ? "text-alerta font-semibold" : ""}`}>{dataCurta(o.proximo_followup)}{atrasado && " · atrasado"}</span>;
        } },
      { id: "dias", titulo: "Dias na etapa", numero: true, valor: (o) => diasDesde(o.etapa_desde),
        celula: (o) => {
          const e = etapas.find((x) => x.id === o.etapa);
          const dias = diasDesde(o.etapa_desde);
          const parada = e?.tipo === "aberta" && e.dias_alerta && dias >= e.dias_alerta;
          return <span className={parada ? "text-alerta font-semibold" : ""}>{dias === 0 ? "Hoje" : dias}</span>;
        } },
      { id: "motivo", titulo: "Motivo da perda", valor: (o) => semAcento(o.motivo_perda),
        celula: (o) => o.motivo_perda && <span className="italic text-tinta-suave">“{o.motivo_perda}”</span> },
    ];
  }, [etapas]);

  const linhas = useMemo(() => {
    if (!ops) return [];
    const termo = busca.trim();
    const col = colunas.find((c) => c.id === ordem.coluna);
    return ops
      .filter((o) => (!filtroEtapa || o.etapa === filtroEtapa) && combina(o, termo))
      .map((o) => [col.valor(o), o])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0) * (ordem.sobe ? 1 : -1))
      .map(([, o]) => o);
  }, [ops, busca, filtroEtapa, ordem, colunas]);

  const ordenarPor = (id) => setOrdem((o) => ({ coluna: id, sobe: o.coluna === id ? !o.sobe : true }));

  if (!ops) return <EsqueletoTabela />;

  return (
    <div className="pt-6 h-full flex flex-col">
      <header className="px-4 md:px-8 mb-4 shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Funil</h1>
            <p className="text-tinta-suave">
              {linhas.length === ops.length ? `${ops.length} leads` : `${linhas.length} de ${ops.length} leads`}
            </p>
          </div>
          <VisaoFunil />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <CampoBusca valor={busca} onMudar={setBusca} className="flex-1 max-w-md"
            placeholder="Buscar por nome, telefone ou bairro" rotulo="Buscar no funil" />
          <Selecao variante="barra" opcoes={etapas} vazio="Todas as colunas" value={filtroEtapa}
            onChange={(e) => setFiltroEtapa(e.target.value)} aria-label="Filtrar por coluna" className="sm:w-56" />
        </div>
      </header>

      {/* Só a tabela rola: cabeçalho e coluna do nome ficam presos */}
      <div className="flex-1 min-h-0 mx-4 md:mx-8 mb-4 overflow-auto overscroll-contain rounded-2xl border border-linha bg-superficie">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              {colunas.map((c, i) => (
                <th key={c.id} scope="col" aria-sort={ordem.coluna === c.id ? (ordem.sobe ? "ascending" : "descending") : undefined}
                  className={`sticky top-0 bg-fundo border-b border-linha font-semibold text-left whitespace-nowrap p-0 ${
                    i === 0 ? "left-0 z-20" : "z-10"}`}>
                  <button type="button" onClick={() => ordenarPor(c.id)}
                    className={`w-full px-3 h-10 flex items-center gap-1 hover:text-tinta ${c.numero ? "justify-end" : ""} ${
                      ordem.coluna === c.id ? "text-tinta" : "text-tinta-suave"}`}>
                    {c.titulo}
                    <span aria-hidden="true" className={`text-xs ${ordem.coluna === c.id ? "" : "invisible"}`}>{ordem.sobe ? "▲" : "▼"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((o) => (
              <tr key={o.id} className="group">
                {colunas.map((c, i) => (
                  <td key={c.id}
                    className={`px-3 py-2.5 border-b border-linha align-middle group-hover:bg-fundo ${c.numero ? "text-right tabular-nums" : ""} ${
                      i === 0 ? "sticky left-0 z-[5] bg-superficie max-w-56 truncate" : ""}`}>
                    {c.celula(o) || <span className="text-tinta-suave/60">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && (
          <p className="p-6 text-center text-tinta-suave">{busca.trim() || filtroEtapa ? "Nenhum lead encontrado." : "O funil está vazio."}</p>
        )}
      </div>
    </div>
  );
}

