import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { validarFilasCampana } from "@/lib/campanas-envio";

type Props = { params: Promise<{ id: string }> };

export const POST = conModulo("campanas_envio", { admin: true }, async (sesion, req: NextRequest, { params }: Props) => {
  const id = BigInt((await params).id);
  const campana = await db.campanaEnvio.findFirst({ where: { id, estado: "borrador" } });
  if (!campana || sesion.orgId === null) return Response.json({ error: "Campaña en borrador inexistente" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  let resultado;
  try { resultado = await validarFilasCampana(body.filas, body.mapeo); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  const variables = Array.isArray(campana.mapeoVariables) ? campana.mapeoVariables.map(String) : [];
  if (variables.some((v) => !resultado.headers.includes(v) && !["{{nombre}}", "{{nombre_completo}}", "{{telefono}}"].includes(v)))
    return Response.json({ error: "Una variable no corresponde a una columna del archivo" }, { status: 400 });
  const filtroGiro = String(body.filtroGiro ?? "").trim().toLocaleLowerCase("es-MX");
  let etiquetaId: bigint | null = null;
  if (body.etiquetaId) {
    try { etiquetaId = BigInt(body.etiquetaId); } catch { return Response.json({ error: "Etiqueta inválida" }, { status: 400 }); }
  }
  if (etiquetaId && !(await db.etiqueta.findFirst({ where: { id: etiquetaId } }))) return Response.json({ error: "Etiqueta inexistente" }, { status: 400 });
  let importados = 0;
  for (let i = 0; i < resultado.aceptadas.length; i += 200) {
    const lote = resultado.aceptadas.slice(i, i + 200);
    await transaccionTenant(sesion.orgId, async (tx) => {
      const vigente = await tx.campanaEnvio.findFirst({ where: { id, estado: "borrador" } });
      if (!vigente) throw new Error("La campaña ya no está en borrador");
      let seleccionadas = lote.filter((fila) => !filtroGiro || fila.giro.toLocaleLowerCase("es-MX") === filtroGiro);
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
        if (fila.contactoId && (fila.nombre || fila.empresa)) await tx.contacto.update({ where: { id: contacto.id }, data: { nombre: fila.nombre || contacto.nombre, empresa: fila.empresa || contacto.empresa } });
      }
      const giros = [...new Set(preparadas.map(({ fila }) => fila.giro).filter(Boolean))];
      if (giros.length) {
        await tx.etiqueta.createMany({ data: giros.map((nombre) => ({ nombre })), skipDuplicates: true });
        const etiquetas = await tx.etiqueta.findMany({ where: { nombre: { in: giros } }, select: { id: true, nombre: true } });
        const etiquetaPorNombre = new Map(etiquetas.map((e) => [e.nombre, e.id]));
        await tx.contactoEtiqueta.createMany({ data: preparadas.flatMap(({ fila, contacto }) => fila.giro && etiquetaPorNombre.has(fila.giro) ? [{ contactoId: contacto.id, etiquetaId: etiquetaPorNombre.get(fila.giro)! }] : []), skipDuplicates: true });
      }
      const creados = await tx.campanaDestinatario.createMany({ data: preparadas.map(({ fila, contacto }) => ({ campanaId: id, contactoId: contacto.id, telefono: fila.telefono, variables: fila.variables })), skipDuplicates: true });
      importados += creados.count;
    });
  }
  return Response.json({ importados, conteos: resultado.conteos, rechazadas: resultado.rechazadas });
});
