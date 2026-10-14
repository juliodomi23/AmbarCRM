import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "../../../web/node_modules/@prisma/client/default.js";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55454");
assert.equal(url.pathname, "/crm_pulido");
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.current_org', '1', true)`;
    assert.equal((await tx.org.findUniqueOrThrow({ where: { slug: "ambar-rojo" } })).id, 1n);
    assert.equal(await tx.servidor.count(), 0, "Usa una BD nueva, exclusivamente desechable");
    await tx.moduloOrg.create({ data: { clave: "servidores", activo: true, config: { puestosPermitidos: ["Administrador"] } } });
    const ahora = new Date();
    const fixture = [
      { nombre: "01 · VPS Operativo", ram: 46, cpu: 18, disco: 35, puntos: 24, vence: 100, cargas: "DeclaraBot\nApp de pruebas\nCoparmex ⚠️ sin contrato en CRM" },
      { nombre: "02 · VPS Atención", ram: 85, cpu: 32, disco: 63, puntos: 2, vence: 20, cargas: "Entorno de pruebas (baja)\nSitio local ⚠️" },
      { nombre: "03 · VPS Crítico", ram: 91, cpu: 12, disco: 45, puntos: 1, vence: 3, cargas: "Panel de pruebas" },
      { nombre: "04 · VPS Sin datos", puntos: 0, cargas: "" },
    ];
    for (const [i, f] of fixture.entries()) {
      const s = await tx.servidor.create({ data: {
        nombre: f.nombre, proveedor: "Proveedor de prueba", ip: `192.0.2.${i + 1}`, propietario: "AR · fixture local", loPagamos: true,
        vence: f.vence ? new Date(ahora.getTime() + f.vence * 86400000) : null,
        costoAnualMxn: i === 0 ? "1200" : null, ramTotalMb: i === 0 ? 8192 : null,
        cargasLibres: f.cargas || null,
        notas: "Fixture local para revisión visual. ⚠️ Datos ficticios, sin conexión a VPS reales.\nFuente de ejemplo: docs/11-infraestructura/infraestructura-n8n.md. Esta nota permanece colapsada.",
        heartbeatTokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      } });
      for (let p = 0; p < f.puntos; p++) {
        await tx.heartbeatServidor.create({ data: {
          servidorId: s.id, fecha: new Date(ahora.getTime() - (f.puntos - 1 - p) * 3600000),
          ramPct: f.ram - (i === 0 ? (f.puntos - 1 - p) * 0.8 : 0), cpuPct: f.cpu, discoPct: f.disco,
          ramTotalMb: 8192, uptimeHoras: 120 + p,
        } });
      }
      if (i === 0) {
        await tx.contrato.updateMany({ where: { contacto: { nombre: { in: ["Serénica Health Center", "Futura Fortuna"] } } }, data: { servidorId: s.id } });
      }
    }
    console.log("Fixtures locales: 4 servidores; verde (24 puntos), amarillo (2 planos), rojo (1 punto), gris (0 puntos). IP de documentación 192.0.2.0/24. Sin tokens en claro ni envíos.");
  }, { timeout: 30000 });
} finally { await prisma.$disconnect(); }
