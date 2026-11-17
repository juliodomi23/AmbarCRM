# Prompt para implementar el módulo Meta Ads (vía OpenRouter)

Plan completo: [PLAN-META-ADS-DASHBOARD.md](PLAN-META-ADS-DASHBOARD.md). Matriz de permisos: [META-ADS-APP-REVIEW.md](META-ADS-APP-REVIEW.md).

---

Estás trabajando en AmbarCRM (Next.js + Prisma + Postgres multi-tenant con RLS, repo en `web/`). Implementa la Fase 2 del plan: la integración de Meta Marketing API para un nuevo módulo de Meta Ads.

**Contexto del stack:**
- Multi-tenant con RLS: toda lectura/escritura a tablas protegidas debe pasar por `transaccionTenant(orgId, tx => ...)` o `runWithOrg(orgId, () => ...)` (ver `web/src/lib/calendario/oauth.ts` como referencia de patrón). Nunca usar el cliente `db` global suelto para escrituras — RLS lo filtra silenciosamente a 0 filas sin lanzar error visible.
- Ya existe un patrón idéntico de OAuth + token refresh para Google Calendar en `web/src/lib/calendario/`. Sigue esa misma estructura para Meta (conexión por org, token cifrado, refresh automático).
- No hay nada de Marketing API todavía en el repo — esto es 100% nuevo, no estás migrando código existente.

**Qué construir (solo lectura, `ads_read` — NO `ads_management`, no hay feature de crear/pausar campañas en esta fase):**

1. Tabla `metaAdsConexion` (Prisma): `orgId`, `adAccountId`, `accessTokenEncrypted`, `tokenExpiraAt`, `estado`, `ultimoError`. Mismo patrón de `calendarioConectado`.
2. Tabla `metaAdsInsight`: `orgId`, `adId`, `nombreAnuncio`, `fecha`, `spend`, `ctr`, `cpa`, `impresiones`. Snapshot diario, no acumulativo.
3. Flujo "Conectar cuenta publicitaria" (UI + OAuth): el admin autoriza, elige su cuenta publicitaria (`act_<id>`), se guarda la conexión.
4. Job de sync (cron, cada 1-6h): `GET /act_<id>/insights?fields=spend,ctr,cpm,actions&level=ad` por org conectada, upsert en `metaAdsInsight`.
5. Dashboard simple: ranking de anuncios por CTR/CPA (mejor/peor), gasto acumulado del mes, gráfica de gasto diario. Reusa el layout de los módulos Despacho/Contenido que ya existen en el repo — no inventes un diseño nuevo.
6. Refresh de token: igual lógica que `tokenCalendario()` pero para el token de Meta — cuidado con el bug que ya se encontró ahí (usar `transaccionTenant`, nunca el `db` global; y si extraes un valor narrowed de un `if` guard para usarlo dentro de un closure, asígnalo a un `const` local primero o TypeScript pierde el narrowing).

**No construir en esta fase:**
- Nada de `ads_management` (crear/editar/pausar campañas).
- Nada de Lead Ads ni `leads_retrieval`.
- Benchmarking de competidores (eso es un widget de Ad Library API, aparte, ver Fase 4 del plan — no lo mezcles aquí).

**Al terminar:**
- Corre `npx tsc --noEmit -p .` antes de entregar, que no rompa el build.
- No hace falta tocar nada de App Review ni variables de entorno de producción — esto se prueba primero con una cuenta publicitaria de prueba/sandbox del admin de la app, antes de pedir el permiso a Meta.
