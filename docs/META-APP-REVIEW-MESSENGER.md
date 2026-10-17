# Paquete de App Review de Messenger

Preparado para `preparar-merge-meta`, desde `modulos-fase-2` en `70e684b`.
La aprobación de WhatsApp no acredita Messenger. No se accedió al panel de Meta,
no se conectó una página real y no se enviaron mensajes externos en esta preparación.
Las pruebas locales usan Graph simulado; no prueban el popup real del SDK.
Actualización del 17-oct-2026: la desconexión de Messenger ya incluye botón,
confirmación del historial y desuscripción remota antes de retirar el canal local.

## Permisos y justificación para la solicitud

El scope real es `pages_show_list,pages_messaging,pages_manage_metadata`, definido en
`web/src/lib/meta/messenger-facebook.ts` y solicitado por
`web/src/components/config/MessengerFacebook.tsx` mediante `FB.login`.

| Permiso | Justificación que corresponde al código | Evidencia para el video |
|---|---|---|
| `pages_show_list` | El administrador autoriza sus páginas. El servidor intercambia el código por un token corto y luego uno largo; consulta `GET /me/accounts?fields=id,name,access_token,picture`, con paginación. La UI recibe ID, nombre y foto; los tokens permanecen cifrados en servidor. Se valida la página elegida con `GET /me?fields=id` usando su token. | Autorizar, ver la lista y elegir una página concreta. |
| `pages_messaging` | Recibir mensajes y acuses en `/api/messenger/webhook`, guardar la conversación y responder texto o adjuntos a un PSID mediante `POST /me/messages`. Se intenta obtener nombre/foto con `GET /{PSID}?fields=first_name,last_name,profile_pic`; un fallo de perfil no impide recibir el mensaje. | Enviar desde Messenger, verlo en `/chat`, responder como asesor y mostrar la respuesta en Messenger. |
| `pages_manage_metadata` | Conectar la página ejecuta `POST /{PAGE_ID}/subscribed_apps` y exige `success: true`. Suscribe `messages`, `message_deliveries`, `message_echoes`, `message_reads`, `standby`, `messaging_handovers`, `messaging_postbacks`. | Mostrar conexión exitosa y recepción posterior por el webhook. |

`web/src/lib/channel/messenger.ts` implementa envío, suscripción y ventana;
`web/src/lib/services/canales.ts` guarda el canal; `messenger-login.ts` conserva el
intento durante diez minutos, ligado a empresa, usuario y sesión, y lo consume una vez.
La firma del webhook usa el App Secret global o el propio del canal.

**Por confirmar en el panel de Meta:** nivel de acceso exigido para cada permiso,
Advanced Access, verificación empresarial, modo público, tipo/caso de uso de la app,
dependencias adicionales para los campos de perfil y compatibilidad de los eventos
suscritos con la versión Graph configurada. No solicitar otros permisos sin un uso
demostrable. Si Meta exige acceso adicional para perfil, documentarlo antes de ampliar
el scope; el código actualmente tolera no obtenerlo.

### HUMAN_AGENT

Sí: preparar una solicitud separada de la capacidad **Human Agent** si se va a usar
la extensión de atención humana. No viene concedida por solicitar los tres scopes
anteriores y no aparece en ese string de permisos. El nombre exacto de la capacidad,
su elegibilidad y su aprobación están **por confirmar en el panel de Meta**.

El comportamiento comprobable en código es:

- Menos de 24 horas desde el último mensaje entrante: `messaging_type: RESPONSE`.
- Entre 24 horas y menos de siete días, solo con contexto de asesor humano:
  `messaging_type: MESSAGE_TAG`, `tag: HUMAN_AGENT`.
- El bot se rechaza después de 24 horas. Desde siete días, tampoco responde el asesor.

🛑 Julio debe confirmar esa aprobación antes de usar respuestas humanas entre 24 h y
siete días. El código no consulta al panel si la capacidad está aprobada y podría
intentar un envío que Meta rechace. Esta preparación no modifica el flujo de envío.

Referencias oficiales para contrastar al presentar la solicitud:
[permisos de Meta](https://developers.facebook.com/docs/permissions/),
[etiquetas de mensajes](https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags/),
[descripción de Messenger](https://developers.facebook.com/docs/messenger-platform/overview/).
La consulta pública de estas páginas devolvió 429 o acceso no disponible; no se usa
como evidencia de que la cuenta ya tenga acceso. Los requisitos del panel quedan pendientes.

## URLs públicas y configuración

Definir `CRM` como el origen HTTPS definitivo de la app, sin `/` final.
**Por confirmar en el panel de Meta:** dominio real, App ID, versión Graph habilitada,
dominios autorizados para el SDK y configuración de Facebook Login.
El valor predeterminado del repo es `v26.0`, configurable por variables.

| URL / configuración | Función comprobada | Confirmación pendiente |
|---|---|---|
| `${CRM}/login` | Login del CRM con credenciales y organización; no es un login NextAuth con proveedor Facebook. | Credenciales exclusivas del revisor y acceso desde Internet. |
| `${CRM}/configuracion` | Abrir Canales, elegir Messenger, preparar conexión y luego pulsar «Iniciar sesión en Facebook». | Cuenta administradora y permisos reales sobre la página. |
| `${CRM}/chat` | Bandeja para recibir y responder. | Canal y contacto de prueba identificados. |
| `${CRM}/api/messenger/webhook` | Callback público GET/POST. GET valida `MESSENGER_VERIFY_TOKEN`; POST valida `X-Hub-Signature-256`. | URL inscrita, token coincidente y objeto Page/campos habilitados. |
| `${CRM}/privacidad` | Política pública; usa `LEGAL_BUSINESS_NAME` y `PRIVACY_EMAIL`. | Texto y correo reales, sin placeholders. |
| `${CRM}/terminos` | Términos públicos. | Texto adecuado a la entidad solicitante. |
| `${CRM}/eliminacion-datos` | Instrucciones públicas de eliminación. | Correo operativo y procedimiento humano; no es un callback automático de eliminación. |
| `${CRM}/api/media/{archivo}?vence=...&firma=...` | URL HTTPS temporal firmada para adjuntos que Meta puede descargar. | Acceso externo efectivo; demostrar con un archivo sintético. |
| Origen `${CRM}` para Facebook Login/SDK | La UI abre `FB.login` y recibe `authResponse.code`; no hay una ruta propia OAuth de callback Facebook en el repo. | Ajustes exactos de dominios, JavaScript SDK y redirects que muestre Meta; no inventar `/api/auth/callback/facebook`. |

`META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY` y
`MESSENGER_VERIFY_TOKEN` deben estar configuradas en el panel del despliegue.
No publicar sus valores ni tokens en el video, instrucciones o capturas.

## Datos que se entregarán al revisor

Todos estos valores están **por confirmar en el panel de Meta** o por Julio;
no se inventan credenciales ni se reutiliza una cuenta de cliente:

| Dato | Valor a completar |
|---|---|
| App ID, nombre y entidad verificada | Por confirmar en el panel de Meta. |
| URL del CRM y organización de revisión | Por confirmar por Julio; organización aislada, sin clientes reales. |
| Correo y contraseña del CRM | Cuenta dedicada con puesto Administrador; entregar solo en el campo privado de App Review. |
| Página de prueba | Nombre, Page ID y enlace `https://m.me/PAGE_ID`; por confirmar en el panel de Meta. |
| Acceso del revisor a Facebook/página | Por confirmar en el panel de Meta; usar el mecanismo de prueba permitido por Meta y la tarea de mensajería correspondiente. |
| Perfil que inicia la conversación | Perfil de prueba autorizado, distinto de la página. |
| Contacto de soporte | Correo operativo y horario; por confirmar por Julio. |
| Video y, si corresponde, video de Human Agent | Enlaces accesibles, sin expiración durante la revisión; por confirmar en el panel de Meta. |

## Guion de video, minuto a minuto

Grabar el entorno de revisión real ya configurado y el panel de Messenger del
perfil de prueba lado a lado. Narración en español con subtítulos si el panel los
requiere (**por confirmar en el panel de Meta**). No grabar secretos ni datos de clientes.

| Tiempo | Acción visible | Resultado que debe quedar grabado |
|---|---|---|
| 00:00–01:00 | Abrir `/login`, indicar organización y entrar con la cuenta del revisor. Abrir Configuración → Canales y elegir Messenger. | Sesión de administrador y organización de prueba; explicar que es una bandeja de atención del negocio. |
| 01:00–02:00 | Pulsar «Conectar con Facebook», luego «Iniciar sesión en Facebook». Autorizar los tres permisos y las páginas de prueba. | Diálogo real de Facebook, permisos y consentimiento; no usar la conexión manual para sustituir esta demostración. |
| 02:00–03:00 | Mostrar lista con ID/nombre/foto; pulsar «Elegir página» en la página autorizada. | «Página de Messenger conectada», sin tokens en pantalla. Explicar suscripción al webhook. |
| 03:00–04:00 | Desde el perfil de prueba, enviar «Hola, necesito ayuda con mi pedido de prueba». Abrir `/chat`. | La conversación y el texto entrante aparecen en la organización conectada; mostrar hora e identificación de página. |
| 04:00–05:00 | Como asesor, responder «Hola, reviso tu pedido de prueba». Mostrar Messenger; opcionalmente adjuntar una imagen sintética. | Entrega al perfil correcto dentro de 24 h; acuse si Meta lo suministra. |
| 05:00–06:00 | Mostrar otra conversación de prueba cuyo último entrante tenga más de 24 h, preparada legítimamente antes de grabar. Explicar que el bot no puede responder fuera de la ventana. | Fecha/hora real y rechazo del bot con ventana cerrada. No cambiar timestamps ni mostrar un mock como si fuera Meta real. Si falta esa conversación, este segmento queda pendiente de grabación. |
| 06:00–07:00 | Si se solicita Human Agent, usar esa conversación con menos de siete días y responder manualmente como asesor. | Atención humana específica del caso; requiere la capacidad aprobada o el modo de prueba autorizado por Meta. Si no se solicita, narrar la limitación y no intentar ese envío. |
| 07:00–08:00 | En Configuración → Canales, pulsar «Desconectar» en la página Messenger de prueba. Confirmar y elegir «Conservar historial». Mostrar el toast y la lista actualizada; abrir el histórico previo. | Con token válido: suscripción cancelada en Facebook y canal retirado localmente, con conversaciones conservadas. Si Meta indica token invalidado/página no disponible, explicar el retiro local y su aviso sin afirmar que hubo cancelación remota. |

### Desconexión como flujo de usuario

Disponible solo para administradores en Configuración → Canales, para un canal
Messenger existente. El botón «Desconectar» abre el Confirmador: «Se cancelará la
suscripción en Facebook; el historial se conserva». Cancelar ahí no hace peticiones.
La segunda confirmación permite «Borrar conversaciones» o «Conservar historial»;
la segunda opción es el camino del video. La lista se refresca después del resultado.

`DELETE /api/canales/{id}` usa el token de página en Authorization para ejecutar
`DELETE /{pageId}/subscribed_apps` mediante `messengerGraph`, con timeout de cinco
segundos. No revoca por sí mismo otros permisos o credenciales de la cuenta Facebook.

| Respuesta de Meta | Resultado en el CRM |
|---|---|
| `success: true` | HTTP 200, `desuscrito: true`; canal retirado, toast de desconexión. |
| Token inválido (190 / sesión invalidada) o página inexistente/no disponible (404, 803) | HTTP 200, `desuscrito: false`, motivo fijo legible; canal retirado. No se afirma que Meta haya confirmado una desuscripción. |
| Red, timeout, 429, 5xx, permisos insuficientes u otra respuesta no confirmada | HTTP 502 con mensaje fijo. Canal e histórico intactos, incluso si se había elegido borrarlos; se puede reintentar. |

Los estados 429/5xx se consideran temporales aunque su cuerpo incluya código 190.
El error 100/33 puede significar objeto inexistente o falta de acceso: por sí solo
no confirma que la página haya desaparecido y conserva el canal con HTTP 502.
Los tokens y cuerpos de error externos no se devuelven ni registran.
`borrarDatos: false` es el comportamiento predeterminado; solo la elección explícita
de borrado elimina conversaciones/mensajes, después del resultado remoto permitido.
WhatsApp y API conservan su comportamiento anterior. La evidencia local cubre rutas
reales con Graph falso y una prueba HTTP con login NextAuth real; no sustituye el
humo sobre la página real de pruebas después de la aprobación.
