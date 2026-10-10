# AmbarCRM — Bots propios de n8n

AmbarCRM puede enviar cada mensaje entrante a un webhook de n8n. El workflow decide si responde, transfiere la conversación a una persona o actualiza etiquetas.

## Flujo

```text
Meta Cloud API → AmbarCRM → webhook del bot en n8n
                               ↓
                    API propia de AmbarCRM
                               ↓
                       Meta Cloud API
```

## Evento recibido por n8n

El CRM envía un evento `message_created` con los identificadores de conversación y contacto, teléfono, nombre, estado del bot y datos del mensaje. Los adjuntos se entregan mediante una URL protegida.

## Responder

Usa el token generado para el bot:

```http
POST /api/v1/accounts/1/conversations/{conversationId}/messages
Content-Type: application/json
api_access_token: <token-del-bot>

{
  "content": "Hola, ¿en qué te ayudo?",
  "message_type": "outgoing"
}
```

La ruta conserva este formato por compatibilidad con workflows ya exportados, pero es una API nativa de AmbarCRM y no requiere servicios externos adicionales.

## Transferir a una persona

El workflow puede desactivar el bot o asignar la conversación mediante las rutas propias disponibles bajo `/api/v1/accounts/1/conversations/{id}`.

## Recomendaciones

- Valida que `botActivo` sea verdadero antes de generar respuestas.
- Usa el identificador de mensaje para idempotencia.
- Maneja reintentos de n8n sin enviar dos respuestas.
- Nunca registres el token completo en logs.

## Referencia

Contrato completo de las rutas, firma HMAC y bitácora: [docs/api-bot.md](docs/api-bot.md).
