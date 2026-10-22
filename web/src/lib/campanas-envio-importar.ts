import { datosParaCompletarContacto, filtrarFilasCampana, seleccionarFilasCampana, validarFilasCampana, type FilaCampana } from "@/lib/campanas-envio";
import { claveTexto, prepararArchivoCampana, type MapeoColumnas } from "@/lib/campanas-envio-archivo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";

export async function guardarFilasCampana(orgId: bigint, campanaId: bigint, filas: FilaCampana[], filtroGiro: string, etiquetaId: bigint | null) {
  let importados = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    await transaccionTenant(orgId, async (tx) => {
      const vigente = await tx.campanaEnvio.findFirst({ where: { id: campanaId, estado: "borrador" } });
      if (!vigente) throw new Error("La campaña ya no está en borrador");
      let seleccionadas = lote.filter((fila) => !filtroGiro || claveTexto(fila.giro) === claveTexto(filtroGiro));
      if (etiquetaId) {
        const conEtiqueta = await tx.contactoEtiqueta.findMany({ where: { etiquetaId, contactoId: { in: seleccionadas.flatMap((fila) => fila.contactoId ? [fila.contactoId] : []) } }, select: { contactoId: true } });
        const permitidos = new Set(conEtiqueta.map((c) => String(c.contactoId)));
        seleccionadas = seleccionadas.filter((fila) => fila.contactoId && permitidos.has(String(fila.contactoId)));
      }
      if (!seleccionadas.length) return;
      const nuevos = seleccionadas.filter((fila) => !fila.contactoId).map((fila) => ({ nombre: fila.nombre || fila.telefono, telefono: fila.telefono, empresa: fila.empresa || null, fuente: "manual" as const }));
      if (nuevos.length) await tx.contacto.createMany({ data: nuevos, skipDuplicates: true });
      const contactos = await tx.contacto.findMany({ where: { OR: [
        { id: { in: seleccionadas.flatMap((fila) => fila.contactoId ? [fila.contactoId] : []) } },
        { telefono: { in: seleccionadas.map((fila) => fila.telefono) } },
      ] } });
      const porId = new Map(contactos.map((c) => [String(c.id), c]));
      const porTelefono = new Map(contactos.map((c) => [c.telefono, c]));
      const recientes = await tx.campanaDestinatario.findMany({ where: { contactoId: { in: contactos.map((c) => c.id) }, enviadoAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) }, estado: { in: ["enviado", "entregado", "leido", "respondio"] } }, select: { contactoId: true } });
      const contactados = new Set(recientes.map((r) => String(r.contactoId)));
      const preparadas = seleccionadas.flatMap((fila) => {
        const contacto = (fila.contactoId ? porId.get(String(fila.contactoId)) : null) ?? porTelefono.get(fila.telefono);
        return contacto && !contacto.optOutDifusion && !contactados.has(String(contacto.id)) ? [{ fila, contacto }] : [];
      });
      if (!preparadas.length) return;
      for (const { fila, contacto } of preparadas) {
        if (!fila.contactoId) continue;
        const data = datosParaCompletarContacto(contacto, fila);
        if (Object.keys(data).length) await tx.contacto.update({ where: { id: contacto.id }, data });
      }
      const giros = [...new Set(preparadas.map(({ fila }) => fila.giro).filter(Boolean))];
      if (giros.length) {
        await tx.etiqueta.createMany({ data: giros.map((nombre) => ({ nombre })), skipDuplicates: true });
        const etiquetas = await tx.etiqueta.findMany({ where: { nombre: { in: giros } }, select: { id: true, nombre: true } });
        const etiquetaPorNombre = new Map(etiquetas.map((e) => [e.nombre, e.id]));
        await tx.contactoEtiqueta.createMany({ data: preparadas.flatMap(({ fila, contacto }) => fila.giro && etiquetaPorNombre.has(fila.giro) ? [{ contactoId: contacto.id, etiquetaId: etiquetaPorNombre.get(fila.giro)! }] : []), skipDuplicates: true });
      }
      const creados = await tx.campanaDestinatario.createMany({ data: preparadas.map(({ fila, contacto }) => ({ campanaId, contactoId: contacto.id, telefono: fila.telefono, variables: fila.variables })), skipDuplicates: true });
      importados += creados.count;
    });
  }
  return importados;
}

export async function aceptarListaCampana(orgId: bigint, campanaId: bigint, usuarioId: bigint, opciones: {
  filas: string[][];
  filaEncabezados?: number;
  mapeo: MapeoColumnas;
  mapeoVariables: string[];
  areasSeleccionadas: unknown;
  zonasSeleccionadas: unknown;
  filasAceptadas: unknown;
  filtroGiro: string;
  filtroZona: string;
  etiquetaId: bigint | null;
}) {
  const archivo = prepararArchivoCampana(opciones.filas, opciones.filaEncabezados);
  const resultado = await validarFilasCampana(opciones.filas, opciones.mapeo, opciones.mapeoVariables, archivo.filaEncabezados);
  let seleccionadas = seleccionarFilasCampana(resultado.aceptadas, opciones.areasSeleccionadas, opciones.filasAceptadas, opciones.zonasSeleccionadas, resultado.tieneZona);
  seleccionadas = await filtrarFilasCampana(seleccionadas, opciones.filtroGiro, opciones.etiquetaId, opciones.filtroZona);
  if (!seleccionadas.length) throw new Error("Los filtros dejaron la lista sin números");
  const importados = await guardarFilasCampana(orgId, campanaId, seleccionadas, "", null);
  if (!importados) throw new Error("Ningún número seleccionado pudo prepararse; revisa las bajas, campañas recientes y filtros");
  const porArea = new Map<string, number>();
  const porZona = new Map<string, number>();
  for (const fila of seleccionadas) {
    porArea.set(fila.areaClave, (porArea.get(fila.areaClave) ?? 0) + 1);
    if (resultado.tieneZona) porZona.set(fila.zonaClave, (porZona.get(fila.zonaClave) ?? 0) + 1);
  }
  const areas = resultado.resumenAreas.flatMap((area) => {
    const total = porArea.get(area.clave) ?? 0;
    return total ? [{ clave: area.clave, nombre: area.nombre, seleccionados: total }] : [];
  });
  const zonas = resultado.resumenZonas.flatMap((zona) => {
    const total = porZona.get(zona.clave) ?? 0;
    return total ? [{ clave: zona.clave, nombre: zona.nombre, seleccionados: total }] : [];
  });
  const listaAceptadaPorArea = { areas, zonas, totalSeleccionados: seleccionadas.length, importados };
  await db.campanaEnvio.update({ where: { id: campanaId }, data: { listaAceptadaPorArea, listaAceptadaPor: usuarioId, listaAceptadaAt: new Date() } });
  return { importados, listaAceptadaPorArea, conteos: resultado.conteos, rechazadas: resultado.rechazadas };
}
