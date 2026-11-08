# PROMPT — Interruptor general de envíos en "Campañas de envío" (EXI)

Misma copia/rama `campanas-envio` (último commit `b07672b`). Mismas reglas: sin push, merge ni deploy; no tocar producción; no enviar nada real. Un solo commit, solo esto.

## Contexto
El workflow de n8n (`AmbarCRM - Campañas de envío (EXI)`) llama a `/api/cron/campanas-envio` cada minuto y se queda **siempre activo**. El dueño quiere un botón dentro del CRM para encender y apagar los envíos sin entrar a n8n.

## Qué hacer
1. **Dato:** un interruptor por organización, **apagado por defecto** (si no existe el valor, cuenta como apagado). Guárdalo donde ya viven los ajustes por org (junto a `ajustes.tarifa_marketing_usd`, mismo mecanismo y RLS). Migración en `prisma/sql/actualizaciones.sql`, idempotente.
2. **Cron** (`api/cron/campanas-envio/route.ts`): si el interruptor de la org está apagado, saltarla por completo (cero llamadas a Graph, no tocar campañas ni destinatarios). Ya existe la comprobación `moduloHabilitado`; el interruptor va después de ella.
3. **API:** `PATCH`/`POST` para cambiar el interruptor, solo para usuarios con permiso de administrar campañas y solo con el módulo encendido (mismo 403/404 que el resto del módulo). Registrar quién lo cambió y cuándo.
4. **UI:** en la pantalla de campañas, un interruptor visible arriba: "Envíos: ACTIVOS / PAUSADOS" con confirmación al activar ("Se empezará a enviar según el calendario de cada campaña en curso"). Si está apagado y hay campañas `programada` o `en_curso`, mostrar un aviso: "Los envíos están pausados; ninguna campaña enviará hasta que lo actives".
5. Apagarlo **no** cambia el estado de las campañas (siguen `en_curso`); al encenderlo retoman donde iban respetando ventana, tanda y tope del día.
6. Las bajas (`BAJA`/`STOP`) y la actualización de estados por webhook siguen funcionando con el interruptor apagado.

## Pruebas (en `web/scripts/check-campanas-envio.ts`)
- Apagado (y sin valor): el cron no hace ninguna llamada a Graph y no cambia nada.
- Encendido: el cron envía como antes.
- Apagar a media campaña y volver a encender: no se pierde ni duplica ningún destinatario.
- Una org sin módulo no puede cambiarlo (403/404); la org 13 queda bloqueada como antes.
- Una baja por respuesta sigue funcionando con el interruptor apagado.

## Entrega
`npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check` limpios y regresión completa pasando. Actualiza `MODULOS.md`, `docs/CAMPANAS-ENVIO-EXI.md` y `docs/ENTREGA-CAMPANAS-ENVIO-EXI.md` solo en lo que cambió (el workflow queda siempre activo; el interruptor del CRM es el control). Reporte breve con archivos tocados y hash del commit.
