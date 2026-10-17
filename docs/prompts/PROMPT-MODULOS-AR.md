# Prompt para Codex — rama `modulos-ar`

> Copia desde "## Prompt" hasta el final y pégalo en Codex.
> Objetivo: usar **AmbarCRM como el CRM interno de Ámbar Rojo Studios**: prospectos, clientes
> trabajando, cobros, fechas de pago y MRR, con datos reales.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM/web`, Next.js + Prisma + Postgres con
RLS multi-tenant). Objetivo: que **Ámbar Rojo Studios sea una organización más del CRM** y lleve
ahí su propia operación comercial y de cobranza. No es un CRM nuevo: reutiliza lo que ya existe.

### 0. Rama y reglas

- Crea la rama `modulos-ar` a partir de `modulos-fase-2` (la Fase 2 está en pausa hasta Meta; no
  mezcles nada con `main`). Commits pequeños por paso, en español, estilo `feat(ar): …`.
- Lee antes de escribir: `MODULOS.md`, `MULTI-TENANT.md`, `web/src/lib/modulos-catalogo.ts`,
  `web/prisma/sql/actualizaciones.sql` y un módulo pequeño ya terminado (Reseñas o Cotizaciones)
  como patrón. **Copia su forma**, no inventes otra.
- Reglas del repo que no se negocian: toda tabla con `org_id` DEFAULT `app.current_org`, RLS
  `org_isolation` y GRANT en `actualizaciones.sql`; reflejar en Prisma; rutas con
  `requireModuloActivo("clave")`; importes con `Prisma.Decimal` calculados en servidor; escrituras
  concurrentes dentro de `transaccionTenant()` con bloqueo; crons con `x-api-key: WA_API_KEY` que
  recorren todas las orgs y siguen aunque una falle.
- Simplicidad: sin abstracciones nuevas, sin dependencias nuevas, sin funcionalidades que no estén
  en este prompt. Si algo del prompt choca con lo que ves en el código, gana el código: avisa y
  propone, no inventes.

### 1. Qué reutilizar (no duplicar)

| Necesidad AR | Ya existe |
|---|---|
| Prospectos y clientes como personas/empresas | `Contacto` (+ etiquetas) |
| Pipeline de ventas | `Embudo` / `Etapa` / `Oportunidad` (valor, fecha de cierre estimada, motivo de pérdida) |
| Cotizar | módulo Cotizaciones (aceptar puede ganar la oportunidad) |
| Seguimiento y pendientes | `Tarea`, `Nota` |
| Aviso por WhatsApp | canal oficial + plantillas aprobadas (texto libre solo dentro de 24 h) |

El embudo de AR se siembra con etapas: **Prospecto → Contactado → Cotizado → Negociación → Ganado →
Perdido** (tipos de etapa según `TipoEtapa`).

### 2. Módulos nuevos (3, no más)

Regístralos en `modulos-catalogo.ts`: área "Ámbar Rojo", icono SVG, acceso por puesto (por defecto
Administrador y el puesto de socio que ya exista; si no existe, solo Administrador).

**a) `contratos` — Servicios contratados** (`/contratos`)
Un contrato = un servicio de un cliente (un mismo cliente puede tener varios: bot + web).
Campos: contacto (cliente), `tipo` (`bot_whatsapp`, `bot_facebook`, `agente_odoo`, `web`, `seo`,
`panel`, `otro`), `estado` (`en_desarrollo`, `en_pruebas`, `produccion`, `pausado`, `baja`,
`incobrable`), `monto_cierre` (pago único, puede ser 0), `anticipo_pct` (50 por defecto),
`mensualidad`, `dia_cobro` (1–28, **opcional**: sin día no se generan mensualidades y el panel
lo marca "sin día de cobro"), `inicio_mensualidad` (date; **la mensualidad no corre antes**),
`fecha_baja`, `notas`, oportunidad de origen opcional.
Regla: el MRR cuenta solo contratos en `produccion` con `inicio_mensualidad <= hoy` (o vacío, si ya cobra).

**b) `cobros` — Cobros y fechas de pago** (`/cobros`)
Un cobro = un cargo con vencimiento: `contrato_id`, `concepto` (`anticipo`, `balance`,
`mensualidad`, `extra`), `periodo` (date, primer día del mes; solo mensualidades), `monto`, `vence`
(date), `estado` (`pendiente`, `pagado`, `vencido`, `incobrable`, `cancelado`), `pagado_en`,
`metodo` (`transferencia`, `tarjeta`, `efectivo`, `mercado_pago`), `referencia`, `nota`.
- Único `(contrato_id, concepto, periodo)` para que el cron nunca duplique.
- **Generación:** cron `/api/cron/generar-cobros` crea la mensualidad del mes siguiente para cada
  contrato elegible (idempotente por el único) y pasa `pendiente → vencido` cuando `vence < hoy`.
  Al crear un contrato con `monto_cierre > 0` se generan anticipo (`anticipo_pct`) y balance.
- **Marcar pagado:** idempotente, bloqueando la fila; no permite pagar dos veces ni pagar un
  `cancelado`. Solo Administrador marca `incobrable` o cancela, y exige nota.
- **Recordatorio:** botón "Recordar por WhatsApp" por cobro (texto dentro de 24 h, plantilla fuera).
  **Nunca automático** en esta rama: apagado por defecto en la config del módulo, y los seeds y
  pruebas jamás envían nada real.

**c) `panel_ar` — Panel Ámbar Rojo** (`/panel-ar`)
Solo lectura, sin tablas propias (consultas sobre las dos anteriores + oportunidades):
- MRR hoy y MRR proyectado (contratos que aún no arrancan), clientes en producción / en desarrollo.
- Por cobrar: vencido, vence en 7 días, vence este mes; cobrado del mes; incobrables.
- Calendario de cobros del mes (lista por fecha, color por estado).
- Pipeline: valor abierto por etapa (solo suma de valores; no inventes probabilidades).
- **Reparto de comisiones** por cobro pagado, configurable en `config` del módulo: proyecto nuevo
  70 % CTO / 30 % CEO; mensualidad 50 / 50 después de restar crédito IA (`credito_ia_mxn`, 100 por
  defecto, **una vez por cliente**, no por contrato: Villafuerte tiene dos). Es informativo; no
  mueve dinero.
- Exportar CSV con la protección de fórmulas común del repo.

### 3. Datos reales para el seed (`scripts/seed-ambar-rojo.mjs`)

Idempotente (correrlo dos veces no duplica). Crea la org `ambar-rojo` con `contratos`, `cobros`,
`panel_ar`, Cotizaciones y Tareas activos. **No metas teléfonos, correos ni secretos reales**: usa
placeholders `+52 000 000 0000`. Fuente: `docs/03-clientes`, `docs/05-financiero` y
`docs/00-resumen` del repo padre (`D:\AmbarRojo\Documentos de ambar rojo`).

**Clientes y contratos (⚠️ = confirmar antes de darlo por bueno):**

| Cliente | Servicio | Cierre | Mensualidad | Estado / notas |
|---|---|---|---|---|
| Villafuerte y Asociados | **2 contratos:** (1) `bot_whatsapp` asistente a clientes; (2) `otro` "bot interno / GestorLegal" | $6,500 pagado (en el 1) | (1) $1,200 + (2) $800 = **$2,000** | producción; `dia_cobro` **5** |
| Dentu | `bot_whatsapp` bot de citas | pagado/sin saldo ⚠️ | **$1,200** | producción ⚠️ (antes figuraba "en desarrollo"); `dia_cobro` **5** |
| Serénica Health Center | `bot_whatsapp` asistente externo (solo este; el bot FB no cuenta) | $4,500 pagado | **$1,200** | producción; `dia_cobro` **5** |
| Alwater | `agente_odoo` agente WhatsApp sobre Odoo | $12,000 **pagado completo**, sin saldo | **$1,500** | `dia_cobro` **vacío** (aún no se sabe); no genera cobros hasta que se defina |
| Exi Chiapas | `bot_whatsapp` agente base + publicidad segmentada | $12,000, **ya dio anticipo** | por definir | en desarrollo; anticipo recibido ⚠️ confirmar monto (¿50 % = $6,000?), balance pendiente; oportunidad **ganada**; sin mensualidad todavía |
| SEMBID (Edwin Monge) | `bot_whatsapp` agente con agenda + BILLDU | **$0 — trueque** (nota: acuerdo especial, no es cierre normal) | $1,200 ⚠️ "creo", confirmar | estado ⚠️ confirmar; `dia_cobro` vacío; oportunidad **ganada** con valor 0 |
| Futura Fortuna | bot "Valeria" WA + bot FB | pagado | — | **baja** ⚠️ fecha por confirmar; sin cobros pendientes |
| Pie Feliz | bot + web | $7,000 + $2,000 pagados | $1,200 | **baja 2026-07-08**, sin pendientes |
| Huipix | bot cotización de envíos | $4,000 | — | **terminado 2026-06-22**, cierre `incobrable` |

MRR esperado con estos datos: **$4,400** en producción (Villafuerte 2,000 + Dentu 1,200 + Serénica
1,200); **+ $1,500** cuando Alwater tenga día de cobro y **+ $1,200** si se confirma SEMBID. Úsalo
como verificación del panel.

**Alianza (sin cobro):** Coparmex — contacto con etiqueta `aliado`, sin contrato.

**Prospectos (oportunidades abiertas, valor = cotización):**
Colegio de Arquitectos Chiapanecos (cotización enviada ⚠️ monto en su carpeta) · Energía Cero · Rubí Perfumería ·
Leyva Asesores — Panel 25 puntos · CrmLite/remarketing WhatsApp · Tour por México · Porfirio
Consultor — automatización de faltantes en entrega · VendoApp (colaboración). Si el monto no está
en la carpeta del prospecto, déjalo en 0 y crea una `Tarea` "definir monto" para el CEO.

**Regla de oro del seed:** donde el doc esté desactualizado o dudoso (el índice de clientes es de
junio), **no adivines**: deja el campo vacío y una `Nota` en el contacto con el origen y la duda.
La lista de ⚠️ debe terminar en el reporte final.

### 4. Pruebas (en esta rama, con esta data)

Sigue el patrón de los `check-*.ts` y `test-*.ts` existentes:

1. `scripts/check-contratos-cobros.ts` — funciones puras: elegibilidad de MRR, generación de
   mensualidades, fechas (febrero, días 29–31 → tope 28), reparto de comisiones con Decimal.
2. `prisma/scripts/test-concurrencia-cobros.ts` — dos "marcar pagado" simultáneos y dos corridas
   del cron simultáneas: un solo pago, cero duplicados. Con variante `COBROS_SIN_PROTECCION=1`
   que demuestre el fallo, como en Reseñas.
3. `prisma/scripts/test-aislamiento.ts` — ampliarlo: otra org no ve contratos ni cobros de AR, y
   AR no ve los de otras.
4. `prisma/scripts/test-cobros-e2e.ts` — flujo completo contra el seed: contrato nuevo → anticipo
   y balance → cron → mensualidad → pagado → el panel muestra MRR y cobrado correctos.
5. Revisión visual en navegador de `/contratos`, `/cobros` y `/panel-ar` en 375 px y escritorio.
   Capturas en `docs/capturas/` y notas en `docs/revision-visual-<fecha>.md`.

Documenta los tres módulos en `MODULOS.md` en el mismo estilo (secciones cortas, reglas y pruebas).

### 5. Entregable y límites

- Al terminar: archivos tocados, resultado literal de cada prueba (si algo falla, dilo) y la lista
  de ⚠️ sin resolver.
- **No hagas**: deploy, push a `main`, envío real de WhatsApp, cambios a `schema.sql` base sin la
  migración correspondiente, ni toques el chat de Villafuerte. Si hay que decidir algo de negocio
  (días de cobro, montos), pregúntalo en el reporte en vez de suponer.
