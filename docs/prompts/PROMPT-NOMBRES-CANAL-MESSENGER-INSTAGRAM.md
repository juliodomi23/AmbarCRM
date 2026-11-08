# Prompt para Codex: nombres claros de canal en Messenger e Instagram

Trabaja en `web/` de AmbarCRM (rama `meta-tech-provider`). Lee `web/AGENTS.md` (este Next.js tiene cambios incompatibles; consulta `node_modules/next/dist/docs/` antes de tocar rutas o componentes). Mismo estilo del código existente, sin dependencias nuevas ni funciones no pedidas. No hagas push ni despliegues.

## Problema

Al conectar Messenger o Instagram con Facebook Login, el canal se guarda con el nombre de la **página** (por ejemplo «Ámbar Rojo Studios»). En producción hoy hay dos canales de la misma org con el mismo nombre («Ámbar Rojo Studios» de Instagram y de Messenger), además del de WhatsApp. En `/chat` y en Configuración → Canales no se distingue cuál es cuál, y el revisor de Meta debe ver canales claramente separados: «Messenger Ámbar Rojo», «Instagram Ámbar Rojo», etc.

## Tarea

1. **Nombre por defecto al conectar** (`conectarPaginaMessenger` en `src/lib/services/messenger-login.ts`, y la conexión manual si aplica): si el usuario no escribe un nombre, usa `Messenger · {nombre de la página}` o `Instagram · {nombre de la página}` (separador « · »). Si el usuario escribe un nombre propio, se respeta tal cual. Limita la longitud como ya se hace hoy.
2. **Selector de canal en `/chat`** (`src/components/chat/ChatCliente.tsx`) y listas de canales en Configuración (`src/components/config/…`): muestra el tipo junto al nombre cuando el nombre no lo incluya ya (no repitas «Messenger · Messenger · …»). Para WhatsApp no cambies nada.
3. **Canales ya existentes:** no hagas migración automática ni toques datos. Se renombran a mano desde el campo «Nombre» del canal.
4. Actualiza o añade la comprobación mínima que ya exista para estos nombres (por ejemplo en `scripts/check-chat-tipos.ts` o en las pruebas de Messenger/Instagram) sin necesitar la base de pruebas en el puerto 55450 si se puede evitar.

## Entregables

- Un commit en español: `fix(canales): nombre por defecto con el tipo de canal`.
- `npx tsc --noEmit` sin errores nuevos (hay errores previos ajenos de `ivaTasa`, `ivaExento`, `ivaTotal`).
- Resumen: archivos tocados, qué probaste y qué no.
