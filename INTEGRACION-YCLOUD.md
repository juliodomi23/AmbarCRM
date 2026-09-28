# Integración de WhatsApp con YCloud

Esta integración permite usar un número oficial de WhatsApp mediante YCloud sin que AmbarCRM sea un Meta Tech Provider.

## Configuración

1. En el servidor configura:

   - YCLOUD_API_KEY
   - YCLOUD_WEBHOOK_SECRET
   - YCLOUD_PHONE_NUMBER (opcional; también puede guardarse en el campo Instancia del canal)

2. En Configuración > Canal, selecciona WhatsApp Oficial (YCloud).

3. Guarda el número del negocio en formato E.164, por ejemplo +525500000000.

4. En YCloud registra este webhook:

   https://TU_DOMINIO/api/wa/ycloud?canal=ID_DEL_CANAL

5. Activa los eventos whatsapp.inbound_message.received y whatsapp.message.updated.

YCloud debe firmar cada solicitud con el header YCloud-Signature. El CRM rechaza solicitudes sin firma válida o con más de cinco minutos de antigüedad.

## Qué queda conectado

- Envío de texto desde el CRM.
- Envío de imagen, video, audio y documento.
- Recepción de texto, multimedia, ubicación y respuestas interactivas.
- Descarga autenticada de multimedia.
- Estados enviado, entregado, leído y fallido.
- Procesamiento normal del CRM mediante el canal existente.

Para enviar mensajes fuera de la ventana de atención de WhatsApp se siguen necesitando plantillas aprobadas por Meta/YCloud.
