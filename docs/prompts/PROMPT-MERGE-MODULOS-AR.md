# Prompt para Codex — merge de `modulos-ar` en `modulos-fase-2` (sin deploy)

> Copia desde "## Prompt" y pégalo en Codex.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`). La rama `modulos-ar` (6 commits sobre
`modulos-fase-2`: contratos, cobros y panel AR) debe fusionarse en `modulos-fase-2`, que es la rama
que despliega producción. **Hoy solo se prepara y verifica el merge en local. No hagas push, deploy,
ni toques ninguna BD de producción.** El deploy lo hace Julio después, por separado.

### 1. Estado inicial (solo lectura)

- `git status` debe estar limpio (el archivo `PROMPT-MODULOS-AR.md` y este prompt son locales sin
  seguimiento: déjalos sin añadir).
- Anota `git rev-parse modulos-fase-2` y `git rev-parse origin/modulos-fase-2`. Se espera que local
  vaya 1 commit por delante (`9f147e1`, cabeceras del template n8n) y que `modulos-ar` parta de él.
- `git log --oneline modulos-fase-2..modulos-ar` debe listar 6 commits. Si no cuadra, detente y
  repórtalo.

### 2. Merge local

```bash
git checkout modulos-fase-2
git merge --no-ff modulos-ar -m "merge: módulos Ámbar Rojo (contratos, cobros y panel AR)"
```

Si hay conflictos, **no los resuelvas a ciegas**: los puntos comunes probables son
`web/src/lib/modulos-catalogo.ts`, `web/prisma/sql/actualizaciones.sql` y `MODULOS.md`. Explícame
cada conflicto y qué elegiste. No toques `main` ni fuerces nada (`--force`, `reset --hard`).

### 3. Verificación sobre la rama ya fusionada

Con un PostgreSQL 16 **desechable** (contenedor nuevo, puerto local libre, `schema.sql` +
`multi-tenant.sql`, rol `crm_app` sin BYPASSRLS), desde `web/`:

1. `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`, `npx next build`.
2. Todos los `scripts/check-*.ts`. Esperado: `TOTAL 31; FALLOS 0`.
3. **La batería completa `prisma/scripts/test-*.ts`** (no solo los de AR). Es la verificación que
   faltó en la entrega anterior. Si un test requiere servidor corriendo, levántalo con
   `next start` en un puerto local.
4. `actualizaciones.sql` aplicado **dos veces seguidas** sobre la BD desechable, sin errores.
5. Comprobar que la migración no cambia permisos de módulos existentes de otras orgs: antes de
   aplicarla, crea una org de control con un módulo previo (p. ej. `citas`) y un puesto con acceso
   restringido, y compara su `config` antes y después.
6. `seed-ambar-rojo.mjs` dos veces: mismos conteos. Revisa y reporta si respeta el bloqueo
   `NODE_ENV=production` / `ALLOW_DEMO_SEED=1` y que **solo toca la org `ambar-rojo`**.

Guarda las salidas literales en `docs/pruebas-merge-ar-<fecha>/` (una por comprobación). Un fallo
se reporta tal cual, aunque parezca ajeno a AR; **no lo arregles en silencio** ni lo ocultes.

### 4. Preparar el respaldo (solo documentar, no ejecutar contra producción)

Añade a `docs/DESPLIEGUE-MODULOS-AR.md` una checklist corta, en este orden:

1. Respaldo manual previo: comando `pg_dump` listo para la consola del servicio `backup` en
   EasyPanel (usando las variables que ya mapea el compose), nombre
   `ambarcrm-pre-modulos-ar-AAAA-MM-DD.sql.gz`, y cómo descargarlo fuera del VPS.
2. Qué variables de entorno nuevas necesita AR en el compose (si no necesita ninguna, dilo
   explícitamente tras revisar `docker-compose.yml` y el código).
3. Orden de deploy: push → redeploy en EasyPanel → logs de arranque (Prisma/RLS) → humo en
   Villafuerte (login, lista de chats, un mensaje) → humo en `/contratos`, `/cobros`, `/panel-ar`.
4. Seed de AR: una sola vez, en la consola del servicio app, con el comando exacto según lo
   que encontraste en 3.6.
5. Marcha atrás: redeploy de `a0b5fe4` (último commit de `origin/modulos-fase-2`); las tablas
   nuevas son aditivas y quedan sin uso. Restaurar BD solo con la app detenida y pidiendo ayuda.

### 5. Entregable

- Resultado del merge (hash del commit de merge, `git log --oneline -9`).
- Tabla de comprobaciones con su resultado literal; lo que falle, destacado primero.
- Qué quedó sin verificar y por qué (teléfono real, lector de pantalla, producción).
- **No hagas**: `git push`, deploy, envío real de WhatsApp, cambios al chat de Villafuerte,
  ni conexión a la BD de producción.
