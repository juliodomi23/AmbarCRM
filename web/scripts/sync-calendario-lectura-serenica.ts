import { createRequire } from "node:module";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());

const { dbRaw } = await import("../src/lib/db");
const { transaccionTenant } = await import("../src/lib/retail-db");
const { tokenCalendario } = await import("../src/lib/calendario/oauth");
const { telefonoContacto } = await import("../src/lib/reservas/telefono");

/**
 * Sync de SOLO LECTURA de los calendarios personales de los doctores (acceso `reader` en Google,
 * no se puede escribir ahí). Corre aparte del módulo `calendario` (que es bidireccional y exige
 * `writer`): no toca `calendarios_conectados` ni `eventos_calendario`, solo crea/actualiza `citas`
 * marcadas con `GCALID:<id>` en las notas para no duplicar en la siguiente corrida.
 * ponytail: marcador en texto en vez de una tabla de mapeo propia — son 2 calendarios fijos, no
 * hace falta más estructura. Si algún día son más, mover a una tabla.
 */
const ORG_SLUG = "serenica-health-center";
const VENTANA_ATRAS_DIAS = 7;
const VENTANA_ADELANTE_DIAS = 120;

const CALENDARIOS = [
  { calendarId: "endo.consultorio909@gmail.com", doctorId: 3n },
  { calendarId: "cenitconsultorio1@gmail.com", doctorId: 4n }
] as const;

type EventoGoogle = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function nombreDe(titulo: string): string {
  const sinPrefijo = titulo.replace(/^✅\s*\[CONFIRMADO\]\s*/i, "").trim();
  return (sinPrefijo.split(" - ")[0] || sinPrefijo).trim() || "Paciente (calendario del doctor)";
}

function telefonoDe(texto: string): string | null {
  const m = texto.match(/(?:Tel|Tel[eé]fono)[:\s]*([\d\s+-]{8,})/i);
  return m?.[1]?.trim() ?? null;
}

async function listarEventos(calendarId: string, token: string, timeMin: string, timeMax: string) {
  const eventos: EventoGoogle[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!respuesta.ok) throw new Error(`Google ${calendarId} HTTP ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
    const data = (await respuesta.json()) as { items?: EventoGoogle[]; nextPageToken?: string };
    eventos.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return eventos;
}

async function main() {
  const org = await dbRaw.org.findUnique({ where: { slug: ORG_SLUG }, select: { id: true } });
  if (!org) throw new Error(`No existe la organización ${ORG_SLUG}`);

  const conexion = await transaccionTenant(org.id, (tx) =>
    tx.calendarioConectado.findFirst({
      where: { estado: "activa" },
      select: { id: true, accessTokenEncrypted: true, refreshTokenEncrypted: true, tokenExpiraAt: true }
    })
  );
  if (!conexion) throw new Error("No hay conexión de Google Calendar activa para leer los calendarios de los doctores");

  const token = await tokenCalendario(org.id, conexion);
  const ahora = new Date();
  const timeMin = new Date(ahora.getTime() - VENTANA_ATRAS_DIAS * 86_400_000).toISOString();
  const timeMax = new Date(ahora.getTime() + VENTANA_ADELANTE_DIAS * 86_400_000).toISOString();

  const resumen = { creadas: 0, actualizadas: 0, canceladas: 0, sinCambio: 0, errores: 0 };

  for (const { calendarId, doctorId } of CALENDARIOS) {
    let eventos: EventoGoogle[];
    try {
      eventos = await listarEventos(calendarId, token, timeMin, timeMax);
    } catch (error) {
      console.error(`✗ ${calendarId}: ${error instanceof Error ? error.message : String(error)}`);
      resumen.errores++;
      continue;
    }

    await transaccionTenant(org.id, async (tx) => {
      for (const evento of eventos) {
        const marcador = `GCALID:${evento.id}`;
        const existente = await tx.cita.findFirst({ where: { notas: { contains: marcador } } });

        if (evento.status === "cancelled") {
          if (existente && existente.estado !== "cancelada") {
            await tx.cita.update({ where: { id: existente.id }, data: { estado: "cancelada" } });
            resumen.canceladas++;
          }
          continue;
        }
        if (!evento.start?.dateTime || !evento.end?.dateTime) continue;
        const inicio = new Date(evento.start.dateTime);
        const fin = new Date(evento.end.dateTime);
        if (!Number.isFinite(+inicio) || !Number.isFinite(+fin) || fin <= inicio) continue;

        const titulo = evento.summary?.trim() || "Cita del calendario del doctor";
        const descripcionOriginal = evento.description?.trim() ?? "";
        const notas = descripcionOriginal ? `${descripcionOriginal}\n\n${marcador}` : marcador;

        if (existente) {
          const cambio = +existente.inicio !== +inicio || +existente.fin !== +fin || existente.titulo !== titulo;
          if (cambio) {
            await tx.cita.update({ where: { id: existente.id }, data: { inicio, fin, titulo, notas, doctorId, estado: existente.estado === "cancelada" ? "programada" : existente.estado } });
            resumen.actualizadas++;
          } else {
            resumen.sinCambio++;
          }
          continue;
        }

        const telefonoTexto = telefonoDe(descripcionOriginal);
        const telefono = telefonoTexto ? telefonoContacto(telefonoTexto) : null;
        const nombre = nombreDe(titulo);
        let contacto = telefono ? await tx.contacto.findFirst({ where: { telefono: { endsWith: telefono.ultimos10 } } }) : null;
        if (!contacto) {
          contacto = await tx.contacto.create({ data: { nombre, telefono: telefono?.completo ?? null, fuente: "otro" } });
        }

        await tx.cita.create({
          data: { contactoId: contacto.id, doctorId, titulo, notas, inicio, fin, estado: "programada", origen: "calendar" }
        });
        resumen.creadas++;
      }
    });
  }

  console.log(JSON.stringify(resumen, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbRaw.$disconnect();
  });
