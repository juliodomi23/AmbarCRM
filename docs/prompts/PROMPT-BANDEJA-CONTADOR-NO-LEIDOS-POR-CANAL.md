# Prompt para Codex: contador de no leídos en las pestañas de canal

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md`: este Next.js tiene cambios incompatibles, revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes. Mismo estilo del código existente (comentarios escasos, nombres en español), sin dependencias nuevas ni funciones no pedidas. No hagas push ni despliegues.

## Problema

En `/chat` las pestañas **WhatsApp / Messenger / Instagram** no avisan cuando hay mensajes sin leer en otro canal: hay que entrar a cada pestaña para descubrirlo. La lista ya muestra el contador por conversación (el círculo con el número).

## Tarea

1. En cada pestaña de tipo de canal (`ChatCliente.tsx`), muestra una **insignia con el número de mensajes/conversaciones sin leer** de ese tipo (la misma métrica que ya usa el círculo de cada conversación; si el círculo cuenta mensajes, suma mensajes; si cuenta conversaciones, igual). Sin insignia cuando es 0; «99+» como tope.
2. El conteo debe ser de **todas las conversaciones del tipo**, no solo de las que están cargadas en la lista ni del filtro activo (Todas/Mis/Sin asignar). Si hoy la lista llega paginada o filtrada, calcula el conteo en el servidor (parámetro o endpoint existente) sin romper la compatibilidad; si ya hay un canal SSE/polling para la bandeja, actualiza el conteo en vivo con él.
3. Respeta el tipo de canal de cada conversación (`cloud_api` = WhatsApp, `messenger`, `instagram`) como ya hace `tiposDeBandeja`.
4. Estilo: círculo pequeño del color de marca (mismo que el de no leídos de la lista), legible en claro/oscuro y a 375 px, con `aria-label` tipo «Messenger, 1 sin leer».
5. Opcional si cabe sin complicar: mostrar la misma insignia junto al ítem «Chat» del menú lateral con el total de los tres tipos. Si implica cambios grandes, omítelo y dilo.

## Entregables

- Un commit en español: `feat(chat): contador de no leídos por tipo de canal`.
- `npx tsc --noEmit` sin errores nuevos (hay previos ajenos de IVA/CFDI), ESLint limpio, `scripts/check-chat-tipos.ts` pasando; añade una comprobación mínima del conteo por tipo.
- Resumen: archivos tocados, de dónde sale el conteo y qué verificaste visualmente y qué no.
