import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, OPCIONES } from "@/lib/opciones-formularios";

export const dynamic = "force-dynamic";

export default async function DetalleExpedientePage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("legal"))) redirect("/");
  const id = aBigInt((await params).id);
  if (id === null) notFound();
  const expediente = await db.expedienteLegal.findFirst({
    where: {
      id,
      ...(esPasante(sesion.user.puesto, sesion.user.rol)
        ? { responsableId: BigInt(sesion.user.id) }
        : {}),
    },
    include: {
      contacto: true,
      responsable: true,
      sucursal: true,
      registros: { include: { usuario: true }, orderBy: [{ fechaInicio: "desc" }, { createdAt: "desc" }] },
      movimientos: { orderBy: { fecha: "desc" } },
    },
  });
  if (!expediente) notFound();
  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <Link href="/legal" className="text-sm text-primary hover:underline">← Expedientes</Link>
        <h1 className="mt-1 text-2xl font-bold">
          {expediente.numeroInterno || expediente.numeroJudicial || `Expediente ${expediente.id}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[expediente.materia, expediente.tipoJuicio, expediente.etapaProcesal].filter(Boolean).join(" · ")}
        </p>
      </header>
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border bg-card p-4 lg:col-span-2">
          <h2 className="font-semibold">Resumen</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {expediente.resumen || "Sin resumen capturado."}
          </p>
        </article>
        <article className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="font-semibold">Datos</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Cliente</dt><dd>{expediente.contacto?.nombre ?? "Sin asignar"}</dd>
            <dt className="text-muted-foreground">Responsable</dt>
            <dd>{expediente.responsable?.nombre ?? "Sin asignar"}</dd>
            <dt className="text-muted-foreground">Sucursal</dt><dd>{expediente.sucursal?.nombre ?? "Sin asignar"}</dd>
            <dt className="text-muted-foreground">Juzgado</dt><dd>{expediente.juzgado ?? "Sin dato"}</dd>
            <dt className="text-muted-foreground">Estado</dt><dd className="capitalize">{expediente.estado}</dd>
          </dl>
        </article>
      </section>
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <h2 className="font-semibold">Historial del expediente</h2>
          <FormularioModulo boton="+ Agregar registro" titulo="Nuevo registro del expediente"
            endpoint={`/api/legal/expedientes/${expediente.id}/registros`}
            campos={[
              { nombre: "tipo", etiqueta: "Tipo", tipo: "seleccion", requerido: true, opciones: OPCIONES.tipoRegistroLegal },
              { nombre: "titulo", etiqueta: "Título", tipo: "texto", requerido: true },
              { nombre: "descripcion", etiqueta: "Descripción", tipo: "textarea" },
              { nombre: "fechaInicio", etiqueta: "Fecha", tipo: "fecha", valorInicial: hoyMexico() },
              { nombre: "fechaFin", etiqueta: "Vence (términos)", tipo: "fecha" },
              { nombre: "estado", etiqueta: "Estado", tipo: "texto" },
            ]} />
        </div>
        {expediente.registros.map((registro) => (
          <article key={String(registro.id)} className="border-b p-4 last:border-0">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">{registro.titulo}</p>
              <span className="text-xs capitalize text-primary">{registro.tipo}</span>
            </div>
            {registro.descripcion && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {registro.descripcion}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {registro.fechaInicio?.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) ?? "Sin fecha"}
              {registro.usuario ? ` · ${registro.usuario.nombre}` : ""}
            </p>
            {registro.archivoUrl && (
              <a
                className="text-xs text-primary hover:underline"
                href={registro.archivoUrl}
              >
                Abrir referencia documental
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
