import { Badge } from "@/components/ui";
import { estiloAR } from "@/lib/ar-vistas";

export function EstadoAR({ estado }: { estado: string | null }) {
  const estilo = estiloAR(estado);
  return <Badge punto className={estilo.badge}>{estilo.titulo}</Badge>;
}
