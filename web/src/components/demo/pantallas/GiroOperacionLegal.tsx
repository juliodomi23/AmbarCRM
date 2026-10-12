"use client";

import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { PanelListado } from "@/components/modulos/PanelListado";
import { PanelLegal } from "@/components/legal/PanelLegal";
import { opcionesDe as opcionesTipadas } from "@/lib/opciones-formularios";
import * as campos from "@/lib/campos-modulos";
import { fechaCampo, textoCampo } from "@/lib/campos-modulos";
import { useDatos } from "@/lib/demo/usar-almacen";
import { conFechas, suma } from "./giro-util";

// Las filas del almacén traen ids string (como las serializadas del CRM); el tipo del helper pide bigint de Prisma.
const opcionesDe = (lista: any[], etiqueta: (x: any) => string, vacia?: string) => opcionesTipadas(lista as any, etiqueta, vacia);
const camposOperacion = campos.camposOperacion;
const camposSucursal = campos.camposSucursal;

export function PantallaOperacionLegal() {
  const d = useDatos();
  const lista = (d.extra.operacionLegal ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const operaciones = lista.map((o) => ({ ...conFechas(o, "fecha"), usuario: d.usuarios.find((u) => u.id === o.usuarioId) ?? null, sucursal: (d.extra.sucursalesLegales ?? []).find((s) => s.id === o.sucursalId) ?? null }));
  const listaSucursales = (d.extra.sucursalesLegales ?? []).filter((s) => s.activa).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sucursales = listaSucursales.length;
  const usuarios = d.usuarios.filter((u) => u.activo).length;
  const registros = lista.length;
  const checadas = lista.filter((o) => o.tipo === "checada").length;
  const sesion = { user: { rol: d.usuarios[0].rol } };
  return <PanelLegal titulo="Operación del despacho" descripcion="Sucursales, asistencia y productividad del equipo."
    acciones={<>
      <FormularioModulo boton="+ Registrar" titulo="Registrar actividad" endpoint="/api/legal/operacion"
      campos={camposOperacion(opcionesDe(listaSucursales, (s) => s.nombre, "Sin sucursal"))} />
      {sesion.user.rol === "admin" && (
        <FormularioModulo boton="+ Sucursal" titulo="Nueva sucursal" endpoint="/api/legal/sucursales"
        campos={camposSucursal()} />
      )}
    </>}
    edicion={{ titulo: "Editar registro", campos: camposOperacion(opcionesDe(listaSucursales, (s) => s.nombre, "Sin sucursal")), eliminar: "Borrar registro" }}
    metricas={[
      { etiqueta: "Sucursales", valor: String(sucursales) },
      { etiqueta: "Equipo activo", valor: String(usuarios) },
      { etiqueta: "Registros", valor: String(registros) },
      { etiqueta: "Checadas", valor: String(checadas) },
    ]}
    filas={operaciones.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/legal/operacion/${item.id}`, valores: { tipo: textoCampo(item.tipo), sucursalId: textoCampo(item.sucursalId), fecha: fechaCampo(item.fecha), descripcion: textoCampo(item.descripcion) } }, titulo: item.descripcion || item.tipo,
      subtitulo: [item.usuario?.nombre, item.sucursal?.nombre, item.tipo].filter(Boolean).join(" · "),
      estado: item.estado || item.tipo,
      fecha: item.fecha?.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) ?? null,
    }))} />;
}
