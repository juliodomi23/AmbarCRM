# App Review · qué subir y qué pegar en cada formulario

Carpeta de clips: `D:\AmbarRojo\Documentos de ambar rojo\docs\08-productos-internos\AmbarCRM\recortes\`

Orden en el panel: Revisión de la aplicación → Siguiente → **Uso permitido** (7 formularios) → **Tratamiento de datos** → **Instrucciones para el revisor**. El botón «Enviar a revisión» lo pulsas tú al final.

## Resumen: formulario → clip

| # | Formulario | Clip a subir | Duración |
|---|---|---|---|
| 1 | `instagram_business_manage_messages` | `instagram_business_manage_messages.mp4` | 36.5 s |
| 2 | `instagram_business_basic` | `instagram_business_basic.mp4` | 28.5 s |
| 3 | `pages_show_list` | `pages_show_list.mp4` | 12.5 s |
| 4 | `business_management` | `business_management.mp4` | 16.5 s |
| 5 | `pages_read_engagement` | `pages_read_engagement.mp4` | 17.5 s |
| 6 | `pages_manage_metadata` | `pages_manage_metadata.mp4` | 22 s |
| 7 | `pages_messaging` | `pages_messaging.mp4` | 22.4 s |

En cada formulario: «Empezar» → pegar el texto → subir el clip → marcar «Confirmo… uso permitido». Los textos citan los tiempos **del clip** que subes.

---

## 1. instagram_business_manage_messages  →  `instagram_business_manage_messages.mp4`

```
AmbarCRM is a third-party customer relationship management (CRM) tool that lets small businesses manage the Instagram direct messages they receive in one shared inbox, together with their WhatsApp and Messenger conversations. This is the permitted use "use third-party CRM tools to manage messages".

How it works:
1. A business admin signs in to AmbarCRM, goes to Settings > Channels, selects Instagram and clicks "Connect with Instagram". The owner of the Instagram professional account authorizes AmbarCRM through Instagram Login.
2. When a customer sends a direct message to the connected Instagram professional account, we receive it through the Instagram webhook (messages field) and show it in the AmbarCRM "Chat" inbox, under the Instagram tab.
3. A business agent opens the conversation and replies from AmbarCRM. The reply is sent through the Instagram messaging API and delivered to the customer in the Instagram app. Replies are only sent within 24 hours of the customer's last message.

Why it is needed: without this permission AmbarCRM cannot receive or answer the business's Instagram messages, which is the core function of the app. It adds value because the business team can answer customers from one place, assign conversations and keep the history.

We only use message data to show it to the business that owns the account and to let its agents reply. We do not sell it, share it with other businesses or use it for advertising. instagram_business_basic is requested as a dependent permission of this one.

How the reviewer can test it: sign in at https://crm.ambarrojostudios.cloud/login with organization "demo-meta" and the email in the reviewer instructions (password in the same section), go to Settings > Channels > Instagram, click "Connect with Instagram" and authorize with an Instagram professional account. Then send a direct message to that account from another account and answer it from the "Chat" tab.

The screencast shows: connecting the account (0:00-0:02), the Instagram authorization screen (0:02-0:10), the connected account (0:10-0:16), the empty inbox before the test (0:16-0:21), a customer sending a DM from a phone (0:21-0:26), the message arriving in the AmbarCRM inbox (0:26-0:29), the agent replying (0:29-0:32) and the reply arriving in the Instagram app (0:32-0:36).
```

## 2. instagram_business_basic  →  `instagram_business_basic.mp4`

```
AmbarCRM uses instagram_business_basic as a dependent permission of instagram_business_manage_messages, which is requested in this same submission.

When a business owner connects their Instagram professional account to AmbarCRM, we read the account's basic profile information (the account ID and the username) to identify which account is connected and to display it to the admin as "@username" in Settings > Channels. The account ID is also needed to match incoming messages to the right business and to send replies from the right account. We do not read or store the account's media, posts or insights.

How the reviewer can test it:
1. Open https://crm.ambarrojostudios.cloud/login and sign in with organization "demo-meta" and email "revisor.meta@gmail.com". The password is in the reviewer instructions section (these are AmbarCRM credentials, not Instagram credentials).
2. Go to Settings > Channels, select Instagram and click "Connect with Instagram".
3. Log in with your own Instagram professional account and accept the permissions.
4. After connecting, the Instagram channel card in the same Channels page shows a "Connected successfully" message with the account's username (profile information read with this permission).

Note: if Instagram shows an authorization error for the reviewer's account while the app is not yet approved, the account must have the "Instagram Tester" role on the app; the video shows the full flow working.

The screencast shows the AmbarCRM sign-in (0:00-0:12), the click on "Connect with Instagram" (0:12-0:14), the Instagram authorization screen (0:14-0:22) and the connected account name "@ambar_rojo_studios" displayed in AmbarCRM (0:22-0:28).
```

## 3. pages_show_list  →  `pages_show_list.mp4`

```
AmbarCRM is a shared inbox for businesses. To connect Messenger, the business admin signs in with Facebook and AmbarCRM calls GET /me/accounts to list the Facebook Pages the admin manages, so the admin can choose which Page to connect. We store only the chosen Page's ID and name. Without this permission the admin cannot choose a Page and no Messenger channel can be connected.

How to test: sign in to https://crm.ambarrojostudios.cloud/login with organization "demo-meta" and the email in the reviewer instructions (password in the same section). Go to Settings > Channels, select Messenger and click "Connect with Facebook". After you log in with Facebook, the list of your Pages appears; select one.

The screencast shows the click on "Connect with Facebook" (0:00-0:02), the Facebook Login window opening (0:02-0:06) and the admin choosing which Page to connect (0:06-0:12). Other Pages are blurred for privacy.
```

## 4. business_management  →  `business_management.mp4`

```
Many of our customers manage their Facebook Pages inside a Business Portfolio. Facebook requires this permission as a dependency to return those Pages and to let the admin pick the Business Portfolio that owns the Page they want to connect. We do not read or change any other business asset (ad accounts, catalogs, etc.).

How to test: in Settings > Channels > Messenger click "Connect with Facebook", log in, and when Facebook asks for the Business Portfolio, select the one that owns your Page.

The screencast shows the Facebook Login window (0:00-0:04), the choice of Page (0:04-0:10) and the selection of the business portfolio (0:10-0:15). Other portfolios are blurred for privacy.
```

## 5. pages_read_engagement  →  `pages_read_engagement.mp4`

```
This permission is required by Meta as a dependency of the Messenger permissions we request. When the admin selects a Page, AmbarCRM validates the Page access token with GET /me?fields=id before saving the channel; this call fails without pages_read_engagement and the Page cannot be connected. We do not read posts, comments, followers or any other Page content.

How to test: connect a Page from Settings > Channels > Messenger ("Connect with Facebook"). After selecting the Page the channel appears as connected.

The screencast shows the list of permissions Facebook asks for (0:01-0:07), the connection (0:07-0:12) and the Page token validation with the channel shown as connected (0:12-0:17).
```

## 6. pages_manage_metadata  →  `pages_manage_metadata.mp4`

```
After the admin chooses a Page, AmbarCRM calls POST /{page-id}/subscribed_apps to subscribe the Page to our webhook (messages, message deliveries, reads, echoes and postbacks). This is how incoming customer messages reach the inbox. Without this permission the Page cannot be subscribed and no Messenger message can be received.

How to test: connect a Page from Settings > Channels > Messenger. Then send a message to the Page from another Facebook account; it appears in the AmbarCRM "Chat" inbox, which proves the subscription works.

The screencast shows the list of permissions (0:01-0:07), the Page being subscribed to the webhook (0:07-0:12), the channel connected (0:12-0:17) and, after a cut, a customer message arriving in the inbox through the webhook (0:17-0:22).
```

## 7. pages_messaging  →  `pages_messaging.mp4`

```
AmbarCRM is a third-party CRM tool: the business's agents receive the messages customers send to the business's Facebook Page in one shared inbox and reply from it (POST /me/messages), only within 24 hours of the customer's last message. This is the core function of the app and adds value because the team can answer customers from one place and keep the history.

We only use message data to show it to the business that owns the Page and to let its agents reply. We do not sell it, share it with other businesses or use it for advertising.

How to test: after connecting a Page, send a message to it from another Facebook account. Open the "Chat" tab, select the Messenger tab, open the conversation and send a reply; it is delivered in the customer's Messenger.

The screencast shows the connected channel (0:00-0:05), a customer sending a message from a phone (0:05-0:11), the message arriving in the inbox (0:11-0:15), the agent replying (0:15-0:18) and the reply arriving in the customer's Messenger (0:18-0:22).
```

---

## 8. Tratamiento de datos

Revisa las respuestas ya guardadas y confírmalas. Si pregunta qué haces con los datos de Messenger e Instagram, usa lo que dice la política (`https://crm.ambarrojostudios.cloud/privacidad`): se procesan solo para prestar el servicio a cada organización; no se venden ni se comparten. Si hay una pregunta que no puedas responder con esto, pásamela.

## 9. Instrucciones para el revisor

Pega el bloque 8 de `docs/META-APP-REVIEW-COPIAR-Y-PEGAR.md` **debajo** del texto de WhatsApp que ya está, con tu contraseña en lugar de `<tu contraseña>`. Corrige la frase de WhatsApp que dice que Facebook Login es solo para Embedded Signup.

---

## Antes de enviar: lista final

- [ ] Los 7 formularios tienen texto, clip subido y «Confirmo…» marcado.
- [ ] Tratamiento de datos confirmado.
- [ ] Instrucciones para el revisor con la contraseña puesta (en el campo, nunca en un texto de permiso).
- [ ] «Nuevas solicitudes» sigue con exactamente 7 permisos y WhatsApp en «renovación».
- [ ] Todo en verde y sin campos rojos antes de «Enviar a revisión».

## Avisos honestos tras revisar los clips

- **Subtítulo «the admin signs in» en los clips de Messenger:** en la grabación Facebook no pide correo ni contraseña (la sesión ya estaba abierta y la ventana pasa directo a «Elige las Páginas»). Ese subtítulo sugiere que se inicia sesión en pantalla. Conviene cambiarlo a «Facebook Login opens in a secure window» antes de enviar, para no dar una descripción inexacta. Hay que volver a renderizar el v2 de Messenger y los 5 recortes.
- **Nombre del perfil de Facebook:** «ChatBots Tuxtla» se ve en el clip de `pages_read_engagement`/`pages_manage_metadata` («Se ha conectado ChatBots Tuxtla a AmbarCRM»). No se difuminó.
- **Clips cortos:** `pages_show_list` queda en 12.5 s. Es suficiente, pero si Meta lo cuestiona se alarga.
- **Instagram:** el consentimiento de Instagram aparece directo (sesión ya iniciada), igual que en Messenger.
