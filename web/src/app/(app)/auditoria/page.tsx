import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { moduloActivo } from "@/lib/modulos";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { getSesion } from "@/lib/session";
import { LIMITE_PANEL } from "@/lib/paginacion";
import {
  AREAS_AUDITORIA,
  CLAVES_COLOR,
  COLORES_AUDITORIA,
  mesDesplazado,
  mesISO,
  nombreArea,
  normalizarPeriodo,
  periodoLargo,
  puedeGestionarAuditoria,
  rangoMesAuditoria,
  type ColorAuditoria,
} from "@/lib/auditoria";
import { EncabezadoPagina } from "@/components/ui";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { AuditoriaLeyenda } from "@/components/modulos/auditoria/AuditoriaLeyenda";
import { AuditoriaMesSelector } from "@/components/modulos/auditoria/AuditoriaMesSelector";
import { AuditoriaResumen } from "@/components/modulos/auditoria/AuditoriaResumen";
import { AuditoriaTablero, type AreaTablero } from "@/components/modulos/auditoria/AuditoriaTablero";
import { AuditoriaHistorial } from "@/components/modulos/auditoria/AuditoriaHistorial";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; colaborador?: string }>;
}) {
  if (!(await moduloActivo("auditoria"))) redirect("/");
  const sesion = await getSesion();
  if (!sesion?.user) redirect("/login");

  const esGestion = puedeGestionarAuditoria(sesion.user.puesto, sesion.user.rol);
  const userId = sesion.user.id ? BigInt(sesion.user.id) : -1n;
  const params = await searchParams;
  const periodo =
    normalizarPeriodo(params.mes) ?? normalizarPeriodo(new Date().toISOString().slice(0, 7))!;
  const mes = mesISO(periodo);
  const rango = rangoMesAuditoria(mes)!;

  const wherePeriodo: Prisma.AuditoriaEvaluacionWhereInput = {
    periodo: { gte: rango.inicio, lt: rango.fin },
  };
  if (!esGestion) wherePeriodo.colaboradorId = userId;

  const colaboradorSolicitado = esGestion ? aBigInt(params.colaborador ?? null) : userId;

  const [evaluaciones, historial, total, porArea, porAreaColor, porColor] = await Promise.all([
    db.auditoriaEvaluacion.findMany({
      where: wherePeriodo,
      orderBy: [{ area: "asc" }, { colaboradorId: "asc" }],
      take: LIMITE_PANEL,
    }),
    colaboradorSolicitado
      ? db.auditoriaEvaluacion.findMany({
          where: { colaboradorId: colaboradorSolicitado },
          orderBy: [{ periodo: "desc" }, { area: "asc" }],
          take: LIMITE_PANEL,
        })
      : Promise.resolve([]),
    db.auditoriaEvaluacion.count({ where: wherePeriodo }),
    db.auditoriaEvaluacion.groupBy({ by: ["area"], where: wherePeriodo, _count: { _all: true } }),
    db.auditoriaEvaluacion.groupBy({ by: ["area", "color"], where: wherePeriodo, _count: { _all: true } }),
    db.auditoriaEvaluacion.groupBy({ by: ["color"], where: wherePeriodo, _count: { _all: true } }),
  ]);

  const idsUsuarios = new Set<string>();
  for (const evaluacion of [...evaluaciones, ...historial]) {
    idsUsuarios.add(String(evaluacion.colaboradorId));
    idsUsuarios.add(String(evaluacion.evaluadorId));
  }
  if (colaboradorSolicitado) idsUsuarios.add(String(colaboradorSolicitado));

  const usuarios = await db.usuario.findMany({
    where: esGestion
      ? { OR: [{ activo: true }, { id: { in: [...idsUsuarios].map(BigInt) } }] }
      : { id: { in: [...idsUsuarios].map(BigInt) } },
    select: { id: true, nombre: true, puesto: true, activo: true },
    orderBy: { nombre: "asc" },
  });
  const nombres = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
  const puestos = new Map(usuarios.map((usuario) => [String(usuario.id), usuario.puesto]));

  const totalPorArea = new Map(porArea.map((fila) => [fila.area, fila._count._all]));
  const conteoAreaColor = new Map(
    porAreaColor.map((fila) => [`${fila.area}|${fila.color}`, fila._count._all]),
  );
  const resumenColor: Record<ColorAuditoria, number> = { verde: 0, amarillo: 0, rojo: 0, gris_na: 0 };
  for (const fila of porColor) {
    if (fila.color in resumenColor) resumenColor[fila.color as ColorAuditoria] = fila._count._all;
  }

  const areas: AreaTablero[] = AREAS_AUDITORIA.map((area) => {
    const resumen: Record<ColorAuditoria, number> = { verde: 0, amarillo: 0, rojo: 0, gris_na: 0 };
    for (const clave of CLAVES_COLOR) {
      resumen[clave] = conteoAreaColor.get(`${area.clave}|${clave}`) ?? 0;
    }
    const colaboradores = evaluaciones
      .filter((evaluacion) => evaluacion.area === area.clave)
      .map((evaluacion) => ({
        id: String(evaluacion.colaboradorId),
        nombre: nombres.get(String(evaluacion.colaboradorId)) ?? "Colaborador",
        puesto: puestos.get(String(evaluacion.colaboradorId)) ?? null,
        color: evaluacion.color,
        nota: evaluacion.nota,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return {
      clave: area.clave,
      nombre: area.nombre,
      descripcion: area.descripcion,
      total: totalPorArea.get(area.clave) ?? 0,
      resumen,
      colaboradores,
    };
  });

  const areasVisibles = esGestion ? areas : areas.filter((area) => area.total > 0);
  const colaboradorNombre = colaboradorSolicitado
    ? nombres.get(String(colaboradorSolicitado)) ?? null
    : null;
  const filasHistorial = historial.map((evaluacion) => ({
    id: String(evaluacion.id),
    periodo: periodoLargo(evaluacion.periodo),
    area: nombreArea(evaluacion.area),
    color: evaluacion.color,
    nota: evaluacion.nota,
    evaluador: nombres.get(String(evaluacion.evaluadorId)) ?? null,
  }));

  const colaboradoresActivos = usuarios.filter((usuario) => usuario.activo);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <EncabezadoPagina
        eyebrow="Auditoría"
        titulo={esGestion ? "Auditoría mensual" : "Mi auditoría"}
        descripcion={
          esGestion
            ? "Captura y consulta el cumplimiento por área con el semáforo de la operación."
            : "Consulta únicamente tus evaluaciones del periodo."
        }
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <AuditoriaMesSelector
              etiqueta={periodoLargo(periodo)}
              anterior={mesISO(mesDesplazado(periodo, -1))}
              siguiente={mesISO(mesDesplazado(periodo, 1))}
            />
            {esGestion && (
              <FormularioModulo
                boton="Registrar evaluación"
                titulo="Registrar o actualizar evaluación"
                endpoint="/api/auditoria"
                campos={[
                  {
                    nombre: "colaboradorId",
                    etiqueta: "Colaborador",
                    tipo: "seleccion",
                    requerido: true,
                    opciones: colaboradoresActivos.map((usuario) => ({
                      valor: String(usuario.id),
                      etiqueta: usuario.puesto ? `${usuario.nombre} · ${usuario.puesto}` : usuario.nombre,
                    })),
                  },
                  {
                    nombre: "area",
                    etiqueta: "Área",
                    tipo: "seleccion",
                    requerido: true,
                    opciones: AREAS_AUDITORIA.map((area) => ({ valor: area.clave, etiqueta: area.nombre })),
                  },
                  {
                    nombre: "periodo",
                    etiqueta: "Periodo",
                    tipo: "fecha",
                    requerido: true,
                    valorInicial: `${mes}-01`,
                    ayuda: "Se guarda como el primer día del mes.",
                  },
                  {
                    nombre: "color",
                    etiqueta: "Resultado del semáforo",
                    tipo: "seleccion",
                    requerido: true,
                    valorInicial: "verde",
                    opciones: CLAVES_COLOR.map((clave) => ({
                      valor: clave,
                      etiqueta: `${COLORES_AUDITORIA[clave].etiqueta} — ${COLORES_AUDITORIA[clave].titulo}`,
                    })),
                    ayuda: "Rojo: no realizado. Amarillo: con observaciones. Verde: cumplimiento óptimo. Gris: no aplica.",
                  },
                  {
                    nombre: "nota",
                    etiqueta: "Nota u observaciones",
                    tipo: "textarea",
                    ayuda: "Explica brevemente el motivo cuando el resultado no sea verde.",
                  },
                ]}
              />
            )}
          </div>
        }
      />

      <AuditoriaResumen total={total} resumen={resumenColor} />
      <AuditoriaLeyenda />

      {areasVisibles.length ? (
        <AuditoriaTablero
          areas={areasVisibles}
          mes={mes}
          colaboradorSeleccionado={colaboradorSolicitado ? String(colaboradorSolicitado) : null}
        />
      ) : (
        <EmptyState
          titulo="Todavía no tienes evaluaciones"
          descripcion="Cuando dirección registre una evaluación de este periodo, aparecerá aquí con su semáforo y observaciones."
        />
      )}

      {colaboradorSolicitado && colaboradorNombre && (
        <AuditoriaHistorial nombre={colaboradorNombre} filas={filasHistorial} mes={mes} />
      )}
    </div>
  );
}
