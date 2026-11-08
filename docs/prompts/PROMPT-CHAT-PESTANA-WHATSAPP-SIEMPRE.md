# Prompt para Codex: mostrar siempre la pestaña WhatsApp en la bandeja

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md`. Mismo estilo del código, sin dependencias ni funciones no pedidas. No hagas push ni despliegues.

## Problema

En `/chat` (`src/components/chat/ChatCliente.tsx`), `tiposDisponibles` solo incluye los tipos que tienen un canal conectado. En la org de revisión de Meta solo hay canales de Messenger e Instagram, así que el selector muestra «Messenger» e «Instagram» pero **no «WhatsApp»**. El revisor debe ver las tres pestañas.

## Tarea

1. Que el selector de tipo muestre **siempre** `WhatsApp`, `Messenger` e `Instagram` cuando la org tenga al menos un canal de Messenger o Instagram (si solo tiene WhatsApp, la bandeja sigue sin selector, como hoy). WhatsApp primero y por defecto si existe; si no tiene canales de WhatsApp, el valor por defecto es el primer tipo con canal.
2. Un tipo sin canales muestra la lista vacía con un texto claro (por ejemplo «Esta empresa no tiene un canal de WhatsApp conectado.»), no el texto de «Aún no hay conversaciones». No se muestra el selector de canal por id cuando no hay canales de ese tipo.
3. Revisa que `/api/conversaciones?tipo=whatsapp` y las páginas que pasan `tipoInicial` (`(app)/chat/page.tsx`) no fallen o devuelvan otra cosa cuando la org no tiene canales de WhatsApp. Las conversaciones sin canal (`canalId null`) siguen contando como WhatsApp.
4. Actualiza `scripts/check-chat-tipos.ts` con este caso (org con solo Messenger e Instagram) sin necesitar la BD de pruebas si se puede evitar.

## Entregables

Un commit en español: `fix(chat): mostrar siempre la pestaña de WhatsApp`. `npx tsc --noEmit` sin errores nuevos (hay previos ajenos de IVA/CFDI). Resumen: archivos tocados y qué probaste.
