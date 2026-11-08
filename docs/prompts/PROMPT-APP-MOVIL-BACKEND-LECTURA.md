# Prompt para Codex — App móvil: endpoints de lectura y plantillas para agentes

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final. Cuatro partes, un commit por parte.
> Rama: `codex/app-movil-lectura`, desde `codex/app-movil-backend` (o desde `meta-tech-provider` si ya la fusionaste).
> Sigue a `PROMPT-APP-MOVIL-BACKEND.md` (login con token, push FCM, contrato). **No toca push.**

## Antes de lanzarlo (Julio)

- Postgres desechable: el contenedor `ambarcrm-app-movil-test` (base `app_movil_test`) ya existe; si no, arma uno aislado en
  localhost como en `PLAN-CIERRE-FASE-2.md`. Sin Firebase ni red externa.
- Esta corrida **no despliega nada** (producción: 3 orgs activas). El despliegue lo haces tú después.
- Lección de la corrida anterior: Codex dejó un `next start` vivo en el puerto 3119. En esta, **cierra todo servidor que levantes**.

## Contexto verificado (confírmalo leyendo el código, no lo asumas)

- La app móvil usa los endpoints de la UI (sesión de usuario con Bearer, ya resuelto en `proxy.ts`). **Faltan `GET` para las
  listas**: la web las obtiene en páginas de servidor (`app/(app)/contactos/page.tsx`, `embudos/page.tsx`, `tareas/page.tsx`)
  llamando a `lib/services/contactos.ts` (`listarContactos`, `listarEtiquetas`, `listarUsuariosActivos`),
  `lib/services/embudos.ts` (`listarEmbudos`, `getEmbudoConTarjetas`) y `lib/services/tareas.ts` (`listarTareas`).
- ⚠️ **Esos servicios devuelven filas completas de Prisma, incluido `Usuario.passwordHash`.** `listarUsuariosActivos()` devuelve
  usuarios enteros, y `listarContactos()` / `listarTareas()` / `getEmbudoConTarjetas()` incluyen `responsable: true` (otro
  `Usuario` completo). Las páginas solo se salvan porque mapean a mano `id` y `nombre` antes de pasar datos al navegador.
  **Un endpoint que devuelva el resultado del servicio filtraría hashes de contraseña.** Todo lo nuevo debe construir la respuesta
  campo por campo (lista blanca), nunca devolver el objeto de Prisma ni hacer `...spread` de él.
- Los datos salen con `serializar()` (`lib/serialize`) porque Prisma usa `BigInt` y `Decimal`.
- Ya existen las escrituras que usará la app: `PATCH /api/tareas/:id`, `POST /api/oportunidades/mover`, `POST/PATCH /api/contactos…`,
  `PATCH /api/conversaciones/:id` (ver `API-MOVIL.md`). Aquí solo se añade lectura.
- Existe `paginacionListado(req)` en `lib/paginacion.ts` (`limite` por defecto y máximo 200, `cursor` por id). `LIMITE_PANEL = 200`.
- `GET /api/meta/templates` usa `requireSesion(true)` (**solo admin**) y el selector `components/chat/EnviarPlantilla.tsx` lo llama,
  así que **hoy un agente sin rol admin recibe error al intentar enviar una plantilla, también en la web**. Además `/api/meta` está
  excluida del `matcher` de `proxy.ts`, por eso con Bearer da 401. Rutas bajo `api/meta`: solo `templates` y `webhook`.
- Puestos: `lib/modulos-catalogo.ts` (`puestoPuedeAcceder`, `puestoPuedeAtenderConversaciones`) y `lib/puestos.ts`. Un Cajero no
  atiende conversaciones.
- Pruebas: patrón `web/scripts/check-*.ts`. Ya existen `check-app-movil.ts` (en proceso) y `check-app-movil-http.ts`
  (servidor real, `APP_URL`) con BD aislada `app_movil_test`. Extiéndelos; no crees un framework nuevo.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Crea la rama `codex/app-movil-lectura` desde la
base indicada. **No hagas push ni deploy, no toques producción, `main` ni ninguna base real, y no llames a red real** (Meta, FCM,
Anthropic, Google). Reglas del repo en `PLAN-CIERRE-FASE-2.md`: BD desechable, **commit al terminar cada parte**, mensajes en
español, sin comentarios obvios, código modular y chico, sin sobre-ingeniería y **sin dependencias nuevas**. Si el entorno
rechaza un `git add` o `git commit`, no te detengas: deja los cambios, y repórtalo.

### Zonas prohibidas (código de producción que otros flujos usan)

`web/src/app/api/v1/**`, `web/src/lib/bot-*.ts`, `docs/api-bot.md`, `web/src/lib/eventos-crm.ts`,
`web/src/lib/services/conversacion-estado.ts`, `web/src/lib/channel/**`, `web/src/lib/meta/**`, `web/src/app/api/wa/**`,
`web/src/components/config/**`, todo lo de push (`lib/push.ts`, `lib/firebase-fcm.ts`, `api/movil/dispositivo|logout`), y cualquier
ruta o servicio existente de conversaciones/mensajes.
**Excepciones únicas:** (1) la línea del `GET` de `web/src/app/api/meta/templates/route.ts` (Parte 1); (2) el `matcher` de
`web/src/proxy.ts` (Parte 1); (3) nuevas funciones **opcionales y compatibles** en `lib/services/{contactos,embudos,tareas}.ts`
si las necesitas, sin cambiar lo que devuelven hoy a la web.
En `schema.prisma` y `actualizaciones.sql` no hace falta tocar nada; si crees que sí, detente y repórtalo.

### Lo que NO debe cambiar (compruébalo)

1. Las páginas web de contactos, embudos y tareas se ven y funcionan igual.
2. `POST /api/meta/templates` sigue siendo **solo admin**.
3. `api/meta/webhook` (verificación y recepción de Meta) sigue **público** y sin pasar por el middleware de sesión.
4. Todo lo demás del `matcher` queda idéntico.
5. Ninguna respuesta nueva contiene `passwordHash`, ni nada con forma de hash de contraseña.

---

### Parte 1 · Plantillas para agentes con Bearer

- `GET /api/meta/templates`: cámbialo a `requireSesion()` (cualquier usuario autenticado). `POST` queda con `requireSesion(true)`.
- `proxy.ts`: en el `matcher`, cambia la exclusión `api/meta(?:/|$)` por `api/meta/webhook(?:/|$)`. Así `templates` pasa por el
  proxy (cookie web como siempre, o Bearer móvil) y el webhook sigue libre. No cambies ninguna otra exclusión.
- La respuesta de `templates` queda como está (la app filtra `APPROVED`).

### Parte 2 · Usuarios y etiquetas

Rutas nuevas bajo `web/src/app/api/movil/`, todas con `requireSesion()` y `Cache-Control: no-store`:

- `GET /api/movil/usuarios` → `{ usuarios: [{ id, nombre, rol, puesto, puedeAtender }] }`: usuarios **activos** de la org.
  `puedeAtender` = `puestoPuedeAtenderConversaciones(puesto, rol)` para que la app solo ofrezca asignar a quien corresponde.
  Nada más (ni correo, ni hash, ni fechas).
- `GET /api/movil/etiquetas` → `{ etiquetas: [{ id, nombre, color }] }`.

### Parte 3 · Contactos, embudos y tareas

- `GET /api/movil/contactos?q=&limite=&cursor=` → `{ contactos: [...], siguiente: "<id>"|null }`.
  Mismos campos que mapea hoy `contactos/page.tsx` (id, nombre, telefono, email, empresa, fuente, responsableId,
  `responsable` solo como **nombre**, optOutDifusion, `oportunidades` como conteo, esCliente, campos, etiquetas
  `[{id,nombre,color}]`), de la lista blanca. Orden estable (`createdAt desc, id desc`). `q` busca (insensible a mayúsculas) en
  nombre, teléfono, correo y empresa; mínimo 2 caracteres. Paginación por cursor con tope 200 reutilizando
  `paginacionListado` o su lógica. Ni duplicados ni saltos entre páginas.
- `GET /api/movil/embudos` → `{ embudos: [{ id, nombre, orden }] }` (solo activos; añade `descripcion` solo si el modelo la tiene).
- `GET /api/movil/embudos/:id?q=&pagina=` → usa `getEmbudoConTarjetas` y devuelve
  `{ id, nombre, pagina, paginas, limitePorColumna, etapas: [{ id, nombre, color, tipo, orden, total, tarjetas: [{ id, titulo,
  valor, moneda, estado, createdAt, diasEnEtapa, conversacionId, contacto: { nombre, telefono }, responsable: { nombre }|null }] }] }`,
  con los **mismos cálculos** que `embudos/page.tsx` (incluida la regla de `valorAnual` en el título y `diasEnEtapa`). `id` inválido
  → 400; embudo inexistente (o de otra org) → 404; `pagina` acotada como en la página (1–10000).
- `GET /api/movil/tareas?completada=true|false` → `{ tareas: [...], truncado: boolean }` con los campos de `tareas/page.tsx`
  (id, titulo, descripcion, venceAt, completada, responsableId, `responsable` solo nombre, `oportunidad: { id, titulo, contacto }`|null).
  Mismo orden que hoy. Tope de **500** con `truncado` si se corta. Sin `completada`, devuelve ambas.
- **Permisos:** revisa qué restringe la web para cada una de estas pantallas (layout `app/(app)`, AppShell,
  `puestoPuedeAcceder`, `moduloActivo`). Si la web le niega una pantalla a un puesto o rol, el endpoint equivalente responde 403.
  Si no restringe, tampoco restrinjas tú. **Reporta lo que encuentres**, sobre todo si un Cajero puede o no ver contactos.

### Parte 3b · Bandeja paginada

Hoy `GET /api/conversaciones` devuelve como máximo las 200 más recientes (`listarConversaciones`, `take: 200`), sin cursor y sin
`updatedAt`. **No modifiques esa ruta ni `listarConversaciones`** (la web y otros flujos la usan). Crea una ruta nueva:

- `GET /api/movil/conversaciones?limite=&cursor=&estado=&q=` → `{ conversaciones: [...], siguiente: "<cursor>"|null }`.
  Cada elemento tiene **exactamente los campos de `mapearConv`** de `api/conversaciones/route.ts` más `updatedAt` (ISO). Reutiliza ese
  mapeo (expórtalo desde un módulo común sin cambiar su comportamiento, o duplícalo mínimo si exportarlo toca la zona prohibida).
- Mismo orden que la web: fijadas primero, luego `ultimoMensajeAt desc`; añade `id desc` como desempate para que el cursor sea
  estable. Piensa el cursor con cuidado (la ordenación tiene `nulls last` y dos claves): puede ser opaco (base64 de las claves) y debe
  no duplicar ni saltar elementos entre páginas, también si llegan mensajes nuevos mientras se pagina. `limite` por defecto 50, tope 100.
- `estado` opcional (`abierta`|`pendiente`|`cerrada`); `q` (mínimo 2 caracteres) reutiliza `buscarEnMensajes` como la web y puede
  devolver `siguiente: null`, indicándolo en la documentación.
- Respeta las mismas reglas de visibilidad que la web (rol, puesto, canales). Compruébalo y reporta qué ve un agente frente a un admin.
- Sin campos fuera de la lista (el `responsable` completo incluye `passwordHash`: usa solo `id`).

### Parte 4 · Contrato y pruebas

**`API-MOVIL.md`:** actualízalo. Quita la sección que dice que no hay `GET` de listas y la nota de bloqueo de plantillas; documenta los
endpoints nuevos con **respuestas reales** ejecutadas contra el servidor local (datos sintéticos). Corrige la fila de
`/api/meta/templates` (ya funciona con Bearer y para agentes; la respuesta con datos de Meta sigue sin ejecutarse: sale a Meta).
Actualiza la fecha de verificación y el puerto usado.

**Pruebas** (extiende `check-app-movil.ts` y `check-app-movil-http.ts`):
- **Anti-fuga:** para **cada** endpoint nuevo y con datos reales, el JSON serializado no contiene `passwordHash`, `password_hash`,
  `$2a$`, `$2b$` ni `$2y$`. Crea usuarios con contraseña real para que el hash exista en la BD.
- **RLS:** con el token de la org B, ninguna lista muestra datos de la org A; con tokens de otra org, `embudos/:id` de la A da 404.
- **Agente vs admin:** un usuario con rol `agente` obtiene 200 en `usuarios`, `etiquetas`, `contactos`, `embudos`, `tareas`.
  `GET /api/meta/templates?canalId=<inexistente>` con **agente** da **404 `canal inexistente`** (prueba que pasó la autorización sin
  llamar a Meta) y con Bearer ya no da 401. `POST /api/meta/templates` con agente da **403**, con admin pasa a su validación.
- **Sin sesión:** sin Bearer ni cookie, `/api/movil/*` conserva el redirect de siempre; con Bearer inválido da 401 JSON.
- **Webhook libre:** `GET /api/meta/webhook` sin credenciales **no** recibe el redirect del middleware (comprueba qué responde hoy y que
  sigue igual), y el POST sin firma válida se rechaza como antes.
- **Tabla de rutas del `matcher`:** actualiza la existente: `/api/meta/templates` protegida, `/api/meta/webhook` pública; el resto de
  rutas públicas (`/api/v1`, `/api/public`, `/api/cron`, `/api/auth`, `/api/instagram/webhook`, `/api/messenger/webhook`, `/login`,
  `/privacidad`, `/eliminacion-datos`…) sigue pública y `/api/media` sigue siendo caso especial.
- **Contactos:** `limite=2` con 5 contactos → 3 páginas sin duplicados ni saltos, `siguiente: null` al final; `q` filtra; `q` de 1 letra no filtra.
- **Bandeja paginada:** con 7 conversaciones (algunas fijadas, una con `ultimoMensajeAt` nulo) y `limite=3` → 3 páginas sin duplicados ni
  saltos, mismo orden que `GET /api/conversaciones`, `siguiente: null` al final; `estado` filtra; cada elemento trae `updatedAt`;
  nada de `passwordHash`; otra org no aparece; `GET /api/conversaciones` sigue respondiendo igual que antes (compara el JSON).
- **Embudos y tareas:** columnas con total y tarjetas correctas, `diasEnEtapa`, `valorAnual`; filtro `completada`; `truncado`.
- **Camino de escritura móvil:** con Bearer, `PATCH /api/tareas/:id` completa una tarea y `POST /api/oportunidades/mover` cambia la
  etapa, y ambas se reflejan en el `GET` correspondiente.
- **Regresión:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, `check:app-movil`, `check:app-movil-http`, `check-audio-ogg`.
  `check-instagram` ya falla antes de esta rama (texto de `CanalExterno`): si sigue fallando en la línea 20 no es tuyo; compruébalo.
- `git diff --stat` contra la base no toca zonas prohibidas (muéstralo; las excepciones deben verse acotadas).
- **Cierra todo servidor y proceso que levantes.**

### Al terminar

Un solo reporte: qué hiciste por parte, resultado de cada prueba, el `git diff --stat`, lo que encontraste sobre permisos por puesto
(Parte 3), cualquier decisión que Julio deba revisar y cada endpoint que no se pudo ejecutar. No hagas push ni merge.
