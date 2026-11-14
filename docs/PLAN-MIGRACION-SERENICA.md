# Plan de migración: Serénica Health Center de Chatwoot a AmbarCRM

Fecha del plan: 9-nov-2026. Corte objetivo: **viernes 13-nov-2026, todo en un día**. Mensualidad acordada: **$1,500 MXN**.
Complementa [RUNBOOK-corte-serenica.md](RUNBOOK-corte-serenica.md), que sigue siendo la lista de pasos
técnicos (respaldo, alta, verificación, Meta, reversión). Este plan agrega calendario, decisiones y lo que
el runbook no cubre: histórico, bot, citas vigentes y capacitación.

## 0. Decisiones previas (hoy y mañana)

| # | Decisión | Quién | Por qué importa |
|---|---|---|---|
| 1 | "Sí" **por escrito** de Ricardo para el corte y la ventana (paso 1 del runbook). | Julio | El runbook prohíbe empezar sin aprobación escrita. |
| 2 | Tres correos confirmados: admin (Ricardo), recepción, doctora (Paloma). | Julio / Ricardo | El alta no inventa correos. |
| 3 | Precios de servicios (hoy solo la valoración: $700). | Ricardo | Vacío = "Precio a consultar" en la reserva en línea. |
| 4 | **Decidido:** Serénica tiene su **app de Meta exclusiva**; se queda ahí y se conecta **manualmente** al CRM como canal con credenciales propias (no se migra el número a la app de Ámbar CRM). Solo se cambia el callback de **su** app. | Julio | No toca la app en App Review y la reversión es restaurar un solo callback. Verificar antes: app en modo Live, webhook de mensajes suscrito en su WABA y método de pago de la WABA activo (error 131042). |
| 5 | Alcance del histórico: contactos + conversaciones con mensajes (sin notas privadas salvo permiso de Ricardo). | Julio / Ricardo | El importador no existe todavía (sección 3). |
| 6 | **¿Dónde viven hoy las citas vigentes?** (Google Calendar vía n8n, hoja, Chatwoot.) | Julio | Las citas futuras no deben perderse en el corte. |

## 1. Calendario: todo el **viernes 13**

Decisión: la migración se hace en **un solo día**. Como no hay ensayo previo en días anteriores, el orden
protege contra errores: lo reversible primero, el cambio de callback en Meta al final y con ventana de retorno.

Antes del viernes (solo preparación, sin tocar Serénica): decisiones 1–6, respaldo de producción con
restauración de ensayo, y tener listos el clon del bot y las variables `SERENICA_*` en el gestor de secretos.

| Hora (sugerida) | Paso | Si falla |
|---|---|---|
| Mañana | Respaldo + `pg_restore --list` (runbook 3–4). Comprobar rol sin `BYPASSRLS` (2, 5). | No seguir. |
| Mañana | `alta:serenica --dry-run`, luego `--confirmo-produccion` y `verificar:serenica` (8–10). | Corregir y repetir; es idempotente. |
| Mediodía | Cargar las citas vigentes y, si está listo, contactos/histórico (sección 3). Conciliar conteos. | Cortar sin histórico. |
| Mediodía | Registrar el canal de WhatsApp **con las credenciales de su app exclusiva** y asignarlo al bot (sin canal no hay recordatorios). Probar con número de prueba (11). | No pasar al corte. |
| Tarde/noche (fuera de horario de clínica) | **Activar el clon del bot**, cambiar callback y verify token **solo en su app**, mensaje de prueba, apagar el flujo de Chatwoot (12–13). | Reversión inmediata (14). |
| Noche | Mensaje entrante real, handoff, cita nueva, recordatorio de prueba. | Reversión (14). |

Después: sábado y lunes vigilancia; capacitación de recepción el mismo viernes por la mañana o el lunes
(sección 5); Chatwoot intacto 30 días y cierre con aprobación de Ricardo (paso 15).

## 2. El bot y los recordatorios (lo que más se rompe)

El bot de Serénica vive en `n8n-serenica-nueva` (21 workflows, recordatorios a 3 pasos 10 am / 3 pm / 9 am,
recordatorio de pago `recordatorio_pago_con_link`, etiqueta `confirmado`). Hoy habla con la API de Chatwoot.

- Crear un **clon** del flujo principal que use la API del bot de AmbarCRM ([INTEGRACION-BOTS.md](../INTEGRACION-BOTS.md),
  [api-bot.md](api-bot.md)), con `settings.timezone = America/Mexico_City` explícito (en la instancia vieja
  los triggers corrían en hora del servidor y se recorren solos en noviembre).
- **Orden seguro (lección de Villafuerte):** activar primero el clon, luego cambiar el callback en Meta, probar,
  y solo después apagar el original. Al revés, el webhook devuelve 404 y Meta reintenta con espera creciente.
- Las etiquetas exactas, el handoff humano y las plantillas fuera de ventana de 24 h se prueban en el ensayo.
- El bot se crea **sin canal**; hay que asignarle el canal de WhatsApp en el CRM al conectar el número, o no hay
  plantillas ni recordatorios (runbook, nota tras variables de entorno).
- Citas: decidir si el bot agenda en el calendario del CRM (módulo Citas con Ricardo y Paloma, ya cargado en la
  demo) y migrar las citas futuras vigentes **antes** del corte (decisión 6).

## 3. Histórico desde Chatwoot

La API de bots no importa mensajes antiguos ni contactos en lote (runbook, "Importación histórica"). El importador
existe aparte del corte: `web/scripts/importar-historial-chatwoot.ts` (ver
[importar-historial-chatwoot.md](importar-historial-chatwoot.md)). Lee directo de la API de Chatwoot, corre con el
rol de aplicación y RLS, y no envía nada por WhatsApp.

1. Fuente: API de Chatwoot (conversaciones del inbox de WhatsApp + mensajes paginados). No se exporta CSV.
2. `--dry-run`, normalización de teléfonos (`telefonoContacto`), deduplicación por teléfono (últimos 10 dígitos) y
   una sola conversación del CRM por contacto+canal. Idempotencia por `wa_message_id` con prefijo
   `chatwoot-import-<id>` y guarda extra: si el `source_id` real ya existe en el canal, el mensaje se salta como
   `ya_en_canal`. El ID de Chatwoot se conserva dentro de ese `wa_message_id` (no hay columna de referencia
   externa en `mensajes`), así que un prefijo sintético no colisiona con IDs reales de WhatsApp.
3. Si hay tiempo, probarlo antes en la copia de la demo; en producción conciliar conteos; probar listas y búsqueda con el **volumen real**
   (en Villafuerte las listas se colgaron con 13 mil mensajes: toda lista lleva límite y búsqueda en servidor).
4. Si el importador no está listo el viernes a mediodía: **cortar sin histórico**. Chatwoot queda 30 días en solo lectura
   y el histórico se importa después. No retrasar el corte por esto.

## 4. Corte del viernes (resumen operativo)

1. Respaldo y restauración de ensayo (ya hechos el martes; repetir un respaldo justo antes).
2. `alta:serenica` real con `--confirmo-produccion`; secretos directo al gestor, nada en chat ni archivos.
3. `verificar:serenica` en verde.
4. Activar el clon del bot, cambiar callback y verify token en Meta, mensaje de prueba, apagar el workflow de Chatwoot.
5. Verificar un mensaje entrante real, un handoff, una cita nueva y un recordatorio de prueba.
6. **Reversión lista** (runbook paso 14): detener el flujo del CRM, restaurar callback anterior, reactivar Chatwoot.
   No borrar nada de Chatwoot.

## 5. Capacitación (45 min, antes del corte)

Recepción: chats, handoff y etiquetas; crear/mover citas por doctor; abrir expediente y registrar evolución;
odontograma. Ricardo y Paloma: su agenda, bloqueos de horario, expediente. Dejar una hoja de una página.

## 6. Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Meta App Review en curso | Serénica usa su app exclusiva; no se toca la app en revisión. |
| Pago pendiente del WABA (error 131042) o límite de marketing (131049) | Revisar método de pago de la WABA antes; los errores de Meta llegan asíncronos, guardar código y motivo. |
| Variables de entorno no llegan al contenedor | Solo las que mapea `docker-compose.yml`; ponerlas en el panel de EasyPanel, no en el `.env` del VPS. |
| `prisma db push` corre antes que las migraciones SQL | Migraciones idempotentes; no depender del orden. |
| Secuencias de IDs (el bot manda `inbox_id` 1) | Con tabla vacía usar `setval(..., is_called=false)`. |
| Pérdida de citas o mensajes | Respaldo + ensayo + Chatwoot intacto 30 días. |
| Datos de pacientes en pruebas | Solo contactos ficticios y números de prueba hasta el corte. |

## 7. Después del corte

- Actualizar `docs/3-clientes/` (Serénica), `docs/5-financiero/` (mensualidad $1,500) y el MRR en la memoria.
- Rotar cualquier secreto que haya pasado por chat; cambiar contraseñas iniciales de los tres usuarios.
- Quitar la org demo de Serénica de la demo 187 si se quiere usar otro giro (ya se usó `demo-clinica` para la demo).
