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
const camposAsesoria = campos.camposAsesoria;

export function PantallaAsesoriasLegales() {
  const d = useDatos();
  const lista = (d.extra.asesorias ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const asesorias = lista.map((a) => ({ ...conFechas(a, "fecha"), contacto: d.contactos.find((c) => c.id === a.contactoId) ?? null, abogado: d.usuarios.find((u) => u.id === a.abogadoId) ?? null }));
  const total = lista.length;
  const pendientes = lista.filter((a) => a.estado === "pendiente").length;
  const contratos = lista.filter((a) => a.estado === "contrato_firmado").length;
  const equipo = d.usuarios.filter((u) => u.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const expedientesOpciones = (d.extra.expedientesLegales ?? []).filter((e) => ["activo", "suspendido"].includes(e.estado)).map((e) => ({ ...e, contacto: d.contactos.find((c) => c.id === e.contactoId) ?? null }));
  return <PanelLegal titulo="Asesorías legales" descripcion="Consultas y conversión a nuevos asuntos."
    acciones={<FormularioModulo boton="+ Nueva asesoría" titulo="Nueva asesoría" endpoint="/api/legal/asesorias"
      campos={camposAsesoria(opcionesDe(equipo, (u) => u.nombre, "Quien lo registra"), opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente"))} />}
    edicion={{ titulo: "Editar asesoría", campos: camposAsesoria(opcionesDe(equipo, (u) => u.nombre, "Sin asignar"), opcionesDe(expedientesOpciones, (e) => [e.numeroInterno, e.materia, e.contacto?.nombre].filter(Boolean).join(" · "), "Sin expediente"), false), eliminar: "Borrar asesoría" }}
    metricas={[
      { etiqueta: "Asesorías", valor: String(total) },
      { etiqueta: "Pendientes", valor: String(pendientes) },
      { etiqueta: "Contratos", valor: String(contratos) },
      { etiqueta: "Conversión", valor: total ? `${Math.round(contratos / total * 100)}%` : "0%" },
    ]}
    filas={asesorias.map((item) => ({
      id: String(item.id), edicion: { endpoint: `/api/legal/asesorias/${item.id}`, valores: { tema: textoCampo(item.tema), abogadoId: textoCampo(item.abogadoId), expedienteId: textoCampo(item.expedienteId), fecha: fechaCampo(item.fecha), origen: textoCampo(item.origen), estado: textoCampo(item.estado), resumen: textoCampo(item.resumen) } }, titulo: item.tema || item.contacto?.nombre || `Asesoría ${item.id}`,
      subtitulo: [item.contacto?.nombre, item.abogado?.nombre, item.origen].filter(Boolean).join(" · "),
      estado: item.estado, fecha: item.fecha?.toLocaleDateString("es-MX") ?? null,
    }))} />;
}
