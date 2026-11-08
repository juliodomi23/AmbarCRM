# Prompt para Codex: corregir los permisos de Instagram en el borrador del App Review de Meta

**NO envíes la solicitud a revisión ni pulses «Enviar a revisión», en ningún caso.** No escribas, copies ni muestres contraseñas, tokens ni secretos. No cambies ajustes de la app, webhooks, política de privacidad, ícono ni URLs (hay una renovación de WhatsApp en el mismo envío). No toques el código de `web/` ni hagas push.

Si no puedes manejar el navegador con la sesión de Julio en Meta, no lo intentes con otra: entrégale los pasos de abajo como lista para hacer él mismo y termina.

App Meta `1611804210387747`, business_id `2899309940269416`. Referencia: `docs/META-APP-REVIEW-ENVIO.md`.

## Problema (verificado el 29-oct-2026)

En `https://developers.facebook.com/apps/1611804210387747/app-review/submissions/?business_id=2899309940269416`, «Nuevas solicitudes» (sin enviar) incluye `instagram_basic` e `instagram_manage_messages` (flujo de Facebook Login). La app usa **Instagram Login**, y los videos grabados muestran `instagram_business_basic` e `instagram_business_manage_messages`. Si se envía así, Meta no verá en los videos los permisos que se piden.

`instagram_business_basic` e `instagram_business_manage_messages` ya aparecen como «Listo para prueba» en Casos de uso → «Administrar mensajes y contenido en Instagram» → Personalizar → Permisos y funciones, pero **no están añadidos** al envío.

## Tarea

1. En Casos de uso → Instagram → Permisos y funciones, en las filas `instagram_business_basic` e `instagram_business_manage_messages`, pulsa «Añadir a la revisión de la aplicación».
2. En la página de Revisión de la aplicación, quita del borrador `instagram_basic` e `instagram_manage_messages` con «suprimir» (solo de la revisión, no del caso de uso).
3. No añadas ni quites ningún otro permiso. Deben quedar en «Nuevas solicitudes» exactamente estos 7: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `business_management`, `instagram_business_basic`, `instagram_business_manage_messages`. «Acceso actual para la renovación» (WhatsApp) no se toca.
4. Si al añadir un permiso Meta pide completar datos (descripción de uso, video, notas), **no los rellenes**: anota qué campos pide y detente ahí. El texto lo pega Julio desde `docs/META-APP-REVIEW-ENVIO.md` (secciones 2 y 3).
5. Abre «Siguiente» solo para ver qué campos faltan (sin enviar) y lístalos.

## Entrega

- Lista final de «Nuevas solicitudes» tal como queda en el panel.
- Campos que Meta pide por permiso y siguen vacíos.
- Cualquier cosa inesperada. No afirmes que quedó hecho si no lo comprobaste en pantalla.
- Actualiza `docs/META-APP-REVIEW-ENVIO.md` añadiendo una línea con la fecha y que el borrador ya está corregido.
