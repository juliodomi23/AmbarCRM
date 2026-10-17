# Prompt para Codex — Dejar AmbarCRM listo para el merge cuando Meta apruebe

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Parte de `modulos-fase-2`
y crea la rama `preparar-merge-meta`. **No hagas push, deploy ni toques producción, `meta-tech-provider`,
`main` ni `ambarcrm-db`. No ejecutes nada contra producción.** Reglas del repo en `PLAN-CIERRE-FASE-2.md`:
BD desechable en :55450 armada con `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql` (no
`prisma db push`), commit por paso, en español, sin comentarios obvios ni librerías nuevas. Contexto:
`modulos-fase-2` es descendiente directa de `meta-tech-provider` (fast-forward); el riesgo del merge está en
los datos y el despliegue, no en git. Lee `DIAGNOSTICO-AMBARCRM-2026-10-16.pdf` si existe.

### Objetivo

Que el día que Meta apruebe, el despliegue sea ejecutar una lista corta, sin escribir código nuevo.

### Tareas (en orden, un commit por tarea)

1. **Regresión completa** en BD desechable: `tsc --noEmit`, `npm run lint`, `npx prisma validate`,
   `npm run build`, `actualizaciones.sql` tres veces, `test-aislamiento.ts`, **todos** los
   `prisma/scripts/test-*.ts` (menos `test-lealtad-aurum.ts`) y **todos** los `scripts/check-*.ts`.
   Registra el resultado real (incluidos fallos) en `docs/regresion-pre-merge-2026-10-17.md`. Si algo falla,
   arréglalo si es pequeño; si no, documéntalo y sigue.
2. **Ensayo de migración**: arma la BD desechable con el esquema de `meta-tech-provider` (usa
   `git show meta-tech-provider:web/prisma/...`), cárgale datos sintéticos que imiten producción (canales
   WhatsApp con `config.token` en claro y con `tokenEncrypted`, conversaciones, mensajes), aplica el
   `actualizaciones.sql` de `modulos-fase-2` y verifica: sin errores, idempotente a la 2.ª y 3.ª corrida,
   y que los datos previos quedan intactos (conteos antes/después). Anota el tiempo que tarda.
3. **Orden db push vs SQL**: confirma que ningún backfill dependa de que `prisma db push` corra después
   (trampa conocida). Revisa cómo `docker-compose.yml` y el servicio `db-migrate` ordenan ambos y documenta
   el orden real. Cualquier backfill que dependa del orden se vuelve idempotente en `actualizaciones.sql`.
4. **Scripts de verificación listos (solo lectura, sin ejecutar contra prod)**: deja en `scripts/pre-merge/`
   (a) la consulta de `docs/verificar-rls.md` como script `.sql` con salida esperada, (b) la de
   `docs/canales-token-legacy.md`, (c) un `check-env-despliegue.ts` que compare las variables que usa el
   código (`process.env.*`) contra las mapeadas en `docker-compose.yml` y liste las faltantes
   (esperadas: `META_APP_ID`, `META_APP_SECRET`). Pruébalos contra la BD desechable.
5. **Checklist único de despliegue**: `docs/CHECKLIST-MERGE-META.md` con casillas, en este orden: respaldo,
   verificación RLS y token-legacy, variables en el panel (no editar `.env` en el VPS), merge
   fast-forward, push, redeploy, logs de `db-migrate`, humo de Villafuerte, humo de `/contratos`,
   `/cobros`, `/panel-ar`, humo de un canal Messenger de prueba, y **marcha atrás** (restaurar respaldo y
   volver a `meta-tech-provider`). Cada paso con el comando exacto y el resultado esperado. Reutiliza
   `docs/DESPLIEGUE-MODULOS-AR.md` sin contradecirlo.
6. **Paquete de App Review de Messenger**: `docs/META-APP-REVIEW-MESSENGER.md` con permisos a pedir
   (`pages_show_list`, `pages_messaging`, `pages_manage_metadata`; justifica cada uno con lo que el código
   hace realmente, y di si `HUMAN_AGENT` requiere solicitud aparte), guion de video minuto a minuto
   (login, elegir página, recibir, responder, ventana 24 h, desconectar), URLs públicas necesarias y datos
   del revisor. Marca como "por confirmar en el panel de Meta" todo lo que no puedas verificar en el código.
7. **Higiene del repo**: lista los `PROMPT-*.md` y `PLAN-*.md` sin commitear y muévelos a `docs/prompts/`
   (commit aparte, sin borrar nada). Lista las ramas locales ya fusionadas en `modulos-fase-2`
   (`git branch --merged`) en el informe, **sin borrarlas**.

### Fuera de alcance

Funciones nuevas, módulos nuevos, cambios a los flujos que revisa Meta (`api/wa/onboard`, `api/meta/webhook`,
`api/meta/templates`, `api/mensajes/enviar`), Instagram, automatizaciones, push/deploy.

### Entrega (una sola parada)

Resumen con: resultado de la regresión (pasa/falla por prueba), hallazgos del ensayo de migración, lista de
variables faltantes, archivos creados y commits. Marca con 🛑 cualquier cosa que requiera decisión de Julio.
