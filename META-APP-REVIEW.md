# Checklist de revisión de Meta — AmbarCRM

Este documento separa lo que ya resuelve el producto de lo que debe configurarse manualmente en el panel de Meta.

## 1. Configuración de la aplicación

- [ ] La app pertenece al Business Manager verificado de la empresa.
- [ ] El producto WhatsApp está agregado y la app está en modo Live al enviar la revisión.
- [ ] Embedded Signup usa una configuración destinada a Tech Provider.
- [ ] El dominio público y las URLs OAuth están autorizados.
- [ ] La versión de Graph API coincide con `META_GRAPH_VERSION` y `NEXT_PUBLIC_META_GRAPH_VERSION`.
- [ ] La configuración de Coexistence usa `featureType: whatsapp_business_app_onboarding`.

## 2. Permisos y acceso avanzado

Solicitar únicamente los permisos usados por el producto y explicar cada uno con un video reproducible:

- [ ] `whatsapp_business_management`: conectar y administrar la cuenta/número y sus plantillas.
- [ ] `whatsapp_business_messaging`: enviar y recibir mensajes en nombre del negocio incorporado.
- [ ] `business_management`: incluirlo solo si el flujo de Embedded Signup o los recursos administrados lo requieren en la configuración real de la app.

No describir integraciones ni proveedores que no forman parte del flujo presentado.

## 3. Webhooks

- [ ] Callback: `https://crm.tudominio.com/api/meta/webhook`.
- [ ] Verify token igual a `META_WEBHOOK_VERIFY_TOKEN`.
- [ ] Firma `x-hub-signature-256` probada con `META_APP_SECRET`.
- [ ] Campos suscritos: `messages`, `message_template_status_update`, `account_update`, `history`, `smb_app_state_sync` y `smb_message_echoes`.
- [ ] El endpoint responde 2xx a eventos válidos e idempotentemente a reintentos.

## 4. URLs públicas y datos del negocio

- [ ] `https://crm.tudominio.com/privacidad`.
- [ ] `https://crm.tudominio.com/terminos`.
- [ ] `https://crm.tudominio.com/eliminacion-datos`.
- [ ] Razón social, dominio, icono, correo de privacidad y contacto de soporte son reales y coinciden con el negocio verificado.
- [ ] El procedimiento de eliminación de datos puede ejecutarse realmente por soporte.

## 5. Guion recomendado del video

Grabar en una sola toma legible, mostrando la URL y sin exponer secretos:

1. Iniciar sesión como administrador en AmbarCRM.
2. Abrir Configuración → WhatsApp y pulsar **Conectar con Meta**.
3. Completar Embedded Signup con un negocio y número de prueba autorizados.
4. Mostrar el número conectado dentro del CRM.
5. Recibir un mensaje del cliente y responder desde el CRM.
6. Mostrar los estados de entrega/lectura.
7. Enviar un mensaje desde WhatsApp Business App y mostrar su eco en el CRM.
8. Abrir la sección de plantillas oficiales, listarlas y crear una de prueba si el permiso solicitado lo requiere.
9. Desconectar el número desde el CRM.

En la explicación de cada permiso, indicar exactamente en qué minuto del video se ve la acción que lo necesita.

## 6. Acceso del revisor

- [ ] URL pública estable, sin VPN ni lista blanca de IP.
- [ ] Credenciales de revisor con rol administrador y datos de demostración.
- [ ] Instrucciones cortas para llegar a Configuración → WhatsApp.
- [ ] Número, negocio y usuarios de prueba siguen disponibles durante toda la revisión.
- [ ] No hay CAPTCHA, 2FA externo ni pasos que el revisor no pueda completar.

## 7. Prueba técnica antes de enviar

Desde `web/`:

```bash
npm run lint
npx prisma validate
npm run build
```

Después ejecutar la prueba de humo de `DESPLIEGUE.md` en el dominio real. Una compilación local correcta no sustituye la prueba con credenciales reales de Meta.
