import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { Pool } = require('pg');
const url = process.env.ADMIN_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).port !== '55453') throw Error('Solo BD desechable local');
const pool = new Pool({ connectionString: url });
const hash = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
try {
  const { rows: orgs } = await pool.query("SELECT to_jsonb(o)::text AS fila FROM orgs o WHERE slug <> 'ambar-rojo' ORDER BY id");
  const { rows: ar } = await pool.query("SELECT id FROM orgs WHERE slug='ambar-rojo'");
  const { rows: tablas } = await pool.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='org_id' ORDER BY table_name");
  const fueraAR = { orgs: { count: orgs.length, hash: hash(orgs) } };
  const conteosAR = {};
  for (const { table_name: nombre } of tablas) {
    const tabla = '"' + nombre.replaceAll('"','""') + '"';
    const { rows } = await pool.query(`SELECT to_jsonb(t)::text AS fila FROM ${tabla} t WHERE org_id <> COALESCE((SELECT id FROM orgs WHERE slug='ambar-rojo'),-1) ORDER BY to_jsonb(t)::text`);
    fueraAR[nombre] = { count: rows.length, hash: hash(rows) };
    conteosAR[nombre] = ar.length ? Number((await pool.query(`SELECT count(*) AS n FROM ${tabla} WHERE org_id=$1`, [ar[0].id])).rows[0].n) : 0;
  }
  const resultado = { fueraAR, conteosAR };
  await writeFile(new URL(process.argv[2], import.meta.url), JSON.stringify(resultado,null,2));
  console.log(`Snapshot: ${tablas.length} tablas con org_id; ${orgs.length} orgs ajenas; AR ${ar[0]?.id ?? 'sin crear'}`);
} finally { await pool.end(); }
