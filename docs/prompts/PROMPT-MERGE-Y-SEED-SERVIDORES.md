# Prompt para Codex — merge de `modulos-ar-servidores` + seed de servidores (sin deploy)

> Copia desde "## Prompt" y pégalo en Codex. Dos partes: A (merge) y B (seed). Hazlas en orden.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`). La rama `modulos-ar-servidores`
(1 commit, `56edbb9`: monitoreo de servidores y alertas de plataforma) debe llegar a
`modulos-fase-2`, la rama que despliega producción. Hoy `modulos-fase-2` y
`origin/modulos-fase-2` están en `adc0836`, justo el padre de `56edbb9`, así que el merge es
fast-forward. **No hagas deploy ni toques ninguna BD de producción.** El redeploy lo hace Julio.

### A. Merge

1. `git status` limpio salvo los `PROMPT-*.md` locales sin seguimiento (déjalos sin añadir).
2. Verifica `git rev-parse modulos-fase-2 origin/modulos-fase-2` = `adc0836` y
   `git log --oneline modulos-fase-2..modulos-ar-servidores` = solo `56edbb9`. Si no cuadra, detente
   y repórtalo.
3. `git checkout modulos-fase-2 && git merge --ff-only modulos-ar-servidores`. Sin `--force` ni
   `reset --hard`. No toques `main`.
4. Desde `web/`, sobre la rama ya fusionada, con un PostgreSQL 16 desechable (rol `crm_app` sin
   BYPASSRLS): `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npx next build`, todos los
   `scripts/check-*.ts` y la batería `prisma/scripts/test-*.ts`. Esperado: 32 checks sin fallos y
   36/37 tests, con el único fallo conocido `test-lealtad-aurum.ts` (faltan variables AURUM).
   Cualquier otro fallo se reporta tal cual, sin arreglarlo en silencio.
5. Aplica `web/prisma/sql/actualizaciones.sql` dos veces seguidas sobre la BD desechable, sin errores.
6. Guarda las salidas literales en `docs/pruebas-merge-servidores-<fecha>/`.
7. **Haz `git push origin modulos-fase-2` solo si 4 y 5 pasaron**, y dime el hash. Si algo falla, no
   empujes.

### B. Seed de servidores (preparar, no ejecutar contra producción)

El seed (`web/scripts/seed-servidores.mjs`) solo siembra la org plataforma (id=1), exige `ORG_SLUG`,
`ALLOW_DEMO_SEED=1`, y se bloquea con `NODE_ENV=production`. Es idempotente y no sobrescribe
servidores existentes.

1. Añade a `docs/DESPLIEGUE-MODULOS-AR.md` una sección "Servidores" con, en orden:
   - Respaldo previo (`pg_dump`, mismo procedimiento ya documentado en ese archivo).
   - Que `actualizaciones.sql` se aplica en el arranque/deploy como las demás migraciones; confirma
     leyendo el compose/entrypoint cuándo corre y dilo explícitamente.
   - Comando del seed, desde una terminal del contenedor `web` o conexión equivalente, **con
     `NODE_ENV` sin definir** y la org real explícita:
     `ORG_SLUG=<slug real de la org plataforma> ALLOW_DEMO_SEED=1 node scripts/seed-servidores.mjs`.
     Verifica el slug real leyendo el seed de Ámbar Rojo y el código; no asumas `inicial`.
   - Los tokens se imprimen una sola vez: guardarlos en el gestor de contraseñas, no en logs.
   - Lista ⚠️ de datos por confirmar (vence, costo, cargas), copiada de
     `docs/pruebas-servidores-2026-10-14/README.md`.
2. Añade el procedimiento de instalación del heartbeat por VPS (el `curl` del README de pruebas,
   un token distinto por servidor, IPs 31.220.49.58, 31.220.51.95, 77.37.67.251, 187.77.20.78) y el
   orden: primero el seed, luego pegar cada token en el cron de su VPS, luego verificar en
   `/servidores` que pasa de gris a verde.
3. n8n: pasos para el cron diario `POST /api/cron/limpiar-heartbeats` (header `x-api-key`:
   `WA_API_KEY`) e importar `docs/n8n/ALERTAS-Diarias-WhatsApp.json` (sin ejecutarlo).
4. Prueba local del seed contra la BD desechable: dos corridas, la segunda no imprime tokens ni
   cambia nada; captura la salida literal sin los tokens.
5. Commit en `modulos-fase-2` solo con los docs nuevos. No incluyas tokens.

### Entrega

Primero el fallo o desviación pendiente, luego un resumen corto con hashes, qué se empujó y la lista
exacta de pasos manuales que le quedan a Julio (redeploy, seed, tokens en los VPS, n8n).
