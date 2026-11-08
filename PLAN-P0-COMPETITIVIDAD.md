# Plan P0 de competitividad — AmbarCRM

> Objetivo: cerrar los huecos que hoy frenan ventas frente a CRMs grandes, sin intentar copiar su catálogo completo.
> Este documento es el plan. El prompt para Codex vive en `docs/prompts/PROMPT-P0-CODEX.md`.

## 1. Contexto

AmbarCRM ya tiene una base fuerte:

- WhatsApp nativo, chat, embudos, contactos, tareas y automatizaciones básicas.
- Multiempresa real: `org_id`, RLS, `runWithOrg`, Prisma extendido en `web/src/lib/db.ts`.
- Módulos por giro: citas, pacientes, reservas, caja, retail, legal, viajes, academia, lealtad, reseñas.
- Caja con modo offline, cotizaciones, pedidos en línea, tienda pública, app móvil en camino.
- Sistema visual y patrones compartidos: `EncabezadoPagina`, `PanelListado`, `FormularioModulo`, `surface`, `Boton`, `Badge`.

Lo que falta para competir no es “más pantallas”, sino **profundidad operativa, integraciones y confianza**.

## 2. Alcance P0

### Dentro del P0

1. **Pagos en línea** (Mercado Pago primero; Stripe opcional después).
2. **Facturación CFDI 4.0** (timbrado, cancelación, PDF/XML).
3. **Google Calendar bidireccional** (OAuth, sync, conflictos, Meet).
4. **Email como canal** (transaccional, bandeja, campañas, formularios).
5. **Integraciones** (Zapier/Make, eventos salientes, Google Workspace/Slack después).
6. **Meta Ads y leads reales** (lectura de campañas, formularios/leads, atribución).
7. **Constructor de automatizaciones** (disparadores, condiciones, acciones, logs).
8. **Reportes** (reportes personalizados, metas, pronóstico, envíos programados).

### Fuera del P0

- Un constructor no-code completo.
- Una suite de marketing completa estilo HubSpot.
- Contabilidad general o nómina.
- SSO/SAML empresarial (va en P1, salvo que un cliente lo exija).
- Reescritura del chat o del POS.
- Nuevas verticales.

## 3. Orden recomendado y dependencias

| Fase | Tema | Depende de | Esfuerzo orientativo (1 dev) |
|---|---|---|---|
| 0 | Descubrimiento y decisiones | — | 1–2 días |
| 1 | Pagos en línea | Fase 0 | 5–8 días |
| 2 | CFDI 4.0 | Fase 1 | 5–7 días |
| 3 | Google Calendar | Fase 0 | 5–7 días |
| 4 | Email como canal | Fase 0 | 6–9 días |
| 5 | Integraciones (Zapier/Make) | API y webhooks actuales | 3–5 días |
| 6 | Meta Ads y leads | Permisos de Meta | 5–8 días |
| 7 | Automatizaciones visuales | Fase 5 y eventos | 8–12 días |
| 8 | Reportes | Datos de fases 1–4 | 6–9 días |

Regla: **una fase por ejecución de Codex**. No avanzar a la siguiente sin revisión de Julio.

## 4. Fase 0 — Descubrimiento y decisiones

Entregables:

- ADR corto por proveedor: pagos, CFDI, email, calendario.
- Inventario de tablas/rutas existentes que se reutilizan.
- Riesgos de RLS, idempotencia, webhooks y credenciales.
- Plan de pruebas y variables de entorno.
- Confirmación de qué se implementa con sandbox/mocks y qué requiere cuenta real.

Decisiones sugeridas (a validar):

- **Pagos:** Mercado Pago Checkout Pro con **OAuth por organización**; el secreto del webhook es de la aplicación. Stripe como adaptador opcional.
- **CFDI:** Facturama o SW Sapien; adaptador para no casarse con uno.
- **Calendario:** Google Calendar primero; Outlook después.
- **Email:** reutilizar SMTP/Resend actual para transaccional; proveedor de campañas aparte.
- **Meta:** solo lectura primero (`ads_read`, `leads_retrieval`) detrás de feature flag.

## 5. Fase 1 — Pagos en línea

### Objetivo

Cobrar en línea desde una venta, cita, cotización o pedido, con conciliación y reembolsos.

### Modelo sugerido

- `credenciales_pago`: org, proveedor, access_token cifrado, refresh_token cifrado, expiración, user_id, activo.
- `pagos_online`: org, tipo de origen, origen_id, proveedor, estado, monto, moneda, **monto_reembolsado** (un solo total), referencia externa, idempotency_key, metadata, timestamps.
- `eventos_pago`: org, pago_id, proveedor, evento_id único, tipo, payload mínimo, procesado_at.
- Enlaces/checkout: guardar preferencia/URL y expiración.

### Backend

- OAuth por organización: `GET /api/pagos/oauth/iniciar` y `GET /api/pagos/oauth/callback`; guardar access/refresh token cifrados; renovar antes de 180 días; marcar “reconectar” si falla.
- Interfaz `ProveedorPago` con `crearCheckout`, `verificarWebhook`, `consultarPago`, `reembolsar`.
- Adaptador Mercado Pago y adaptador mock para pruebas.
- Ruta `POST /api/pagos/checkout`.
- Ruta webhook `POST /api/public/pagos/webhook/mercado_pago/:org` con firma de aplicación, replay protection e idempotencia.
- Cron de conciliación de pendientes, tolerante a errores por organización.
- Actualización transaccional del origen (venta/cita/cotización/pedido) solo cuando el pago esté aprobado.
- Venta cancelada o ya entregada: no se acredita; conflicto + reembolso/alerta.
- Un solo pago pendiente por origen; reintento permitido tras rechazo/cancelación.

### UI

- “Conectar Mercado Pago”, estado de conexión, vencimiento, reconectar/desconectar.
- Botón “Cobrar en línea” en caja/ventas/cotizaciones/citas según permisos.
- Estado del pago con `Badge`, enlace copiable/regenerable y total reembolsado.
- Página pública de resultado (sin afirmar pago confirmado sin token).
- Configuración del módulo: proveedor, moneda, sandbox.

### Seguridad

- Verificar firma del webhook; nunca confiar en el monto del cliente.
- Idempotencia por `evento_id` y `idempotency_key`.
- Tokens OAuth por organización cifrados; secreto de webhook por aplicación.
- No registrar tarjetas, tokens ni datos sensibles.
- Rate limit en checkout y validación de permisos.
- No revivir ventas canceladas ni aceptar pagos tardíos.
- Documentar variables en `.env.example`.

### Pruebas mínimas

- OAuth: state inválido/CSRF, code inválido, refresh, token expirado, reconexión.
- Firma inválida rechazada; webhook duplicado no duplica el pago.
- Monto/moneda distintos al origen se rechazan.
- Pago aprobado actualiza el origen en una sola transacción.
- RLS: una empresa no ve pagos de otra.
- Concurrencia: dos checkouts simultáneos dejan uno pendiente; dos eventos distintos dejan un solo estado final.
- Reembolsos parciales acumulados con un solo total; sobre-reembolso rechazado.
- Venta cancelada + pago tardío: no se acredita.
- Cron continúa si una organización falla.
- HTTP E2E del webhook y mock E2E de checkout + conciliación.

## 6. Fase 2 — CFDI 4.0

### Objetivo

Emitir, consultar y cancelar facturas desde una venta/pago, con PDF/XML y estados.

### Modelo sugerido

- `datos_fiscales`: org, contacto_id, RFC, razón social, régimen fiscal, CP, uso CFDI, correo.
- `facturas`: org, venta_id/pago_id, proveedor, UUID, serie/folio, estado, total, moneda, xml_url, pdf_url, cancelación, timestamps.
- `eventos_factura`: idempotencia y bitácora.

### Backend

- Adaptador `ProveedorFactura` con `timbrado`, `consultar`, `cancelar`.
- Validación de RFC, régimen, uso CFDI, forma/método de pago.
- Ruta `POST /api/facturas`, `GET /api/facturas/:id`, `POST /api/facturas/:id/cancelar`.
- Reintentos y conciliación.
- Guardar XML/PDF en almacenamiento privado con URL firmada o ruta protegida.

### UI

- Datos fiscales en la ficha del cliente.
- “Facturar” desde venta/pago.
- Estado de factura y descarga PDF/XML.
- Configuración del emisor (RFC, régimen, serie, certificados).

### Pruebas mínimas

- Validaciones fiscales.
- Timbrado sandbox/mock.
- Cancelación y estados.
- Idempotencia por venta/pago.
- RLS y permisos.

## 7. Fase 3 — Google Calendar bidireccional

### Objetivo

Sincronizar citas con Google Calendar sin duplicar ni perder eventos.

### Modelo sugerido

- `calendarios_conectados`: org, usuario_id, proveedor, cuenta, tokens cifrados, calendar_id, sync_token, canal, expiración.
- `eventos_calendario`: org, cita_id, proveedor, event_id, etag, estado, último_sync.

### Backend

- OAuth 2.0 con scopes mínimos.
- Crear/actualizar/borrar eventos al cambiar citas.
- Leer cambios con incremental sync y watch channels.
- Resolver conflictos con `updated`/`etag` y regla explícita (CRM gana o calendario gana, configurable).
- Zona horaria del negocio; no usar la del servidor.
- Enlace de Google Meet opcional.

### UI

- “Conectar Google Calendar” en Configuración/Perfil.
- Estado de conexión, calendario elegido, última sync.
- Manejo de errores y reconexión.

### Pruebas mínimas

- Token expirado/reconexión.
- Evento creado, editado y borrado en ambos lados.
- Conflicto de horario.
- RLS y aislamiento por usuario/empresa.
- Mock de API de Google.

## 8. Fase 4 — Email como canal

### Objetivo

Recibir y enviar correo, y hacer campañas básicas con consentimiento.

### Subfases

- 4A: bandeja de email (inbound webhook/IMAP), hilos, adjuntos, asignación.
- 4B: campañas, plantillas, secuencias, programación, rebotes, unsubscribe.
- 4C: formularios/landing pages básicas con captura de leads.

### Modelo sugerido

- `cuentas_email`, `mensajes_email`, `hilos_email`, `campanas_email`, `destinatarios_email`, `eventos_email`, `formularios`.
- Consentimiento y `opt_out` por contacto.

### Backend

- Proveedor de envío (Resend/Brevo/SendGrid) y inbound (webhook o IMAP).
- Verificación SPF/DKIM/DMARC documentada.
- Envío con idempotencia y rate limit.
- Rebotes, quejas y unsubscribe.
- Personalización con variables y validación.

### UI

- Bandeja unificada o pestaña Email en el chat.
- Constructor simple de campañas.
- Formularios con código embebible.

### Pruebas mínimas

- Inbound/outbound, adjuntos, rebotes, unsubscribe.
- Consentimiento y RLS.
- Idempotencia de webhooks.
- Límites y reintentos.

## 9. Fase 5 — Integraciones

### Objetivo

Que el cliente conecte AmbarCRM con sus herramientas sin desarrollo a medida.

### Alcance inicial

- API keys por organización y permisos.
- Catálogo de eventos salientes (`contacto.creado`, `cita.creada`, `pago.aprobado`, etc.).
- Suscripciones webhook con reintentos, firma y logs.
- Conector Zapier/Make (acciones y triggers).
- Documentación OpenAPI.

### Después

- Google Workspace, Slack, firma electrónica, contabilidad (Contpaq/Facturama).

## 10. Fase 6 — Meta Ads y leads

### Objetivo

Leer campañas/resultados y recibir leads reales con atribución.

### Alcance inicial

- OAuth y selección de cuenta publicitaria.
- Lectura de campañas, conjuntos, anuncios e insights.
- Formularios/leads (`leads_retrieval`) y creación de contactos/oportunidades.
- UTM/click IDs y origen en el contacto.
- Sin crear ni modificar anuncios en esta fase.

### Dependencias

- Permisos y App Review de Meta.
- Cuenta de prueba; nunca usar cuentas de clientes para pruebas.

## 11. Fase 7 — Automatizaciones visuales

### Objetivo

Constructor de flujos: disparador → condiciones → acciones, con historial.

### Alcance

- Disparadores: contacto creado, mensaje recibido, cita, pago, pedido, campo cambiado, programación.
- Acciones: enviar WhatsApp/email, crear tarea, mover etapa, actualizar campo, webhook, esperar.
- Reintentos, errores, límites, logs y versionado.
- UI de flujo simple; no un motor BPMN.

## 12. Fase 8 — Reportes

### Objetivo

Reportes que el cliente pueda armar y programar.

### Alcance

- Métricas por módulo, filtros, agrupaciones, comparaciones.
- Metas y pronóstico simple.
- Export CSV/PDF.
- Envío programado por email/WhatsApp.
- Guardar reportes por usuario/empresa.

## 13. Cambios de datos y RLS

Toda tabla nueva debe:

- Tener `org_id` y FK a `orgs`.
- Tener política `org_isolation` (USING y WITH CHECK).
- Tener índices por `org_id` y claves de búsqueda.
- Revocar `DELETE`/`TRUNCATE` al rol de aplicación cuando aplique.
- Aplicarse con SQL idempotente en `web/prisma/sql/actualizaciones.sql` o migración equivalente.
- Ensayarse desde `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql` en base desechable.
- Probar aislamiento con dos empresas.

## 14. Seguridad y cumplimiento

- Firmas de webhook, replay protection, idempotencia.
- Cifrado de tokens OAuth y llaves de proveedor.
- No loggear PII, tarjetas ni secretos.
- Rate limiting en rutas públicas.
- Consentimiento y opt-out para email/WhatsApp.
- Bitácora de acciones sensibles (pagos, facturas, calendario, integraciones).
- Documentar DPA/privacidad y retención.
- Sandbox por defecto; producción solo con autorización explícita.

## 15. Estrategia de pruebas

- Unitarias: validadores y adaptadores con HTTP mockeado.
- Base de datos: RLS, constraints, idempotencia, concurrencia.
- E2E: Postgres desechable + app local + proveedor mock.
- Checks estáticos: `npx tsc --noEmit`, ESLint, build.
- Evidencia: comandos, resultados, fallos previos y limpieza.

## 16. Despliegue y feature flags

- Cada fase detrás de módulo/configuración por organización.
- Desplegar primero a demo, luego a un cliente piloto.
- Migraciones con respaldo previo.
- Monitoreo de webhooks y colas.
- Documentar variables en `.env.example` y `docs/DESPLIEGUE.md`.

## 17. Riesgos

- Permisos de Meta y tiempos de App Review.
- Proveedores de CFDI con APIs distintas y ambientes sandbox limitados.
- Complejidad de sync bidireccional de calendario.
- Costos de email y reputación de dominio.
- Scope creep en automatizaciones/reportes.
- Codex puede implementar en exceso si no se le pone un límite por fase.

## 18. Preguntas para Julio

1. ¿Mercado Pago, Stripe o ambos?
2. ¿CFDI ya o después de pagos?
3. ¿Google Calendar o Outlook primero?
4. ¿Proveedor de email preferido?
5. ¿Qué cliente/demo es el piloto?
6. ¿Qué país/moneda además de México?
7. ¿Meta App Review está en curso?
8. ¿Qué fase quiere primero?

## 19. Definición de terminado (por fase)

- Código y migración listos.
- RLS y permisos probados.
- Pruebas unitarias/DB/E2E aprobadas.
- `tsc`, ESLint y build aprobados.
- Documentación y `.env.example` actualizados.
- Evidencia en un README de pruebas.
- Sin secretos ni cuentas reales.
- Revisión de Julio antes de la siguiente fase.
