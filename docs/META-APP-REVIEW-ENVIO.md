# App Review de Messenger e Instagram · texto listo para pegar en el panel

Estado al 29-oct-2026: **nada enviado**. Este documento sustituye a `META-APP-REVIEW-MESSENGER.md` y `META-APP-REVIEW-CHECKLIST-JULIO.md` en lo que respecta al flujo actual (Instagram Login para Instagram; Facebook Login por `scope` para Messenger). Los textos de las secciones 2 y 3 están en inglés porque es lo que lee el revisor.

App `1611804210387747` · CRM `https://crm.ambarrojostudios.cloud` · organización de revisión `demo-meta` (id 10, en `META_CANALES_REVISION_ORGS`) · usuario `revisor.meta@gmail.com` (rol administrador; la contraseña la pones tú, nunca en este archivo).

**30-oct-2026:** borrador corregido en el panel (quedan los 7 permisos de la sección 1; se quitaron `instagram_basic` e `instagram_manage_messages`). Verificación y Configuración de la aplicación aparecen en verde. Faltan Uso permitido, Tratamiento de datos e Instrucciones para revisores (el texto actual solo habla de WhatsApp y hay que ampliarlo con el de la sección 3).

## 1. Permisos a solicitar (7)

| Canal | Permiso | Video | Minuto |
|---|---|---|---|
| Messenger | `pages_show_list` | Messenger | 0:06–0:12 |
| Messenger | `business_management` | Messenger | 0:12–0:17 |
| Messenger | `pages_manage_metadata` | Messenger | 0:25–0:35 (y 0:40, recepción por webhook) |
| Messenger | `pages_messaging` | Messenger | 0:35–0:52 |
| Messenger | `pages_read_engagement` | Messenger | 0:17–0:35 |
| Instagram | `instagram_business_basic` | Instagram | 0:02–0:16 |
| Instagram | `instagram_business_manage_messages` | Instagram | 0:02–0:10 y 0:21–0:37 |

No solicitar `instagram_basic`, `instagram_manage_messages`, Human Agent, Ads ni comentarios (eso es la segunda revisión).

## 2. Descripción de uso por permiso (campo «How are you using this permission?»)

**pages_show_list**
AmbarCRM is a shared inbox for businesses. To connect Messenger, the business admin signs in with Facebook and AmbarCRM calls `GET /me/accounts` to list the Pages the admin manages so they can choose which Page to connect. Only the chosen Page's ID and name are stored. Shown in the Messenger video at 0:06–0:12.

**business_management**
Many of our customers manage their Pages inside a Business Portfolio. Facebook requires this permission as a dependency to return those Pages and let the admin pick the portfolio that owns the Page. We do not read or change any other business asset. Shown at 0:12–0:17.

**pages_read_engagement**
Required by Meta as a dependency of the Messenger permissions. When the admin selects a Page, AmbarCRM validates the Page access token with `GET /me?fields=id` before saving the channel, which fails without this permission. We do not read posts, comments or any other Page content. Shown at 0:17–0:35.

**pages_manage_metadata**
After the admin chooses a Page, AmbarCRM calls `POST /{page-id}/subscribed_apps` to subscribe the Page to our webhook (messages, deliveries, reads, echoes, postbacks) so incoming messages reach the inbox. Without it no message can be received. Shown at 0:25–0:35, and its effect at 0:40 when the customer's message arrives.

**pages_messaging**
The business's agents receive customer messages sent to the Page in the AmbarCRM inbox and reply from it (`POST /me/messages`, within the 24-hour window). Shown at 0:35–0:52: a customer sends a message from a phone, it appears in the inbox, the agent replies, and the reply is delivered in the customer's Messenger.

**instagram_business_basic** (video de Instagram)
```
AmbarCRM uses instagram_business_basic as a dependent permission of instagram_business_manage_messages, which is requested in this same submission.

When a business owner connects their Instagram professional account to AmbarCRM, we read the account's basic profile information (the account ID and the username) to identify which account is connected and to display it to the admin as "@username" in Settings > Channels. The account ID is also needed to match incoming messages to the right business and to send replies from the right account. We do not read or store the account's media, posts or insights.

How the reviewer can test it:
1. Open https://crm.ambarrojostudios.cloud/login and sign in with the organization, email and password we provide in the reviewer instructions (these are AmbarCRM credentials, not Instagram credentials).
2. Go to Settings > Channels, select Instagram and click "Connect with Instagram".
3. Log in with your own Instagram professional account and accept the permissions.
4. After connecting, the Instagram channel card in the same Channels page shows a "Connected successfully" message with the account's username (profile information read with this permission).

The screencast shows the connection flow (0:02-0:10) and the connected account name displayed in AmbarCRM (0:10-0:16).
```

**instagram_business_manage_messages** (video de Instagram)
```
AmbarCRM is a third-party customer relationship management (CRM) tool that lets small businesses manage the Instagram direct messages they receive in one shared inbox, together with their WhatsApp and Messenger conversations. This is the permitted use "use third-party CRM tools to manage messages".

How it works:
1. A business admin signs in to AmbarCRM, goes to Settings > Channels, selects Instagram and clicks "Connect with Instagram". The owner of the Instagram professional account authorizes AmbarCRM through Instagram Login.
2. When a customer sends a direct message to the connected Instagram professional account, we receive it through the Instagram webhook (messages field) and show it in the AmbarCRM "Chat" inbox, under the Instagram tab.
3. A business agent opens the conversation and replies from AmbarCRM. The reply is sent through the Instagram messaging API and delivered to the customer in the Instagram app. Replies are only sent within 24 hours of the customer's last message.

Why it is needed: without this permission AmbarCRM cannot receive or answer the business's Instagram messages, which is the core function of the app. It adds value because the business team can answer customers from one place, assign conversations and keep the history.

We only use message data to show it to the business that owns the account and to let its agents reply. We do not sell it, share it with other businesses or use it for advertising. instagram_business_basic is requested as a dependent permission of this one.

The screencast (Instagram video) shows: connecting the account (0:02-0:16), a customer sending a DM from a phone (0:21-0:26), the message arriving in the AmbarCRM inbox (0:26-0:29), the agent replying (0:29-0:32) and the reply arriving in the Instagram app (0:32-0:37).
```

## 3. Instrucciones para el revisor (campo «Notes for reviewer»)

```
AmbarCRM is a multi-tenant inbox for small businesses (WhatsApp, Messenger, Instagram).

1. Open https://crm.ambarrojostudios.cloud/login
2. Organization: demo-meta
   Email: revisor.meta@gmail.com
   Password: <la pones tú en el campo privado de Meta>
3. Go to Settings > Channels. Select "Messenger" (or "Instagram") and click
   "Connect with Facebook" (or "Connect with Instagram").
4. Complete the Meta login with an account that has a role on the app/Page and
   accept the permissions. Choose the Page / business portfolio.
5. Send a message to the connected Page (or Instagram account) from a different
   account. Open the "Chat" tab: the conversation appears under the Messenger /
   Instagram tab. Open it, write a reply and send it.

Notes:
- Messenger contact names may show as a numeric ID. Meta does not return the
  profile of users without a role while the app is in development mode.
- Replies are only possible within 24 hours of the customer's last message.
- The Messenger and Instagram channel options are enabled only for this
  organization until the app is approved; other customers still see them as
  "coming soon".
- Data deletion: https://crm.ambarrojostudios.cloud/eliminacion-datos
  Privacy: https://crm.ambarrojostudios.cloud/privacidad
```

## 4. Lo que verifiqué hoy en producción

- `/login`, `/privacidad`, `/terminos` y `/eliminacion-datos`: 200. La privacidad menciona Messenger e Instagram; razón social «Ambar Rojo Studios» y correo de privacidad configurados.
- Webhooks `/api/messenger/webhook` y `/api/instagram/webhook` existen y rechazan con 403 un token incorrecto; ambos usan `MESSENGER_VERIFY_TOKEN`, que está definido. **No pude comprobar que el token que tienes en el panel coincida**: eso solo se ve al suscribir.
- Organización `demo-meta` (id 10) existe con el usuario `revisor.meta@gmail.com` como admin.
- `META_HUMAN_AGENT_APROBADO=false` (correcto: no se pide Human Agent).
- Sin errores `[meta-login]` en logs desde el redeploy de las 02:37 UTC.

## 5. Pendientes que solo tú puedes confirmar en el panel

- [ ] **Webhooks suscritos** en el panel: Messenger (objeto Page, campos `messages`, `messaging_postbacks`, etc.) e Instagram (campo `messages`) con la URL y el token que pusiste.
- [ ] **Modo de la app / rol del revisor:** si la app sigue en desarrollo, el revisor necesita poder iniciar sesión con Meta (Meta suele añadirlo como probador durante la revisión; si el panel pide otra cosa, síguelo).
- [ ] **Verificación empresarial** y «Acceso avanzado» que el panel exija para `pages_messaging`, `instagram_business_manage_messages` y `business_management`.
- [ ] **URL de política de privacidad y de eliminación de datos** puestas en Configuración básica de la app.
- [ ] **Añadir al envío** los 7 permisos de la sección 1 (borrador que ya tienes) y subir los dos videos editados.
- [ ] **Contraseña de `revisor.meta@gmail.com`**: ponla tú en el campo privado de credenciales.
- [ ] **No tocar** la política de privacidad, el ícono ni las URLs mientras la renovación de WhatsApp esté en revisión (va en el mismo envío).
- [ ] Ver los dos videos completos una vez antes de subirlos (difuminado de otras páginas en el de Messenger).

## 6. Riesgos conocidos

- La política de privacidad dice que se accede «con Facebook Login» también para Instagram; ahora Instagram usa Instagram Login. No lo cambies durante la revisión de WhatsApp; corrígelo después.
- Los dos mensajes de prueba del video de Messenger son cortos («Hola»). Funciona, pero un revisor exigente podría pedir un mensaje más descriptivo.
- Messenger muestra al contacto como ID numérico (perfil bloqueado en modo desarrollo); está explicado en las notas.
- `META-APP-REVIEW.md` (raíz) sigue hablando solo de WhatsApp; no afecta este envío.
