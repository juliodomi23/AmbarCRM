import assert from "node:assert/strict";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { solicitarResena, type ResultadoEnvio } from "../../src/lib/resenas-envio";

process.env.NEXTAUTH_URL ||= "https://crm.prueba.test";
const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.RESENAS_SIN_PROTECCION === "1";
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 961n;
const pausa = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
let envios = 0;

const emisorFalso = async (): Promise<ResultadoEnvio> => {
  envios++;
  await pausa();
  return { forma: "texto", conversacionId: 1n };
};

/** Copia de la reserva SIN el bloqueo del contacto: comprobar y luego insertar. */
async function solicitarSinProteccion(contactoId: bigint, origen: { citaId?: bigint; ventaId?: bigint }) {
  const reservada = await transaccionTenant(orgId, async (tx) => {
    const vigente = await tx.solicitudResena.findFirst({
      where: { contactoId, estado: { in: ["reservada", "enviada"] }, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
    });
    if (vigente) return null;
    await pausa(80);
    return tx.solicitudResena.create({ data: { contactoId, citaId: origen.citaId ?? null, ventaId: origen.ventaId ?? null, evento: origen.citaId ? "cita" : "venta", estado: "reservada" } });
  });
  if (!reservada) return null;
  await emisorFalso();
  await transaccionTenant(orgId, (tx) => tx.solicitudResena.update({ where: { id: reservada.id }, data: { estado: "enviada" } }));
  return reservada;
}

const pedir = (contactoId: bigint, evento: { citaId?: bigint; ventaId?: bigint }, emisor = emisorFalso) =>
  sinProteccion
    ? solicitarSinProteccion(contactoId, evento)
    : solicitarResena(orgId, evento.citaId
      ? { evento: "cita", citaId: evento.citaId, contactoId }
      : { evento: "venta", ventaId: evento.ventaId!, contactoId }, emisor);

const contarVigentes = (contactoId: bigint) => transaccionTenant(orgId, (tx) =>
  tx.solicitudResena.count({ where: { contactoId, estado: { in: ["reservada", "enviada"] } } }));

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Reseñas concurrentes', $2)", [String(orgId), `resenas-conc-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "resenas", activo: true, config: { enlaceGoogle: "https://g.page/r/CconcurrenciaE2E/review", diasEntreSolicitudes: 90 } } });
    const contactos = [];
    for (const nombre of ["Ana", "Beto", "Carla", "Dani"]) {
      contactos.push(await tx.contacto.create({ data: { nombre, telefono: `55${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, fuente: "web" } }));
    }
    const hoy = new Date();
    const citas = [];
    for (let i = 0; i < 8; i++) {
      citas.push(await tx.cita.create({ data: { contactoId: contactos[i % 4].id, inicio: hoy, fin: new Date(hoy.getTime() + 1_800_000), titulo: `Cita ${i}`, estado: "completada" } }));
    }
    const venta = await tx.venta.create({ data: { folio: `RES-${sufijo}`, contactoId: contactos[0].id, estado: "entregada", subtotal: 10, total: 10 } });
    return { contactos, citas, venta };
  });
}

async function main() {
  const base = await preparar();
  const [ana, beto, carla, dani] = base.contactos;

  // 1) Cita atendida y venta entregada de la misma clienta al mismo tiempo.
  const dobleEvento = await Promise.allSettled([
    pedir(ana.id, { citaId: base.citas[0].id }),
    pedir(ana.id, { ventaId: base.venta.id }),
  ]);
  const doble = { eventos: 2, solicitudes: await contarVigentes(ana.id), enviosWhatsApp: envios };

  // 2) Seis citas simultáneas de otra clienta.
  envios = 0;
  await Promise.allSettled(base.citas.slice(1, 7).map((cita) => pedir(beto.id, { citaId: cita.id })));
  const rafaga = { eventos: 6, solicitudes: await contarVigentes(beto.id), enviosWhatsApp: envios };

  const resultado: Record<string, unknown> = { modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION", dobleEvento: doble, rafaga };

  if (!sinProteccion) {
    assert.equal(doble.solicitudes, 1);
    assert.equal(doble.enviosWhatsApp, 1);
    assert.equal(rafaga.solicitudes, 1);
    assert.equal(rafaga.enviosWhatsApp, 1);
    assert.ok(dobleEvento.every((r) => r.status === "fulfilled"));

    // 3) El candado es por contacto: otra persona sí recibe su solicitud.
    envios = 0;
    await Promise.all([pedir(carla.id, { citaId: base.citas[2].id }), pedir(dani.id, { citaId: base.citas[3].id })]);
    assert.equal(await contarVigentes(carla.id), 1);
    assert.equal(await contarVigentes(dani.id), 1);
    assert.equal(envios, 2);

    // 4) Una repetición posterior dentro del periodo no envía; pasado el periodo sí.
    envios = 0;
    assert.equal(await pedir(ana.id, { citaId: base.citas[4].id }), null);
    assert.equal(envios, 0);
    await admin.query("UPDATE solicitudes_resena SET created_at = now() - interval '91 days' WHERE org_id = $1 AND contacto_id = $2", [String(orgId), String(ana.id)]);
    const tras = await pedir(ana.id, { citaId: base.citas[4].id });
    assert.equal(tras?.estado, "enviada");
    assert.equal(envios, 1);

    // 5) Omitida o fallida no consumen el periodo; un emisor que revienta no tumba al llamador.
    const sinCanal = async (): Promise<ResultadoEnvio> => ({ forma: "omitido", motivo: "Sin canal", conversacionId: null });
    const revienta = async (): Promise<ResultadoEnvio> => { throw new Error("Meta caído"); };
    await admin.query("DELETE FROM solicitudes_resena WHERE org_id = $1 AND contacto_id = $2", [String(orgId), String(carla.id)]);
    const primera = await solicitarResena(orgId, { evento: "cita", citaId: base.citas[2].id, contactoId: carla.id }, sinCanal);
    assert.equal(primera?.estado, "omitida");
    const segunda = await solicitarResena(orgId, { evento: "cita", citaId: base.citas[6].id, contactoId: carla.id }, revienta);
    assert.equal(segunda?.estado, "fallida");
    assert.match(segunda?.detalle ?? "", /Meta caído/);
    const tercera = await solicitarResena(orgId, { evento: "cita", citaId: base.citas[6].id, contactoId: carla.id });
    assert.equal(tercera?.estado, "omitida", "sin canal real queda omitida, y la cita ya había cambiado de estado");

    // 5b) Una "reservada" de más de 1 h se considera abandonada; una reciente sigue bloqueando.
    const [vieja, reciente] = await transaccionTenant(orgId, async (tx) => [
      await tx.contacto.create({ data: { nombre: "Reserva vieja", telefono: `55${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, fuente: "web" } }),
      await tx.contacto.create({ data: { nombre: "Reserva reciente", telefono: `55${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, fuente: "web" } }),
    ]);
    for (const [contacto, intervalo] of [[vieja, "2 hours"], [reciente, "10 minutes"]] as const) {
      await admin.query(
        `INSERT INTO solicitudes_resena (org_id, contacto_id, evento, estado, created_at) VALUES ($1, $2, 'cita', 'reservada', now() - interval '${intervalo}')`,
        [String(orgId), String(contacto.id)],
      );
    }
    envios = 0;
    const tomada = await pedir(vieja.id, { citaId: base.citas[0].id });
    assert.equal(tomada?.estado, "enviada", "la reservada de hace 2 h está abandonada y no bloquea");
    assert.equal(await pedir(reciente.id, { citaId: base.citas[0].id }), null, "la reservada de hace 10 min sí bloquea");
    assert.equal(envios, 1);
    resultado.reservadaAbandonada = { hace2h: tomada?.estado, hace10min: "bloquea" };

    // 6) Módulo apagado o sin enlace: no hace nada.
    await admin.query("UPDATE modulos_org SET activo = false WHERE org_id = $1 AND clave = 'resenas'", [String(orgId)]);
    assert.equal(await pedir(dani.id, { citaId: base.citas[7].id }), null);
    resultado.omitidasYFallidas = { primera: primera?.estado, segunda: segunda?.estado, tercera: tercera?.estado };
  }
  console.log(JSON.stringify(resultado));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(orgId)]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [String(orgId)]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
