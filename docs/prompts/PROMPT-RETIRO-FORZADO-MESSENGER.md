# Prompt para Codex — Messenger: retiro forzado cuando Meta no deja desuscribir

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Parte de `modulos-fase-2`
(SHA `586fb36`, ya contiene la desconexión de Messenger) y crea la rama `messenger-retiro-forzado`.
**No hagas push ni deploy, no toques producción, `meta-tech-provider`, `main` ni `ambarcrm-db`.** Reglas del
repo en `PLAN-CIERRE-FASE-2.md`: BD desechable en :55450 armada con `schema.sql` + `multi-tenant.sql` +
`actualizaciones.sql` (no `prisma db push`), commit por paso, en español, sin comentarios obvios ni
librerías nuevas. Lee primero `desuscribirPagina` en `web/src/lib/channel/messenger.ts`, `manejarDELETE` en
`web/src/app/api/canales/[id]/route.ts` y el botón "Desconectar" de `web/src/components/config/CanalExterno.tsx`.

### Problema

`desuscribirPagina` solo tolera token vencido (190) y página inexistente (404/803). Cualquier otro error de
Meta (p. ej. el admin de la página quitó el permiso a la app, o Meta rechaza con otro 4xx) da 502 y el canal
**no se puede borrar nunca desde el CRM**. El admin queda atrapado.

### Qué hacer (un commit por tarea)

1. **API:** en `DELETE /api/canales/[id]` acepta `forzar: true` en el cuerpo, **solo para Messenger** y solo
   admin. Con `forzar`: intenta `desuscribirPagina` igual; si falla por cualquier motivo, borra el canal local
   de todos modos y responde `{ ok: true, desuscrito: false, forzado: true, motivo }` con un motivo fijo y
   legible ("Se retiró del CRM, pero la suscripción puede seguir activa en Facebook: quita la app desde la
   configuración de la página"). Sin `forzar`, el comportamiento actual no cambia (502 y el canal se
   conserva). `forzar` en WhatsApp/API se ignora. Nunca devuelvas ni registres el cuerpo de error de Meta
   ni el token. Respeta `borrarDatos`.
2. **UI:** cuando el DELETE normal da 502 en un canal Messenger, el Confirmador ofrece un segundo paso:
   "Facebook no permitió cancelar la suscripción. ¿Retirar solo del CRM?" con advertencia clara, y solo si el
   admin acepta se reenvía con `forzar: true`. Toast final distinto si `forzado`. No muestres el botón forzado
   de entrada: primero se intenta el camino normal.
3. **Pruebas** (Graph simulado, sin llamadas reales): 4xx distinto de 190/404/803 sin `forzar` → 502 y el
   canal sigue; con `forzar` → 200, `forzado: true`, canal borrado, historial conservado según `borrarDatos`;
   5xx/timeout con `forzar` → también se retira; `forzar` en un canal API/WhatsApp no cambia nada; no admin →
   rechazo; aislamiento entre empresas; ningún token ni cuerpo de Meta en respuesta ni bitácora. Agrégalas a
   `prisma/scripts/test-canales-messenger.ts` o a un archivo hermano.
4. **Docs:** nota en `docs/canales-decisiones.md` (qué es el retiro forzado y su riesgo: la suscripción puede
   quedar viva en Meta, los webhooks de esa página se ignoran con 200 porque ya no hay canal) y una línea en
   `docs/CHECKLIST-MERGE-META.md` (no es parte del humo; solo referencia para soporte).
5. **Regresión completa** en la BD desechable (tsc, lint, `prisma validate`, build, `actualizaciones.sql` ×3,
   `test-aislamiento.ts`, todos los `test-*.ts` menos `test-lealtad-aurum.ts`, todos los `check-*.ts`).
   Añade los resultados reales a `docs/regresion-pre-merge-2026-10-17.md` en sección nueva con fecha. Retira el
   contenedor desechable al terminar.
6. **Merge local solo si todo pasó:** árbol limpio, `git switch modulos-fase-2`,
   `git merge --ff-only messenger-retiro-forzado`. Si no es fast-forward, detente y repórtalo; sin reset,
   rebase ni merge con commit. **No fusiones en `meta-tech-provider` y no hagas push.**

### Fuera de alcance

Cambiar el webhook o la firma de Messenger, unificar `MESSENGER_VERIFY_TOKEN` con `META_WEBHOOK_VERIFY_TOKEN`,
Instagram, automatizaciones, módulos nuevos, flujos que revisa Meta, correr nada contra producción.

### Entrega (una sola parada)

Commits nuevos, resultado de la regresión por prueba, SHA final de `modulos-fase-2` si el merge se hizo, y
lo pendiente de Julio con 🛑 (panel de Meta, Human Agent, ensayo con respaldo real, Aurum de pruebas).
