# Prompt para Codex: pulido visual de Configuración → Canales (antes de grabar el App Review)

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md`: este Next.js tiene cambios incompatibles, revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes. Mismo estilo del código existente (comentarios escasos, nombres en español), sin dependencias nuevas ni funciones no pedidas. **Solo presentación**: no toques OAuth, webhooks, permisos ni llamadas a la API de Meta. No hagas push ni despliegues.

Archivos relevantes: `src/components/config/Canales.tsx`, `CanalExterno.tsx`, `MessengerFacebook.tsx`, `AvisoConexionInstagram.tsx`, `ConexionManual.tsx` (plegado de WhatsApp, úsalo como referencia de estilo), `src/app/(app)/configuracion/page.tsx`, `src/components/Toaster.tsx` y `src/lib/meta/mensaje-conexion.ts`.

## Contexto

Julio grabará videos del App Review de Meta (Messenger e Instagram) con esta pantalla. Hoy se ve poco cuidada:

- El selector «Tipo de canal» es un `<select>` simple con una opción «API».
- La tarjeta de cada canal conectado muestra una insignia «Conectado» pequeña y sosa.
- Dentro de las tarjetas de Messenger/Instagram salen campos de conexión manual (`ID de la página (page_id)`, `Token de la página`, `ID de la app de Meta`, `App Secret`, `instagram_id`) que al cliente final no le interesan y que **no deben aparecer en pantalla en un video** (aunque estén vacíos).

## Tarea

1. **Selector de tipo de canal**: cámbialo por pestañas o tarjetas seleccionables con icono (`IconoCanal`) para WhatsApp, Messenger e Instagram, con `role="tablist"`/`aria-selected` o equivalente accesible, letra mínima 12 px, claro/oscuro y que quepa en 375 px. Conserva el comportamiento actual (`metaRevision`, «próximamente»). **Quita «API» del selector**; no borres la función ni sus rutas: los canales API ya existentes se siguen listando debajo como hoy (`canales.filter((c) => c.proveedor !== "cloud_api")`). Si hay forma sencilla de crear un canal API nuevo sin la opción, déjala en una sección plegada «Avanzado: canal API» al final de la página; si no, avísame en el resumen.
2. **Estado «Conectado» destacado**: cuando el canal de Messenger o Instagram está conectado, muestra dentro de su tarjeta un bloque verde centrado (icono de check, título «¡Conectado con éxito!», y debajo el nombre de la cuenta o página, p. ej. «@ambar_rojo_studios» o «Ámbar Rojo Studios»), con `role="status"`. Los otros estados siguen igual de claros: «Requiere reconexión» en rojo con el mensaje existente, «Desconectado» en neutro. Quita la insignia pequeña si queda redundante.
3. **Aviso tras conectar** (`AvisoConexionInstagram.tsx` y el equivalente de Messenger, si existe): que el aviso de éxito aparezca **centrado y en verde** con el texto «¡Conectado con éxito!» y el nombre de la cuenta, y se cierre solo a los pocos segundos o con un botón. Si ya hay un componente de toast reutilizable, extiéndelo en vez de crear otro. Los errores mantienen su estilo y mensaje.
4. **Campos manuales ocultos por defecto**: en las tarjetas de Messenger e Instagram, mueve el formulario de conexión manual (nombre, `page_id`, `instagram_id`, tokens, `app_id`, `App Secret`) a una sección **plegada** «Conexión manual (avanzado)», igual que la de WhatsApp, **cerrada por defecto y que no se abra sola** al conectar o editar. El botón principal de la tarjeta es «Conectar con Facebook» / «Conectar con Instagram». Los campos de token y secreto nunca deben quedar visibles con la sección cerrada. «Desconectar» sigue visible fuera del plegado.
5. Verifica claro/oscuro, 375 px y escritorio, sin desbordes horizontales, con un canal conectado, uno sin conectar y uno con error de autorización.

## Entregables

- Commits en español por bloque (`style(canales): selector por pestañas y conectado destacado`, `style(canales): conexión manual plegada`).
- `npx tsc --noEmit` sin errores nuevos (hay previos ajenos de IVA/CFDI), ESLint limpio, y `scripts/check-canales-ui.ts` y `scripts/check-chat-tipos.ts` pasando (actualiza aserciones solo si cambia texto visible).
- Resumen: archivos tocados, qué verificaste visualmente y qué no, y qué hiciste con la opción «API».
