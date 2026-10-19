import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";

const base = process.env.E2E_BASE_URL!;
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.equal(new URL(base).port, "3118");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const marca = Date.now();
const cookieDe = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ");
try {
  const org = await dbRaw.org.create({ data: { nombre: "Precarga de citas", slug: `precarga-${marca}` } });
  const ajena = await dbRaw.org.create({ data: { nombre: "Otra empresa", slug: `precarga-ajena-${marca}` } });
  const email = `precarga-${marca}@local.test`, password = "Precarga-local-2026";
  const contacto = await runWithOrg(org.id, async () => {
    await db.usuario.create({ data: { nombre: "Recepción", email, passwordHash: await bcrypt.hash(password, 10), rol: "admin" } });
    await db.moduloOrg.createMany({ data: [{ clave: "citas", activo: true }, { clave: "clientes", activo: true }] });
    await db.contacto.createMany({ data: Array.from({ length: 501 }, (_, i) => ({ nombre: `A contacto ${String(i).padStart(4, "0")}` })) });
    return db.contacto.create({ data: { nombre: `Z contacto precargado ${marca}` } });
  });
  const contactoAjeno = await runWithOrg(ajena.id, () => db.contacto.create({ data: { nombre: `Z contacto ajeno ${marca}` } }));
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const inicial = cookieDe(csrf), { csrfToken } = await csrf.json();
  const login = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, orgSlug: org.slug, json: "true" }),
  });
  const cookie = `${inicial}; ${cookieDe(login)}`;
  assert.match(cookie, /next-auth.session-token/);
  async function pagina(query = "") {
    const res = await fetch(`${base}/citas${query}`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200); return res.text();
  }
  assert.ok(!(await pagina()).includes(contacto.nombre), "el contacto está fuera de las primeras 500 opciones");
  const precargada = await pagina(`?contactoId=${contacto.id}`);
  assert.ok(precargada.includes(contacto.nombre), "la ficha/conversación agrega el contacto precargado sin expediente");
  assert.ok(!precargada.includes("passwordHash"));
  assert.ok(!(await pagina(`?contactoId=${contactoAjeno.id}`)).includes(contactoAjeno.nombre), "no revela un contacto ajeno");
  assert.equal((await pagina("?contactoId=9223372036854775808")).includes(contactoAjeno.nombre), false);
  console.log("OK · precarga HTTP con sesión real: contacto después del límite de 500, sin expediente, id ajeno y BIGINT fuera de rango sin filtraciones");
} finally { await dbRaw.$disconnect(); }
