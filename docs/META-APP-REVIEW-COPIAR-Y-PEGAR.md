# App Review · textos para copiar y pegar

Cada bloque de código va en el formulario con su nombre (Uso permitido → «Describe cómo usa tu aplicación este permiso o función»). Marca «Confirmo… uso permitido» en cada uno. No incluye contraseñas: la pones tú.

| Formulario | Video que se sube |
|---|---|
| `instagram_business_manage_messages`, `instagram_business_basic` | `IG-App-Review-editado-PiP.mp4` |
| `pages_show_list`, `business_management`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging` | `Messenger-App-Review-editado-PiP.mp4` |

---

## 1. instagram_business_manage_messages

```
AmbarCRM is a third-party customer relationship management (CRM) tool that lets small businesses manage the Instagram direct messages they receive in one shared inbox, together with their WhatsApp and Messenger conversations. This is the permitted use "use third-party CRM tools to manage messages".

How it works:
1. A business admin signs in to AmbarCRM, goes to Settings > Channels, selects Instagram and clicks "Connect with Instagram". The owner of the Instagram professional account authorizes AmbarCRM through Instagram Login.
2. When a customer sends a direct message to the connected Instagram professional account, we receive it through the Instagram webhook (messages field) and show it in the AmbarCRM "Chat" inbox, under the Instagram tab.
3. A business agent opens the conversation and replies from AmbarCRM. The reply is sent through the Instagram messaging API and delivered to the customer in the Instagram app. Replies are only sent within 24 hours of the customer's last message.

Why it is needed: without this permission AmbarCRM cannot receive or answer the business's Instagram messages, which is the core function of the app. It adds value because the business team can answer customers from one place, assign conversations and keep the history.

We only use message data to show it to the business that owns the account and to let its agents reply. We do not sell it, share it with other businesses or use it for advertising. instagram_business_basic is requested as a dependent permission of this one.

The screencast (Instagram video) shows: signing in to AmbarCRM and connecting the account (0:00-0:28), a customer sending a DM from a phone (0:33-0:39), the message arriving in the AmbarCRM inbox (0:39-0:41), the agent replying (0:41-0:45) and the reply arriving in the Instagram app (0:45-0:48).
```

## 2. instagram_business_basic

```
AmbarCRM uses instagram_business_basic as a dependent permission of instagram_business_manage_messages, which is requested in this same submission.

When a business owner connects their Instagram professional account to AmbarCRM, we read the account's basic profile information (the account ID and the username) to identify which account is connected and to display it to the admin as "@username" in Settings > Channels. The account ID is also needed to match incoming messages to the right business and to send replies from the right account. We do not read or store the account's media, posts or insights.

How the reviewer can test it:
1. Open https://crm.ambarrojostudios.cloud/login and sign in with organization "demo-meta" and email "revisor.meta@gmail.com". The password is in the reviewer instructions section (these are AmbarCRM credentials, not Instagram credentials).
2. Go to Settings > Channels, select Instagram and click "Connect with Instagram".
3. Log in with your own Instagram professional account and accept the permissions.
4. After connecting, the Instagram channel card in the same Channels page shows a "Connected successfully" message with the account's username (profile information read with this permission).

Note: if Instagram shows an authorization error for the reviewer's account while the app is not yet approved, the account must have the "Instagram Tester" role on the app; the video shows the full flow working.

The screencast shows the CRM sign-in and the connection flow (0:00-0:22) and the connected account name displayed in AmbarCRM (0:22-0:28).
```

## 3. pages_show_list

```
AmbarCRM is a shared inbox for businesses. To connect Messenger, the business admin signs in with Facebook and AmbarCRM calls GET /me/accounts to list the Facebook Pages the admin manages, so the admin can choose which Page to connect. We store only the chosen Page's ID and name. Without this permission the admin cannot choose a Page and no Messenger channel can be connected.

How to test: sign in to https://crm.ambarrojostudios.cloud/login with the AmbarCRM credentials in the reviewer instructions (organization demo-meta). Go to Settings > Channels, select Messenger and click "Connect with Facebook". After you log in with Facebook, the list of your Pages appears; select one.

The screencast shows the Facebook login and the Page list at 0:06-0:12 (other Pages are blurred for privacy).
```

## 4. business_management

```
Many of our customers manage their Facebook Pages inside a Business Portfolio. Facebook requires this permission as a dependency to return those Pages and to let the admin pick the Business Portfolio that owns the Page they want to connect. We do not read or change any other business asset (ad accounts, catalogs, etc.).

How to test: in Settings > Channels > Messenger click "Connect with Facebook", log in, and when Facebook asks for the Business Portfolio, select the one that owns your Page.

The screencast shows the portfolio selection at 0:12-0:17.
```

## 5. pages_read_engagement

```
This permission is required by Meta as a dependency of the Messenger permissions we request. When the admin selects a Page, AmbarCRM validates the Page access token with GET /me?fields=id before saving the channel; this call fails without pages_read_engagement and the Page cannot be connected. We do not read posts, comments, followers or any other Page content.

How to test: connect a Page from Settings > Channels > Messenger ("Connect with Facebook"). After selecting the Page the channel appears as connected.

The screencast shows the permission list at 0:17-0:25 and the connected channel at 0:25-0:35.
```

## 6. pages_manage_metadata

```
After the admin chooses a Page, AmbarCRM calls POST /{page-id}/subscribed_apps to subscribe the Page to our webhook (messages, message deliveries, reads, echoes and postbacks). This is how incoming customer messages reach the inbox. Without this permission the Page cannot be subscribed and no Messenger message can be received.

How to test: connect a Page from Settings > Channels > Messenger. Then send a message to the Page from another Facebook account; it appears in the AmbarCRM "Chat" inbox, which proves the subscription works.

The screencast shows the connection at 0:25-0:35 and the message arriving through the webhook at 0:40-0:45.
```

## 7. pages_messaging

```
AmbarCRM is a third-party CRM tool: the business's agents receive the messages customers send to the business's Facebook Page in one shared inbox and reply from it (POST /me/messages), only within 24 hours of the customer's last message. This is the core function of the app and adds value because the team can answer customers from one place and keep the history.

We only use message data to show it to the business that owns the Page and to let its agents reply. We do not sell it, share it with other businesses or use it for advertising.

How to test: after connecting a Page, send a message to it from another Facebook account. Open the "Chat" tab, select the Messenger tab, open the conversation and send a reply; it is delivered in the customer's Messenger.

The screencast shows a customer message sent from a phone (0:35-0:40), arriving in the inbox (0:40-0:45), the agent replying (0:45-0:48) and the reply arriving in Messenger (0:48-0:52).
```

---

## 8. Instrucciones para el revisor (campo «Instrucciones para el revisor»)

Pégalo **debajo** del texto de WhatsApp que ya está (conserva la parte de WhatsApp). Sustituye `<tu contraseña>` por la real.

```
MESSENGER AND INSTAGRAM (new in this submission)

REVIEWER CREDENTIALS (AmbarCRM, not Instagram or Facebook credentials)
- Login URL: https://crm.ambarrojostudios.cloud/login?org=demo-meta
- Organization: demo-meta (shown as "Demo Meta"). If the login asks for the organization name or code, use demo-meta.
- Email: revisor.meta@gmail.com
- Password: <tu contraseña>

HOW TO TEST
1. Sign in with the credentials above and go to Settings > Channels.
2. Messenger: select Messenger and click "Connect with Facebook". Log in with a Facebook account that manages a Page, accept the permissions, choose the Business Portfolio and the Page.
3. Instagram: select Instagram and click "Connect with Instagram". Log in with an Instagram professional account and accept the permissions.
4. Send a message to the connected Page (or Instagram account) from a different account. Open the "Chat" tab: the conversation appears under the Messenger / Instagram tab. Open it, write a reply and send it; it is delivered to the customer.

NOTES
- Messenger contact names may show as a numeric ID. Meta does not return the profile of users without a role while the app is in development mode.
- Replies are only possible within 24 hours of the customer's last message.
- If Instagram shows an authorization error for your account, it needs the "Instagram Tester" role on the app; the video shows the full flow working.
- Facebook Login is used for Messenger, Instagram Login for Instagram, and Embedded Signup for WhatsApp.
- Data deletion: https://crm.ambarrojostudios.cloud/eliminacion-datos
- Privacy policy: https://crm.ambarrojostudios.cloud/privacidad
```

El párrafo de WhatsApp que dice «Facebook Login is used only for Embedded Signup» ya no es cierto: bórralo o cámbialo por la línea «Facebook Login is used for Messenger…» de arriba.
