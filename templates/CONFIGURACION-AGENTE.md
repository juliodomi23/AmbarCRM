# Configuración de un agente de n8n

Esta guía conecta un workflow de n8n con el sistema de bots propio de AmbarCRM.

## 1. Crear el webhook

Crea un nodo Webhook POST en n8n y activa el workflow. Copia su URL de producción.

## 2. Registrar el bot

En AmbarCRM abre Configuración → Bots:

1. Crea el bot.
2. Pega la URL de producción del webhook.
3. Copia el token generado.
4. Asocia el bot al canal de WhatsApp.

## 3. Variables recomendadas en n8n

- `cfg_baseUrl`: URL pública de AmbarCRM.
- `cfg_apiToken`: token del bot.
- `conversationId`: valor recibido en el evento.

## 4. Responder

Configura un nodo HTTP Request:

- Método: POST.
- URL: `{{$json.cfg_baseUrl}}/api/v1/accounts/1/conversations/{{$json.conversationId}}/messages`.
- Header `api_access_token`: token del bot.
- Body JSON: `{"content":"texto de respuesta","message_type":"outgoing"}`.

## 5. Handoff

Cuando el flujo requiera intervención humana, desactiva el bot en la conversación y agrega una nota o etiqueta que explique el motivo. Evita que el workflow siga respondiendo después del handoff.
