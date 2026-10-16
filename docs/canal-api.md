# Canal API libre

En Configuración → Canales crea una bandeja API con nombre y `webhook_url` HTTPS pública. Copia la clave de entrada y el secreto de firma: solo aparecen al crear o regenerar; regenerar invalida los anteriores. Son distintos del token del bot. La clave se almacena con SHA-256 y el secreto con AES-256-GCM (`META_TOKEN_ENCRYPTION_KEY`).

## Entrada

```sh
curl -X POST 'https://crm.ejemplo.com/api/canal-api/42/mensajes' \
  -H 'Content-Type: application/json' -H 'x-api-key: CLAVE_DEL_CANAL' \
  -d '{"contacto":{"id_externo":"cliente-123","nombre":"Ana"},"mensaje":{"id":"evento-001","tipo":"texto","contenido":"Hola"}}'
```

`telefono` es opcional, con 7–15 dígitos y `+` opcional; `timestamp` es fecha ISO opcional (por defecto ahora, no se aceptan fechas futuras). Los tipos son `texto`, `imagen`, `audio`, `video`, `documento`, `ubicacion`. Los adjuntos usan `media_url` HTTPS; ubicación usa `contenido`. Límite del cuerpo: 100 KB. `mensaje.id` es obligatorio y único por canal: repetir incluso simultáneamente devuelve `duplicado: true` y no dispara de nuevo el bot. El pipeline es el mismo de WhatsApp, incluyendo CSAT, lead, horario, bienvenida, bot y SSE. La clave de una empresa no autoriza otra bandeja.

## Salida

El bot responde por la API v1 existente; el asesor por el chat. La bandeja entrega POST JSON con `event: message_created`, `message_type: outgoing`, `content`, `conversation.id`, `receiver.identifier` y `attachments` (`file_type`, `data_url`; los archivos cargados en el chat pueden viajar como data URI). Las notas privadas no salen. Estado final: `enviado` o `fallido`, con motivo visible. Hasta tres reintentos adicionales para red, timeout, 429 o 5xx, con esperas de 500, 1000 y 2000 ms; otros 4xx y redirecciones fallan sin repetir. Timeout por intento: 5 s.

El receptor debe deduplicar por `X-Ambar-Delivery`, que se conserva entre intentos. La firma se calcula sobre los bytes UTF-8 del JSON exacto, antes de parsearlo. `X-Ambar-Timestamp` son segundos Unix. Ejemplo Node (sin dependencias):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
function verificar(headers, cuerpoCrudo, secreto) {
  const timestamp = headers['x-ambar-timestamp'];
  if (!/^\d+$/.test(timestamp ?? '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const firma = Buffer.from(headers['x-ambar-signature'] ?? '');
  const esperado = Buffer.from('sha256=' + createHmac('sha256', secreto)
    .update(timestamp + '.').update(cuerpoCrudo).digest('hex'));
  return firma.length === esperado.length && timingSafeEqual(firma, esperado);
}
```

Se rechazan destinos locales/privados, credenciales en URL y HTTP; se revisa DNS en cada intento y se fija la IP validada en la conexión TLS. No se siguen redirecciones. La URL del bot de n8n y el webhook de salida de la bandeja cumplen funciones independientes.
