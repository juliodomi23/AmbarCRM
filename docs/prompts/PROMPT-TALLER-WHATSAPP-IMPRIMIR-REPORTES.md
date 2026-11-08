# PROMPT — Taller: WhatsApp al cliente, seguimiento, impresión y reportes

Rama `taller-mecanico` (último commit `0f87a0f`). Trabaja en `web/`. Lee `web/AGENTS.md` (este Next.js tiene cambios incompatibles: revisa `node_modules/next/dist/docs/` antes de tocar rutas o componentes), `web/DESIGN.md` (solo tokens del sistema, nada de hexadecimales ni colores fijos de Tailwind), `docs/TALLER-MECANICO.md`, `MULTI-TENANT.md` y `docs/api-bot.md`. Reglas: sin push, merge ni deploy; no tocar producción; **ningún mensaje real a Meta durante el desarrollo** (usa el modo simulado de la fase 1); migraciones idempotentes en `web/prisma/sql/actualizaciones.sql` (se repiten en cada deploy con `ON_ERROR_STOP=1`: pruébala corriéndola 3 veces); tablas nuevas con `org_id`, RLS `org_isolation` y GRANT; enlaces públicos con `NEXTAUTH_URL` (nunca `req.url`); zona horaria `America/Mexico_City` fija en todo texto de fecha (evita errores de hidratación). Un commit por fase, en español.

## Contexto
La demo del taller ya se enseña a prospectos y preguntan por: (1) mandar al cliente el enlace de aprobación por WhatsApp, (2) avisar cuando el carro está listo, (3) que el cliente pueda preguntar cómo va su carro, (4) imprimir/PDF y (5) reportes. Ya existe el patrón a seguir: `src/lib/cotizacion-envio.ts` (`enviarCotizacionWhatsapp`: ventana de 24 h abierta → texto; cerrada → plantilla aprobada; guarda el `mensaje` en la conversación; códigos de error claros). **Reutiliza ese patrón y sus helpers** (`getProvider`, `estadoVentana`, `configCotizaciones` como modelo para la configuración del módulo); no inventes otro.

## Fase 1 — Enviar por WhatsApp (aprobación, listo y estado)

**Biblioteca** `src/lib/taller-whatsapp.ts` con una función `enviarMensajeTaller(orden, tipo, usuarioId)` donde `tipo` es `aprobacion` | `listo` | `estado`. Textos (con el nombre del taller de `ajustes.marcaNombre`):
- `aprobacion`: «Hola {nombre}, tu {marca} {modelo} ({placa}) ya tiene diagnóstico. Revisa y aprueba la cotización aquí: {enlace}».
- `listo`: «Hola {nombre}, ¡tu {marca} {modelo} ({placa}) está listo para entrega! {saldo si > 0: Saldo por liquidar: $X}. Te esperamos».
- `estado`: «Hola {nombre}, así va tu {marca} {modelo}: {estado legible}. Promesa de entrega: {fecha}. Seguimiento: {enlace de seguimiento}».

**Tres formas de envío, en este orden:**
1. **Simulado** si la configuración del módulo tiene `simularEnvio: true`: no llama a Meta, registra la notificación como `simulado` y muestra el mensaje en el toast. Es para la demo; el seed de `demo-taller` lo activa.
2. **Oficial** si el contacto tiene conversación en un canal `cloud_api` activo: ventana abierta → texto; cerrada → plantilla aprobada de la configuración (`plantillaAprobacion`, `plantillaListo`, `plantillaEstado`, cada una `{ name, language }`) con variables en orden fijo documentado; sin plantilla → error 409 `ventana_cerrada_sin_plantilla` con mensaje claro. Copia las verificaciones de `enviarCotizacionWhatsapp` (plantilla aprobada en Meta, sin WABA, Meta no disponible).
3. **Respaldo manual** si no hay canal oficial: el API devuelve `{ forma: "manual", enlaceWhatsapp }` con `https://wa.me/<teléfono normalizado>?text=<mensaje codificado>`, y la UI abre WhatsApp Web / app en una pestaña nueva y registra la notificación como `manual`. Usa el normalizador de teléfonos que ya existe (revisa `campanas-envio-importar.ts` / contactos) para el formato de México.

**Datos:** tabla `taller_notificaciones` (`id`, `org_id`, `orden_id` con FK compuesta `(orden_id, org_id)`, `tipo`, `forma` [`oficial`|`simulado`|`manual`], `estado` [`enviado`|`fallido`|`simulado`|`manual`], `error`, `user_id`, `created_at`). Se muestran en el historial de la orden («Se avisó al cliente: listo · WhatsApp · 4:20 p. m.») y, si ya existe una del mismo tipo, el botón pide confirmación con el diálogo de la app (`confirmar()` de `src/components/Confirmador.tsx`), nunca `window.confirm`.

**Configuración:** sección «WhatsApp del taller» dentro del módulo (solo administradores): interruptor `simularEnvio`, selector de plantilla por tipo (lista de plantillas aprobadas del canal, como hace Cotizaciones) y, por cada tipo, el texto sugerido para crearla en Meta (categoría UTILITY, español) con sus variables `{{1}}`…. El interruptor `avisarAlMarcarListo` (apagado por defecto): si está encendido, al pasar a `listo` se envía el aviso automáticamente; si no, la UI ofrece «¿Avisar al cliente?» tras marcar listo.

**UI:**
- En el detalle: botón «Enviar por WhatsApp» junto al enlace de aprobación (reemplaza el copiar/pegar manual; deja «Copiar enlace»). En estado `listo`, tarjeta destacada «Avisar al cliente que su vehículo está listo». En cualquier estado activo, «Enviar estado al cliente».
- Estados de carga, error con el motivo exacto del servidor y toast de éxito. Móvil: botones de 48 px.

**Permisos:** solo usuarios con acceso al módulo; cada envío queda auditado en `taller_notificaciones`. Límite anti-abuso: máximo 1 mensaje del mismo tipo por orden cada 10 minutos (409 si se repite).

## Fase 2 — Seguimiento para el cliente y preguntas por WhatsApp

**Página pública de seguimiento** `/taller-estado/[token]` (token de 48 hex guardado en `taller_ordenes.seguimiento_token`, con `org_id` en el prefijo como el de aprobación; **añade `taller-estado/` y `api/taller-estado/` al matcher de `src/proxy.ts`** para que no pida login). Solo lectura, móvil primero, con la marca de la organización (igual que `TallerAprobacionPublica`): placa y modelo, línea de progreso de 6 pasos, estado en lenguaje claro («Estamos revisando tu vehículo», «Esperando tu aprobación» con botón a la página de aprobación, «Listo para entrega»), fecha promesa y saldo pendiente. **Sin precios por concepto, sin teléfonos ni nombres de mecánicos.** El token se genera al pedirlo por primera vez y deja de funcionar 30 días después de la entrega o al cancelar (404 genérico). Sin sesión, sin escritura, misma respuesta 404 para token inexistente o expirado.

**Bots (n8n):** nueva ruta `GET /api/v1/accounts/[accountId]/conversations/[conversationId]/taller/ordenes` (sigue el estilo de las rutas de `quotes`/`appointments`, con la misma firma HMAC, bitácora y verificación de pertenencia de la conversación) que devuelve las órdenes **activas y las entregadas en los últimos 7 días** del contacto de esa conversación: `numero`, `vehiculo` (placa, marca, modelo), `estado`, `estadoTexto`, `fechaPromesa`, `saldo`, `enlaceSeguimiento`. Permiso nuevo en `src/lib/bot-permisos.ts`: `consultar_taller` («Consultar el estado de las órdenes del taller»), apagado por defecto. Solo lectura; no expongas conceptos ni precios. Documenta la ruta en `docs/api-bot.md` con un ejemplo de herramienta para el agente de n8n y la respuesta sugerida («Tu Versa va en reparación, la promesa es mañana. Seguimiento: …»). Prueba: un bot sin el permiso recibe 403; un contacto sin órdenes recibe lista vacía; una conversación de otra org recibe 404.

**Personal humano:** en el chat de una conversación, si el contacto tiene órdenes activas, una chip «Orden #N · En reparación» (solo lectura, enlaza al detalle) para que quien atiende vea el estado sin salir del chat. Si es difícil integrarlo sin tocar el chat general, déjalo documentado como pendiente en vez de forzarlo.

## Fase 3 — Imprimir / PDF

Sin librerías nuevas: páginas con estilos `@media print` y botón «Imprimir / Guardar PDF» (`window.print()`), pensadas para A4/Carta y papel térmico no necesario. Marca de la organización (nombre, logo), folio, fecha en zona de México.
- `/taller/ordenes/[id]/imprimir?doc=recepcion`: **orden de recepción** — datos del cliente y vehículo (placa, VIN, km de entrada, combustible/observaciones opcionales si ya existen en el modelo; si no, deja un recuadro en blanco para escribirlos a mano), falla reportada, fecha promesa, espacio para firma del cliente y leyenda editable (texto por organización en configuración del módulo, con un valor por defecto sensato).
- `?doc=cotizacion`: **cotización/comprobante** — conceptos con cantidad, precio e importe, subtotal mano de obra / refacciones, total, pagos registrados, saldo y estado; con espacio de firma de aprobación.
- Botones «Imprimir recepción» e «Imprimir cotización» en el detalle (menú «Imprimir»). La vista de impresión oculta menú, barra superior y navegación (`print:hidden` o equivalente) y no parte tablas a media fila (`break-inside: avoid`).
- Comprueba que ocupan 1 página con 10 conceptos y que con 40 conceptos paginan bien.

## Fase 4 — Reportes

Nueva pestaña **Reportes** en `TallerNavegacion` (`/taller/reportes`). **Solo administradores ven montos**; los demás puestos no ven la pestaña (y la API responde 403).
- Selector de periodo: Hoy, 7 días, Este mes, Mes anterior y rango personalizado (`<input type="date">`), en zona de México.
- API `GET /api/taller/reportes?desde=&hasta=` (con `conModulo("taller")`, RLS y agregaciones en SQL, **sin cargar todas las órdenes al cliente**) que devuelve:
  - **Resumen:** órdenes ingresadas, entregadas, canceladas; ticket promedio (entregadas); **ingresos cobrados** (suma de `taller_pagos` del periodo); **por cobrar** (saldo de todas las órdenes abiertas hoy, independiente del periodo); tiempo promedio de entrega (recibido → entregado, en días).
  - **Por mecánico:** órdenes entregadas, ingresos por mano de obra y refacciones.
  - **Refacciones:** más usadas (cantidad e importe), margen bruto (precio − costo) del periodo y piezas bajo el mínimo.
  - **Embudo del taller:** cuántas órdenes hay hoy por estado.
  - **Serie diaria** de ingresos cobrados del periodo (para la gráfica).
  - **Clientes con saldo pendiente** (top 10) y **vehículos con recordatorio vencido** (conteo).
- UI: tarjetas de resumen con `.tnum`, gráfica de barras por día **hecha con CSS/SVG sin librería** (revisa la guía del skill/estilo `dataviz` del repo si existe; accesible: título, tabla alternativa oculta con los valores, colores por tokens), tablas por mecánico y por refacción, y estados de carga (`.skeleton`) y vacío con texto amable.
- Exportar CSV (UTF-8 con BOM, separador coma, fechas ISO) de las órdenes del periodo: folio, fecha, cliente, placa, estado, total, pagado, saldo, mecánico.
- Rendimiento: con 20 000 órdenes y 100 000 pagos la API debe responder en < 1 s; añade los índices que falten (`org_id, created_at`; `taller_pagos(org_id, created_at)`) con `CREATE INDEX IF NOT EXISTS`.

## Fase 5 — Demo y pruebas

- **`scripts/seed-demo-taller.mjs`:** activa `simularEnvio` en `demo-taller`; crea notificaciones de ejemplo en el historial (una `aprobacion` y una `listo` simuladas); genera **~40 órdenes entregadas repartidas en los últimos 60 días** con conceptos, pagos en fechas distintas, varios mecánicos y refacciones, y un par con saldo, para que los reportes se vean vivos; y un token de seguimiento activo que imprime junto al de aprobación. Sigue siendo idempotente y limitado a `demo-taller`.
- **Pruebas en `scripts/check-taller.ts`** (corre la suite completa y pega la salida; si no puedes, dilo):
  - Envío: simulado no llama a Meta; manual devuelve `wa.me` con el texto codificado; sin canal ni simulación ni teléfono → error claro; límite de 1 mensaje cada 10 min; ventana cerrada sin plantilla → 409.
  - Seguimiento: token válido 200 sin cookie; expirado/cancelado/desconocido 404; sin precios ni teléfonos en el JSON; ruta no pública sigue protegida.
  - Bot: sin permiso 403; con permiso solo órdenes del contacto; otra org 404.
  - Reportes: aislamiento entre orgs, no-admin recibe 403, totales cuadran con pagos de fixtures y con límites de periodo en zona de México, CSV con BOM.
  - Migración: `actualizaciones.sql` corrida 3 veces seguidas con `psql -v ON_ERROR_STOP=1` sin error.
- Verificación visual con Playwright o a mano (claro/oscuro, 375 px y escritorio) de: botones de WhatsApp y tarjeta «Listo», página de seguimiento, impresión (vista previa) de las dos hojas y Reportes con datos del seed; guarda capturas en `docs/capturas-taller/`.
- `npx tsc --noEmit`, `npm run lint`, `git diff --check` limpios. Actualiza `docs/TALLER-MECANICO.md` (estados, tablas, configuración de plantillas y modo simulado) y `MODULOS.md`.

## Entrega
Commits por fase (`feat(taller): enviar aprobación, listo y estado por WhatsApp`, `feat(taller): seguimiento público y consulta para bots`, `feat(taller): impresión de recepción y cotización`, `feat(taller): reportes del taller`, `chore(taller): demo con histórico y pruebas`). Reporte breve: qué quedó, qué verificaste visualmente y qué no, qué dejaste pendiente y por qué, y hash de cada commit. **No envíes nada real a Meta en ningún momento.**
