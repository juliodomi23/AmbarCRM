# App Review · últimos pasos antes de «Enviar a revisión»

Estado verificado en el panel (30-oct-2026): Verificación ✅ · Configuración de la aplicación ✅ · Uso permitido ✅ (7 formularios guardados) · Tratamiento de datos ✅ (respuestas ya guardadas) · **Instrucciones para revisores ⚠️ falta actualizar**.

Los permisos de WhatsApp siguen en «Acceso actual para la renovación» y la pestaña «Renovación» de Uso permitido tiene palomita verde. No se tocaron.

---

## 1. Tratamiento de datos (ya viene respondido, solo confírmalo)

Meta rellenó las respuestas con las del envío anterior. Revísalas y deja así:

| Pregunta | Respuesta guardada | ¿Correcta? |
|---|---|---|
| ¿Hay encargados del tratamiento / proveedores con acceso a los datos? | Sí | Confírmalo tú |
| ¿Cuáles? | Anthropic, PBC · Cloudflare, Inc. · Hostinger International Ltd | **Tú decides** |
| ¿Quién es responsable de los datos? | AMBAR ROJO STUDIOS SA DE CV | ✅ |
| País del responsable | México | ✅ |
| ¿Datos entregados a autoridades por seguridad nacional (12 meses)? | No | ✅ |
| Políticas ante esas solicitudes | Revisión de legalidad · Impugnar si son ilegales · Minimización de datos | ✅ |

Dos cosas que debes decidir tú, porque son datos legales de tu empresa:
- **Anthropic:** déjalo solo si los mensajes de Messenger/Instagram/WhatsApp pasan por un bot con IA de Anthropic. Si no, quítalo.
- **Proveedores que no aparecen:** si usas otro servicio que vea los mensajes (por ejemplo n8n en la nube, almacenamiento o correo), añádelo con «Añadir encargado del tratamiento».

Cuando lo confirmes, el paso queda en verde (ya aparece en verde en la barra).

---

## 2. Instrucciones para el revisor (lo único que falta)

Ruta: Uso permitido → Siguiente (Tratamiento) → Siguiente → «Instrucciones para el revisor».

### 2.1 ⚠️ Credenciales: están desactualizadas

En el campo de credenciales de ese formulario hay **una contraseña guardada que no es la que me diste hoy** (tiene otro formato). Con esa contraseña vieja el revisor no podría entrar.

1. Entra tú a `https://crm.ambarrojostudios.cloud/login?org=demo-meta` con `revisor.meta@gmail.com` y la contraseña que usas hoy, para confirmar cuál es la buena.
2. Reemplaza el texto del campo de credenciales por este bloque, con la contraseña correcta:

```
REVIEWER CREDENTIALS (AmbarCRM; these are not Facebook or Instagram credentials)
Login URL: https://crm.ambarrojostudios.cloud/login?org=demo-meta
Email: revisor.meta@gmail.com
Password: <tu contraseña actual>
Organization: demo-meta (already included in the login URL)
These credentials will remain active for at least one year.
```

### 2.2 Texto de instrucciones: reemplázalo completo

El cuadro «Explica cómo acceder a la aplicación…» solo habla de WhatsApp y dice que Facebook Login se usa «solo para Embedded Signup». Ya no es cierto. Bórralo todo y pega esto:

```
AmbarCRM is a web CRM / shared inbox for businesses that serve their customers on WhatsApp, Facebook Messenger and Instagram.

HOW TO LOG IN
1. Open https://crm.ambarrojostudios.cloud/login?org=demo-meta
2. Sign in with the test credentials provided in the credentials field of this form (email and password). The organization "demo-meta" contains sample contacts and conversations. Login to the CRM uses email and password, not Facebook Login.

HOW META LOGINS ARE USED
- WhatsApp: Facebook Login for Business is used for Meta Embedded Signup, through the Facebook JavaScript SDK, so a business can connect its own WhatsApp Business Account: "Configuración" > "Canal WhatsApp" > "Conectar con Meta".
- Messenger: Facebook Login. In "Configuración" > "Canales" > Messenger, click "Conectar con Facebook" / "Iniciar sesión en Facebook", accept the permissions, choose the Business Portfolio and the Page.
- Instagram: Instagram Login. In "Configuración" > "Canales" > Instagram, click "Conectar con Instagram" and authorize with an Instagram professional account.

PERMISSIONS
- whatsapp_business_management: used during Embedded Signup to read the shared WhatsApp Business Account and phone numbers, register the number and subscribe our webhooks; and to create and list message templates in "Configuración" > "Plantillas de Meta".
- whatsapp_business_messaging: used to send and receive WhatsApp messages from the inbox ("Chat"), including media and approved templates.
- pages_show_list, business_management, pages_read_engagement, pages_manage_metadata, pages_messaging: used to connect a Facebook Page to Messenger, subscribe it to our webhook, and receive and answer Messenger messages from the inbox.
- instagram_business_basic, instagram_business_manage_messages: used to connect an Instagram professional account and to receive and answer its direct messages from the inbox.

HOW TO TEST MESSENGER AND INSTAGRAM
1. Sign in and go to "Configuración" > "Canales".
2. Messenger: select Messenger, click "Conectar con Facebook", log in with a Facebook account that manages the Page, accept the permissions and choose the Page. Instagram: select Instagram, click "Conectar con Instagram" and authorize.
3. Send a message to the connected Page (or Instagram account) from a different account.
4. Open the "Chat" tab. The conversation appears under the Messenger / Instagram tab. Open it, write a reply and send it; it is delivered to the customer (only within 24 hours of the customer's last message).

IMPORTANT
- Connecting a WhatsApp number requires a real business and a real phone number, so the test account has no WhatsApp number connected. The complete end-to-end flows (Embedded Signup, sending a message from AmbarCRM and receiving it in WhatsApp, connecting Messenger and Instagram, receiving and answering a message, creating a template) are shown in the screencasts attached to each permission.
- Messenger contact names may show as a numeric ID: Meta does not return the profile of users without a role while the app is in development mode.
- If Instagram shows an authorization error for the reviewer's account while the app is not yet approved, the account needs the "Instagram Tester" role on the app; the screencast shows the full flow working.
- The interface is in Spanish: "Configuración" = Settings, "Canales" = Channels, "Canal WhatsApp" = WhatsApp channel, "Conectar con Meta" = Connect with Meta, "Plantillas de Meta" = Meta templates, "Chat" = Inbox.
- Data deletion: https://crm.ambarrojostudios.cloud/eliminacion-datos
- Privacy policy: https://crm.ambarrojostudios.cloud/privacidad
```

### 2.3 Otros campos de esa pantalla (ya están bien)

- **Facebook Login integrado (pregunta Sí/No):** debe estar en **Sí** (ahora Messenger lo usa).
- **Pago / códigos de acceso:** «Not applicable…» ✅.
- **Restricción geográfica:** «Not applicable…» ✅.
- **Documentación opcional:** ya hay un archivo, `login meta.mp4` (6-oct-2026, 5 MB). **Ábrelo antes de enviar** y comprueba que no muestre una contraseña vieja ni la actual. Si la muestra, elimínalo con la X o súbelo difuminado.

---

## 3. Antes de pulsar «Enviar a revisión»

- [ ] Tratamiento de datos confirmado (Anthropic / otros proveedores decididos).
- [ ] Credenciales actualizadas con la contraseña buena (y probadas por ti).
- [ ] Texto de instrucciones reemplazado (2.2).
- [ ] `login meta.mp4` revisado (sin contraseñas).
- [ ] 7 permisos en «Nuevas solicitudes» + WhatsApp en «renovación».
- [ ] (Opcional) Una persona real con rol **Evaluador** en Roles de la aplicación, para `pages_messaging`.

Si todo está en verde, el botón «Enviar a revisión» se activa. Lo pulsas tú.

## 4. Después de enviar

- No cambies política de privacidad, ícono ni URLs mientras esté en revisión (la renovación de WhatsApp va en el mismo envío).
- No desconectes ni reconectes los canales de la organización `demo-meta` durante la revisión.
- Si Meta rechaza, el mensaje dirá qué permiso no vio claro. Se corrige solo ese clip o texto y se reenvía.
