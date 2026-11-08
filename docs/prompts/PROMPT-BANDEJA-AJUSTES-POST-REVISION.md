# Prompt para Codex: ajustes de la bandeja tras revisar producción

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md`: este Next.js tiene cambios incompatibles, revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes. Mismo estilo del código existente (comentarios escasos, nombres en español), sin dependencias nuevas ni funciones no pedidas. No hagas push ni despliegues. Cambios solo de presentación; no toques OAuth, webhooks ni API de Meta.

## Hallazgos (revisión en producción, `/chat` con una conversación de Messenger abierta, escritorio 1536 px)

1. **Panel del contacto muestra un error que no es error.** Debajo de «Próximas citas» aparece «No se pudieron cargar las próximas citas». Causa: `GET /api/citas` y `/api/pacientes` responden `404 {"error":"módulo no activo"}` cuando la organización no tiene el módulo de citas, y `CitasContacto.tsx` lo trata como fallo.
2. **Tipografía demasiado pequeña** (10–11 px): pestañas WhatsApp/Messenger/Instagram, filtros (Todas / Mis / Sin asignar / Personal), hora de cada fila, chip de canal, «abierta», «Bot activo», «En vivo», separador de día y hora de cada burbuja. Cuesta leerlo en una grabación de pantalla.
3. **Chip del canal cortado en la lista**: «Messenger · Ámbar Rojo Studios» se trunca («Messenger · Ámb…») y en el encabezado del chat repite lo mismo que ya dice la pestaña.
4. **Estado de la conversación redundante**: «Abierta», «Bot activo» y «En vivo» aparecen en la fila y en el encabezado con estilos distintos (a veces texto plano con «·»).
5. **Dos selectores seguidos** en la lista (estado «Todos» y canal «Todos los canales de Messenger»): parecen duplicados.
6. **Identificador crudo como título** cuando Meta no da el nombre (p. ej. `35565275703056661`): es intencional por ahora, pero el avatar queda con iniciales sin sentido.

## Tarea

1. `CitasContacto.tsx` (y la ficha de pacientes si aplica): si la respuesta es 404 con «módulo no activo», **oculta toda la sección** de próximas citas y no muestres error. Los demás errores (500, red) mantienen su mensaje.
2. Sube a **12 px mínimo** (`text-xs`) el texto de pestañas, filtros, horas, chips, estados y burbujas, ajustando alturas/paddings para que sigan cabiendo en 375 px (usa abreviaturas o solo iconos en las pestañas si hace falta en móvil, nunca por debajo de 12 px).
3. Chip de canal en la lista: muestra solo el **icono + nombre de la cuenta sin el prefijo** cuando la pestaña activa ya indica el tipo (p. ej. «Ámbar Rojo Studios» o «@ambar_rojo_studios»), con `title` completo; en el encabezado del chat conserva el nombre completo.
4. Unifica el estado en **una sola insignia por conversación** con color por estado (abierta / pendiente / cerrada) y un icono pequeño de robot si el bot está activo; el «En vivo» se queda solo como punto verde con `aria-label`.
5. Agrupa los dos selectores en una fila (estado | canal) con etiquetas accesibles, o muestra el selector de canal solo cuando haya más de un canal del tipo.
6. Avatar sin nombre real (título numérico): muestra el icono del canal en lugar de iniciales.
7. Verifica claro/oscuro, 375 px y escritorio. Revisa que no haya desbordes horizontales.

## Entregables

- Un commit en español: `style(chat): legibilidad y estados de la bandeja` (y otro `fix(citas): ocultar sección si el módulo no está activo` si prefieres separarlo).
- `npx tsc --noEmit` sin errores nuevos (hay previos ajenos de IVA/CFDI), ESLint limpio, `scripts/check-chat-tipos.ts` y `scripts/check-canales-ui.ts` pasando (actualiza aserciones solo si cambia texto visible).
- Resumen: archivos tocados, qué verificaste visualmente y qué no.
