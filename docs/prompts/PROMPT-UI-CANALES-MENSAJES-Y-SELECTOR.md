# Prompt para Codex: pulir los mensajes de conexión y el selector de canales

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md` (este Next.js tiene cambios incompatibles; consulta `node_modules/next/dist/docs/` antes de tocar rutas o componentes). Usa los componentes y tokens de estilo que ya existen (`Boton`, `Campo`, clases `surface`, `text-success`, `text-destructive`, `bg-muted`, `IconoCanal`, `Toaster`, etc.); no añadas dependencias. Solo cambios visuales y de textos: no toques la lógica de OAuth, webhooks ni datos. No hagas push ni despliegues. Este material lo verá el revisor de Meta en los videos, así que debe verse limpio y profesional.

## 1. Mensajes de conexión de Instagram y Messenger

Hoy:
- Tras conectar Instagram, `/configuracion` muestra un `<p>` suelto con `instagram_mensaje` (`src/app/(app)/configuracion/page.tsx`, línea ~75) sin estilo, y la URL queda con `?instagram=ok&instagram_mensaje=...` pegada.
- Messenger muestra «Messenger conectado.» como texto verde pequeño dentro de `MessengerFacebook.tsx`.
- Los errores (por ejemplo «Instagram rechazó la conexión (/access_token, HTTP 400)») salen en texto plano y técnico.

Tarea:
1. Muestra el resultado de la conexión de Instagram como aviso destacado y consistente con el resto de la app: preferentemente con el `Toaster` existente (`toast(mensaje, "ok" | "error")`) en un pequeño componente cliente que lea los parámetros al cargar, y luego **limpie la URL** (`router.replace("/configuracion")`) para que no se repita al refrescar. Si un toast no encaja, usa un banner con icono, borde y color de éxito/error, con botón para cerrarlo.
2. Haz lo mismo para el aviso de Messenger y de Instagram al conectar desde `MessengerFacebook.tsx`: mismo estilo, con el nombre de la cuenta o página conectada si se conoce (por ejemplo «Instagram conectado: @ambar_rojo_studios», «Messenger conectado: Ámbar Rojo Studios»).
3. Los errores deben ser claros y en español para una persona no técnica: no muestres rutas de la API ni «HTTP 400». Conserva el detalle técnico solo en `console.error` del servidor (ya existe). Redacta mensajes por causa conocida: cuenta no profesional, cuenta ya conectada, falta de rol de evaluador/tester en la app, cancelaron la autorización, sesión vencida; el resto: «No se pudo conectar. Vuelve a intentarlo o usa la conexión manual.» Sugiere la acción siguiente cuando exista.
4. Estado «conectado» en la tarjeta del canal: muestra una insignia de estado (Conectado / Requiere reconexión si hay `errorAutorizacion`) junto al título, con el icono del canal (`IconoCanal`), el nombre visible y, para Instagram con login de Instagram, el `@usuario`.
5. El botón principal («Conectar con Instagram», «Conectar con Facebook») con estado de carga claro y deshabilitado mientras se redirige. Sin cambiar su lógica.

## 2. Selector de canales en la bandeja (`/chat`)

Archivo: `src/components/chat/ChatCliente.tsx` (selector de tipo ~línea 520 y selector de canal por id ~línea 593).

Hoy el selector de tipo son tres botones planos y el de canal es un `<select>` nativo que se ve distinto al resto.

Tarea:
1. Pestañas de tipo con el `IconoCanal` de cada tipo y texto (WhatsApp, Messenger, Instagram), estado activo claro, foco visible, accesibles con teclado (`role="tablist"`/`tab` o `aria-pressed`, como convenga), y que quepan bien en el ancho de 20 rem (`md:w-80`) y en móvil. Puede mostrarse un contador de conversaciones sin leer por tipo solo si el dato ya está disponible en el cliente sin nuevas llamadas; si no, no lo añadas.
2. El selector de canal por id debe verse integrado con el diseño (mismas alturas, bordes y fuente que los otros filtros de la lista) y mostrar el nombre visible del canal con su icono cuando sea posible. Si un `<select>` nativo no lo permite, mantenlo nativo pero con el mismo estilo que los demás filtros; no construyas un dropdown propio salvo que ya exista uno reutilizable en el proyecto.
3. En cada conversación de la lista y en el encabezado del chat, el chip/icono del canal debe identificar claramente el tipo y la cuenta (por ejemplo «Instagram · @ambar_rojo_studios» o el nombre visible del canal). Reutiliza `nombreVisibleCanal` y `IconoCanal`.
4. Estados vacíos agradables: el texto «Esta empresa no tiene un canal de X conectado» con un icono y un enlace a Configuración → Canales para quien tenga permiso.

## 3. Comprobaciones y entrega

- Verifica en modo claro y oscuro si el proyecto los tiene, y en ancho móvil (~375 px) y escritorio.
- Actualiza `scripts/check-canales-ui.ts` / `scripts/check-chat-tipos.ts` solo si tus cambios rompen lo que comprueban.
- Un commit en español por bloque (por ejemplo `style(canales): avisos de conexión claros`, `style(chat): pestañas y selector de canal`).
- `npx tsc --noEmit` sin errores nuevos (hay errores previos ajenos de IVA/CFDI) y ESLint limpio.
- Resumen final: archivos tocados y qué se vio/probó; si puedes, indica cómo ver cada pantalla para que Julio la revise antes de grabar.
