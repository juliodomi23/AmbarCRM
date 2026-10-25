import Link from "next/link";
import { Badge, tonoEstado } from "@/components/ui";

const MENSAJES = {
  exito: {
    titulo: "Pago recibido",
    detalle:
      "Estamos confirmando el pago. La venta se actualizará automáticamente.",
  },
  pendiente: {
    titulo: "Pago pendiente",
    detalle: "El medio de pago todavía está procesando la operación.",
  },
  error: {
    titulo: "No se completó el pago",
    detalle: "Puedes volver a la venta e intentar con otro medio de pago.",
  },
};

export default async function ResultadoPago({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const estado = (await searchParams).estado;
  const contenido =
    MENSAJES[estado as keyof typeof MENSAJES] ?? MENSAJES.pendiente;
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <section className="surface w-full max-w-md space-y-4 p-6 text-center shadow-soft">
        <Badge tono={tonoEstado(estado ?? "pendiente")}>
          {estado === "exito"
            ? "Aprobado"
            : estado === "error"
              ? "Error"
              : "Pendiente"}
        </Badge>
        <h1 className="text-2xl font-bold">{contenido.titulo}</h1>
        <p className="text-sm text-muted-foreground">{contenido.detalle}</p>
        <Link
          href="/ventas"
          className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Volver a ventas
        </Link>
      </section>
    </main>
  );
}
