# Un bot de n8n para WhatsApp, Messenger e Instagram

El flujo puede compartir la lógica de negocio: consultar perfil, decidir la
respuesta, mover el embudo y escalar al equipo. La identidad y las posibilidades
de envío dependen del canal. Los permisos del bot y el aislamiento por empresa
siguen aplicando; no reutilices tokens del bot entre clientes.

## Identidad y canal

| Dato | WhatsApp (`cloud_api`) | Messenger (`messenger`) | Instagram (`instagram`) |
|---|---|---|---|
| Destinatario | Teléfono | PSID de esa página | IGSID de esa cuenta |
| `meta.sender.identifier` | Teléfono sin `+` | ID externo | ID externo |
| `meta.sender.phone_number` | Teléfono con `+` si existe | Puede ser `null` | Puede ser `null` |
| Identidad del contacto | Teléfono | Canal + ID externo | Canal + ID externo |

No interpretes un ID de Meta como teléfono. Dos personas pueden tener el mismo
nombre o username; un nombre coincidente no autoriza a fusionarlas. Guarda
`conversationId` como referencia del trabajo y deja que el CRM resuelva el
destinatario. El mismo ID externo en otro canal es otra identidad.

El webhook del bot conserva su formato compatible con los flujos existentes.
Para saber el proveedor, usa un nodo HTTP Request:

```text
GET /api/v1/accounts/1/conversations/{{conversationId}}
api_access_token: <token del bot de esa empresa>
```

La respuesta añade `canal: "cloud_api" | "messenger" | "instagram" | "api"`
(puede ser `null` si el canal se retiró). `meta.sender`, `labels`, `status`,
`mensajes` y `perfil` mantienen su estructura. Los webhooks salientes del CRM
también incluyen `datos.canal`; son otra integración y usan su propia firma.

## Ventanas y formatos

| Canal | Antes de 24 h desde la última entrada | Después de 24 h |
|---|---|---|
| WhatsApp | Texto y media permitidos por el proveedor | Solo plantilla oficial aprobada por Meta; una respuesta rápida no es una plantilla oficial |
| Messenger | Texto y media | Un asesor puede usar `HUMAN_AGENT` hasta antes de 7 días, si Meta lo habilita; el bot no |
| Instagram | Texto y media según el contrato simulado | Mismo control local de 24 h y asesor hasta antes de 7 días; pendiente de verificar con Meta |
| API propia | Según el receptor | Sin ventana de Meta |

El endpoint del bot `POST …/messages` recibe `content` de texto y `private:true`
para notas internas. No añade aquí un envío de plantillas o adjuntos. Los
adjuntos entrantes llegan en el formato existente del webhook; el canal de
Instagram normaliza imagen, audio, video y archivo. Reels/stories compartidos u
otros adjuntos incompatibles quedan como un marcador legible en texto (o en el
caption si también hay un adjunto compatible). No se descarta su evento.

Instagram tiene un **límite local conservador de 1000 caracteres** por mensaje,
también para el texto que acompaña un adjunto. Un texto mayor devuelve error sin
enviar ni truncar. La capa compartida de Messenger y WhatsApp no impone ese mismo
tope local uniforme. Para un flujo compartido, prepara respuestas breves de hasta
1000 caracteres y maneja los rechazos del proveedor; los máximos efectivos de
Meta y los formatos admitidos deben verificarse antes de habilitar clientes.
El límite de 1000 es una decisión local, no una certificación del máximo de Meta.

`HUMAN_AGENT` no autoriza un bot ni una regla de automatización. Las respuestas
rápidas de reglas solo se envían dentro de 24 h; fuera se registra
`omitida_ventana`. Sin última entrada válida o después de 7 días, esperar una
nueva entrada del cliente. Las notas internas siguen disponibles.

## Patrón de flujo único en n8n

1. Recibir el webhook existente del bot y verificar su firma cuando esté activada.
2. Consultar GET de la conversación con el token del bot de la misma empresa.
3. Si aparece `bot_off` o un responsable humano, detener la respuesta automática.
4. Usar un Switch sobre `{{$json.canal}}`: `cloud_api`, `messenger`, `instagram`.
   Compartir la búsqueda de datos y adaptar texto, identidad y salida en cada rama.
5. Responder con `POST …/messages {"content":"…"}`. Tratar el rechazo de ventana
   como una salida a atención humana/nota interna, sin reintentos indefinidos.

Ejemplo de condición en un nodo IF después del GET, para agrupar los canales sin
plantillas de WhatsApp:

```text
{{ ['messenger', 'instagram'].includes($json.canal) }}
```

Si es verdadero, preparar texto breve y no intentar una plantilla de WhatsApp.
Esto clasifica el canal; no demuestra que su ventana esté abierta. El CRM valida
la ventana al enviar y puede devolver 502 con un error fijo. El `can_reply:true`
heredado de la API es compatibilidad del formato, no una autorización de Meta;
los últimos 20 mensajes tampoco garantizan contener toda la historia de la ventana.

## Supuestos pendientes de cuenta real

🛑 Instagram solo se probó con Graph simulado: token de página, envío a
`/me/messages` con IGSID, sobre `object:instagram`/`entry.messaging`, perfil
`name,username,profile_pic`, suscripción `messages` en la página y
`HUMAN_AGENT` hasta 7 días. Las pruebas verifican lo que el CRM hace ante ese
contrato; no verifican que Meta lo acepte. Confirmar permisos, acceso, campos de
suscripción y formatos de media en la app de cada cliente antes de usarlo.
