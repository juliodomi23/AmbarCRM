# Checklist de Julio · Messenger e Instagram App Review

Estado: **preparación de código y guiones; nada enviado ni aprobado en Meta**. Messenger e Instagram siguen como «próximamente» en Configuración. Para grabar videos y dar acceso al revisor habrá que habilitar el flujo en un entorno de revisión aislado, con tu decisión, sin abrirlo a clientes antes de la aprobación.

## 1. Permisos a revisar y solicitar en tu app

| Canal | Permiso/capacidad | Justificación visible |
|---|---|---|
| Messenger | `pages_show_list` | Mostrar y elegir una página autorizada en Facebook Login. |
| Messenger | `pages_messaging` | Recibir mensajes de página y responder desde `/chat`. |
| Messenger | `pages_manage_metadata` | Suscribir la página al webhook. |
| Instagram con página vinculada | `pages_show_list` | Elegir la página vinculada. |
| Instagram con página vinculada | `instagram_basic` | Identificar `instagram_business_account` de la página. |
| Instagram con página vinculada | `instagram_manage_messages` | Recibir y responder DM. |
| Instagram con página vinculada | `pages_manage_metadata` | Suscribir mensajes de la página al webhook. |
| Atención humana ampliada | Capacidad **Human Agent**, separada de los scopes anteriores | Respuesta de asesor después de 24 h y antes de 7 días. Por defecto está desactivada en el CRM. |

Comprueba en el panel el nivel de acceso, la verificación empresarial y el caso de uso exacto. Meta documenta Advanced Access para conversaciones de personas sin rol en la app/página/negocio. `business_management` solo se evaluará si una prueba real con página de Business Portfolio demuestra que hace falta; primero comparte acceso a la página con el usuario administrador. `pages_read_engagement` queda por confirmar si el panel lo exige para una operación concreta; el flujo actual no consulta publicaciones ni historial de Conversations API. No solicitar `instagram_business_*`: esos scopes son del flujo distinto de Instagram Login. [Fuente oficial de conversaciones](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) · [guía técnica y guiones](META-APP-REVIEW-MESSENGER.md).

## 2. URLs y variables

Sustituye `${CRM}` por el origen HTTPS público de revisión, sin `/` final. Revisa en el panel de Meta los dominios permitidos para Facebook SDK/Login y los webhooks:

| URL | Uso |
|---|---|
| `${CRM}/login` y `${CRM}/configuracion` | Revisor entra al CRM y conecta el canal. |
| `${CRM}/chat` | Recibir y responder el mensaje de prueba. |
| `${CRM}/api/messenger/webhook` | Callback de Messenger, GET de verificación y POST firmado. |
| `${CRM}/api/instagram/webhook` | Callback de Instagram, GET de verificación y POST firmado. |
| `${CRM}/privacidad`, `${CRM}/terminos`, `${CRM}/eliminacion-datos` | Enlaces públicos legales y de eliminación de datos. |

En el despliegue de revisión: `NEXTAUTH_URL`, `META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY`, `MESSENGER_VERIFY_TOKEN`, `META_GRAPH_VERSION` y `NEXT_PUBLIC_META_GRAPH_VERSION` alineadas. `NEXT_PUBLIC_META_APP_ID` debe corresponder a la misma app si se usa el SDK de WhatsApp en esa página. **Despliegue de revisión aislado:** pon `META_CANALES_REVISION=true` solo ahí; habilita Messenger e Instagram en Configuración → Canales. En producción debe seguir en `false` (siguen como «próximamente»). Deja `META_HUMAN_AGENT_APROBADO=false` hasta que confirmes la capacidad; luego actívalo y prueba antes de mostrar la respuesta ampliada. No pegues tokens ni secretos en el video o documentos públicos.

## 3. Datos que debes preparar

- [ ] App ID y entidad del negocio en Meta; anota el estado real de cada permiso y capacidad.
- [ ] Organización de CRM aislada y cuenta de **administrador revisor**, con URL, usuario y contraseña para el campo privado de App Review.
- [ ] Página de Facebook de prueba que el administrador pueda gestionar y otro perfil de prueba que inicie la conversación de Messenger.
- [ ] Cuenta profesional de Instagram de prueba vinculada a esa página y **otra cuenta** que envíe el DM. Confirma el acceso a mensajes y la tarea de mensajería sobre la página.
- [ ] Correo de soporte, política de privacidad y procedimiento de eliminación con datos reales de tu negocio.
- [ ] Página y app de prueba para comprobar que conectar/desconectar Instagram no corta Messenger cuando comparten activos. Nunca usar una página de cliente para esa prueba.

## 4. Videos a grabar

**Messenger (6–8 min):** entrar con el revisor → Configuración → Canales → Facebook Login y consentimiento de los tres scopes → elegir página → enviar mensaje desde el otro perfil → verlo en `/chat` → responder dentro de 24 h → mostrar recepción en Messenger → desconectar conservando historial. Si solicitas Human Agent, añade una demostración separada de atención humana entre 24 h y 7 días **solo cuando esté habilitada**. [Guion minuto a minuto](META-APP-REVIEW-MESSENGER.md#guion-de-video-minuto-a-minuto).

**Instagram (5–6 min):** entrar con el revisor → Facebook Login con los cuatro scopes → elegir página con cuenta profesional vinculada → enviar DM desde la otra cuenta → verlo en `/chat` → responder y confirmar entrega → desconectar sin interrumpir el otro canal de prueba. [Guion minuto a minuto](META-APP-REVIEW-MESSENGER.md#instagram-messaging-con-página-vinculada).

- [ ] Grabar los diálogos y resultados **reales**, sin mocks, datos de cliente ni secretos visibles.
- [ ] En la solicitud, explicar por permiso qué acción del video lo usa y el minuto exacto.
- [ ] Antes de enviar: verificar que el revisor sí puede abrir la función en un entorno de revisión autorizado. El selector público permanece como «próximamente» mientras decides su activación.
