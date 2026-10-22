import assert from "node:assert/strict";
import pg from "pg";
import ExcelJS from "exceljs";
import { parseCSV } from "../src/lib/csv";
import { datosParaCompletarContacto, esBajaCampana, filtrarFilasCampana, horarioPermitido, reanudarCampana, seleccionarFilasCampana, validarCalendario, validarFilasCampana } from "../src/lib/campanas-envio";
import { detectarFilaEncabezados, mapearColumnas, normalizarTelefonoCampana, prepararArchivoCampana } from "../src/lib/campanas-envio-archivo";
import { fechaEnZona } from "../src/lib/campanas-envio-fecha";
import { aceptarListaCampana, guardarFilasCampana } from "../src/lib/campanas-envio-importar";
import { comprobarPlantillaParaLanzar } from "../src/lib/campanas-envio-plantilla";
import { clasificar, procesarCampana } from "../src/lib/campanas-envio-motor";
import { getProvider } from "../src/lib/channel";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { ingestarEntrante } from "../src/lib/services/ingest";
import { actualizarAjustes, cambiarEnviosCampanas, getAjustes } from "../src/lib/services/config";
import { moduloHabilitado, requireModuloActivo } from "../src/lib/modulos";
import { moduloPorClave } from "../src/lib/modulos-catalogo";
import { moduloVisibleEnOrg } from "../src/lib/modulos-plataforma";
import { POST as cron } from "../src/app/api/cron/campanas-envio/route";
import { NextRequest } from "next/server";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL para PostgreSQL aislado");
  const url = new URL(valor);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/campanas_test") throw new Error("La prueba solo admite localhost/campanas_test");
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgId = 12n, otraOrgId = 13n;
const ahoraPrueba = new Date("2026-10-19T16:00:00Z");
const plantilla = { name: "exi_aviso", language: "es_MX", status: "APPROVED" };
const respuestas = new Map<string, number>();
const llamadas: string[] = [];
let consultasPlantillas = 0;
let pausarDuranteTanda = false;
let modoPlantillas: "ok" | "no_disponible" | "rechazado" | "sin_aprobar" = "ok";
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("https://graph.facebook.com/")) throw new Error(`Red externa bloqueada en pruebas: ${url}`);
  if (url.includes("/message_templates")) {
    consultasPlantillas++;
    if (modoPlantillas === "no_disponible") return Response.json({ error: { code: 1, message: "Meta temporalmente caído" } }, { status: 503 });
    if (modoPlantillas === "rechazado") return Response.json({ error: { code: 190, message: "Credencial rechazada" } }, { status: 401 });
    return Response.json({ data: [{ ...plantilla, status: modoPlantillas === "sin_aprobar" ? "REJECTED" : "APPROVED" }] });
  }
  if (url.endsWith("/messages")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const telefono = String(body.to);
    llamadas.push(telefono);
    if (pausarDuranteTanda) {
      pausarDuranteTanda = false;
      await cambiarEnviosCampanas(false, 999n);
    }
    const codigo = respuestas.get(telefono);
    if (codigo) return Response.json({ error: { code: codigo, message: `Simulado ${codigo}` } }, { status: 400 });
    return Response.json({ messages: [{ id: `sim-${llamadas.length}` }] });
  }
  throw new Error(`Ruta Graph inesperada: ${url}`);
};

async function crearCampana(nombre: string, canalId: bigint, contactoIds: bigint[], opciones: { topeDiario?: number; tandaTamano?: number; diasSemana?: number[]; horaInicio?: string; horaFin?: string } = {}) {
  const campana = await db.campanaEnvio.create({ data: {
    nombre, canalId, plantillaNombre: plantilla.name, plantillaIdioma: plantilla.language,
    mapeoVariables: [], estado: "en_curso", confirmoPermiso: true, permisoAt: new Date(),
    fechaInicio: new Date("2026-10-01T00:00:00Z"), zonaHoraria: "America/Mexico_City",
    diasSemana: opciones.diasSemana ?? [1, 2, 3, 4, 5], horaInicio: opciones.horaInicio ?? "09:30", horaFin: opciones.horaFin ?? "17:30",
    topeDiario: opciones.topeDiario ?? 50, tandaTamano: opciones.tandaTamano ?? 5, pausaTandaMin: 5,
  } });
  for (const contactoId of contactoIds) {
    const contacto = await db.contacto.findUniqueOrThrow({ where: { id: contactoId } });
    await db.campanaDestinatario.create({ data: { campanaId: campana.id, contactoId, telefono: contacto.telefono!, variables: {} } });
  }
  return campana;
}

async function main() {
  const existentes = await admin.query("SELECT id FROM orgs WHERE id IN (12,13)");
  if (existentes.rowCount) throw new Error("La base aislada debe estar vacía para esta prueba");
  await admin.query("INSERT INTO orgs (id,nombre,slug) VALUES (12,'EXI prueba','exi-chiapas'),(13,'Otra prueba','otra-prueba')");
  await runWithOrg(orgId, async () => {
    await db.moduloOrg.create({ data: { clave: "campanas_envio", activo: true } });
  });
  const canal = await runWithOrg(orgId, () => db.canalWhatsapp.create({ data: { nombre: "Meta simulado", proveedor: "cloud_api", estado: "conectado", activo: true, config: { token: "solo-prueba", phoneNumberId: "sim-phone", wabaId: "sim-waba" } } }));
  const contactos = await runWithOrg(orgId, async () => {
    const salida = [];
    for (let i = 0; i < 20; i++) salida.push(await db.contacto.create({ data: { nombre: `Persona ${i}`, telefono: `529611000${String(i).padStart(3, "0")}`, fuente: "manual" } }));
    return salida;
  });

  assert.deepEqual(parseCSV('telefono,nombre\n"961,0000000",Ana\n'), [["telefono", "nombre"], ["961,0000000", "Ana"]]);
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet("Clientes").addRows([["telefono", "nombre"], ["9610000000", "Ana"]]);
  libro.addWorksheet("Ignorada").addRow(["999"]);
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await libro.xlsx.writeBuffer());
  assert.equal(leido.worksheets[0].getRow(2).getCell(1).text, "9610000000");
  assert.equal(leido.worksheets.length, 2);
  const archivoExi = new ExcelJS.Workbook();
  archivoExi.addWorksheet("Prospectos").addRows([
    ["Directorio de prueba"], ["Nota de origen"], ["Datos sintéticos"], ["Revisar teléfonos"],
    ["Tel", "Contacto publicado", "Empresa", "Segmento", "Municipio"],
    ["961 614 1943 ext. 102", "  Ana   Torres  ", "  Colegio   Uno ", "Colegio privado", "Tuxtla Gutiérrez"],
    ["961 614 1944 / 961 614 1999", "Beto", "Colegio Dos", "colegio privado", "tuxtla gutierrez"],
    ["9616141945", "Caro", "Colegio Tres", "Colegio privado", "Comitán"],
    ["9616141946", "Dani", "Colegio Cuatro", "Colegio privado", "San Cristóbal"],
    ["9616141947", "Eva", "Taller Uno", "Artes gráficas", "Tuxtla Gutiérrez"],
    ["9616141948", "Fede", "Taller Dos", "artes graficas", "Comitán"],
    ["9616141949", "Gabi", "Taller Tres", "Artes gráficas", "San Cristóbal"],
    ["9616141950", "Hugo", "Servicio Uno", "Servicios", "Tuxtla Gutiérrez"],
    ["9616141951", "Iris", "Servicio Dos", "Servicios", "Comitán"],
    ["9616141952", "Juan", "Servicio Tres", "Servicios", "San Cristóbal"],
    ["", "Sin teléfono", "Colegio Cinco", "Colegio privado", "Tuxtla Gutiérrez"],
  ]);
  const workbookExi = new ExcelJS.Workbook();
  await workbookExi.xlsx.load(await archivoExi.xlsx.writeBuffer());
  const hojaExi = workbookExi.worksheets[0];
  const filasExi = Array.from({ length: hojaExi.rowCount }, (_, i) => Array.from({ length: hojaExi.columnCount }, (_, j) => hojaExi.getRow(i + 1).getCell(j + 1).text));
  assert.equal(detectarFilaEncabezados(filasExi), 5);
  const encabezadosExi = prepararArchivoCampana(filasExi);
  assert.equal(encabezadosExi.filaEncabezados, 5);
  assert.deepEqual(mapearColumnas(encabezadosExi.headers), { telefono: 0, nombre: 1, empresa: 2, giro: 3, zona: 4 });
  for (const sinonimo of ["Ciudad", "Municipio", "Zona"]) assert.equal(mapearColumnas(["Tel", sinonimo]).zona, 1);
  assert.equal(normalizarTelefonoCampana("961 614 1943 ext. 102"), "529616141943");
  assert.equal(normalizarTelefonoCampana("961 614 1944 / 961 614 1999"), "529616141944");
  assert.equal(detectarFilaEncabezados([["Una nota"], ["Sin teléfono"], ["Algo"]]), null);
  assert.equal(prepararArchivoCampana([["Nota"], ["Celular", "Nombre", "Área"]], 2).filaEncabezados, 2);
  await runWithOrg(orgId, async () => {
    const grafoAntesLista = consultasPlantillas, enviosAntesLista = llamadas.length;
    const listaExi = await validarFilasCampana(filasExi, encabezadosExi.mapeo, [], 5);
    assert.equal(listaExi.aceptadas.length, 10);
    assert.equal(listaExi.rechazadas.length, 1);
    assert.equal(listaExi.rechazadas[0].numeroFila, 16);
    assert.match(listaExi.rechazadas[0].motivo, /Teléfono MX inválido/);
    assert.equal(listaExi.aceptadas[0].telefono, "529616141943");
    assert.equal(listaExi.aceptadas[0].nombre, "Ana Torres");
    assert.equal(listaExi.aceptadas[0].empresa, "Colegio Uno");
    assert.equal(listaExi.aceptadas[1].telefono, "529616141944");
    assert.equal(listaExi.resumenAreas.length, 3);
    assert.deepEqual(listaExi.resumenAreas.find((area) => area.clave === "colegio privado") && (({ total, validos, rechazados }) => ({ total, validos, rechazados }))(listaExi.resumenAreas.find((area) => area.clave === "colegio privado")!), { total: 5, validos: 4, rechazados: 1 });
    assert.equal(listaExi.resumenAreas.find((area) => area.clave === "artes graficas")?.total, 3);
    assert.equal(listaExi.resumenZonas.length, 3);
    assert.equal(listaExi.resumenZonas.find((zona) => zona.clave === "tuxtla gutierrez")?.nombre, "Tuxtla Gutiérrez");
    assert.equal(listaExi.resumenZonas.find((zona) => zona.clave === "tuxtla gutierrez")?.total, 5);
    assert.equal(listaExi.resumenZonas.find((zona) => zona.clave === "tuxtla gutierrez")?.rechazados, 1);
    assert.equal(listaExi.matrizAreaZona.length, 9);
    assert.equal(listaExi.matrizAreaZona.find((celda) => celda.areaClave === "colegio privado" && celda.zonaClave === "tuxtla gutierrez")?.validos, 2);
    assert.equal((await filtrarFilasCampana(listaExi.aceptadas, "Colegio privado", null, "TUXTLA GUTIERREZ")).length, 2);
    const zonaVacia = await validarFilasCampana([["Tel", "Zona"], ["9616141961", "  "]], { telefono: 0, zona: 1 });
    assert.equal(zonaVacia.resumenZonas[0].nombre, "Sin zona");
    assert.equal(zonaVacia.aceptadas[0].zonaClave, "");
    assert.throws(() => seleccionarFilasCampana(listaExi.aceptadas, [], []), /Selecciona al menos/);
    assert.throws(() => seleccionarFilasCampana(listaExi.aceptadas, ["colegio privado"], [6], [], true), /Selecciona al menos una zona/);
    assert.throws(() => seleccionarFilasCampana(listaExi.aceptadas, [], [6], ["tuxtla gutierrez"], true), /Selecciona al menos un área/);
    assert.equal(seleccionarFilasCampana(listaExi.aceptadas, ["colegio privado"], [6, 7, 16], ["tuxtla gutierrez"], true).length, 2, "la fila rechazada se descarta");
    assert.equal(seleccionarFilasCampana(listaExi.aceptadas, ["colegio privado"], [6, 7, 16], [], false).length, 2, "sin columna de zona se conserva la selección anterior");
    const campanaLista = await db.campanaEnvio.create({ data: { nombre: "Lista aceptada de prueba", canalId: canal.id, plantillaNombre: plantilla.name, plantillaIdioma: plantilla.language, mapeoVariables: [] } });
    const aceptacion = await aceptarListaCampana(orgId, campanaLista.id, 999n, { filas: filasExi, filaEncabezados: 5, mapeo: encabezadosExi.mapeo, mapeoVariables: [], areasSeleccionadas: ["colegio privado"], zonasSeleccionadas: ["tuxtla gutierrez"], filasAceptadas: [6, 16], filtroGiro: "", filtroZona: "Tuxtla Gutiérrez", etiquetaId: null });
    assert.equal(aceptacion.importados, 1, "solo se importa la intersección elegida");
    assert.equal(aceptacion.listaAceptadaPorArea.areas[0].seleccionados, 1);
    assert.equal(aceptacion.listaAceptadaPorArea.zonas[0].seleccionados, 1);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: campanaLista.id } }), 1);
    assert.equal(await db.contacto.count({ where: { telefono: { in: ["529616141944", "529616141945", "529616141947"] } } }), 0, "la fila excluida, otras áreas y la rechazada no crean contactos");
    const registrada = await db.campanaEnvio.findUniqueOrThrow({ where: { id: campanaLista.id } });
    assert.equal(registrada.listaAceptadaPor, 999n);
    assert.ok(registrada.listaAceptadaAt);
    assert.equal(registrada.confirmoPermiso, false, "aceptar la lista no sustituye la casilla de permiso");
    const campanaSinZona = await db.campanaEnvio.create({ data: { nombre: "Sin columna de zona", canalId: canal.id, plantillaNombre: plantilla.name, plantillaIdioma: plantilla.language, mapeoVariables: [] } });
    const aceptacionSinZona = await aceptarListaCampana(orgId, campanaSinZona.id, 999n, { filas: [["Tel", "Nombre", "Segmento"], ["9616141960", "Prueba sin zona", "Colegio privado"]], mapeo: { telefono: 0, nombre: 1, giro: 2 }, mapeoVariables: [], areasSeleccionadas: ["colegio privado"], zonasSeleccionadas: { ignorado: true }, filasAceptadas: [2], filtroGiro: "", filtroZona: "", etiquetaId: null });
    assert.equal(aceptacionSinZona.importados, 1);
    assert.deepEqual(aceptacionSinZona.listaAceptadaPorArea.zonas, []);
    assert.equal(consultasPlantillas, grafoAntesLista);
    assert.equal(llamadas.length, enviosAntesLista, "aceptar la lista no llama a Graph");
    await db.contacto.update({ where: { id: contactos[0].id }, data: { optOutDifusion: true } });
    const vista = await validarFilasCampana([["telefono", "nombre"], ["9611000000", "A"], ["9611000000", "B"], ["123", "C"], ["9611000001", "D"]], { telefono: 0, nombre: 1 });
    assert.equal(vista.conteos.optOut, 1); assert.equal(vista.conteos.duplicados, 1);
    assert.equal(vista.conteos.invalidos, 1); assert.equal(vista.conteos.validos, 1);
    assert.equal(vista.muestra.length, 4);
    const vacia = await validarFilasCampana([["telefono", "empresa"], ["9611000099", ""]], { telefono: 0, empresa: 1 }, ["empresa"]);
    assert.equal(vacia.conteos.validos, 0);
    assert.equal(vacia.rechazadas[0].motivo, "Variable vacía: empresa");
    const real = await db.contacto.findUniqueOrThrow({ where: { id: contactos[1].id } });
    const cambioReal = datosParaCompletarContacto(real, { nombre: "Nombre del Excel", empresa: "Empresa nueva" });
    await db.contacto.update({ where: { id: real.id }, data: cambioReal });
    assert.equal((await db.contacto.findUniqueOrThrow({ where: { id: real.id } })).nombre, "Persona 1");
    const sinNombre = await db.contacto.update({ where: { id: contactos[2].id }, data: { nombre: contactos[2].telefono! } });
    await db.contacto.update({ where: { id: sinNombre.id }, data: datosParaCompletarContacto(sinNombre, { nombre: "Nombre rellenado", empresa: "" }) });
    assert.equal((await db.contacto.findUniqueOrThrow({ where: { id: sinNombre.id } })).nombre, "Nombre rellenado");
    await db.contacto.update({ where: { id: contactos[2].id }, data: { nombre: contactos[2].telefono! } });
    const borrador = await db.campanaEnvio.create({ data: { nombre: "Prueba importación", canalId: canal.id, plantillaNombre: plantilla.name, plantillaIdioma: plantilla.language, mapeoVariables: ["empresa"] } });
    const datos = await validarFilasCampana([
      ["telefono", "nombre", "empresa"],
      [contactos[1].telefono!, "No reemplazar", "No reemplazar empresa"],
      [contactos[2].telefono!, "Rellenado desde Excel", "Empresa rellenada"],
      ["9611000099", "Sin empresa", ""],
    ], { telefono: 0, nombre: 1, empresa: 2 }, ["empresa"]);
    assert.equal(datos.rechazadas[0].motivo, "Variable vacía: empresa");
    assert.equal(await guardarFilasCampana(orgId, borrador.id, datos.aceptadas, "", null), 2);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: borrador.id } }), 2);
    assert.equal(await db.contacto.count({ where: { telefono: "529611000099" } }), 0, "la fila rechazada no se importa");
    const conservado = await db.contacto.findUniqueOrThrow({ where: { id: contactos[1].id } });
    assert.equal(conservado.nombre, "Persona 1");
    assert.equal(conservado.empresa, "Empresa nueva");
    const rellenado = await db.contacto.findUniqueOrThrow({ where: { id: contactos[2].id } });
    assert.equal(rellenado.nombre, "Rellenado desde Excel");
    assert.equal(rellenado.empresa, "Empresa rellenada");
  });
  assert.equal(horarioPermitido({ diasSemana: [1, 2, 3, 4, 5], horaInicio: "09:30", horaFin: "17:30", zonaHoraria: "America/Mexico_City", fechaInicio: new Date("2026-10-01"), ultimaTandaAt: null, pausaTandaMin: 10 }, ahoraPrueba), true);
  assert.equal(fechaEnZona("2026-10-19T10:00", "America/Mexico_City"), "2026-10-19T16:00:00.000Z");
  assert.equal(horarioPermitido({ diasSemana: [1, 2, 3, 4, 5], horaInicio: "09:30", horaFin: "17:30", zonaHoraria: "America/Mexico_City", fechaInicio: new Date("2026-10-01"), ultimaTandaAt: null, pausaTandaMin: 10 }, new Date("2026-10-18T16:00:00Z")), false);
  assert.throws(() => validarCalendario({ topeDiario: 151 }));
  assert.throws(() => validarCalendario({ tandaTamano: 21 }));
  assert.throws(() => validarCalendario({ pausaTandaMin: 4 }));
  assert.equal(esBajaCampana("texto", " nó grácias "), true);
  assert.equal(esBajaCampana("texto", "Quiero información"), false);
  for (const [codigo, estado] of [[131050, "omitido"], [131049, "omitido"], [131026, "fallido"], [131042, "fallido"], [190, "fallido"]] as const) assert.equal(clasificar({ ok: false, errorCodigo: codigo }, 0).estado, estado);
  assert.ok(clasificar({ ok: false, errorCodigo: 131042 }, 0).pausar);
  assert.ok(clasificar({ ok: false, errorCodigo: 131049 }, 0).reintentarAt);
  assert.equal(clasificar({ ok: false, errorCodigo: 131049 }, 1).reintentarAt, null);

  await runWithOrg(orgId, async () => {
    process.env.WA_API_KEY = "cron-prueba";
    const llamarCron = () => cron(new NextRequest("http://127.0.0.1/api/cron/campanas-envio", { method: "POST", headers: { "x-api-key": "cron-prueba" } }));
    const interruptor = await crearCampana("Interruptor general", canal.id, [contactos[17].id, contactos[18].id, contactos[19].id], { tandaTamano: 1, diasSemana: [0,1,2,3,4,5,6], horaInicio: "00:00", horaFin: "23:59" });
    const primerDestinatario = await db.campanaDestinatario.findFirstOrThrow({ where: { campanaId: interruptor.id }, orderBy: { id: "asc" } });
    const haceOnceMinutos = new Date(Date.now() - 11 * 60_000);
    await db.campanaDestinatario.update({ where: { id: primerDestinatario.id }, data: { estado: "enviando", enviadoAt: haceOnceMinutos, updatedAt: haceOnceMinutos } });
    assert.equal((await getAjustes()).campanasEnvioActivas, false, "sin fila de ajustes el interruptor está apagado");
    const grafoAntes = consultasPlantillas, enviosAntes = llamadas.length;
    assert.equal((await llamarCron()).status, 200);
    assert.equal(consultasPlantillas, grafoAntes);
    assert.equal(llamadas.length, enviosAntes);
    assert.equal((await db.campanaDestinatario.findUniqueOrThrow({ where: { id: primerDestinatario.id } })).estado, "enviando", "apagado no recupera reservas ni cambia destinatarios");
    assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: interruptor.id } })).estado, "en_curso");
    await actualizarAjustes({ campanasEnvioActivas: false });
    assert.equal((await llamarCron()).status, 200);
    assert.equal(consultasPlantillas, grafoAntes);
    assert.equal(llamadas.length, enviosAntes);
    assert.equal((await db.campanaDestinatario.findUniqueOrThrow({ where: { id: primerDestinatario.id } })).estado, "enviando");
    const encendidos = await cambiarEnviosCampanas(true, 999n);
    assert.equal(encendidos.campanasEnvioActivas, true);
    assert.equal(encendidos.campanasEnvioCambiadoPor, 999n);
    assert.ok(encendidos.campanasEnvioCambiadoAt);
    assert.equal((await llamarCron()).status, 200);
    assert.equal(llamadas.length, enviosAntes + 1, "encendido vuelve a enviar");
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: interruptor.id, estado: "enviado" } }), 1);
    const pausados = await cambiarEnviosCampanas(false, 999n);
    assert.equal(pausados.campanasEnvioActivas, false);
    assert.equal((await llamarCron()).status, 200);
    assert.equal(llamadas.length, enviosAntes + 1, "pausa intermedia no envía");
    assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: interruptor.id } })).estado, "en_curso", "el interruptor no pausa la campaña");
    await cambiarEnviosCampanas(true, 999n);
    await db.campanaEnvio.update({ where: { id: interruptor.id }, data: { ultimaTandaAt: haceOnceMinutos } });
    assert.equal((await llamarCron()).status, 200);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: interruptor.id, estado: "enviado" } }), 2);
    await db.campanaEnvio.update({ where: { id: interruptor.id }, data: { ultimaTandaAt: haceOnceMinutos } });
    assert.equal((await llamarCron()).status, 200);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: interruptor.id, estado: "enviado" } }), 3);
    const telefonosInterruptor = [17, 18, 19].map((i) => contactos[i].telefono!);
    assert.deepEqual(telefonosInterruptor.map((telefono) => llamadas.filter((llamada) => llamada === telefono).length), [1, 1, 1], "reanudar no pierde ni duplica destinatarios");

    const contactosTanda = await Promise.all([1, 2].map((i) => db.contacto.create({ data: { nombre: `Pausa en tanda ${i}`, telefono: `52961300000${i}`, fuente: "manual" } })));
    const tanda = await crearCampana("Pausa dentro de tanda", canal.id, contactosTanda.map((c) => c.id), { tandaTamano: 2, diasSemana: [0,1,2,3,4,5,6], horaInicio: "00:00", horaFin: "23:59" });
    pausarDuranteTanda = true;
    await procesarCampana(orgId, tanda.id);
    assert.equal((await getAjustes()).campanasEnvioActivas, false);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: tanda.id, estado: "enviado" } }), 1);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: tanda.id, estado: "pendiente" } }), 1, "la reserva sin enviar se libera al apagar");
    assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: tanda.id } })).estado, "en_curso");
    await cambiarEnviosCampanas(true, 999n);
    await db.campanaEnvio.update({ where: { id: tanda.id }, data: { ultimaTandaAt: haceOnceMinutos } });
    assert.equal((await llamarCron()).status, 200);
    assert.deepEqual(contactosTanda.map((contacto) => llamadas.filter((telefono) => telefono === contacto.telefono).length), [1, 1], "la tanda interrumpida continúa sin duplicados");

    const fuera = await crearCampana("Fuera de ventana", canal.id, [contactos[13].id]);
    const antesFuera = consultasPlantillas;
    await procesarCampana(orgId, fuera.id, new Date("2026-10-20T02:00:00Z"));
    assert.equal(consultasPlantillas, antesFuera, "fuera de ventana no consulta Graph");
    await db.campanaEnvio.update({ where: { id: fuera.id }, data: { estado: "completada" } });
    const entre = await crearCampana("Entre tandas", canal.id, [contactos[14].id]);
    await db.campanaEnvio.update({ where: { id: entre.id }, data: { ultimaTandaAt: ahoraPrueba } });
    await procesarCampana(orgId, entre.id, ahoraPrueba);
    assert.equal(consultasPlantillas, antesFuera, "entre tandas no consulta Graph");
    await db.campanaEnvio.update({ where: { id: entre.id }, data: { estado: "completada" } });

    const metaCaida = await crearCampana("Meta temporal", canal.id, [contactos[15].id]);
    modoPlantillas = "no_disponible";
    const antesEnvios = llamadas.length;
    const primerFallo = await procesarCampana(orgId, metaCaida.id, ahoraPrueba);
    assert.match(primerFallo.error ?? "", /Meta/);
    assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: metaCaida.id } })).estado, "en_curso");
    assert.equal(llamadas.length, antesEnvios, "Meta caído no inicia envíos");
    for (let intento = 2; intento <= 5; intento++) await procesarCampana(orgId, metaCaida.id, ahoraPrueba);
    const quinta = await db.campanaEnvio.findUniqueOrThrow({ where: { id: metaCaida.id } });
    assert.equal(quinta.estado, "pausada");
    assert.equal(quinta.fallosConsultaMeta, 5);
    assert.match(quinta.motivoPausa ?? "", /Meta no responde/);
    const reanudada = await reanudarCampana(metaCaida.id);
    assert.equal(reanudada.estado, "programada");
    assert.equal(reanudada.motivoPausa, null);
    assert.equal(reanudada.fallosConsultaMeta, 0);
    await procesarCampana(orgId, metaCaida.id, ahoraPrueba);
    const unFalloTrasReanudar = await db.campanaEnvio.findUniqueOrThrow({ where: { id: metaCaida.id } });
    assert.equal(unFalloTrasReanudar.estado, "programada", "un fallo aislado tras reanudar no pausa");
    assert.equal(unFalloTrasReanudar.fallosConsultaMeta, 1);
    await db.campanaEnvio.update({ where: { id: metaCaida.id }, data: { estado: "completada" } });
    const proveedor = getProvider("cloud_api", canal.config, canal.instancia);
    assert.equal((await comprobarPlantillaParaLanzar(proveedor, plantilla.name, plantilla.language))?.status, 503);
    const intermitente = await crearCampana("Meta intermitente", canal.id, []);
    await procesarCampana(orgId, intermitente.id, ahoraPrueba);
    assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: intermitente.id } })).fallosConsultaMeta, 1);
    modoPlantillas = "ok";
    await procesarCampana(orgId, intermitente.id, ahoraPrueba);
    assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: intermitente.id } })).fallosConsultaMeta, 0, "una consulta correcta reinicia la cuenta consecutiva");
    await db.campanaEnvio.update({ where: { id: intermitente.id }, data: { estado: "completada" } });
    modoPlantillas = "sin_aprobar";
    const noAprobada = await crearCampana("Plantilla retirada", canal.id, []);
    await procesarCampana(orgId, noAprobada.id, ahoraPrueba);
    assert.match((await db.campanaEnvio.findUniqueOrThrow({ where: { id: noAprobada.id } })).motivoPausa ?? "", /ya no está aprobada/);
    modoPlantillas = "rechazado";
    const rechazada = await crearCampana("Meta rechazó", canal.id, []);
    await procesarCampana(orgId, rechazada.id, ahoraPrueba);
    assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: rechazada.id } })).estado, "pausada");
    modoPlantillas = "ok";

    const variableVacia = await crearCampana("Variable vacía", canal.id, [contactos[16].id]);
    await db.campanaEnvio.update({ where: { id: variableVacia.id }, data: { mapeoVariables: ["empresa"] } });
    const antesVariable = llamadas.length;
    await procesarCampana(orgId, variableVacia.id, ahoraPrueba);
    assert.equal(llamadas.length, antesVariable, "una variable vacía no llama a Meta para enviar");
    assert.equal((await db.campanaDestinatario.findFirstOrThrow({ where: { campanaId: variableVacia.id } })).estado, "omitido");

    const a = await crearCampana("Tope A", canal.id, [contactos[1].id, contactos[2].id], { topeDiario: 2, tandaTamano: 2 });
    const b = await crearCampana("Tope B", canal.id, [contactos[3].id, contactos[4].id], { topeDiario: 2, tandaTamano: 2 });
    await Promise.all([procesarCampana(orgId, a.id, ahoraPrueba), procesarCampana(orgId, b.id, ahoraPrueba)]);
    const enviados = await db.campanaDestinatario.count({ where: { campanaId: { in: [a.id, b.id] }, estado: "enviado" } });
    assert.equal(enviados, 2, "dos campañas del canal comparten tope aun en paralelo");
    await db.campanaEnvio.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { estado: "completada" } });

    const c = await crearCampana("Concurrencia", canal.id, [contactos[5].id, contactos[6].id], { topeDiario: 10, tandaTamano: 2 });
    const horaSiguiente = new Date("2026-10-20T16:00:00Z");
    const antes = llamadas.length;
    await Promise.all([procesarCampana(orgId, c.id, horaSiguiente), procesarCampana(orgId, c.id, horaSiguiente)]);
    assert.equal(llamadas.length - antes, 2, "dos ejecuciones simultáneas no duplican destinatarios");
    await db.campanaEnvio.update({ where: { id: c.id }, data: { estado: "completada" } });

    const recuperada = await crearCampana("Reinicio", canal.id, [contactos[7].id], { diasSemana: [0,1,2,3,4,5,6], horaInicio: "00:00", horaFin: "23:59" });
    await db.campanaDestinatario.updateMany({ where: { campanaId: recuperada.id }, data: { estado: "enviando", enviadoAt: new Date(Date.now() - 11 * 60_000), updatedAt: new Date(Date.now() - 11 * 60_000) } });
    const respuesta = await cron(new NextRequest("http://127.0.0.1/api/cron/campanas-envio", { method: "POST", headers: { "x-api-key": "cron-prueba" } }));
    assert.equal(respuesta.status, 200);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: recuperada.id, estado: "enviado" } }), 1);
    await db.campanaEnvio.update({ where: { id: recuperada.id }, data: { estado: "completada" } });

    const casos = [[8, 131050], [9, 131049], [10, 131026], [11, 131042], [12, 190]] as const;
    for (const [indice, codigo] of casos) {
      respuestas.set(contactos[indice].telefono!, codigo);
      const prueba = await crearCampana(`Meta ${codigo}`, canal.id, [contactos[indice].id]);
      await procesarCampana(orgId, prueba.id, new Date("2026-10-21T16:00:00Z"));
      const d = await db.campanaDestinatario.findFirstOrThrow({ where: { campanaId: prueba.id } });
      assert.equal(d.errorCodigo, codigo);
      if (codigo === 131050) assert.equal((await db.contacto.findUniqueOrThrow({ where: { id: contactos[indice].id } })).optOutDifusion, true);
      if (codigo === 131049) assert.ok(d.reintentarAt && d.reintentarAt > new Date());
      if (codigo === 131042 || codigo === 190) assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: prueba.id } })).estado, "pausada");
      await db.campanaEnvio.update({ where: { id: prueba.id }, data: { estado: "completada" } });
    }

    const lote = [];
    for (let i = 20; i < 40; i++) lote.push(await db.contacto.create({ data: { nombre: `Lote ${i}`, telefono: `529611000${String(i).padStart(3, "0")}`, fuente: "manual" } }));
    lote.slice(0, 7).forEach((c) => respuestas.set(c.telefono!, 131026));
    const calidad = await crearCampana("Fallas de calidad", canal.id, lote.map((c) => c.id), { topeDiario: 50, tandaTamano: 20 });
    await procesarCampana(orgId, calidad.id, new Date("2026-10-22T16:00:00Z"));
    const conNumerosMuertos = await db.campanaEnvio.findUniqueOrThrow({ where: { id: calidad.id } });
    assert.equal(conNumerosMuertos.estado, "completada", "7 errores 131026 no pausan la campaña");
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: calidad.id, estado: "fallido", errorCodigo: 131026 } }), 7);

    const loteOtros = [];
    for (let i = 40; i < 60; i++) loteOtros.push(await db.contacto.create({ data: { nombre: `Otro ${i}`, telefono: `529611000${String(i).padStart(3, "0")}`, fuente: "manual" } }));
    loteOtros.slice(0, 7).forEach((c) => respuestas.set(c.telefono!, 131000));
    const calidadReal = await crearCampana("Fallas generales", canal.id, loteOtros.map((c) => c.id), { topeDiario: 50, tandaTamano: 20 });
    await procesarCampana(orgId, calidadReal.id, new Date("2026-10-23T16:00:00Z"));
    const pausada = await db.campanaEnvio.findUniqueOrThrow({ where: { id: calidadReal.id } });
    assert.equal(pausada.estado, "pausada", "7 fallos distintos de 131026 detienen la campaña");
    assert.match(pausada.motivoPausa ?? "", /30 %/);

    const enviado = await db.campanaDestinatario.findFirstOrThrow({ where: { estado: "enviado", campanaId: { in: [a.id, b.id] } } });
    await cambiarEnviosCampanas(false, 999n);
    const antesBaja = llamadas.length;
    await ingestarEntrante({ waMessageId: "baja-prueba", telefono: enviado.telefono, tipo: "texto", contenido: "NÓ GRACIAS", direccion: "entrante", timestamp: new Date() }, canal.id);
    assert.equal((await db.contacto.findUniqueOrThrow({ where: { id: enviado.contactoId } })).optOutDifusion, true);
    assert.equal(llamadas.length, antesBaja, "la baja no genera respuesta automática");
    assert.ok(await db.mensaje.findFirst({ where: { conversacion: { contactoId: enviado.contactoId }, interna: true } }));
    assert.equal((await getAjustes()).campanasEnvioActivas, false, "la baja se procesa con envíos pausados");

    const otroEnviado = await db.campanaDestinatario.findFirstOrThrow({ where: { estado: "enviado", campanaId: { in: [a.id, b.id] }, contactoId: { not: enviado.contactoId } } });
    await ingestarEntrante({ waMessageId: "respuesta-previa", telefono: otroEnviado.telefono, tipo: "texto", contenido: "Hola", direccion: "entrante", timestamp: new Date() }, canal.id);
    assert.equal((await db.campanaDestinatario.findUniqueOrThrow({ where: { id: otroEnviado.id } })).estado, "respondio");
    const antesStop = llamadas.length;
    await ingestarEntrante({ waMessageId: "baja-tras-respuesta", telefono: otroEnviado.telefono, tipo: "texto", contenido: "STOP", direccion: "entrante", timestamp: new Date() }, canal.id);
    assert.equal((await db.contacto.findUniqueOrThrow({ where: { id: otroEnviado.contactoId } })).optOutDifusion, true);
    assert.equal(llamadas.length, antesStop, "STOP tras una respuesta no llega a la automatización de envío");
    assert.ok(await db.mensaje.findFirst({ where: { conversacion: { contactoId: otroEnviado.contactoId }, interna: true } }));
    const reciente = await validarFilasCampana([["telefono"], [otroEnviado.telefono]], { telefono: 0 });
    assert.equal(reciente.conteos.optOut, 1);
    const recienteSinBaja = await validarFilasCampana([["telefono"], [lote[10].telefono!]], { telefono: 0 });
    assert.equal(recienteSinBaja.conteos.recientes, 1);
  });

  const aislado = await runWithOrg(otraOrgId, () => db.campanaEnvio.count());
  assert.equal(aislado, 0, "RLS oculta campañas de EXI a otra org");
  const moduloCampanas = moduloPorClave("campanas_envio")!;
  assert.equal(moduloCampanas.soloOrgId, 12);
  assert.equal(moduloVisibleEnOrg(moduloCampanas, orgId), true);
  assert.equal(moduloVisibleEnOrg(moduloCampanas, otraOrgId), false);
  assert.equal(await runWithOrg(orgId, () => requireModuloActivo("campanas_envio", { rol: "admin" })), null);
  const bloqueado = await runWithOrg(otraOrgId, () => requireModuloActivo("campanas_envio", { rol: "admin" }));
  assert.equal(bloqueado?.status, 404);
  await runWithOrg(otraOrgId, async () => {
    assert.equal((await getAjustes()).campanasEnvioActivas, false, "otra org no hereda el interruptor de EXI");
    await db.moduloOrg.create({ data: { clave: "campanas_envio", activo: true } });
    assert.equal(await moduloHabilitado("campanas_envio"), false, "una bandera forzada en BD no supera la restricción del catálogo");
    assert.equal((await requireModuloActivo("campanas_envio", { rol: "admin" }))?.status, 404);
    assert.equal((await getAjustes()).campanasEnvioActivas, false, "el acceso denegado no cambia el interruptor");
    const otroCanal = await db.canalWhatsapp.create({ data: { nombre: "Meta org 13", proveedor: "cloud_api", estado: "conectado", activo: true, config: { token: "solo-prueba", phoneNumberId: "sim-phone-13", wabaId: "sim-waba-13" } } });
    const otroContacto = await db.contacto.create({ data: { nombre: "Otra org", telefono: "529612000001", fuente: "manual" } });
    const otraCampana = await crearCampana("Otra org activa", otroCanal.id, [otroContacto.id], { diasSemana: [0,1,2,3,4,5,6], horaInicio: "00:00", horaFin: "23:59" });
    const llamarCron = () => cron(new NextRequest("http://127.0.0.1/api/cron/campanas-envio", { method: "POST", headers: { "x-api-key": "cron-prueba" } }));
    assert.equal((await llamarCron()).status, 200);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: otraCampana.id, estado: "pendiente" } }), 1, "el cron no procesa una org restringida aunque la bandera exista");
    const catalogoDePrueba = moduloCampanas as unknown as { soloOrgId?: number };
    const restriccionOriginal = catalogoDePrueba.soloOrgId;
    try {
      delete catalogoDePrueba.soloOrgId;
      assert.equal(await requireModuloActivo("campanas_envio", { rol: "admin" }), null);
      await cambiarEnviosCampanas(true, 999n);
      assert.equal((await llamarCron()).status, 200);
      assert.equal(await db.campanaDestinatario.count({ where: { campanaId: otraCampana.id, estado: "enviado" } }), 1, "el cron no tiene un filtro 12 propio");
    } finally {
      catalogoDePrueba.soloOrgId = restriccionOriginal;
    }
    assert.equal((await requireModuloActivo("campanas_envio", { rol: "admin" }))?.status, 404);
    await db.moduloOrg.updateMany({ where: { clave: "campanas_envio" }, data: { activo: false } });
    assert.equal((await requireModuloActivo("campanas_envio", { rol: "admin" }))?.status, 404);
  });
  await runWithOrg(orgId, () => db.moduloOrg.updateMany({ where: { clave: "campanas_envio" }, data: { activo: false } }));
  const apagado = await runWithOrg(orgId, () => requireModuloActivo("campanas_envio", { rol: "admin" }));
  assert.equal(apagado?.status, 404);
  console.log("campanas-envio: CSV/XLSX, variables vacías, contactos, calendario, Graph temporal, reanudación, topes, concurrencia, reinicio, códigos Meta, fallos, bajas, RLS, restricción EXI e interruptor general OK");
}

try { await main(); }
finally { globalThis.fetch = fetchOriginal; await admin.end(); await dbRaw.$disconnect(); }
