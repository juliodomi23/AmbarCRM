// Actividad "viva" de las empresas demo: conversaciones, etiquetas, oportunidades, tareas y reseñas.
// Se llama dentro de la transacción del seed (con app.current_org ya fijado) y es idempotente:
// todo se busca por una clave natural y las fechas se recalculan respecto a "ahora" en cada corrida.

export function fechaMexico(dias, hora) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date()).map((parte) => [parte.type, parte.value]),
  );
  const fecha = new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return new Date(`${fecha.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}:00:00-06:00`);
}

const hace = (minutos) => new Date(Date.now() - minutos * 60_000);

async function resolverEmbudo(tx, definicion) {
  let embudo = await tx.embudo.findFirst({ orderBy: [{ orden: "asc" }, { id: "asc" }] });
  if (!embudo) embudo = await tx.embudo.create({ data: { nombre: definicion.nombre, orden: 1 } });
  let etapas = await tx.etapa.findMany({ where: { embudoId: embudo.id }, orderBy: [{ orden: "asc" }, { id: "asc" }] });
  if (etapas.length === 0) {
    for (const [indice, [nombre, tipo, color]] of definicion.etapas.entries()) {
      await tx.etapa.create({ data: { embudoId: embudo.id, nombre, tipo, color, orden: indice + 1 } });
    }
    etapas = await tx.etapa.findMany({ where: { embudoId: embudo.id }, orderBy: [{ orden: "asc" }, { id: "asc" }] });
  }
  for (const [tipo, nombre, color] of [["ganado", "Ganado", "#16A34A"], ["perdido", "Perdido", "#DC2626"]]) {
    if (!etapas.some((etapa) => etapa.tipo === tipo)) {
      await tx.etapa.create({ data: { embudoId: embudo.id, nombre, tipo, color, orden: etapas.length + 1 } });
      etapas = await tx.etapa.findMany({ where: { embudoId: embudo.id }, orderBy: [{ orden: "asc" }, { id: "asc" }] });
    }
  }
  return { embudo, etapas };
}

function etapaPara(etapas, referencia) {
  if (referencia === "ganado" || referencia === "perdido") return etapas.find((etapa) => etapa.tipo === referencia);
  const normales = etapas.filter((etapa) => etapa.tipo === "normal");
  return normales[referencia % normales.length];
}

function vencimientoTarea(tipo, indice) {
  if (tipo === "vencida") return fechaMexico(-(1 + (indice % 3)), 10);
  if (tipo === "hoy") return fechaMexico(0, 23);
  if (tipo === "proxima") return fechaMexico(1 + (indice % 5), 11);
  if (tipo === "completada") return fechaMexico(-1, 12);
  return null;
}

export async function sembrarActividadDemo(tx, org, perfil) {
  const todos = await tx.usuario.findMany({ where: { activo: true }, orderBy: { id: "asc" } });
  const usuarios = todos.filter((usuario) => usuario.puesto !== "Cajero");
  const admin = usuarios[0];
  const atiende = (indice) => usuarios[indice ?? 0] ?? admin;

  const etiquetas = new Map();
  for (const [nombre, color] of Object.entries(perfil.etiquetas)) {
    etiquetas.set(nombre, await tx.etiqueta.upsert({
      where: { orgId_nombre: { orgId: org.id, nombre } },
      update: { color }, create: { nombre, color },
    }));
  }

  const contactos = [];
  for (const dato of perfil.contactos) {
    const contacto = await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono: dato.telefono } },
      update: { nombre: dato.nombre },
      create: { nombre: dato.nombre, telefono: dato.telefono, fuente: dato.fuente ?? "whatsapp", responsableId: atiende(dato.responsable).id },
    });
    contactos.push(contacto);
    for (const nombre of dato.etiquetas ?? []) {
      const etiqueta = etiquetas.get(nombre);
      await tx.contactoEtiqueta.upsert({
        where: { contactoId_etiquetaId: { contactoId: contacto.id, etiquetaId: etiqueta.id } },
        update: {}, create: { contactoId: contacto.id, etiquetaId: etiqueta.id },
      });
    }
  }

  const { embudo, etapas } = await resolverEmbudo(tx, perfil.embudo);
  const oportunidades = [];
  for (const [indice, [contactoIndice, titulo, valor, referencia, diasAtras]] of perfil.oportunidades.entries()) {
    const etapa = etapaPara(etapas, referencia);
    const cerrada = etapa.tipo !== "normal";
    const datos = {
      contactoId: contactos[contactoIndice].id, embudoId: embudo.id, etapaId: etapa.id, titulo, valor,
      responsableId: atiende(indice).id, orden: indice,
      estado: etapa.tipo === "ganado" ? "ganado" : etapa.tipo === "perdido" ? "perdido" : "abierto",
      motivoPerdida: etapa.tipo === "perdido" ? "Eligió otra opción" : null,
      closedAt: cerrada ? hace(60 * 24 * Math.max(1, diasAtras - 1)) : null,
    };
    const existente = await tx.oportunidad.findFirst({ where: { contactoId: datos.contactoId, titulo } });
    oportunidades.push(existente
      ? await tx.oportunidad.update({ where: { id: existente.id }, data: datos })
      : await tx.oportunidad.create({ data: { ...datos, createdAt: hace(60 * 24 * diasAtras) } }));
  }

  for (const [indice, conversacion] of perfil.conversaciones.entries()) {
    const contacto = contactos[conversacion.contacto];
    const ultimo = Math.min(...conversacion.mensajes.map(([, , minutos]) => minutos));
    const datos = {
      estado: conversacion.estado ?? "abierta",
      noLeidos: conversacion.noLeidos ?? 0,
      botActivo: conversacion.bot ?? true,
      responsableId: conversacion.atiende === null ? null : atiende(conversacion.atiende ?? indice).id,
      csatScore: conversacion.csat ?? null,
      ultimoMensajeAt: hace(ultimo),
    };
    const existente = await tx.conversacion.findFirst({ where: { contactoId: contacto.id, canalId: null } });
    const fila = existente
      ? await tx.conversacion.update({ where: { id: existente.id }, data: datos })
      : await tx.conversacion.create({ data: { contactoId: contacto.id, ...datos } });
    for (const [posicion, [tipo, contenido, minutos]] of conversacion.mensajes.entries()) {
      const waMessageId = `demo:${org.slug}:${indice}:${posicion}`;
      const datosMensaje = {
        conversacionId: fila.id,
        direccion: tipo === "entrante" ? "entrante" : "saliente",
        contenido,
        interna: tipo === "nota",
        status: tipo === "entrante" ? "entregado" : minutos === ultimo ? "entregado" : "leido",
        enviadoPor: tipo === "entrante" || tipo === "nota" ? null : (datos.responsableId ?? admin.id),
        timestamp: hace(minutos),
      };
      await tx.mensaje.upsert({ where: { waMessageId }, update: datosMensaje, create: { ...datosMensaje, waMessageId } });
    }
  }

  for (const [indice, [titulo, tipo, oportunidadIndice, responsable]] of perfil.tareas.entries()) {
    const venceAt = vencimientoTarea(tipo, indice);
    const completada = tipo === "completada";
    const datos = {
      titulo, venceAt, completada, completadaAt: completada ? fechaMexico(-1, 15) : null,
      oportunidadId: oportunidadIndice == null ? null : oportunidades[oportunidadIndice].id,
      responsableId: atiende(responsable ?? indice).id,
    };
    const existente = await tx.tarea.findFirst({ where: { titulo } });
    if (existente) await tx.tarea.update({ where: { id: existente.id }, data: datos });
    else await tx.tarea.create({ data: datos });
  }

  if (perfil.resenas) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave: "resenas" } },
      update: { activo: true, config: { enlaceGoogle: perfil.resenas.enlaceGoogle, diasEntreSolicitudes: 90 } },
      create: { clave: "resenas", activo: true, config: { enlaceGoogle: perfil.resenas.enlaceGoogle, diasEntreSolicitudes: 90 } },
    });
    await tx.resena.deleteMany({ where: { orgId: org.id } });
    await tx.resena.createMany({
      data: perfil.resenas.filas.map(([calificacion, origen, diasAtras], indice) => ({
        calificacion, origen, createdAt: fechaMexico(-diasAtras, 9 + (indice % 9)),
      })),
    });
  }
}
