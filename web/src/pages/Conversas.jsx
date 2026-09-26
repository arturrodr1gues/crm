import ListaConversas from "../components/ListaConversas";
import useMidia, { TELA_LARGA } from "../lib/useMidia";

export default function Conversas() {
  const larga = useMidia(TELA_LARGA);

  // Celular e tablet: a lista ocupa a tela.
  if (!larga) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-6">
        <ListaConversas />
      </div>
    );
  }

  // Computador: lista ao lado, como no WhatsApp Web.
  return (
    <div className="flex h-full">
      <aside className="w-80 xl:w-96 shrink-0 border-r border-linha bg-superficie">
        <ListaConversas lateral />
      </aside>
      <div className="flex-1 grid place-items-center text-tinta-suave text-sm">
        Escolha uma conversa ao lado.
      </div>
    </div>
  );
}
