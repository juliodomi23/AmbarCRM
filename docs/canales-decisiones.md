# Decisiones de canales

- Se conserva `canales_whatsapp` como tabla de bandejas para mantener las relaciones y la API v1. `wa_message_id` representa el identificador de cualquier proveedor; su unicidad es por canal. Un trigger deriva `mensajes.canal_id` de la conversación para cubrir también los envíos existentes de WhatsApp.
- Messenger/API identifican al contacto por `(canal_id, identificador_externo)` (índice parcial SQL). WhatsApp sigue identificando por teléfono dentro de la empresa. No se deduce que dos personas sean la misma a partir de un nombre o PSID.
- Si una identidad externa recibe después un teléfono libre en esa empresa, se agrega al mismo contacto: una futura conversación WhatsApp reutiliza ese contacto, sin perder el PSID/id externo. Si el teléfono ya pertenece a otro contacto, se conserva la identidad y no se fusionan historiales automáticamente; el teléfono de ese evento no sustituye al existente. La consolidación manual de contactos queda fuera de alcance.
- Prisma representa las columnas del índice parcial como campos normales: el índice y las funciones/triggers se administran exclusivamente mediante SQL.
- En la fase base los proveedores API/Messenger devuelven un error explícito hasta completar sus respectivas fases; no se pueden crear desde la interfaz todavía.
