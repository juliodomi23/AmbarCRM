# Prompt para Codex: pulido visual de la bandeja y nombre de contacto en Messenger

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md`: este Next.js tiene cambios incompatibles, revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes. Mismo estilo del código existente (comentarios escasos, nombres en español), sin dependencias nuevas ni funciones no pedidas. No hagas push ni despliegues. Reutiliza los tokens/clases del proyecto (colores, radios, sombras), claro y oscuro.

## Contexto (visto en producción)

- `/chat` ya tiene pestañas WhatsApp / Messenger / Instagram, filtros y chip de canal (commits `6b8e949`, `8785aed`). Falta que **toda la bandeja** (lista, encabezado del chat, burbujas, panel del contacto, estados vacíos) se vea pulida y consistente; hoy se siente "cruda".
- Una conversación de **Messenger** aparece con el título `35565275703056661` (el PSID) en vez del nombre de la persona. En Instagram sí sale el nombre.

## Tarea 1: nombre del contacto en Messenger

1. `perfilPaginaMeta` (`src/lib/channel/meta-mensajeria.ts`) pide `first_name,last_name,profile_pic` y **traga el error** (`catch { return {}; }`), por eso no sabemos por qué falla. Registra con `console.error("[meta-perfil]", …)` el HTTP, código/subcódigo y mensaje de Meta (sin tokens ni el PSID completo) y confirma la causa. Causas probables: la persona no tiene rol en la app mientras está en modo desarrollo, o falta el permiso de perfil de usuario; si es eso, dilo en el resumen (no es corregible en código).
2. Prueba también `?fields=name,profile_pic` como alternativa cuando `first_name/last_name` no vengan.
3. Si el perfil no se puede obtener, no muestres el número crudo: título `Contacto de Messenger` (y `Contacto de Instagram` / el equivalente actual en WhatsApp sin cambios), con el identificador solo en el panel de detalles. Si luego llega otro mensaje y el contacto aún no tiene nombre, reintenta el perfil una vez (hoy solo se pide cuando el contacto es nuevo) y actualiza nombre y foto.
4. Los contactos ya creados con el número como nombre: no migres datos; el reintento del punto 3 los corrige al próximo mensaje.

## Tarea 2: pulido visual de la bandeja

Archivo principal `src/components/chat/ChatCliente.tsx` y los componentes que use. Objetivo: que se vea como una bandeja profesional de mensajería, sin cambiar lógica, API ni datos.

1. **Lista de conversaciones**: avatar con iniciales o foto (con la insignia pequeña del canal en la esquina), nombre en negrita, vista previa en una línea con elipsis, hora a la derecha, contador de no leídos como círculo del color de marca, fila activa y hover bien diferenciados, separadores suaves. Altura de fila consistente.
2. **Encabezado del chat**: avatar, nombre, chip del canal, estado (abierta/pendiente/cerrada) y acciones con jerarquía clara; en móvil, botón "volver".
3. **Burbujas**: entrante y saliente bien distinguidas, esquinas redondeadas, hora y estado de envío discretos, separadores de día, ancho máximo legible, imágenes/archivos con su tarjeta.
4. **Caja de redacción**: altura que crece, botón de enviar claro, aviso de ventana de 24 h de Messenger/Instagram con estilo de alerta suave (no texto suelto).
5. **Estados vacíos y de carga**: esqueletos en la lista y mensajes cuando no hay conversación seleccionada (icono + texto corto).
6. Revisa claro/oscuro, 375 px y escritorio; foco visible y `aria-label` en los botones de icono.

## Entregables

- Dos commits en español: `fix(messenger): nombre del contacto y registro del error de perfil` y `style(chat): pulido visual de la bandeja`.
- `npx tsc --noEmit` sin errores nuevos (hay previos ajenos de IVA/CFDI), ESLint limpio, `scripts/check-chat-tipos.ts` y `scripts/check-canales-ui.ts` pasando (actualiza aserciones solo si cambia texto visible).
- Resumen: causa real del fallo del perfil de Messenger, archivos tocados, qué verificaste visualmente y qué no.
