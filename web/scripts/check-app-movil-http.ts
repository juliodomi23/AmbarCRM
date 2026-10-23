import assert from "node:assert/strict";
import pg from "pg";
import { decode, encode } from "next-auth/jwt";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";

const base = process.env.APP_URL;
if (!base) throw new Error("APP_URL es obligatorio");
const url = new URL(base);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol !== "http:") throw new Error("APP_URL solo admite HTTP local");
for (const valor of [process.env.DATABASE_URL, process.env.ADMIN_DATABASE_URL]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL");
  const dbUrl = new URL(valor);
  if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname) || dbUrl.pathname !== "/app_movil_test") throw new Error("La prueba solo admite app_movil_test local");
}
const fetchLocal = (ruta: string, init?: RequestInit) => fetch(new URL(ruta, base), { ...init, redirect: "manual" });
const admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });

async function main() {
  const fixture = await admin.query<{ id: string; slug: string; email: string; usuario_id: string }>(
    `SELECT o.id,o.slug,u.email,u.id AS usuario_id FROM orgs o JOIN usuarios u ON u.org_id=o.id
     WHERE o.slug LIKE 'movil-a-%' AND o.activo AND u.rol='admin' ORDER BY o.id DESC LIMIT 1`
  );
  assert.equal(fixture.rowCount, 1, "ejecuta check:app-movil primero");
  const { id: orgId, slug, email, usuario_id: usuarioId } = fixture.rows[0];
  const login = await fetchLocal("/api/movil/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org: slug, email, password: "ClavePrueba2026" }) });
  assert.equal(login.status, 200);
  const datos = await login.json();
  const bearer = { Authorization: `Bearer ${datos.token}` };
  console.log("login", JSON.stringify({ status: login.status, usuario: datos.usuario, org: datos.org, expiraEn: datos.expiraEn }));

  const csrf = await fetchLocal("/api/auth/csrf");
  assert.equal(csrf.status, 200);
  const csrfToken = (await csrf.json()).csrfToken as string;
  const csrfCookie = csrf.headers.get("set-cookie")?.split(";")[0] ?? "";
  const webLogin = await fetchLocal("/api/auth/callback/credentials", { method: "POST",
    headers: { Cookie: csrfCookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password: "ClavePrueba2026", orgSlug: slug, json: "true" }) });
  assert.ok([200, 302].includes(webLogin.status));
  const cookieSesion = webLogin.headers.get("set-cookie") ?? "";
  assert.ok(cookieSesion.includes("next-auth.session-token"));
  const expiracionCookie = /Expires=([^;]+)/i.exec(cookieSesion)?.[1];
  assert.ok(expiracionCookie);
  assert.ok(Math.abs(new Date(expiracionCookie).getTime() - Date.now() - 604800000) < 60000);
  console.log("login web", JSON.stringify({ status: webLogin.status, cookieSieteDias: true }));
  const cookieWeb = /(?:^|,\s*)(next-auth\.session-token=[^;]+)/.exec(cookieSesion)?.[1];
  assert.ok(cookieWeb);

  const shell = await fetchLocal("/api/shell", { headers: bearer });
  assert.equal(shell.status, 200);
  console.log("shell", JSON.stringify(await shell.json()).slice(0, 400));
  const lista = await fetchLocal("/api/conversaciones", { headers: bearer });
  assert.equal(lista.status, 200);
  console.log("conversaciones", JSON.stringify(await lista.json()).slice(0, 400));
  const sin = await fetchLocal("/api/shell");
  assert.equal(sin.status, 307);
  assert.ok(sin.headers.get("location")?.includes("/api/auth/signin") || sin.headers.get("location")?.includes("/login"));
  const malo = await fetchLocal("/api/shell", { headers: { Authorization: "Bearer inválido" } });
  assert.equal(malo.status, 401);
  assert.deepEqual(await malo.json(), { error: "no autorizado" });
  const revocado = await encode({ secret: process.env.NEXTAUTH_SECRET!, maxAge: 604800,
    token: { sub: usuarioId, id: usuarioId, orgId, rol: "admin", revocado: true } });
  const r = await fetchLocal("/api/shell", { headers: { Authorization: `Bearer ${revocado}` } });
  assert.equal(r.status, 401);
  const ganaCookie = await fetchLocal("/api/shell", { headers: { Authorization: `Bearer ${revocado}`, Cookie: cookieWeb } });
  assert.equal(ganaCookie.status, 200);

  const archivo = `o${orgId}-${Date.now()}-${"0".repeat(32)}.png`;
  const orgAjena = await admin.query<{ id: string }>("SELECT id FROM orgs WHERE slug=$1", [slug.replace("movil-a-", "movil-b-")]);
  const archivoAjeno = `o${orgAjena.rows[0].id}-${Date.now()}-${"1".repeat(32)}.png`;
  const botToken = `bot-http-${Date.now()}`;
  await admin.query("INSERT INTO bots(org_id,nombre,webhook_url,api_token) VALUES($1,'Bot prueba','http://127.0.0.1:9',$2)", [orgId, botToken]);
  const directorio = path.join(process.cwd(), "uploads");
  await mkdir(directorio, { recursive: true });
  await writeFile(path.join(directorio, archivo), Buffer.from([137, 80, 78, 71]));
  await writeFile(path.join(directorio, archivoAjeno), Buffer.from([137, 80, 78, 71]));
  try {
    const mediaBearer = await fetchLocal(`/api/media/${archivo}`, { headers: bearer });
    const mediaCookie = await fetchLocal(`/api/media/${archivo}`, { headers: { Cookie: cookieWeb } });
    const mediaBot = await fetchLocal(`/api/media/${archivo}`, { headers: { "x-bot-token": botToken } });
    const mediaSin = await fetchLocal(`/api/media/${archivo}`);
    const mediaAjena = await fetchLocal(`/api/media/${archivoAjeno}`, { headers: bearer });
    assert.equal(mediaBearer.status, 200);
    assert.equal(mediaCookie.status, 200);
    assert.equal(mediaBot.status, 200);
    assert.equal(mediaSin.status, 401);
    assert.equal(mediaAjena.status, 404);
    if (process.env.META_TOKEN_ENCRYPTION_KEY) {
      const vence = String(Math.floor(Date.now() / 1000) + 300);
      const firma = createHmac("sha256", Buffer.from(process.env.META_TOKEN_ENCRYPTION_KEY, "base64"))
        .update(`media-messenger:${vence}:${archivo}`).digest("hex");
      const firmada = await fetchLocal(`/api/media/${archivo}?vence=${vence}&firma=${firma}`);
      assert.equal(firmada.status, 200);
    }
    console.log("media", JSON.stringify({ bearer: mediaBearer.status, cookie: mediaCookie.status, bot: mediaBot.status, sinCredenciales: mediaSin.status, otraOrg: mediaAjena.status, firmada: !!process.env.META_TOKEN_ENCRYPTION_KEY }));
  } finally { await unlink(path.join(directorio, archivo)); await unlink(path.join(directorio, archivoAjeno)); }
  const botEnMovil = await fetchLocal("/api/movil/renovar", { method: "POST", headers: { Authorization: `Bearer ${botToken}` } });
  assert.equal(botEnMovil.status, 401);
  const movilEnBot = await fetchLocal(`/api/v1/accounts/${orgId}/conversations`, { headers: bearer });
  assert.equal(movilEnBot.status, 401);

  const renovar = await fetchLocal("/api/movil/renovar", { method: "POST", headers: bearer });
  assert.equal(renovar.status, 200);
  const renovado = await renovar.json();
  assert.notEqual(renovado.token, datos.token);
  const [tokenPrimero, tokenSegundo] = await Promise.all([
    decode({ token: datos.token, secret: process.env.NEXTAUTH_SECRET! }),
    decode({ token: renovado.token, secret: process.env.NEXTAUTH_SECRET! })
  ]);
  assert.equal(tokenSegundo?.emitidoAt, tokenPrimero?.emitidoAt);
  console.log("renovar", JSON.stringify({ status: renovar.status, usuario: renovado.usuario, org: renovado.org }));
  const tokenFcm = `http-${Date.now()}`;
  const alta = await fetchLocal("/api/movil/dispositivo", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ tokenFcm, plataforma: "android" }) });
  assert.equal(alta.status, 200);
  console.log("dispositivo", JSON.stringify(await alta.json()));
  const invalido = await fetchLocal("/api/movil/dispositivo", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ tokenFcm: "", plataforma: "web" }) });
  assert.equal(invalido.status, 400);
  const logout = await fetchLocal("/api/movil/logout", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ tokenFcm }) });
  assert.equal(logout.status, 200);
  assert.equal((await admin.query("SELECT 1 FROM dispositivos_push WHERE token_fcm=$1", [tokenFcm])).rowCount, 0);
  console.log("logout", JSON.stringify(await logout.json()));

  const brand = await fetchLocal(`/api/public/brand?slug=${slug}`);
  assert.equal(brand.status, 200);
  console.log("brand", JSON.stringify(await brand.json()).slice(0, 400));
  const search = await fetchLocal("/api/buscar?q=zz", { headers: bearer });
  assert.equal(search.status, 200);
  console.log("buscar", JSON.stringify(await search.json()).slice(0, 400));
  const templates = await fetchLocal("/api/meta/templates?canalId=0", { headers: bearer });
  console.log("templates", templates.status, JSON.stringify(await templates.json()).slice(0, 300));

  const contacto = await admin.query<{ id: string }>("INSERT INTO contactos(org_id,nombre,telefono) VALUES($1,'Ana móvil',$2) RETURNING id", [orgId, `52${Date.now()}`]);
  const canal = await admin.query<{ id: string }>("INSERT INTO canales_whatsapp(org_id,nombre,proveedor,activo) VALUES($1,'WhatsApp local','cloud_api',true) RETURNING id", [orgId]);
  const conv = await admin.query<{ id: string }>("INSERT INTO conversaciones(org_id,contacto_id,canal_id,bot_activo,no_leidos) VALUES($1,$2,$3,true,1) RETURNING id", [orgId, contacto.rows[0].id, canal.rows[0].id]);
  const conversacionId = conv.rows[0].id;
  const etiqueta = await fetchLocal("/api/etiquetas", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ nombre: `VIP-${conversacionId}` }) });
  assert.equal(etiqueta.status, 200);
  const etiquetar = await fetchLocal(`/api/conversaciones/${conversacionId}`, { method: "PATCH", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ etiquetas: [`VIP-${conversacionId}`] }) });
  assert.equal(etiquetar.status, 200);
  const detalle = await fetchLocal(`/api/conversaciones/${conversacionId}`, { headers: bearer });
  assert.equal(detalle.status, 200);
  console.log("detalle", JSON.stringify(await detalle.json()).slice(0, 500));
  const mensajes = await fetchLocal(`/api/conversaciones/${conversacionId}/mensajes`, { headers: bearer });
  assert.equal(mensajes.status, 200);
  console.log("mensajes", JSON.stringify(await mensajes.json()).slice(0, 300));
  const ejemploConv = await fetchLocal("/api/conversaciones", { headers: bearer });
  const convEtiquetada = (await ejemploConv.json()).conversaciones.find((c: any) => c.id === conversacionId);
  console.log("conversación etiquetada", JSON.stringify(convEtiquetada).slice(0, 700));
  const ventana = await fetchLocal("/api/mensajes/enviar", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ conversacionId, texto: "Hola" }) });
  assert.equal(ventana.status, 400);
  console.log("ventana cerrada", JSON.stringify(await ventana.json()));
  const cerrar = await fetchLocal(`/api/conversaciones/${conversacionId}`, { method: "PATCH", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ estado: "cerrada" }) });
  assert.equal(cerrar.status, 200);
  assert.equal((await admin.query("SELECT estado FROM conversaciones WHERE id=$1", [conversacionId])).rows[0].estado, "cerrada");
  console.log("cerrar", JSON.stringify(await cerrar.json()));

  const stream = await fetch(new URL("/api/stream", base), { headers: bearer, signal: AbortSignal.timeout(6000) });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  const primero = new TextDecoder().decode((await reader.read()).value);
  assert.ok(primero.includes(": conectado"));
  const orgB = await admin.query<{ id: string }>("SELECT id FROM orgs WHERE slug=$1", [slug.replace("movil-a-", "movil-b-")]);
  const contactoB = await admin.query<{ id: string }>("INSERT INTO contactos(org_id,nombre,telefono) VALUES($1,'Contacto B',$2) RETURNING id", [orgB.rows[0].id, `52${Date.now()}8`]);
  const convB = await admin.query<{ id: string }>("INSERT INTO conversaciones(org_id,contacto_id) VALUES($1,$2) RETURNING id", [orgB.rows[0].id, contactoB.rows[0].id]);
  await admin.query("INSERT INTO mensajes(org_id,conversacion_id,direccion,contenido) VALUES($1,$2,'entrante','evento B')", [orgB.rows[0].id, convB.rows[0].id]);
  await admin.query("INSERT INTO mensajes(org_id,conversacion_id,direccion,contenido) VALUES($1,$2,'entrante','evento local')", [orgId, conversacionId]);
  const evento = new TextDecoder().decode((await reader.read()).value);
  assert.ok(evento.includes("data:"));
  assert.ok(evento.includes(`\"org_id\" : ${orgId}`));
  assert.ok(!evento.includes("evento B"));
  await reader.cancel();
  console.log("stream", JSON.stringify({ primero: primero.trim(), evento: evento.trim().slice(0, 300) }));
  await admin.query("UPDATE usuarios SET password_cambiada_at=now() WHERE id=$1", [usuarioId]);
  const vieja = await fetchLocal("/api/movil/renovar", { method: "POST", headers: bearer });
  assert.equal(vieja.status, 401);
  await admin.query("UPDATE usuarios SET password_cambiada_at=NULL WHERE id=$1", [usuarioId]);
  await verificarLecturas({ orgId, slug, usuarioId, bearer });
  console.log("check-app-movil-http OK");
}

async function verificarLecturas({ orgId, slug, usuarioId, bearer }: {
  orgId: string; slug: string; usuarioId: string; bearer: Record<string, string>;
}) {
  const orgB = (await admin.query<{ id: string }>("SELECT id FROM orgs WHERE slug=$1", [slug.replace("movil-a-", "movil-b-")])).rows[0].id;
  await admin.query("UPDATE orgs SET activo=true WHERE id=$1", [orgB]);
  const emailAgente = `agente-${Date.now()}@prueba.test`;
  const agente = await admin.query<{ id: string }>(
    "INSERT INTO usuarios(org_id,nombre,email,password_hash,rol,puesto) SELECT $1,'Agente móvil',$2,password_hash,'agente','Cajero' FROM usuarios WHERE id=$3 RETURNING id",
    [orgId, emailAgente, usuarioId]
  );
  const accesoAgente = await fetchLocal("/api/movil/login", { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "192.0.2.211" },
    body: JSON.stringify({ org: slug, email: emailAgente, password: "ClavePrueba2026" }) });
  assert.equal(accesoAgente.status, 200);
  const bearerAgente = { Authorization: `Bearer ${(await accesoAgente.json()).token}` };
  const fixtureB = (await admin.query<{ slug: string; email: string }>(
    "SELECT o.slug,u.email FROM orgs o JOIN usuarios u ON u.org_id=o.id WHERE o.id=$1 AND u.rol='agente' ORDER BY u.id LIMIT 1", [orgB]
  )).rows[0];
  const accesoB = await fetchLocal("/api/movil/login", { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "192.0.2.212" },
    body: JSON.stringify({ org: fixtureB.slug, email: fixtureB.email, password: "ClavePrueba2026" }) });
  assert.equal(accesoB.status, 200);
  const bearerB = { Authorization: `Bearer ${(await accesoB.json()).token}` };

  const contactos: string[] = [];
  const marcaContactos = `Lote móvil ${Date.now()}`;
  for (let i = 0; i < 7; i++) {
    const creado = await admin.query<{ id: string }>(
      "INSERT INTO contactos(org_id,nombre,telefono,responsable_id) VALUES($1,$2,$3,$4) RETURNING id",
      [orgId, i < 5 ? `${marcaContactos} ${i}` : `Bandeja móvil ${i}`, `5255${Date.now()}${i}`, agente.rows[0].id]
    );
    contactos.push(creado.rows[0].id);
  }
  const contactoB = (await admin.query<{ id: string }>(
    "INSERT INTO contactos(org_id,nombre,telefono) VALUES($1,'Solo org B',$2) RETURNING id",
    [orgB, `5255${Date.now()}9`]
  )).rows[0].id;
  const etiquetaA = (await admin.query<{ id: string }>(
    "INSERT INTO etiquetas(org_id,nombre) VALUES($1,$2) RETURNING id", [orgId, `Lectura-${Date.now()}`]
  )).rows[0].id;
  await admin.query("INSERT INTO contacto_etiquetas(org_id,contacto_id,etiqueta_id) VALUES($1,$2,$3)", [orgId, contactos[0], etiquetaA]);
  const etiquetaB = (await admin.query<{ id: string }>(
    "INSERT INTO etiquetas(org_id,nombre) VALUES($1,$2) RETURNING id", [orgB, `Ajena-${Date.now()}`]
  )).rows[0].id;
  const embudoA = (await admin.query<{ id: string }>(
    "INSERT INTO embudos(org_id,nombre) VALUES($1,'Embudo móvil A') RETURNING id", [orgId]
  )).rows[0].id;
  const embudoB = (await admin.query<{ id: string }>(
    "INSERT INTO embudos(org_id,nombre) VALUES($1,'Embudo móvil B') RETURNING id", [orgB]
  )).rows[0].id;
  const etapa1 = (await admin.query<{ id: string }>(
    "INSERT INTO etapas(org_id,embudo_id,nombre,orden) VALUES($1,$2,'Nuevo',1) RETURNING id", [orgId, embudoA]
  )).rows[0].id;
  const etapa2 = (await admin.query<{ id: string }>(
    "INSERT INTO etapas(org_id,embudo_id,nombre,orden) VALUES($1,$2,'Seguimiento',2) RETURNING id", [orgId, embudoA]
  )).rows[0].id;
  const oportunidad = (await admin.query<{ id: string }>(
    "INSERT INTO oportunidades(org_id,contacto_id,embudo_id,etapa_id,titulo,valor,responsable_id,campos) VALUES($1,$2,$3,$4,'Oportunidad móvil',123,$5,$6::jsonb) RETURNING id",
    [orgId, contactos[0], embudoA, etapa1, agente.rows[0].id, JSON.stringify({ valorAnual: 1200 })]
  )).rows[0].id;
  const tarea = (await admin.query<{ id: string }>(
    "INSERT INTO tareas(org_id,titulo,oportunidad_id,responsable_id,vence_at) VALUES($1,'Llamar desde móvil',$2,$3,'2000-01-01') RETURNING id",
    [orgId, oportunidad, agente.rows[0].id]
  )).rows[0].id;
  await admin.query("INSERT INTO tareas(org_id,titulo) VALUES($1,'Solo tarea B')", [orgB]);
  const conversaciones: string[] = [];
  for (let i = 0; i < 7; i++) {
    const creada = await admin.query<{ id: string }>(
      `INSERT INTO conversaciones(org_id,contacto_id,responsable_id,estado,fijado_at,ultimo_mensaje_at)
       VALUES($1,$2,$3,$4,CASE WHEN $5::int < 2 THEN now() - ($5::int || ' minutes')::interval ELSE NULL END,
       CASE WHEN $5::int = 6 THEN NULL ELSE now() - (($5::int + 1) || ' hours')::interval END) RETURNING id`,
      [orgId, contactos[i], agente.rows[0].id, i === 5 ? "cerrada" : "abierta", i]
    );
    conversaciones.push(creada.rows[0].id);
  }
  await admin.query("INSERT INTO mensajes(org_id,conversacion_id,direccion,contenido) VALUES($1,$2,'entrante','búsqueda móvil')", [orgId, conversaciones[0]]);
  await admin.query("UPDATE conversaciones SET ultimo_mensaje_at=now()-interval '60 days' - id * interval '1 second' WHERE org_id=$1 AND id<$2 AND fijado_at IS NULL", [orgId, conversaciones[0]]);
  await admin.query("INSERT INTO conversaciones(org_id,contacto_id) VALUES($1,$2)", [orgB, contactoB]);

  const rutas = ["usuarios", "etiquetas", "contactos", "embudos", `embudos/${embudoA}`, "tareas", "conversaciones"];
  const leer = async (ruta: string, headers = bearer) => {
    const respuesta = await fetchLocal(`/api/movil/${ruta}`, { headers });
    assert.equal(respuesta.status, 200, ruta);
    assert.equal(respuesta.headers.get("cache-control"), "no-store");
    const texto = await respuesta.text();
    assert.ok(!/passwordHash|password_hash|\$2[aby]\$/i.test(texto), `fuga en ${ruta}`);
    return JSON.parse(texto);
  };
  for (const ruta of rutas) {
    await leer(ruta);
    await leer(ruta, bearerAgente);
    const sin = await fetchLocal(`/api/movil/${ruta}`);
    assert.equal(sin.status, 307);
    const invalido = await fetchLocal(`/api/movil/${ruta}`, { headers: { Authorization: "Bearer inválido" } });
    assert.equal(invalido.status, 401);
  }
  const usuarios = await leer("usuarios", bearerAgente);
  assert.equal(usuarios.usuarios.find((u: any) => u.id === agente.rows[0].id).puedeAtender, false);
  assert.ok(!usuarios.usuarios.some((u: any) => u.id === contactoB));
  const etiquetas = await leer("etiquetas");
  assert.ok(etiquetas.etiquetas.some((e: any) => e.id === etiquetaA));
  assert.ok(!(await leer("etiquetas", bearerB)).etiquetas.some((e: any) => e.id === etiquetaA));
  assert.ok((await leer("usuarios", bearerB)).usuarios.every((u: any) => u.id !== agente.rows[0].id));

  const ids: string[] = [];
  let cursor: string | null = null;
  let paginasContactos = 0;
  do {
    const datos = await leer(`contactos?q=${encodeURIComponent(marcaContactos)}&limite=2${cursor ? `&cursor=${cursor}` : ""}`);
    ids.push(...datos.contactos.map((c: any) => c.id));
    cursor = datos.siguiente;
    paginasContactos++;
  } while (cursor);
  assert.equal(paginasContactos, 3);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(contactos.slice(0, 5).every((id) => ids.includes(id)));
  assert.ok(!(await leer("contactos", bearerB)).contactos.some((c: any) => contactos.includes(c.id)));
  assert.equal((await leer(`contactos?q=${encodeURIComponent(marcaContactos)}`)).contactos.length, 5);
  assert.equal((await leer("contactos?q=L")).contactos.length, (await leer("contactos")).contactos.length);
  const embudos = await leer("embudos", bearerB);
  assert.ok(!embudos.embudos.some((e: any) => e.id === embudoA));
  assert.equal((await fetchLocal(`/api/movil/embudos/${embudoA}`, { headers: bearerB })).status, 404);
  assert.equal((await fetchLocal("/api/movil/embudos/no", { headers: bearer })).status, 400);
  assert.ok((await leer(`embudos/${embudoA}`)).etapas[0].tarjetas[0].titulo.includes("valor anual"));
  assert.equal((await leer(`embudos/${embudoA}`)).etapas[0].total, 1);
  assert.equal((await leer(`embudos/${embudoA}`)).etapas[0].tarjetas[0].diasEnEtapa, 0);
  assert.ok(!(await leer("tareas", bearerB)).tareas.some((t: any) => t.id === tarea));
  assert.ok((await leer("tareas?completada=false")).tareas.some((t: any) => t.id === tarea));
  const completar = await fetchLocal(`/api/tareas/${tarea}`, { method: "PATCH", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ completada: true }) });
  assert.equal(completar.status, 200);
  assert.ok((await leer("tareas?completada=true")).tareas.some((t: any) => t.id === tarea));
  const mover = await fetchLocal("/api/oportunidades/mover", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ oportunidadId: oportunidad, etapaIdDestino: etapa2, ordenIds: [oportunidad] }) });
  assert.equal(mover.status, 200);
  assert.equal((await leer(`embudos/${embudoA}`)).etapas[1].total, 1);
  await admin.query("INSERT INTO tareas(org_id,titulo) SELECT $1,'Tarea masiva ' || i FROM generate_series(1,501) i", [orgId]);
  assert.equal((await leer("tareas")).truncado, true);

  const webAntes = await fetchLocal("/api/conversaciones", { headers: bearer });
  const jsonAntes = await webAntes.json();
  assert.ok(jsonAntes.conversaciones.every((c: any) => !("updatedAt" in c)));
  const listaMovil: any[] = [];
  let siguiente: string | null = null;
  do {
    const datos = await leer(`conversaciones?limite=3${siguiente ? `&cursor=${encodeURIComponent(siguiente)}` : ""}`);
    listaMovil.push(...datos.conversaciones);
    siguiente = datos.siguiente;
    if (listaMovil.length === 3) {
      assert.deepEqual(await (await fetchLocal("/api/conversaciones", { headers: bearer })).json(), jsonAntes);
      await admin.query("UPDATE conversaciones SET ultimo_mensaje_at=now() WHERE id=$1", [conversaciones[6]]);
    }
  } while (siguiente);
  assert.equal(new Set(listaMovil.map((c) => c.id)).size, listaMovil.length);
  assert.deepEqual(listaMovil.map((c) => c.id), jsonAntes.conversaciones.map((c: any) => c.id));
  assert.ok(listaMovil.every((c) => c.updatedAt));
  assert.ok(!(await leer("conversaciones", bearerB)).conversaciones.some((c: any) => conversaciones.includes(c.id)));
  assert.ok((await leer("conversaciones?estado=cerrada")).conversaciones.every((c: any) => c.estado === "cerrada"));
  assert.equal((await leer("conversaciones?q=b%C3%BAsqueda")).siguiente, null);
  const webDespues = await fetchLocal("/api/conversaciones", { headers: bearer });
  assert.deepEqual(Object.keys(await webDespues.json()), Object.keys(jsonAntes));

  const templatesAgente = await fetchLocal("/api/meta/templates?canalId=0", { headers: bearerAgente });
  assert.equal(templatesAgente.status, 404);
  assert.deepEqual(await templatesAgente.json(), { error: "canal inexistente" });
  assert.equal((await fetchLocal("/api/meta/templates", { method: "POST", headers: bearerAgente, body: "{}" })).status, 403);
  assert.equal((await fetchLocal("/api/meta/templates", { method: "POST", headers: bearer, body: "{}" })).status, 404);
  assert.equal((await fetchLocal("/api/meta/webhook")).status, 403);
  assert.equal((await fetchLocal("/api/meta/webhook", { method: "POST", body: "{}" })).status, 401);
  console.log("lecturas móviles", JSON.stringify({ usuarios: usuarios.usuarios.slice(0, 2), etiquetas: etiquetas.etiquetas.slice(0, 1),
    contactos: await leer("contactos?limite=1"), embudos: (await leer("embudos")).embudos.find((e: any) => e.id === embudoA),
    embudo: await leer(`embudos/${embudoA}`),
    tarea: (await leer("tareas?completada=true")).tareas[0], conversacion: listaMovil[0] }));
}

try { await main(); }
finally { await admin.end(); }
