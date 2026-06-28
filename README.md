# AmbarCRM — CRM conversacional con WhatsApp

> Nombre de trabajo: **AmbarCRM** (cambiable). Producto interno de Ámbar Rojo para **vender a clientes**.

CRM tipo **Kommo / Leadsales**: embudos de ventas en tablero kanban arrastrable, gestión de
contactos/leads, y **bandeja de chat de WhatsApp** integrada al embudo. La conversación vive
pegada a la oportunidad: ves el chat y mueves la tarjeta por el embudo desde la misma pantalla.

---

## Decisiones de arquitectura (Fase 0)

| Tema | Decisión | Por qué |
|------|----------|---------|
| **Modelo de negocio** | **Multi-tenant** (BD compartida + `org_id` + RLS). Antes era single-tenant. | Habilita ser **Tech Provider de Meta**: onboardear el WhatsApp de cada cliente desde un panel central, sin un deploy por cliente. Ver `MULTI-TENANT.md`. |
| **Stack** | **Next.js 14 full-stack** (App Router + API Routes) + Tailwind + shadcn/ui + **PostgreSQL self-hosted (Docker)** + Prisma + Auth.js (NextAuth) | Reusar todo lo de GestorLegal. Sin stack nuevo a media obra. |
| **WhatsApp** | **Evolution API ahora → Cloud API oficial (coexistencia Meta) después** | Validar rápido con QR sin trámites; arquitectura con capa de abstracción de canal para migrar sin reescribir. |
| **Chat en tiempo real** | **SSE** (Server-Sent Events) alimentado por Postgres `LISTEN/NOTIFY`; fallback a polling | Sin Supabase realtime. n8n recibe el webhook de Evolution → escribe en Postgres → `NOTIFY` → el navegador recibe el mensaje al instante. |
| **Ingesta de mensajes** | **n8n** recibe los webhooks de Evolution/Meta y llama a los endpoints `/api/wa/*` del CRM | Mismo patrón de integración que GestorLegal (n8n ↔ API con `x-api-key`). |
| **Deploy** | Docker + EasyPanel en VPS | Igual que GestorLegal. |

### La capa de abstracción de canal (clave para la migración Evolution → Meta)

Toda la app habla con una interfaz `ChannelProvider` (`enviarTexto`, `enviarMedia`, `normalizarEntrante`).
Hay dos implementaciones: `EvolutionProvider` (hoy) y `CloudApiProvider` (después). La tabla
`canales_whatsapp` guarda qué proveedor usa cada número. Migrar a coexistencia oficial = configurar
un canal nuevo con `proveedor = 'cloud_api'`; **ni la UI ni la lógica del embudo cambian**.

> **Coexistencia oficial de Meta** = usar la app de WhatsApp Business y la Cloud API sobre el mismo
> número a la vez (chats sincronizados). Requiere ser *Tech Provider* de Meta, verificación de negocio
> y *Embedded Signup*. Se hace en la fase de migración, no en el MVP.

---

## Alcance del MVP

1. **Embudos kanban** — múltiples embudos, etapas configurables, tarjetas (oportunidades) arrastrables entre etapas, etapas de ganado/perdido.
2. **Contactos / leads** — alta manual y automática (desde WhatsApp), datos, etiquetas, responsable, fuente del lead.
3. **Bandeja de chat WhatsApp** — lista de conversaciones, hilo de mensajes, enviar/recibir texto y media, no leídos, respuestas rápidas (plantillas).
4. **Multiusuario básico** — roles admin/agente, asignación de responsable a contactos/oportunidades/conversaciones.
5. **Tareas y notas** sobre oportunidades (recordatorios de seguimiento).

**Fuera del MVP (fases siguientes):** triggers visuales avanzados, bots/respuestas con IA,
coexistencia oficial Meta, facturación/planes, horario de atención, reportes exportables.

> **Nota de migración:** se agregó la tabla `ajustes` (automatizaciones). En una BD ya existente
> corre `npx prisma db push` (o aplica el bloque `ajustes` de `schema.sql`); en deploy nuevo se crea sola.

---

## Artefactos

| Archivo | Qué es | Estado |
|---------|--------|--------|
| `modelo-datos.md` | Entidades, relaciones y decisiones del modelo | ✅ |
| `schema.sql` | Esquema Postgres completo + seed + trigger NOTIFY | ✅ |
| `web/` | App Next.js completa (front + API) | ✅ MVP |
| `docker-compose.yml` + `web/Dockerfile` | Despliegue | ✅ |
| `DESPLIEGUE.md` | Guía local + EasyPanel | ✅ |
| `INTEGRACION-N8N.md` | Conexión WhatsApp vía n8n/Evolution | ✅ |
| `MULTI-TENANT.md` | Migración a multi-tenant (org_id + RLS) para Tech Provider | ✅ código, validar en local |

## Estado MVP (todos los módulos construidos)

| Módulo | Estado |
|--------|--------|
| Auth + roles (admin/agente) | ✅ |
| App shell responsive | ✅ |
| Embudos kanban (drag & drop) | ✅ |
| Ficha de oportunidad (notas/tareas/timeline) | ✅ |
| Bandeja de chat WhatsApp + SSE en vivo | ✅ |
| Contactos + etiquetas | ✅ |
| Tareas | ✅ |
| Configuración (embudos/etapas/usuarios/canal/plantillas) | ✅ |
| Capa de canal Evolution → Meta | ✅ |
| Conexión WhatsApp por QR desde el CRM | ✅ |
| Ingesta de webhooks (para n8n) | ✅ |
| Dashboard de ventas (home con métricas) | ✅ |
| Enviar imágenes/archivos en el chat | ✅ |
| Plantillas con variables (`{{nombre}}`) | ✅ |
| Recordatorios de tareas (vencidas/hoy + badge) | ✅ |
| Automatizaciones: auto-asignar leads + bienvenida | ✅ |
| Media entrante (descarga) + acuses ✓✓ enviado/entregado/leído | ✅ |
| Puente chat↔embudo (oportunidades, reasignar, cerrar desde el chat) | ✅ |
| Notificaciones de chat (sonido + navegador) | ✅ |
| Búsqueda/filtros (chat y contactos) + importación CSV | ✅ |
| Bots de n8n (compatible Chatwoot: webhook + API + handoff) | ✅ |
| Lead automático + bot mueve el embudo (`actualizar_funnel`) | ✅ |
| CSAT (encuesta de satisfacción) + KPI en dashboard | ✅ |
| Etiquetas de conversación + filtros de bandeja | ✅ |
| Notas internas + sugerencia de respuesta con IA (Claude) | ✅ |
| Horario de atención (fuera de horario) + auto-resolver | ✅ |
| Panel del contacto: renombrar, datos/notas y lead editable desde el chat | ✅ |
| Atajos de plantilla con `/`, recordatorio de seguimiento | ✅ |
| Difusión por etiqueta + reportes CSV (oportunidades/CSAT) | ✅ |
| Deploy Docker/EasyPanel | ✅ |

> ⚠️ El código está escrito para compilar pero **no se ha verificado con `npm run build`**
> (sin entorno Node aquí). Validar al levantar `web/` en local antes de producción.

---

**Creado:** 2026-06-12 · **MVP completo:** 2026-06-13
