# Prompt para Codex — Desconexión de Messenger y cierre de `preparar-merge-meta`

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). **Continúa en la rama
`preparar-merge-meta`** (ya existe, 7 commits sobre `modulos-fase-2`; no crees otra). **No hagas push ni
deploy, no toques producción, `meta-tech-provider`, `main` ni `ambarcrm-db`.** Reglas del repo en
`PLAN-CIERRE-FASE-2.md`: BD desechable en :55450 armada con `schema.sql` + `multi-tenant.sql` +
`actualizaciones.sql` (no `prisma db push`), commit por paso, en español, sin comentarios obvios ni
librerías nuevas. Lee primero `docs/META-APP-REVIEW-MESSENGER.md` (sección "Desconexión"),
`docs/CHECKLIST-MERGE-META.md` y `docs/regresion-pre-merge-2026-10-17.md`.

### Objetivo

Cerrar el único hueco de código que quedó: **desconectar una página de Messenger** hoy solo borra el canal
local; no cancela la suscripción en Meta ni deja un botón en la UI. Después, dejar la rama lista y
fusionarla en local.

### Tareas (un commit por tarea)

1. **Desuscripción remota al borrar un canal Messenger.** En `web/src/app/api/canales/[id]/route.ts`
   (`manejarDELETE`), para `canal.proveedor === "messenger"`: `DELETE ${META_GRAPH_URL}/{pageId}/subscribed_apps`
   con el token de página (`tokenFromChannelConfig`, nunca en logs ni respuestas). Reglas:
   - Meta responde error de red/5xx/429 → 502 con mensaje fijo y **el canal no se borra** (se puede
     reintentar).
   - Meta responde que el token ya es inválido (código 190 / sesión invalidada) o la página ya no existe →
     el canal se borra igual y la respuesta indica `desuscrito: false` con motivo legible (no hay nada que
     cancelar).
   - Éxito → `desuscrito: true`. Conserva `borrarDatos` tal cual (histórico se conserva por defecto).
   - No cambies el comportamiento de WhatsApp ni de API.
   - Reutiliza `messengerGraph` de `web/src/lib/channel/messenger.ts` si encaja; el timeout ya existe.
2. **Botón "Desconectar" en la UI** de `CanalExterno.tsx` para canales Messenger existentes. Con el
   `Confirmador` del repo, texto claro ("Se cancelará la suscripción en Facebook; el historial se
   conserva"), opción de borrar o conservar conversaciones (mismo patrón que ya usa la desconexión de
   WhatsApp en `Canales.tsx`), toast con el resultado, y refresco de la lista. Solo admin.
3. **Pruebas** (Graph simulado, sin llamadas reales a Meta): éxito; token inválido → se borra igual con
   `desuscrito:false`; 5xx → 502 y el canal sigue; sin sesión admin → rechazo; aislamiento (la empresa A
   no puede desconectar el canal de B); el token no aparece en ninguna respuesta ni bitácora. Agrégalas a
   `prisma/scripts/test-canales-messenger.ts` o a un archivo hermano, y un `check-*` si aplica.
4. **Docs.** Actualiza `docs/META-APP-REVIEW-MESSENGER.md`: la desconexión ahora es un flujo de usuario
   (quita el workaround de consola y el 🛑; el minuto 07:00 del guion usa el botón), y
   `docs/CHECKLIST-MERGE-META.md` paso 10 (añade desconectar al humo del canal de prueba).
   Anota la decisión en `docs/canales-decisiones.md`.
5. **Regresión completa** otra vez en la BD desechable (tsc, lint, `prisma validate`, build,
   `actualizaciones.sql` ×3, `test-aislamiento.ts`, todos los `test-*.ts` menos `test-lealtad-aurum.ts`,
   todos los `check-*.ts`). Agrega los resultados reales (incluidos fallos) a
   `docs/regresion-pre-merge-2026-10-17.md` en una sección nueva con fecha. Retira el contenedor
   desechable al terminar.
6. **Merge local, solo si TODO lo anterior pasó:**
   ```
   git status --short                      # debe estar limpio
   git switch modulos-fase-2
   git merge --ff-only preparar-merge-meta
   git log --oneline -3
   ```
   Si no es fast-forward o el árbol no está limpio, **detente y repórtalo**; no uses reset, rebase ni
   merge con commit. **No fusiones en `meta-tech-provider`** (eso es el paso 4 del checklist, el día del
   despliegue) y no hagas push.

### Fuera de alcance

Instagram, automatizaciones, módulos nuevos, cambios al webhook o a la firma de Messenger, flujos que
revisa Meta (`api/wa/onboard`, `api/meta/webhook`, `api/meta/templates`, `api/mensajes/enviar`),
push/deploy, correr cualquier script `scripts/pre-merge/` contra producción.

### Entrega (una sola parada)

Resumen con: commits nuevos, resultado de la regresión por prueba (pasa/falla), si el merge `--ff-only`
a `modulos-fase-2` se hizo (SHA final) y qué sigue pendiente de Julio. Marca con 🛑 lo que requiera su
decisión (panel de Meta, Human Agent, ensayo con respaldo real).
