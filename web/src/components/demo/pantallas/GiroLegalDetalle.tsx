"use client";

// Detalle de un expediente legal: mismo JSX que app/(app)/legal/[id]/page.tsx con datos del almacén.
import Link from "next/link";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, OPCIONES } from "@/lib/opciones-formularios";
import { useDatos } from "@/lib/demo/usar-almacen";
import { conFechas } from "./giro-util";
import { PantallaNoDisponible } from "./NoDisponible";

export function PantallaLegalDetalle({ id }: { id: string }) {
  const d = useDatos();
  const e = (d.extra.expedientesLegales ?? []).find((x) => x.id === id);
  if (!e) return <PantallaNoDisponible ruta={`/legal/${id}`} />;
  const expediente = {
    ...conFechas(e, "fechaInicio"),
    contacto: d.contactos.find((c) => c.id === e.contactoId) ?? null,
    responsable: d.usuarios.find((u) => u.id === e.responsableId) ?? null,
    sucursal: (d.extra.sucursalesLegales ?? []).find((s) => s.id === e.sucursalId) ?? null,
    registros: (d.extra.registrosLegales ?? [])
      .filter((r) => r.expedienteId === id)
      .sort((a, b) => (b.fechaInicio ?? "").localeCompare(a.fechaInicio ?? ""))
      .map((r) => ({ ...conFechas(r, "fechaInicio", "fechaFin"), usuario: d.usuarios.find((u) => u.id === r.usuarioId) ?? null })),
  };
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
        <article className="surface p-4 lg:col-span-2">
          <h2 className="font-semibold">Resumen</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {expediente.resumen || "Sin resumen capturado."}
          </p>
        </article>
        <article className="surface p-4 text-sm">
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
      <section className="surface">
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
        {expediente.registros.map((registro: any) => (
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
