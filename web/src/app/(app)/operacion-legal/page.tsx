import { redirect } from "next/navigation";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { db } from "@/lib/db";
import { esPasante } from "@/lib/legal";
import { moduloActivo } from "@/lib/modulos";
import { LIMITE_PANEL } from "@/lib/paginacion";
import { getSesion } from "@/lib/session";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, LIMITE_OPCIONES, OPCIONES, opcionesDe } from "@/lib/opciones-formularios";

export const dynamic = "force-dynamic";

export default async function OperacionLegalPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");
  if (!(await moduloActivo("operacion_legal"))) redirect("/");
  const filtro = esPasante(sesion.user.puesto, sesion.user.rol)
    ? { usuarioId: BigInt(sesion.user.id) }
    : {};
  const [operaciones, sucursales, usuarios, registros, checadas] = await Promise.all([
    db.registroOperacionLegal.findMany({
      where: filtro,
      include: { usuario: true, sucursal: true }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: LIMITE_PANEL,
    }),
    db.sucursalLegal.count({ where: { activa: true } }),
    db.usuario.count({ where: { activo: true } }),
    db.registroOperacionLegal.count({ where: filtro }),
    db.registroOperacionLegal.count({ where: { ...filtro, tipo: "checada" } }),
  ]);
  const listaSucursales = await db.sucursalLegal.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } });
  return <PanelLegal titulo="Operación del despacho" descripcion="Sucursales, asistencia y productividad del equipo."
    acciones={<>
      <FormularioModulo boton="+ Registrar" titulo="Registrar actividad" endpoint="/api/legal/operacion"
      campos={[
        { nombre: "tipo", etiqueta: "Tipo", tipo: "seleccion", requerido: true, opciones: OPCIONES.tipoOperacion },
        { nombre: "sucursalId", etiqueta: "Sucursal", tipo: "seleccion", opciones: opcionesDe(listaSucursales, (s) => s.nombre, "Sin sucursal") },
        { nombre: "fecha", etiqueta: "Fecha", tipo: "fecha", valorInicial: hoyMexico() },
        { nombre: "descripcion", etiqueta: "Descripción", tipo: "textarea" },
      ]} />
      {sesion.user.rol === "admin" && (
        <FormularioModulo boton="+ Sucursal" titulo="Nueva sucursal" endpoint="/api/legal/sucursales"
        campos={[
          { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
          { nombre: "direccion", etiqueta: "Dirección", tipo: "texto" },
          { nombre: "telefono", etiqueta: "Teléfono", tipo: "texto" },
        ]} />
      )}
    </>}
    metricas={[
      { etiqueta: "Sucursales", valor: String(sucursales) },
      { etiqueta: "Equipo activo", valor: String(usuarios) },
      { etiqueta: "Registros", valor: String(registros) },
      { etiqueta: "Checadas", valor: String(checadas) },
    ]}
    filas={operaciones.map((item) => ({
      id: String(item.id), titulo: item.descripcion || item.tipo,
      subtitulo: [item.usuario?.nombre, item.sucursal?.nombre, item.tipo].filter(Boolean).join(" · "),
      estado: item.estado || item.tipo,
      fecha: item.fecha?.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) ?? null,
    }))} />;
}
