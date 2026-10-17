# Reglas de automatización

Configuración → Automatizaciones conserva los ajustes de bienvenida, horario,
autoasignación y CSAT y agrega un constructor de reglas. Solo el administrador puede
listar, crear, editar, activar, eliminar, simular o consultar ejecuciones. Cada empresa
puede tener 25 reglas, incluidas las inactivas. El cupo se bloquea en transacción.

Disparadores: `conversacion.creada`, `conversacion.estado_cambiado`, `mensaje.recibido`.
Se enganchan a `dispararEvento`, exactamente en los [puntos de webhooks](webhooks-salientes.md).
Sin reglas activas solo se consulta su existencia, sin modificar la conversación.
El motor trabaja después del commit y el flujo original no espera sus acciones.

Todas las condiciones deben cumplirse (AND), máximo diez por regla:

| Tipo JSON | Valor |
|---|---|
| `canal` | `cloud_api`, `messenger`, `instagram`, `api` |
| `estado` | `abierta`, `pendiente`, `cerrada` |
| `etiqueta` | ID string de una etiqueta de la empresa |
| `texto_contiene` / `texto_no_contiene` | Texto de 1–300 caracteres, comparación sin distinguir mayúsculas |
| `fuera_horario` | Booleano; usa el horario activo existente y la zona del proceso del CRM |
| `contacto_nuevo` | Booleano; verdadero solo cuando esa ingesta creó al contacto |

En cambios manuales de estado no hay texto entrante ni contacto nuevo. Horario inactivo
equivale a `fuera_horario: false`. No se aceptan expresiones libres, campos desconocidos,
OR, grupos anidados ni `eval`.

Acciones en orden, de una a cinco:

| Tipo JSON | Parámetro | Resultado |
|---|---|---|
| `asignar_agente` | `id` | Agente activo que pueda atender, apaga el bot |
| `agregar_etiqueta` | `id` | Etiqueta existente del contacto, sin duplicar |
| `cambiar_estado` | `valor` | `abierta`, `pendiente` o `cerrada` |
| `enviar_plantilla` | `id` | Respuesta rápida existente en `PlantillaMensaje`, con variables del contacto |
| `enviar_webhook` | `id` | Webhook saliente activo de esa empresa, misma entrega firmada y límites |

No existe entidad equipo en el CRM: se recorta la asignación a equipo. No se crean
equipos ni esquemas de plantillas oficiales. `PlantillaMensaje` almacena respuestas
rápidas, no la aprobación de Meta: WhatsApp/Messenger/Instagram solo las envían antes de 24 h
desde el último mensaje entrante. Fuera de ventana se registra `omitida_ventana` y se
continúa; nunca se usa Human Agent para automatizaciones. API no tiene ventana.
Se reutilizan `getProvider`, `estadoVentana`, `aplicarVariables`, la entrega de webhooks
y los servicios compartidos de modificación de conversación/etiquetas.

Las referencias se validan bajo RLS al guardar y se revisan otra vez al ejecutar.
Un destino eliminado o inactivo se omite. Un fallo de acción no impide las siguientes.
Los errores externos no se guardan: solo códigos fijos `error_accion`, `error_envio`,
`error_webhook`, `omitida_destino`, `omitida_ventana`, `ok`. El resultado agregado es
`error` si alguna acción falló, `omitida` si hubo omisiones o `ok` si todas funcionaron.
El detalle contiene esos códigos en el mismo orden que las acciones.

## Límites y anti-bucles

- El contexto marca origen `contacto`, `agente`, `bot` o `automatizacion`. Los dos
  últimos no ejecutan reglas. Las acciones modifican mediante servicios sin volver
  a publicar eventos y sus mensajes salientes no entran al pipeline de ingesta.
- Máximo 20 ejecuciones que cumplen condiciones por conversación en una hora móvil,
  entre todas las reglas. La reserva en `ejecucion_regla` se serializa por empresa y
  conversación antes de ejecutar cualquier acción, incluidas las que fallan u omiten.
  Alcanzar el cupo deja de ejecutar; no se generan filas ilimitadas de rechazos.
- La bitácora se conserva siete días y se depura cuando se ejecuta el motor;
  la API devuelve las últimas 50 de la regla. Las reservas pendientes también cuentan
  si el proceso muere antes de completar las acciones. No se purgan filas de la hora
  actual al limitar la lista visible.
- No hay cola durable, cron, retrasos, reintentos de reglas ni recuperación tras
  reinicios. Un fallo no revierte la operación original. El webhook conserva sus
  cuatro intentos ya existentes, sin repetir las otras acciones de la regla.

## API y prueba sin efectos

`GET/POST /api/automatizaciones`, `PATCH/DELETE /api/automatizaciones/:id`,
`POST /api/automatizaciones/:id/probar`, `GET /api/automatizaciones/:id/ejecuciones`.
`GET` devuelve reglas y opciones públicas de agentes, etiquetas, respuestas y webhooks.
POST requiere `nombre`, `evento`, `condiciones`, `acciones`; `activo` es opcional.
PATCH acepta esos campos parcialmente. JSON estricto y límite de cuerpo de 16 KiB.

«Probar» usa un contexto fijo visible: WhatsApp, abierta, sin etiquetas, dentro de
horario, contacto nuevo, texto «Hola, quiero información sobre una cita y precios».
Devuelve si cumple y qué acciones haría; no consulta proveedores, consume cupo ni
modifica datos. La simulación no certifica la disponibilidad del proveedor o ventana
de una conversación real. Los cambios de regla se guardan antes de probarla.

## Ejemplos

Clínica: evento `mensaje.recibido`, canal WhatsApp, texto contiene «cita», contacto
nuevo. Agregar etiqueta «Primera consulta», asignar al agente de recepción y enviar
la respuesta rápida «Horarios de consulta». Es un mensaje entrante reciente, por lo
que normalmente abre la ventana; si no se puede enviar se registra y se continúa.

Tienda: evento `conversacion.creada`, canal Messenger y fuera de horario. Agregar
etiqueta «Atender al abrir», cambiar estado a pendiente y enviar el webhook de n8n
para registrar la solicitud. La etiqueta debe existir y el destino pertenecer a la
misma empresa. Usar deduplicación de entregas en n8n.

Pruebas: `prisma/scripts/test-automatizaciones.ts`, exclusivamente BD desechable en
55450. Cubre cada condición positiva/negativa, las cinco acciones, fallos, aislamiento,
permisos, simulación, enganches reales y carreras con y sin bloqueo de cupos.
