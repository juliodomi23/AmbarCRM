# Prompt para Codex — Canal Instagram DM (conexión manual) + guía de bots multicanal

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.
> **Requisito:** `webhooks-y-automatizaciones` ya fusionada en `modulos-fase-2` y árbol limpio. Si no, Codex debe detenerse y avisar.
> Alcance deliberado: solo conexión **manual** (una app de Meta por cliente), sin login con Facebook ni App Review.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Verifica primero que
`modulos-fase-2` contiene los commits de `webhooks-y-automatizaciones` y que el árbol está limpio; si no,
**detente y repórtalo**. Después crea la rama `canal-instagram` desde `modulos-fase-2`.
**No hagas push ni deploy, no toques producción, `meta-tech-provider`, `main` ni `ambarcrm-db`, y no llames a
Meta ni a ninguna red real** (Graph simulado en todas las pruebas). Reglas del repo en `PLAN-CIERRE-FASE-2.md`:
BD desechable en :55450 armada con `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql` (no
`prisma db push`), commit por paso, en español, sin comentarios obvios ni librerías nuevas.

Lee primero, y úsalo como plantilla: `web/src/lib/channel/messenger.ts`, `web/src/lib/channel/index.ts`,
`web/src/lib/channel/types.ts`, `web/src/app/api/messenger/webhook/route.ts`, `web/src/lib/services/canales.ts`
(`guardarCanalMessenger`), `web/src/app/api/canales/route.ts` y `[id]/route.ts`,
`web/src/components/config/CanalExterno.tsx` y `Canales.tsx`, `web/src/components/chat/IconoCanal.tsx`,
`web/src/lib/automatizaciones-esquema.ts`, `docs/canales-decisiones.md`, `docs/api-bot.md` y las secciones de
Messenger en `actualizaciones.sql`.

### Objetivo

Que una empresa conecte una **cuenta profesional de Instagram** (enlazada a una página de Facebook) y reciba y
responda mensajes directos en la bandeja, igual que Messenger. Cada cliente usa su propia app de Meta, así que el
App Secret va **por canal**, exactamente como en Messenger.

### Supuestos sobre Meta (no los inventes: verifícalos en tus pruebas simuladas y márcalos en la entrega)

- Conexión con **token de página** (el de la página de Facebook enlazada) y el **id de la cuenta de Instagram**.
  Envío por `POST {META_GRAPH_URL}/me/messages` con el token de página y `recipient.id` = id de Instagram del
  usuario (IGSID). Mismas reglas que Messenger: ventana de 24 h y etiqueta `HUMAN_AGENT` hasta 7 días.
- Webhook con `object: "instagram"`, `entry[].messaging[]` con `sender.id`, `recipient.id` y `message`
  (`mid`, `text`, `attachments`). Se firma con `X-Hub-Signature-256` igual que Messenger.
- Suscripción a los campos de mensajes de Instagram sobre la página (`subscribed_apps`).
- El nombre y la foto del usuario vienen de un `GET` de perfil que puede fallar; un fallo no impide guardar el
  mensaje. Los adjuntos de Instagram pueden ser de tipos que el CRM no soporta (stories, reels compartidos):
  guárdalos como mensaje de texto con un marcador legible, nunca descartes el evento.
- Si algo de esto no puede resolverse sin llamar a Meta, impleméntalo como el comportamiento más conservador y
  repórtalo en la entrega con 🛑 para que Julio lo verifique con una cuenta real.

### Qué hacer (un commit por tarea)

1. **Proveedor `instagram`.** Nuevo valor en `proveedor_canal` (`ALTER TYPE … ADD VALUE IF NOT EXISTS`, fuera de
   transacción, idempotente) y en el tipo de TypeScript. Índice único parcial por id de cuenta de Instagram
   activa (como `canales_messenger_page_activa_uq`) y función `resolve_org_by_instagram(...)` análoga a la de
   Messenger (SECURITY DEFINER, mismo patrón de permisos). Aplica `actualizaciones.sql` ×3.
2. **`web/src/lib/channel/instagram.ts`**: `makeInstagramProvider`, `normalizarInstagram`,
   `suscribirCuenta`/`desuscribirCuenta`, perfil de usuario y regla de ventana/etiqueta. **Reutiliza** lo que
   ya existe en `messenger.ts` (por ejemplo `messengerGraph`, la ventana de 24 h, el manejo de errores 190/404/803
   y la regla de "red/429/5xx no borra el canal"); si hace falta, extrae lo común a un módulo compartido en un
   commit aparte sin cambiar el comportamiento de Messenger. Registra el proveedor en `getProvider`.
3. **Webhook `web/src/app/api/instagram/webhook/route.ts`**: GET de verificación y POST con firma válida (secreto
   global o del canal), resolución de empresa, idempotencia por `canalId + mid`, 200 siempre que no haya nada que
   hacer (para evitar tormenta de reintentos) y `ingestarEntrante`. El contacto se identifica por
   `(canal_id, identificador_externo)`; **no** lo deduzcas de nombre ni lo fusiones con otro contacto.
   Variable de verificación: reutiliza la de Messenger si es el mismo mecanismo; **no** agregues variables nuevas
   salvo que sea imprescindible, y si lo es, mapéala en `docker-compose.yml` y repórtalo.
4. **Servicio y API de canales:** `guardarCanalInstagram` (manual: token de página, id de cuenta de Instagram,
   id de página, App ID y App Secret por canal cifrado; mismas validaciones, cifrado y control de duplicados
   que `guardarCanalMessenger`), alta/edición en `POST/PATCH /api/canales` y baja en `DELETE /api/canales/[id]`
   con desuscripción remota, mensaje de error fijo, `borrarDatos` y el **retiro forzado** ya existente para
   Messenger extendido a Instagram (solo admin). Ningún token ni cuerpo de error de Meta en respuestas, logs ni
   bitácora.
5. **UI:** formulario de conexión manual de Instagram en `Canales.tsx`/`CanalExterno.tsx` (mismo patrón que
   Messenger manual), botón Desconectar con el `Confirmador` y retiro forzado en dos pasos, ícono de canal en
   `IconoCanal.tsx` y en la bandeja (`ChatCliente.tsx`), y aviso visible de la ventana de 24 h. Si el
   mensaje de otro canal ya muestra tipo de canal, haz lo mismo para Instagram.
6. **Integración con lo existente:** que las reglas de automatización acepten `instagram` como valor de la
   condición "canal" (`automatizaciones-esquema.ts` y `EditorRegla.tsx`), que los webhooks salientes incluyan el
   canal correcto en el payload y que `GET` de la conversación en la API v1 del bot exponga el tipo de canal
   (`messenger`, `instagram`, `cloud_api`) si hoy no lo hace, sin romper el formato compatible con Chatwoot.
7. **Pruebas** (Graph simulado) en `prisma/scripts/test-canales-instagram.ts`: firma válida/inválida (global y
   por canal); idempotencia por `mid`; contacto nuevo y repetido; adjunto no soportado no pierde el evento;
   ventana de 24 h y `HUMAN_AGENT` (7 días) y rechazo fuera de ventana; envío de texto y media; alta manual con
   secreto cifrado; duplicado de cuenta entre empresas → 409; desconexión (éxito, token vencido, 5xx conserva
   el canal) y retiro forzado solo admin; aislamiento entre empresas; ningún token ni secreto en respuestas ni
   bitácora; automatización con condición de canal Instagram; los tests de Messenger siguen en verde. Añade un
   `check-*` si aplica y actualiza el número fijo de rutas en `check-arquitectura-modulos.ts`.
8. **Guía de bots multicanal** `docs/bots-multicanal.md` (y una línea en `docs/api-bot.md`): qué cambia para un
   flujo de n8n según el canal: identificador del cliente (teléfono vs id externo), ventana de 24 h sin
   plantillas en Messenger e Instagram, `HUMAN_AGENT`, formatos de mensaje y límites de texto, cómo leer el tipo
   de canal en la API v1 y un patrón de flujo único con una rama por canal, con un ejemplo pequeño de condición en
   n8n. Texto claro para quien arma bots, sin código nuevo.
9. **Docs de canal:** secciones de Instagram en `docs/canales-decisiones.md` (decisiones, límites, supuestos
   pendientes de verificar con cuenta real) y `docs/CHECKLIST-MERGE-META.md` (humo del canal de prueba de
   Instagram, marcado como opcional hasta tener cuenta real).
10. **Regresión completa** en la BD desechable (tsc, lint, `prisma validate`, build, `actualizaciones.sql` ×3,
    `test-aislamiento.ts`, todos los `test-*.ts` menos `test-lealtad-aurum.ts`, todos los `check-*.ts`). Agrega los
    resultados reales (incluidos fallos) a `docs/regresion-pre-merge-2026-10-17.md` en sección nueva con fecha.
    Retira el contenedor desechable. Si algo falla, corrígelo y repite; no sigas al merge con fallos.
11. **Merge local solo si todo pasó:** árbol limpio, `git switch modulos-fase-2`,
    `git merge --ff-only canal-instagram`. Si no es fast-forward, detente y repórtalo; sin reset, rebase ni merge
    con commit. **No fusiones en `meta-tech-provider` y no hagas push.**

### Fuera de alcance

Login con Facebook para Instagram (flujo de selección de cuenta), "Instagram Login" con tokens propios de Instagram,
comentarios, menciones, historias, respuestas a stories, publicación de contenido, difusión masiva, App Review o
cualquier material para Meta, cambios a WhatsApp o a Messenger más allá de extraer código común sin alterar su
comportamiento, flujos que revisa Meta (`api/wa/onboard`, `api/meta/webhook`, `api/meta/templates`,
`api/mensajes/enviar` salvo registrar el proveedor), correr nada contra producción.

### Entrega (una sola parada)

Commits nuevos, qué quedó implementado y qué se recortó (con motivo), supuestos de Meta que quedaron sin
verificar, resultado de la regresión por prueba, SHA final de `modulos-fase-2` si el merge se hizo, y lo pendiente
de Julio con 🛑: probar con una cuenta de Instagram profesional real enlazada a una página, confirmar en el panel
de Meta qué permisos (`instagram_basic`, `instagram_manage_messages`) necesita la app de cada cliente, panel de
Meta general, Human Agent, ensayo con respaldo real y Aurum de pruebas.
