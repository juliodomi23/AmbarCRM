import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { apiE2E, loginE2E, paginaE2E } from "./e2e-http";

const baseUrl = process.env.E2E_BASE_URL ?? "";
const adminUrl = process.env.ADMIN_DATABASE_URL ?? "";
if (!baseUrl || !adminUrl) throw new Error("Define E2E_BASE_URL y ADMIN_DATABASE_URL locales explícitas.");
const base = new URL(baseUrl);
const baseDatos = new URL(adminUrl);
if (
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  base.port !== "3120" ||
  !["localhost", "127.0.0.1"].includes(baseDatos.hostname) ||
  !["55433", "55451"].includes(baseDatos.port)
) {
  throw new Error("Esta prueba sólo admite HTTP local :3120 y una BD desechable local :55433 o :55451.");
}

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgA = BigInt(Date.now()) * 1000n + 222n;
const orgB = orgA + 1n;
const slugA = `contenido-e2e-a-${sufijo}`;
const slugB = `contenido-e2e-b-${sufijo}`;
const password = "Contenido-E2E-2026!";

type PiezaDto = {
  id: string;
  version: number;
  estado: string;
  titulo: string;
  copy: string;
  redactorId: string | null;
  revisorId: string | null;
  fechaPublicacion: string | null;
  publicadaAt: string | null;
  comentarios: { id: string; texto: string; tipo: string }[];
  cambios: { estadoAnterior: string | null; estadoNuevo: string }[];
};

async function main() {
  await admin.query(
    "INSERT INTO orgs(id,nombre,slug) VALUES ($1,'Contenido E2E A',$2),($3,'Contenido E2E B',$4)",
    [String(orgA), slugA, String(orgB), slugB],
  );
  const hash = await bcrypt.hash(password, 10);
  const usuarios = [
    { org: orgA, nombre: "Admin A", email: `admin-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
    { org: orgA, nombre: "Redactor A", email: `redactor-${sufijo}@test.local`, rol: "agente", puesto: "Mercadotecnia" },
    { org: orgA, nombre: "Revisor A", email: `revisor-${sufijo}@test.local`, rol: "agente", puesto: "Dirección comercial" },
    { org: orgB, nombre: "Admin B", email: `admin-b-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
  ] as const;
  const ids = new Map<string, string>();
  const idDe = (email: string) => {
    const id = ids.get(email);
    assert.ok(id, `Falta el usuario ${email}`);
    return id;
  };
  for (const usuario of usuarios) {
    const { rows } = await admin.query(
      "INSERT INTO usuarios(org_id,nombre,email,password_hash,rol,puesto) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text AS id",
      [String(usuario.org), usuario.nombre, usuario.email, hash, usuario.rol, usuario.puesto],
    );
    ids.set(usuario.email, rows[0].id);
  }
  const contactoA = (
    await admin.query(
      "INSERT INTO contactos(org_id,nombre,telefono) VALUES ($1,'Cliente Contenido A',$2) RETURNING id::text AS id",
      [String(orgA), `5297${Date.now()}`],
    )
  ).rows[0].id;
  const contactoB = (
    await admin.query(
      "INSERT INTO contactos(org_id,nombre,telefono) VALUES ($1,'Cliente Contenido B',$2) RETURNING id::text AS id",
      [String(orgB), `5286${Date.now()}`],
    )
  ).rows[0].id;
  await admin.query(
    "INSERT INTO modulos_org(org_id,clave,activo) VALUES ($1,'contenido',true),($2,'contenido',true)",
    [String(orgA), String(orgB)],
  );

  const adminA = await loginE2E(baseUrl, usuarios[0].email, slugA, password);
  const redactorA = await loginE2E(baseUrl, usuarios[1].email, slugA, password);
  const revisorA = await loginE2E(baseUrl, usuarios[2].email, slugA, password);
  const adminB = await loginE2E(baseUrl, usuarios[3].email, slugB, password);

  assert.equal((await apiE2E(baseUrl, "", "/api/contenido/piezas")).status, 307);
  assert.equal((await apiE2E(baseUrl, "", "/api/contenido/piezas", "POST", {})).status, 307);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/contenido/piezas")).status, 200);
  assert.equal((await apiE2E(baseUrl, redactorA, "/api/contenido/piezas")).status, 200);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/contenido/piezas", "POST", { canal: "instagram" })).status, 400);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/contenido/piezas", "POST", {
    titulo: "Enlace inválido", canal: "instagram", formato: "imagen", enlaceMaterial: "http://ejemplo.test/material",
  })).status, 400);

  const pieza = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, redactorA, "/api/contenido/piezas", "POST", {
      titulo: `Pieza E2E ${sufijo}`,
      copy: "Copy inicial",
      canal: "instagram",
      formato: "imagen",
      contactoId: contactoA,
      redactorId: idDe(usuarios[1].email),
      revisorId: idDe(usuarios[2].email),
      enlaceMaterial: "https://ejemplo.test/material",
    })
  ).data.pieza;
  assert.ok(pieza);
  assert.equal(pieza.estado, "idea");
  assert.equal(pieza.version, 1);
  assert.equal(String(pieza.redactorId), idDe(usuarios[1].email));
  assert.equal(String(pieza.revisorId), idDe(usuarios[2].email));
  assert.equal((await apiE2E(baseUrl, adminA, "/api/contenido/piezas", "POST", { titulo: "Contacto ajeno", canal: "instagram", contactoId: contactoB })).status, 400);
  assert.equal((await apiE2E(baseUrl, adminB, `/api/contenido/piezas/${pieza.id}`)).status, 404);
  assert.equal((await apiE2E(baseUrl, adminB, `/api/contenido/piezas/${pieza.id}`, "PATCH", { version: 1, titulo: "Cruce" })).status, 404);
  assert.equal((await apiE2E(baseUrl, adminB, `/api/contenido/piezas/${pieza.id}/comentarios`, "POST", { texto: "Cruce" })).status, 404);

  assert.equal((await apiE2E(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`, "PATCH", { version: 1, estado: "aprobado" })).status, 409);
  const redaccion = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, redactorA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: 1,
      estado: "redaccion",
    })
  ).data.pieza;
  assert.equal(redaccion?.estado, "redaccion");
  assert.equal(redaccion?.version, 2);
  assert.equal((await apiE2E(baseUrl, redactorA, `/api/contenido/piezas/${pieza.id}`, "PATCH", { version: 1, copy: "Versión vieja" })).status, 409);

  const revision = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, redactorA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: 2,
      estado: "revision",
    })
  ).data.pieza;
  assert.equal(revision?.estado, "revision");
  assert.equal(revision?.version, 3);
  assert.equal((await apiE2E(baseUrl, redactorA, `/api/contenido/piezas/${pieza.id}`, "PATCH", { version: 3, estado: "aprobado" })).status, 403);

  const comentario = (
    await apiE2E<{ comentario: { id: string; texto: string; tipo: string }; estado: string }>(
      baseUrl,
      revisorA,
      `/api/contenido/piezas/${pieza.id}/comentarios`,
      "POST",
      { texto: "Ajusta el copy", tipo: "cambio_solicitado" },
    )
  ).data;
  assert.equal(comentario.estado, "cambios");
  assert.equal(comentario.comentario.tipo, "cambio_solicitado");
  const comentarios = (await apiE2E<{ comentarios: { id: string }[] }>(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}/comentarios`)).data.comentarios;
  assert.equal(comentarios.length, 1);

  const enRevision = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, redactorA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: 4,
      estado: "revision",
    })
  ).data.pieza;
  assert.equal(enRevision?.estado, "revision");
  assert.equal(enRevision?.version, 5);
  const aprobada = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, revisorA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: 5,
      estado: "aprobado",
    })
  ).data.pieza;
  assert.equal(aprobada?.estado, "aprobado");
  assert.equal(aprobada?.version, 6);

  const reabierta = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: 6,
      copy: "Copy corregido",
    })
  ).data.pieza;
  assert.equal(reabierta?.estado, "revision");
  assert.equal(reabierta?.version, 7);
  assert.equal(reabierta?.cambios.at(-1)?.estadoNuevo, "revision");

  const aprobada2 = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: 7,
      estado: "aprobado",
    })
  ).data.pieza;
  assert.equal(aprobada2?.estado, "aprobado");
  assert.equal((await apiE2E(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`, "PATCH", { version: 8, estado: "programado" })).status, 400);
  const programada = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: 8,
      estado: "programado",
      fechaPublicacion: "2026-11-20",
    })
  ).data.pieza;
  assert.equal(programada?.estado, "programado");
  assert.ok(programada?.fechaPublicacion);
  const publicada = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`, "PATCH", {
      version: programada!.version,
      estado: "publicado",
    })
  ).data.pieza;
  assert.equal(publicada?.estado, "publicado");
  assert.ok(publicada?.publicadaAt);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`, "DELETE")).status, 403);

  const piezaBorrar = (
    await apiE2E<{ pieza: PiezaDto }>(baseUrl, redactorA, "/api/contenido/piezas", "POST", {
      titulo: `Pieza para borrar ${sufijo}`,
      canal: "facebook",
      formato: "texto",
      redactorId: idDe(usuarios[1].email),
    })
  ).data.pieza;
  assert.ok(piezaBorrar);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/contenido/piezas/${piezaBorrar.id}`, "DELETE")).status, 200);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/contenido/piezas/${piezaBorrar.id}`)).status, 404);

  const listado = (await apiE2E<{ piezas: PiezaDto[] }>(baseUrl, adminA, "/api/contenido/piezas?estado=publicado")).data.piezas;
  assert.equal(listado.length, 1);
  assert.equal(listado[0]?.id, pieza.id);
  assert.equal((await apiE2E<{ piezas: PiezaDto[] }>(baseUrl, adminB, "/api/contenido/piezas")).data.piezas.length, 0);

  for (const ruta of ["/contenido", "/contenido/tablero", "/contenido/piezas", "/contenido/revision"]) {
    assert.equal(await paginaE2E(baseUrl, adminA, ruta), 200, ruta);
  }

  await admin.query("UPDATE modulos_org SET activo=false WHERE org_id=$1 AND clave='contenido'", [String(orgA)]);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/contenido/piezas")).status, 404);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/contenido/piezas", "POST", { titulo: "Sin módulo", canal: "instagram" })).status, 404);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/contenido/piezas/${pieza.id}`)).status, 404);
  await admin.query("UPDATE modulos_org SET activo=true WHERE org_id=$1 AND clave='contenido'", [String(orgA)]);

  console.log("HTTP Contenido completo: login real, pieza, comentarios, revisión/aprobación, regreso a revisión, programación, publicación, tenant y módulo desactivado OK");
}

try {
  await main();
} finally {
  for (const tabla of ["contenido_comentarios", "contenido_cambios", "contenido_piezas", "contactos", "usuarios", "modulos_org"]) {
    await admin.query(`DELETE FROM ${tabla} WHERE org_id IN ($1,$2)`, [String(orgA), String(orgB)]);
  }
  await admin.query("DELETE FROM orgs WHERE id IN ($1,$2)", [String(orgA), String(orgB)]);
  await admin.end();
}
