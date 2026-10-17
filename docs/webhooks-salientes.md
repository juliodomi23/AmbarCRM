# Webhooks salientes

En Configuración → Automatizaciones, un administrador registra hasta diez URLs HTTPS
públicas por empresa. La clave aleatoria se cifra con `encryptMetaToken` y solo se
devuelve al crear. Copiarla antes de cerrar el aviso; no se puede recuperar por API.
No incluir credenciales en la URL. DELETE elimina el destino; PATCH permite cambiar
URL, eventos o activo. Todas las rutas exigen administrador y están sujetas a RLS.

Eventos conectados:

| Evento | Punto después del commit |
|---|---|
| `contacto.creado` | `ingest.ts`, contacto nuevo por mensaje entrante |
| `conversacion.creada` | `ingest.ts`, primera conversación del contacto/canal |
| `conversacion.estado_cambiado` | `services/conversacion-estado.ts` al editar desde chat; `ingest.ts` al reabrir |
| `mensaje.recibido` | `ingest.ts`, mensaje entrante nuevo |

La publicación pasa por `dispararEvento`. Duplicados, historial importado, contactos
personales y ecos salientes no disparan estos eventos. `mensaje.enviado` queda fuera:
no existe un punto común de envío y no se modifican las rutas de Meta/envío prohibidas.
Su nombre está reservado en el contrato, pero la UI no ofrece esa suscripción.
Las altas manuales/importaciones de contactos y cambios de estado de bots/crons no
emiten eventos: esta versión cubre los puntos anteriores, sin instrumentar toda la BD.

```json
{
  "evento": "mensaje.recibido",
  "empresa": "12",
  "ocurrido_en": "2026-10-17T18:00:00.000Z",
  "datos": { "id": "90", "conversacion_id": "30", "contacto_id": "20", "canal_id": "4", "estado": "abierta", "tipo": "texto" }
}
```

Los identificadores son strings. No se incluyen el cuerpo del mensaje, tokens,
configuraciones ni secretos. POST `/api/webhooks-salientes/:id/probar` entrega
`evento: "prueba"` solo al destino indicado y activo.

## Verificación en n8n

El Webhook debe conservar el **cuerpo crudo**, como binario `data`; no verificar una
reserialización de `$json.body`. En un nodo Code con acceso al módulo nativo `crypto`
y la variable de entorno `AMBAR_WEBHOOK_SECRET`, adaptar la obtención de raw a la
configuración del Webhook:

```js
const { createHmac, timingSafeEqual } = require('crypto');
const raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const h = $input.first().json.headers;
const t = h['x-ambar-timestamp'];
if (!/^\d+$/.test(t ?? '') || Math.abs(Date.now() / 1000 - Number(t)) > 300)
  throw new Error('Entrega vencida');
const esperado = Buffer.from('sha256=' + createHmac('sha256', $env.AMBAR_WEBHOOK_SECRET)
  .update(t + '.' + raw).digest('hex'));
const firma = Buffer.from(h['x-ambar-signature'] ?? '');
if (firma.length !== esperado.length || !timingSafeEqual(firma, esperado))
  throw new Error('Firma inválida');
return [{ json: { ...JSON.parse(raw), entrega: h['x-ambar-delivery'] } }];
```

Persistir `X-Ambar-Delivery` en n8n para deduplicar antes de ejecutar acciones. Firma
HMAC SHA-256 de `timestamp + "." + cuerpo`. El emisor reutiliza `entregarWebhookApi`:
una entrega y hasta tres reintentos (500/1000/2000 ms) por red, timeout, 429 o 5xx;
los demás 4xx no reintentan. El UUID y cuerpo se conservan, la firma/timestamp se
renuevan en cada intento. Timeout de cinco segundos por intento, sin redirecciones;
DNS público validado de nuevo y conexión fijada a esa IP para evitar SSRF/rebinding.

Un fallo definitivo cuenta una vez aunque tenga cuatro intentos. Veinte fallos
seguidos desactivan el destino; un éxito reinicia el contador. Reactivarlo también
reinicia el contador. La bitácora conserva únicamente `ok/error` y un error fijo.
El límite de diez se serializa por empresa para cubrir altas concurrentes.

La entrega se inicia sin esperar desde la operación del CRM; no es una cola durable.
Un reinicio puede perder entregas pendientes. Ningún fallo del receptor revierte el
mensaje ni el cambio de estado guardado. No hay push ni despliegue en esta entrega.
