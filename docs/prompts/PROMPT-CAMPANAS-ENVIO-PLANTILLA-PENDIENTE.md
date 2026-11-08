# PROMPT — Campañas de envío: crear la plantilla desde la campaña y programarla para cuando Meta la apruebe

Copia/rama `campanas-envio`, partiendo de `meta-tech-provider` en `5edbfd4` (fetch/pull desde ahí si la copia está atrás). Mismas reglas: sin push, merge ni deploy; no tocar producción; no enviar nada real; provider simulado. Un solo commit, solo esto.

## Contexto
Hoy una campaña solo se puede lanzar con una plantilla `APPROVED` (`comprobarPlantillaParaLanzar` en `campanas-envio-plantilla.ts`), y el motor (`procesarCampana`) pausa la campaña si la plantilla deja de estar aprobada. La plantilla se crea aparte en Configuración → Meta (`MetaCanales.tsx` → `POST /api/meta/templates`, que ya llama a `message_templates` de Graph). Meta tarda desde minutos hasta más de un día en aprobar una plantilla de marketing. Se quiere poder **crear la plantilla desde la misma pantalla de campaña, programar la campaña de una vez y que empiece sola cuando Meta la apruebe**.

## Qué hacer
1. **Crear plantilla desde el paso "Programar":** botón "Crear plantilla nueva" que reutiliza la lógica de `POST /api/meta/templates` (extrae la parte común a una función compartida; **no dupliques** el llamado a Graph ni cambies el comportamiento de Configuración). Campos mínimos: nombre, idioma (`es_MX` por defecto), categoría fija `MARKETING`, cuerpo con variables `{{1}}`, `{{2}}`, texto de ejemplo para cada variable (Meta lo exige). Al enviarla a Meta, queda en la lista de la campaña con estado `PENDING`.
2. **Aviso de baja:** si el cuerpo no contiene "BAJA" (sin distinguir mayúsculas/acentos), mostrar advertencia clara "Incluye 'Responde BAJA para no recibir más mensajes'" y un botón para insertar la frase. Advertencia, no bloqueo.
3. **Seleccionar plantillas `PENDING` además de `APPROVED`:** en el selector de la campaña mostrar ambas, con etiqueta de estado (Aprobada / En revisión de Meta). Las `REJECTED`/`PAUSED`/`DISABLED` no se pueden elegir. El mapeo de variables funciona igual con una plantilla en revisión (usa sus componentes).
4. **Lanzar con plantilla en revisión:** `comprobarPlantillaParaLanzar` acepta `PENDING` (y `IN_APPEAL` si Graph lo devuelve) y la campaña queda `programada` normalmente, con la casilla de permiso obligatoria como siempre. Si Meta no está disponible sigue el 503 actual. `REJECTED` o inexistente sigue rechazando el lanzamiento con mensaje claro.
5. **Motor:** en `procesarCampana`, cuando hoy toca enviar (dentro de ventana/tope/pausa entre tandas, mismo orden que ya existe, **cero llamadas a Graph fuera de ventana**):
   - `APPROVED` → envía como hoy.
   - `PENDING`/`IN_APPEAL` → **no pausa, no envía, no cuenta como fallo de Meta**; deja la campaña como está y registra en el resultado del cron "Esperando aprobación de la plantilla". Para no consultar Graph cada minuto mientras espera, consultar la plantilla como máximo cada 5 minutos por campaña (guarda la última consulta; opción más simple que no pierda estado al reiniciar).
   - `REJECTED`, `PAUSED`, `DISABLED` o inexistente → pausar con motivo legible ("Meta rechazó la plantilla: <motivo si viene>").
   - Una vez `APPROVED`, empieza en la siguiente ejecución dentro de la ventana, respetando tanda, pausa y tope diario como siempre. **El interruptor general de envíos manda**: con envíos pausados no sale nada aunque la plantilla ya esté aprobada.
6. **Pantalla y reporte:** en la lista y el detalle de la campaña, mostrar "Esperando aprobación de Meta" (con la hora de la última consulta) mientras la plantilla esté en revisión, y "Plantilla aprobada" cuando cambie. El resumen previo al lanzamiento debe decir que **empezará sola al aprobarse, dentro de la ventana configurada**.
7. No cambies `/difusion`, el flujo de bajas ni los topes. No agregues otra forma de crear plantillas ni editores avanzados (sin botones, sin imágenes, sin encabezados). Mantén el estilo visual actual.

## Pruebas (`web/scripts/check-campanas-envio.ts`, Graph simulado)
- Crear plantilla desde la campaña → una sola llamada a Graph con categoría `MARKETING`, ejemplos de variables y nombre/idioma correctos; sin la frase BAJA devuelve la advertencia.
- Lanzar con plantilla `PENDING` → campaña `programada`; con `REJECTED` o inexistente → rechazado; Graph caído → 503.
- Motor con `PENDING`: dentro de ventana no envía, no pausa, no suma `fallosConsultaMeta`; entre consultas (menos de 5 min) 0 llamadas a Graph; fuera de ventana 0 llamadas.
- Pasa a `APPROVED` → la siguiente ejecución envía respetando tanda, pausa y tope.
- Pasa a `REJECTED` → se pausa con motivo; no se envía nada.
- Aprobada pero interruptor de envíos apagado → 0 envíos.
- Regresión previa completa; org 13 y módulo apagado siguen bloqueados.

## Entrega
`npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check` limpios y regresión completa. Migración idempotente en `prisma/sql/actualizaciones.sql` solo si hace falta una columna (p. ej. última consulta de plantilla). Actualiza `MODULOS.md` y `docs/` solo en lo que cambió. Reporte breve: archivos tocados, decisiones donde el prompt no decía, qué quedó sin verificar contra Meta real (nombres exactos de estados y tiempos de aprobación) y hash del commit.
