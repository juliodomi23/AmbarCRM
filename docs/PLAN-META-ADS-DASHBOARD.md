# Plan: módulo Meta Ads en AmbarCRM

Fecha: 2026-11-17. Ver matriz de permisos ya hecha en [META-ADS-APP-REVIEW.md](META-ADS-APP-REVIEW.md).

## Objetivo
Que el cliente vea en el CRM (no en Ads Manager): qué anuncio le funciona mejor/peor, cuánto ha gastado en el mes, más amigable que Meta. Parte 3 (qué le funciona a otros creadores de su giro) se recorta a un buscador de Ad Library por palabra clave, no benchmarking real — Meta no da métricas de competidores vía API.

## Fases

### Fase 1 — App Review (bloqueante, 1-2 semanas de cola de Meta)
- Permiso `ads_read` (Advanced Access) sobre la app ya aprobada para Messenger/WhatsApp.
- Confirmar en panel: Business Verification, Facebook Login for Business, activos seleccionables.
- Grabar el caso de uso: login → autorizar → elegir cuenta publicitaria → ver dashboard de resultados reales.
- NO pedir `ads_management` todavía — no hay feature de crear/pausar campañas, solo lectura.

### Fase 2 — Integración (paralela a la cola de Meta)
- OAuth: nuevo flujo "Conectar cuenta publicitaria" por organización (tabla nueva, ej. `metaAdsConexion`: orgId, adAccountId, accessTokenEncrypted, expiraAt — mismo patrón de `calendarioConectado`).
- Sync: cron (cada 1-6h) que llama `GET /act_<id>/insights` con `fields=spend,ctr,cpm,actions` por anuncio, guarda snapshot diario en tabla `metaAdsInsight` (orgId, adId, fecha, spend, ctr, cpa, impresiones).
- Todo acceso a estas tablas pasa por `transaccionTenant`/`runWithOrg` (RLS) — no usar el cliente `db` global.

### Fase 3 — Dashboard
- Ranking de anuncios por CPA/CTR (mejor/peor), gasto acumulado del mes vs. anteriores, gráfica simple de gasto diario.
- Reusar layout de módulos ya existentes (Despacho/Contenido) para no reinventar.

### Fase 4 — "qué le funciona a otros" (recortado)
- Widget de búsqueda en Meta Ad Library API (pública, sin permiso especial) por palabra clave/giro del cliente.
- Muestra anuncios activos de la competencia, sin métricas de spend/performance (Meta no las expone).
- Etiquetar claramente en la UI que es "anuncios públicos de tu industria", no benchmarking de resultados.

## Fuera de alcance v1
- Crear/editar/pausar campañas (`ads_management`) — se evalúa después si el cliente lo pide.
- Benchmarking real de competidores (requeriría una API de pago tipo Pathmatics).

## Siguiente paso
Enviar a Meta la solicitud de `ads_read` en cuanto el flujo de conexión (Fase 2, mínimo OAuth) esté demostrable — Meta pide ver la acción funcionando, no solo el scope en código.
