# Prompt para Codex — Cerrar webhooks/automatizaciones y seguir con Instagram

> Copia desde "## Prompt" y pégalo en Codex **cuando la corrida anterior ya se haya detenido**. Corrida única, una sola parada al final.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Continúa en la rama
`webhooks-y-automatizaciones` (ya tiene sus commits de las fases 1 y 2; no crees otra). **No hagas push ni
deploy, no toques producción, `meta-tech-provider`, `main` ni `ambarcrm-db`, y no llames a ninguna red real.**
Reglas del repo en `PLAN-CIERRE-FASE-2.md`: BD desechable en :55450 armada con `schema.sql` + `multi-tenant.sql` +
`actualizaciones.sql` (no `prisma db push`), commit por paso, en español, sin comentarios obvios ni librerías nuevas.

### Parte A — Cerrar `webhooks-y-automatizaciones`

1. **Revisa el estado real.** `git status`, `git log modulos-fase-2..HEAD` y lee
   `docs/prompts/PROMPT-WEBHOOKS-Y-AUTOMATIZACIONES.md`. Compara cada paso (1 a 16) con lo que existe y lista, sin
   asumir, qué pasos faltan o están incompletos (tablas, emisor, 5 eventos, API, UI, pruebas, docs, regresión,
   merge). Si falta algo de los pasos 1 a 14, complétalo en su propio commit antes de seguir.
2. **Archivos sin seguimiento:** incluye en un commit de documentación, **sin modificarlos**,
   `docs/pruebas-webhooks-automatizaciones-2026-10-17/` y `docs/prompts/PROMPT-CANAL-INSTAGRAM.md` y
   `docs/prompts/PROMPT-CERRAR-WEBHOOKS-Y-LANZAR-INSTAGRAM.md`. Si hay otro archivo suelto que no reconozcas,
   no lo agregues: repórtalo.
3. **Regresión completa** en la BD desechable (tsc, lint, `prisma validate`, build, `actualizaciones.sql` ×3,
   `test-aislamiento.ts`, todos los `test-*.ts` menos `test-lealtad-aurum.ts`, todos los `check-*.ts`). Agrega los
   resultados reales (incluidos fallos) a `docs/regresion-pre-merge-2026-10-17.md` en sección nueva con fecha.
   Retira el contenedor. Si algo falla, corrígelo y repite; no pases al merge con fallos.
4. **Merge local solo si todo pasó:** árbol limpio, `git switch modulos-fase-2`,
   `git merge --ff-only webhooks-y-automatizaciones`. Si no es fast-forward, **detente y repórtalo**; sin reset,
   rebase ni merge con commit. **No fusiones en `meta-tech-provider`.**

### Parte B — Instagram (solo si la Parte A terminó con el merge hecho)

Ejecuta completo `docs/prompts/PROMPT-CANAL-INSTAGRAM.md`, desde su verificación inicial hasta su merge
`--ff-only` a `modulos-fase-2`, respetando todo lo que dice (rama `canal-instagram`, un commit por tarea,
regresión propia, fuera de alcance, supuestos de Meta marcados como no verificados). Si la Parte A no pudo
cerrar, **no empieces la Parte B**: detente y repórtalo.

### Entrega (una sola parada)

Para la Parte A: qué pasos estaban incompletos y cómo se resolvieron, resultado de la regresión por prueba y SHA
final de `modulos-fase-2`. Para la Parte B (si corrió): lo que pide su propio prompt (commits, qué quedó y qué se
recortó, supuestos de Meta sin verificar, regresión, SHA final). Cierra con lo pendiente de Julio con 🛑: probar
Messenger e Instagram con cuentas reales, panel de Meta, Human Agent, ensayo con respaldo real y Aurum de pruebas.
