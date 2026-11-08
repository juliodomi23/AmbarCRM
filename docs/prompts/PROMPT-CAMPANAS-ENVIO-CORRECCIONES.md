# PROMPT — Correcciones a "Campañas de envío" (EXI) tras revisión

Trabaja en la copia/rama `campanas-envio` (la que ya tiene el módulo). Misma regla de siempre: no merge, no deploy, no tocar producción, no enviar nada real, módulo apagado salvo en la BD de pruebas desechable. Solo estos cambios; no agregues nada más.

## 0. Primero: commit
Todo el trabajo previo está **sin commitear**. Antes de tocar nada, haz un commit con lo actual (mensaje en español, ej. "Agregar módulo Campañas de envío para EXI"). Luego un commit por cada corrección de abajo, o uno solo al final si es más limpio. No hagas push.

## 1. [CRÍTICO] Las bajas no funcionan después de que el prospecto responde
`web/src/lib/services/ingest.ts`: al primer mensaje entrante el destinatario pasa a `respondio`, pero la búsqueda que detecta la baja (`campanaDestinatario.findFirst` con `estado: { in: ["enviado","entregado","leido"] }`) no incluye `respondio`. Si el prospecto responde "hola" y luego escribe "STOP"/"BAJA", la baja no se registra y el mensaje llega al bot.

Corrección:
- Incluir `respondio` en esa búsqueda.
- Solo actualizar a `respondio` si el estado no lo era ya.
- La baja debe detectarse aunque el destinatario ya esté en `respondio`, dentro de la misma ventana de 30 días.
- Mantener el comportamiento actual de la baja: `optOutDifusion = true`, nota interna, y salir antes de horario, bienvenida y bot.

## 2. [CRÍTICO] Un fallo momentáneo de Meta pausa la campaña
`web/src/lib/campanas-envio-motor.ts`, `procesarCampana`: llama `listarPlantillas()` en cada ejecución del cron, antes de revisar horario/pausa/tope, y `listarPlantillas()` devuelve `[]` ante cualquier error (`cloudapi.ts` ~línea 214), así que un timeout o 5xx de Meta pausa la campaña con "La plantilla no está aprobada".

Corrección:
- **Orden:** primero comprobar estado de la campaña, horario permitido, pausa entre tandas y tope diario (la misma lógica de `horarioPermitido` y del conteo del día). Solo si hoy toca enviar, verificar la plantilla. Fuera de ventana o entre tandas, **cero llamadas a Graph**.
- **Distinguir errores:** para esto usa `consultarPlantillas()` (ya devuelve `ok`, `motivo: "sin_waba" | "rechazado" | "no_disponible"`); expónlo en el provider o agrega un método mínimo que conserve ese `motivo`. No cambies el comportamiento de `listarPlantillas()` para los demás usos.
  - `no_disponible` (red, timeout, 5xx): **no pausar**; salir de esa ejecución sin enviar y reintentar en la siguiente vuelta. Registrar el error en el resultado del cron.
  - `rechazado` (4xx) o `sin_waba`: pausar con motivo legible.
  - Plantilla encontrada pero no `APPROVED`: pausar con "La plantilla ya no está aprobada".
  - Si `no_disponible` ocurre en 5 ejecuciones seguidas, entonces sí pausar con "Meta no responde; revisa el estado del canal" (guarda el contador en la campaña o deduce de `updatedAt`; la opción más simple que no pierda estado al reiniciar).
- Aplica lo mismo a la verificación del endpoint de `lanzar` en `api/campanas-envio/[id]/route.ts`: si Meta no está disponible, responder 503 con mensaje claro en lugar de "La plantilla ya no está aprobada".

## 3. Quitar el `12` fijo
- `web/src/app/api/cron/campanas-envio/route.ts`: la consulta `... AND id = 12` debe quitarse; basta `moduloHabilitado("campanas_envio")` por org (ya está dentro del `runWithOrg`).
- `web/src/lib/services/ingest.ts`: quitar `orgId === 12n`; dejar solo `moduloHabilitado("campanas_envio")`.
- Confirmar que el módulo sigue apagado por defecto para toda org y solo se enciende desde el panel.

## 4. Variables vacías
Hoy una celda vacía usada como variable manda un parámetro vacío y Meta lo rechaza (cuenta como fallo).
- En la **vista previa y la importación** (`validarFilasCampana` / ruta de importar): si una columna mapeada a una variable de la plantilla viene vacía en una fila, rechazar esa fila con motivo "Variable vacía: <columna>" (aparece en las rechazadas y en el CSV descargable). Para esto la validación necesita conocer `mapeoVariables` de la campaña; pásalo en la preview como parámetro opcional.
- En el motor, defensa extra: si al armar `variables` alguna queda vacía tras `aplicarVariables`, marcar el destinatario `omitido` con motivo "Variable vacía" sin llamar a Meta y sin contar para el límite de fallos.
- Quitar el fallback `mapa[clave] ?? clave` que enviaría el nombre de la columna al prospecto: si falta la clave, tratar como vacía.

## 5. Pausa por fallos y números inexistentes (decisión ya tomada)
En `revisarFallos`: **no contar** los destinatarios con `error_codigo = 131026` (número no entregable) para el umbral de 7 de 20; en bases viejas es normal que haya fijos o números muertos. Sí contar el resto de fallos. Los 131026 siguen siendo `fallido`, sin reintento, y aparecen en el reporte. Extrae el umbral a una constante con nombre.

## 6. Importación no debe pisar datos de contactos existentes (decisión ya tomada)
En `api/campanas-envio/[id]/importar/route.ts`: para contactos que ya existen, el Excel **solo rellena** `nombre` o `empresa` si el del CRM está vacío (o es igual al teléfono, que es lo que se pone cuando no hay nombre). Nunca sobrescribir un valor real.

## Pruebas (agrega a `web/scripts/check-campanas-envio.ts`, mismo estilo, Graph simulado)
- Baja **después** de una respuesta previa: destinatario en `respondio`, llega "STOP" → `optOutDifusion = true`, el bot no recibe el mensaje.
- Baja con estado `enviado` sigue funcionando.
- Fuera de ventana y entre tandas: Graph simulado recibe **0 llamadas** de plantillas.
- Graph `no_disponible` una vez: campaña sigue `programada`/`en_curso`, no se pausa, no se envía; a la 5.ª seguida sí se pausa; plantilla no `APPROVED` sí pausa; 4xx pausa.
- `lanzar` con Meta caído → 503.
- Fila con variable vacía → rechazada en preview, no se importa; defensa del motor la omite sin llamar a Meta.
- 7 fallos de 20 donde 7 son 131026 → **no** pausa; 7 fallos de otro código → sí pausa.
- Importación: contacto existente con nombre real conserva su nombre; con nombre vacío se rellena.
- El módulo encendido en una org distinta de la 12 funciona (sin el 12 fijo) y apagado devuelve 403/404.

## Entrega
- `npx tsc --noEmit`, `npm run lint`, `git diff --check` limpios; regresión completa pasando (incluyendo las pruebas previas).
- Actualiza `docs/CAMPANAS-ENVIO-EXI.md` y `docs/ENTREGA-CAMPANAS-ENVIO-EXI.md` solo en lo que cambió.
- Reporte final breve: qué cambió por punto, resultados de pruebas, decisiones donde el prompt no decía, y qué sigue sin verificar contra Meta real.
