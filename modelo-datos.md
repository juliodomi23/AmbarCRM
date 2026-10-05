# Modelo de datos — AmbarCRM

## Núcleo multiempresa

- `organizaciones`: cliente propietario de la información.
- `usuarios`: agentes y administradores de una organización.
- `canales_whatsapp`: números conectados mediante Meta Cloud API; guarda identificadores de Meta y credenciales cifradas.
- `contactos`: personas identificadas principalmente por teléfono.
- `conversaciones`: relación entre un contacto y un canal.
- `mensajes`: historial normalizado de entradas, salidas y estados.

## Operación comercial

- `leads` y entidades de embudo: seguimiento de oportunidades.
- `plantillas`: respuestas rápidas internas.
- Plantillas oficiales de WhatsApp: se administran en Meta y se consultan mediante la API.
- `bots`: endpoints y tokens de automatizaciones de n8n.

## Decisiones importantes

- Cada registro de negocio pertenece a una organización y las consultas se ejecutan bajo su contexto.
- `wa_message_id` permite procesar reintentos de webhook sin duplicar mensajes.
- El canal se identifica por `phone_number_id`, no solo por el teléfono visible.
- Los mensajes históricos de Coexistence se marcan durante la ingesta para evitar notificaciones, bots y creación automática de leads.
- Las credenciales de Meta nunca se serializan hacia el cliente.
