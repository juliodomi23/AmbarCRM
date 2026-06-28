// Crea/actualiza el usuario admin con un hash bcrypt real.
// Uso: node scripts/seed-admin.mjs "Nombre" admin@correo.mx "contraseña"
// La app corre como crm_app (RLS): se fija el tenant (org 1 por defecto) en la MISMA
// transacción del insert; si no, org_id quedaría NULL y RLS rechazaría la escritura.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [, , nombre = "Admin", email = "admin@ambarcrm.mx", pass = "demo1234"] = process.argv;
const orgId = process.env.SEED_ORG_ID ?? "1";
const db = new PrismaClient();

const passwordHash = await bcrypt.hash(pass, 10);
const [, rows] = await db.$transaction([
  db.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", orgId),
  db.$queryRawUnsafe(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (org_id, email)
     DO UPDATE SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash,
                   rol = 'admin', activo = true
     RETURNING id, email`,
    nombre, email, passwordHash
  ),
]);

const u = rows[0];
console.log(`Admin listo: ${u.email} (id ${u.id}, org ${orgId}). Contraseña: ${pass}`);
await db.$disconnect();
