# Prompt para Codex: dejar Messenger e Instagram listos para App Review

Rama: `codex/fase-3-marketing-meta-ads`. No hagas push, merge, despliegue ni llamadas a Meta reales. No toques los archivos sin seguimiento ajenos (`docs/VARIABLES-CORREO-CRMLITE.md`, `docs/COMPARATIVA-CALLBELL.pdf`, `docs/prompts/PROMPT-*.md`).

**Messenger e Instagram deben seguir como «próximamente» en `web/src/components/config/Canales.tsx`.** Julio los habilitará cuando se aprueben los permisos. Todo lo que hagas debe quedar detrás de ese estado.

Contexto: una revisión independiente encontró 4 problemas. Corrígelos en este orden, con cambios pequeños y sin abstracciones nuevas.

## 1. La desconexión de un canal rompe al otro si comparten página

`web/src/lib/channel/meta-mensajeria.ts` (`desuscribirPaginaMeta`) hace `DELETE /{pageId}/subscribed_apps` sin campos. Eso quita **toda** la suscripción de la app a esa página. Messenger e Instagram pueden compartir página y app, así que desconectar uno deja al otro sin webhooks.

Haz esto:
- Antes de desuscribir, consulta en la BD si queda otro canal activo (Messenger o Instagram) de **cualquier organización** con el mismo `pageId` y la misma app. Si queda, no llames al DELETE: vuelve a hacer `POST subscribed_apps` solo con los campos que necesita el canal restante, o simplemente omite el DELETE. Elige la opción más simple y justifica en un comentario corto por qué.
- Si no queda otro canal con esa página, el comportamiento actual no cambia.
- Aplica la misma lógica en el alta: suscribir un canal no debe quitar los campos del otro (el POST de `subscribed_fields` reemplaza la lista, así que debe enviar la unión de campos de ambos).
- Añade un check en `web/scripts/` con Graph simulado que pruebe: conectar ambos, desconectar uno y comprobar que la suscripción del otro sigue; desconectar el último y comprobar que se retira.

## 2. Instagram sin login guiado (bloquea App Review)

Hoy Instagram solo tiene alta manual (token + App ID + App Secret). Meta exige en el video de revisión el diálogo real de Facebook donde el usuario autoriza los permisos, y un cliente no puede generar ese token sin rol en la app.

Haz esto:
- Reutiliza el flujo de Facebook Login de Messenger (`messenger-facebook.ts`, `MessengerFacebook.tsx`, `messenger-login.ts`) para Instagram. No dupliques el flujo: parametriza los scopes.
- Scopes de Instagram con página vinculada: `instagram_basic, instagram_manage_messages, pages_manage_metadata, pages_show_list` y, si la documentación oficial accesible lo exige, `pages_read_engagement`. No añadas ninguno que no puedas justificar; si no puedes verificar uno, déjalo marcado como «por confirmar en el panel» en el documento.
- Tras elegir la página, obtener `instagram_business_account` de esa página (`GET /{pageId}?fields=instagram_business_account`). Si la página no tiene cuenta de Instagram vinculada, muestra un mensaje claro en español y no guardes nada.
- Conserva la conexión manual como alternativa, igual que en Messenger.
- Mantén tokens cifrados, el intento ligado a empresa/usuario/sesión con vencimiento de 10 minutos y los webhooks firmados.
- Pruebas con Graph simulado, igual que las de Messenger.

## 3. Páginas dentro de un Business Portfolio

`/me/accounts` puede no devolver páginas que pertenecen a un Business Portfolio si solo se pidió `pages_show_list`. No cambies el scope a ciegas. Haz esto:
- Si la lista llega vacía tras autorizar, muestra un mensaje que explique que la página puede estar en un portafolio empresarial y qué debe hacer el administrador (compartir acceso a la página con su usuario).
- En `docs/META-APP-REVIEW-MESSENGER.md` añade `business_management` como permiso condicional, a pedir solo si la prueba con una página de portafolio real lo demuestra necesario.

## 4. Human Agent sin comprobar si está aprobado

`tipoEnvioMeta` en `meta-mensajeria.ts` intenta `HUMAN_AGENT` entre 24 h y 7 días, aunque la capacidad no esté aprobada.

Haz esto:
- Añade una variable de entorno `META_HUMAN_AGENT_APROBADO` (por defecto `false`). Solo si es `true` se permite el envío con la etiqueta. Si es `false`, tratar esos mensajes como fuera de ventana, con un mensaje claro al asesor.
- Documéntala donde estén las demás variables de Meta.
- Actualiza el check existente de ventanas de mensajería.

## 5. Documentación

- Actualiza `docs/META-APP-REVIEW-MESSENGER.md`: scopes finales, y un apartado de Instagram con permisos, justificación por permiso, URLs y guion de video minuto a minuto, igual que el de Messenger.
- Actualiza `docs/revision-conexiones-instagram-messenger-2026-10-21.md` marcando qué riesgos quedaron resueltos y cuáles siguen pendientes de confirmar en el panel.
- No marques nada como aprobado ni confirmado en Meta.

## Validación

Corre Prisma validate, TypeScript, lint y los checks de canales. Instala `tsx` si hace falta y hay red; si no, dilo. Informa qué pasó y qué no pudiste correr. Haz un commit local con mensaje en español.
