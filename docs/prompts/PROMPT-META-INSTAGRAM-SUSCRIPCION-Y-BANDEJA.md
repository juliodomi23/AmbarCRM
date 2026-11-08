# Prompt para Codex: suscripción de la cuenta de Instagram y bandeja por canal

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md`: este Next.js tiene cambios incompatibles, revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes. Mantén el estilo del código existente (comentarios escasos, nombres en español). No agregues dependencias ni funciones que no se piden. No hagas push ni despliegues.

## Contexto verificado en producción (27-oct-2026)

- Instagram se conecta con **Facebook Login** (token de página). El webhook `/api/instagram/webhook` recibe bien las pruebas de Meta (firma válida), pero los DMs reales no llegaban.
- Hoy solo se suscribe la **página** (`POST /{pageId}/subscribed_apps` con `messages`) en `suscribirPaginaMeta` (`src/lib/channel/meta-mensajeria.ts`). `GET /{instagramId}/subscribed_apps` devolvía `[]`: la propia cuenta de Instagram no estaba suscrita.
- Se probó a mano `POST /{instagramId}/subscribed_apps` con `subscribed_fields=messages` y el token de la página: respondió `{"success":true}` y el GET ya mostró `messages` para la app. Falta confirmar con un DM real que esto hace llegar el evento. Si no, esta tarea sigue siendo correcta y no se revierte.

## Tarea 1: suscribir también la cuenta de Instagram

1. En `src/lib/channel/instagram.ts`, `suscribirCuenta` debe, además de lo que hace hoy, llamar `POST /{config.instagramId}/subscribed_apps` con `subscribed_fields=messages` (usa `graphMensajeriaMeta`, mismo token de página). Si Meta no responde `success: true`, falla con un error claro en español, igual que la suscripción de página.
2. Confirma qué función se llama al conectar un canal Instagram en `src/lib/services/canales.ts` (hoy se ve `suscribirPagina` de `messenger`). Si Instagram no pasa por `suscribirCuenta`, corrige el flujo para que sí lo haga, tanto por login con Facebook como por conexión manual.
3. En la desconexión (`src/app/api/canales/[id]/route.ts`, `desuscribirCuenta`): antes del DELETE de la página, haz `DELETE /{instagramId}/subscribed_apps`. Conserva el comportamiento actual de no romper el otro canal de la misma página. Si el token ya venció (código 190) o la cuenta ya no existe, sigue tratando el caso como hoy.
4. Canales ya conectados: no hace falta migración. Basta con que al reconectar/guardar se suscriba. Documenta en el commit que los canales existentes deben reconectarse.
5. Agrega o actualiza las pruebas existentes de Messenger/Instagram (`prisma/scripts/test-messenger-facebook.ts` y los `check-*` relacionados) con el nuevo paso. `scripts/check-instagram.ts` está desactualizado respecto al login guiado: corrígelo para que pase.

## Tarea 2: bandeja separada por tipo de canal

Problema: en `/chat` el filtro de canal dice «Todos los WhatsApp» y mezcla todo. Para el revisor de Meta, WhatsApp, Messenger e Instagram deben verse separados.

Archivo principal: `src/components/chat/ChatCliente.tsx` (ya tiene `canales` con `proveedor`, `canalProveedor` por conversación, `IconoCanal`, `esWhatsapp`/`esMensajeriaMeta`, y `filtroCanal` por id de canal).

1. Agrega un selector de **tipo de canal** arriba de la lista: `WhatsApp`, `Messenger`, `Instagram`. Solo muestra los tipos que existan en `canales` (si la org solo tiene WhatsApp, no debe aparecer nada nuevo ni cambiar la bandeja actual). Por defecto, `WhatsApp` si existe; si no, el primer tipo disponible.
2. La lista filtra conversaciones por el proveedor elegido (`cloud_api` = WhatsApp, `messenger`, `instagram`). Incluye otros proveedores de WhatsApp que ya se traten como WhatsApp en el código (`esWhatsapp`), sin romperlos.
3. El selector de canal por id pasa a listar solo los canales del tipo elegido, y la primera opción dice «Todos los canales de WhatsApp» / «de Messenger» / «de Instagram» según corresponda. Quita el texto fijo «Todos los WhatsApp».
4. Los contadores («Mis (n)», «Sin asignar», etc.) respetan el tipo elegido.
5. No cambies la API ni el modelo de datos si el filtrado se puede hacer en el cliente con los datos que ya llegan. Si la paginación del servidor hace que el filtro en cliente pierda conversaciones, filtra en el servidor con un parámetro opcional y mantenlo compatible.
6. Mantén la experiencia móvil/escritorio actual y los estilos del proyecto.

## Entregables

- Cambios de código y pruebas, con `npx tsc --noEmit` sin errores nuevos (hay errores previos ajenos de `ivaTasa`, `ivaExento`, `ivaTotal`; no los toques).
- Un commit por tarea, con mensajes en español (`fix(instagram): ...`, `feat(chat): ...`).
- En el resumen final: qué archivos tocaste, qué probaste y qué no pudiste probar (el DM real solo se prueba en producción).
