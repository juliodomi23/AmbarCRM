# Plan de cierre · Fase 2 (lo que falta)

> Actualizado: 2026-10-10. Sustituye la sección "Orden de trabajo" de `PLAN-MODULOS-FASE-2.md`
> para lo que queda. Las reglas de la §0 de ese plan siguen vigentes.
> Escrito para que una sesión nueva (Claude o Codex) pueda ejecutarlo sin contexto previo.

## 1. Dónde estamos

Rama `modulos-fase-2` (local, **todavía no subida a GitHub**). Producción = `meta-tech-provider`,
no se toca ni se despliega hasta que Meta apruebe la App Review.

| Bloque | Estado | Commits |
|---|---|---|
| Paso 0 · cantidades decimales | ✅ | anteriores |
| A1 · caja, turnos y corte | ✅ | 68aa1bc, d0745ee |
| A2 · devoluciones, apartados, fiado | ✅ | 66384c1, dab668e |
| B · cotizaciones | ✅ | fdd64a5, 97bc842 |
| C · pedidos en línea + catálogo público | ✅ | ae81f03, 71f61f2 |
| A3 · precios, promociones, etiquetas | ✅ | 87a7089, 64b6d1b, c602e86 |
| A4 · reportes y varias cajas | ✅ (falta 1 fix, ver 3.1) | 0805888, 8480e9e |
| API del bot (rama `bot-api-v1`) | ✅ integrada | merge b1a36d0 |
| **Fix de A4 (envío)** | ✅ | 75bc943 |
| **D · reseñas de Google** | ✅ | b9ac2f6, bc91dcd y el commit de los fixes de revisión |
| **A5 · modo sin internet** | ⏳ | — |
| **Revisión final + despliegue** | ⏳ (despliegue espera a Meta) | — |

Estado de pruebas en b1a36d0 (BD desechable): tsc, eslint y build OK; `actualizaciones.sql` 3 veces OK;
aislamiento en 73 tablas; todas las pruebas de concurrencia, e2e (A1, A2, B, C, A3, A4) y
`test-bot-api.ts` en verde; los 22 `scripts/check-*.ts` en verde.

## 2. Reglas prácticas (además de la §0 del plan original)

- **No hacer commit** de estos cambios locales del usuario: `web/src/app/login/page.tsx`,
  `web/src/proxy.ts` (prefijo `demo`), `web/src/app/demo/`, `web/src/components/demo/`.
  Agregar archivos uno por uno o con `git add -p`; nunca `git add -A`.
- Nunca usar producción ni el contenedor `ambarcrm-db`. Pruebas solo en un Postgres desechable:

```bash
docker run -d --name ambarcrm-prueba -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test \
  -e POSTGRES_DB=crm -p 55450:5432 postgres:16
# desde web/
DATABASE_URL=postgresql://dueno:dueno_test@localhost:55450/crm npx prisma db push --skip-generate
docker exec -i ambarcrm-prueba psql -U dueno -d crm -v ON_ERROR_STOP=1 -q < prisma/sql/multi-tenant.sql
for n in 1 2 3; do docker exec -i ambarcrm-prueba psql -U dueno -d crm -v ON_ERROR_STOP=1 -q < prisma/sql/actualizaciones.sql; done
docker exec ambarcrm-prueba psql -U dueno -d crm -c "ALTER ROLE crm_app PASSWORD 'app_test'"
```

- Variables para las pruebas:
  `ADMIN_DATABASE_URL=postgresql://dueno:dueno_test@localhost:55450/crm`,
  `DATABASE_URL=postgresql://crm_app:app_test@localhost:55450/crm`,
  `META_TOKEN_ENCRYPTION_KEY=<base64 de 32 bytes>`, `NEXTAUTH_URL=https://crm.prueba.test` (para
  `test-bot-api.ts`). Las e2e necesitan la app levantada (`npx next start -p 3118`, con
  `NEXTAUTH_URL=http://127.0.0.1:3118`) y `E2E_BASE_URL=http://127.0.0.1:3118`.
- Regresión completa = tsc, lint, build, `actualizaciones.sql` 3 veces, `test-aislamiento.ts`,
  **todos** los `prisma/scripts/test-*.ts` (menos `test-lealtad-aurum.ts`, que necesita un Aurum real)
  y **todos** los `scripts/check-*.ts`.
- Cada protección de concurrencia se reporta **sin** y **con** la protección.
- Commit por cada paso que funcione; si la sesión se corta, no se pierde trabajo.
- Al terminar, borrar el contenedor y apagar la app **por puerto**, nunca por nombre de ventana.

## 3. Lo que falta, en orden

### 3.1 Fix de A4 · el envío no es ingreso de producto (chico)

`ingresosNetosPorPartida` (`web/src/lib/venta-importes.ts`) reparte `venta.total` entre las partidas;
en pedidos web ese total incluye `costoEnvio`. Eso infla el ingreso y la utilidad por producto, y una
devolución parcial reembolsa parte del envío.

- Repartir `total − costoEnvio` entre las partidas (lo usan reportes **y** devoluciones).
- En el reporte de ingresos, el envío va como renglón propio "Envíos".
- Las devoluciones parciales no reembolsan envío.
- Prueba: un pedido de $100 más $50 de envío, con costo $60, da utilidad de producto $40 y envíos $50.
  Al devolver todo, el reembolso es de $100.

### 3.2 D · Reseñas de Google 🛑 (mediano)

Especificación en `PLAN-MODULOS-FASE-2.md` §D (referencia: `productos-nfc/maquina-resenas`). Reglas clave:

- `/opinion/<empresa>?o=<origen>` guarda la calificación y **siempre** redirige a Google, sin
  importar la estrella. Solo redirige al enlace configurado por la empresa (https y dominio de Google:
  `g.page`, `google.com`, `maps.app.goo.gl`), nunca a una URL que venga en el query (open redirect).
- El origen se normaliza: minúsculas, `[a-z0-9_-]`, máximo 40 caracteres; si no es válido, se usa `directo`.
- Límite por IP con `limitarIp`/`ipCliente`. Con el módulo apagado responde 404.
- **Solicitud automática** al pasar una cita a `completada` (el "atendida" del plan) o una venta a
  `entregada`. Las ventas de mostrador quedan fuera porque nunca pasan por "entregada"; hay que
  documentarlo.
  - Dentro de la ventana de 24 h se manda texto; fuera, la plantilla aprobada.
  - Sin plantilla o sin canal, no se envía y queda una nota interna.
  - Reutilizar el patrón de `lib/pedidos-envio.ts`.
- Una sola solicitud por contacto cada N días (configurable, default 90). Se protege con UNIQUE o con
  bloqueo, no solo con un `if`.
  - Prueba de concurrencia: dos eventos simultáneos dan 1 solicitud.
- El envío de WhatsApp va **fuera** de la transacción del cambio de estado: si Meta falla, la cita o
  la venta cambian de estado de todos modos.
- Panel `/resenas`: promedio, distribución, tendencia semanal en zona local, conteo por origen y QR
  por origen. Si no hay generador de QR en el repo, hacer uno propio en SVG, sin dependencias nuevas.
- Las tablas nuevas llevan `org_id` DEFAULT, RLS y GRANT, y deben pasar `test-aislamiento.ts`.
- Commits: (1) tablas, página pública y panel; (2) solicitud automática con su prueba de concurrencia.

### 3.3 A5 · Modo sin internet 🛑 (grande, el más delicado)

Especificación en `PLAN-MODULOS-FASE-2.md` §A5. Reglas clave:

- **Alcance:** solo la pantalla `/caja`. Nada más del CRM funciona sin red.
- **Service Worker propio** (sin librerías nuevas):
  - cachea el shell de `/caja` y el catálogo (productos, precios ya calculados por el motor de A3,
    promociones vigentes y listas);
  - el catálogo se refresca al abrir la caja y cada N minutos con red.
- **Cola local en IndexedDB.** Cada venta lleva su `uuid_cliente`, que ya es idempotente desde A1.
  - Al volver la red, la cola se sube en orden.
  - Si el servidor responde 4xx, la venta se marca con error visible para el Encargado, no se
    reintenta sin fin, y la cola sigue.
  - Si responde 5xx o hay fallo de red, se reintenta con espera.
- **Precio sin red:** el servidor recalcula al subir.
  - Si su total difiere del cobrado sin red, se respeta lo cobrado (la venta ya ocurrió).
  - La diferencia queda marcada para revisión, sin bloquear la cola.
  - Hay que decidir y documentar cómo se registra.
- **Inventario negativo a propósito** solo para ventas que llegan de la cola sin red.
  - Se marcan, se muestran claro en pantalla y se corrigen con un ajuste.
  - Las ventas en línea siguen rechazando la sobreventa.
- **Requieren conexión:** ventas a crédito, apartados, notas de crédito, devoluciones y abrir o
  cerrar turno.
  - El turno debe estar abierto antes de perder la red.
  - Si el turno se cerró en el servidor mientras la caja estaba sin red, las ventas encoladas igual
    entran a ese turno o al siguiente. Hay que definirlo y probarlo con el corte.
- **Pruebas:**
  - reenviar la cola dos veces no duplica nada;
  - dos cajas sin red no pierden ventas;
  - una venta sin red del último producto contra una venta con red da existencia −1, marcada;
  - el corte cuadra con las ventas que llegan tarde.
- Commits: (1) SW y catálogo en caché; (2) cola y subida idempotente; (3) inventario negativo
  marcado y UI.

### 3.4 Pendientes menores (decidir; no bloquean)

| Tema | Detalle | Sugerencia |
|---|---|---|
| Firma HMAC sin marca de tiempo | `X-AmbarCRM-Signature` firma solo el cuerpo; un mensaje capturado se puede reenviar | Agregar `X-AmbarCRM-Timestamp` dentro de lo firmado y rechazar en n8n los mayores a 5 min |
| Round-robin del handoff | Reparte entre **todos** los usuarios activos (incluye Cajeros) | Limitar a quienes tienen acceso a Conversaciones |
| `bot_on` | El bot puede reactivarse en una conversación que un humano apagó | Aceptarlo solo si el responsable no es humano, o quitarlo |
| Reportes en memoria | Cargan todas las ventas del rango (máx. 1 año) | Bien para negocios chicos; pasar a SQL agregado si una empresa crece |
| `test-lealtad-aurum.ts` | Necesita un Aurum de pruebas real | Correrlo antes de desplegar |

### 3.5 Revisión final y despliegue (después de D y A5)

1. Revisar todo `modulos-fase-2` contra `meta-tech-provider` (diff completo, con atención a
   multi-tenant, dinero y rutas públicas).
2. Ensayar la migración en una **copia** de la BD de producción: restaurar el dump en un contenedor
   desechable, correr `actualizaciones.sql` 2 veces y verificar:
   - que los bots existentes quedan con permisos `leer_perfil, enviar_mensaje, notas_internas,
     mover_embudo, handoff`;
   - que `test-aislamiento.ts` pasa.
   - **Zona horaria de columnas:** la BD de pruebas creada con `db push` usa `timestamp` SIN zona y
     producción usa `timestamptz`; verificar en el ensayo con la copia de producción que reportes,
     vigencias y tendencias (cotizaciones, promociones, reseñas) den igual.
   - **Operativo (Meta):** crear y aprobar, por cliente, la plantilla de reseña (`{{1}}` nombre,
     `{{2}}` enlace); sin ella la solicitud fuera de la ventana de 24 h queda omitida.
3. **Sólo con la App Review aprobada:** merge a `meta-tech-provider` y despliegue.
4. Variables nuevas en EasyPanel:
   - `IP_HEADER`: `x-real-ip` por defecto. Si el dominio pasa por Cloudflare con nube naranja, usar
     `cf-connecting-ip`.
   - opcionales: `BOT_RATE_LIMIT_MAX`, `BOT_RATE_LIMIT_WINDOW_MS`, `BOT_AUTH_FAIL_MAX`,
     `BOT_AUTH_FAIL_WINDOW_MS`.
5. Crons nuevos con `x-api-key = WA_API_KEY`, además de los existentes (`auto-resolver`,
   `enviar-programados`, `recordatorios-citas`):
   - `POST /api/cron/vencer-apartados` (diario)
   - `POST /api/cron/vencer-cotizaciones` (diario)
   - `POST /api/cron/vencer-pedidos` (cada hora)
6. n8n: los bots existentes siguen funcionando igual, porque sin secreto no se firma. Para activar la
   firma, regenerar el secreto en Configuración → Bots y verificar en n8n (ver `docs/api-bot.md`).
7. Prueba de humo en producción (DESPLIEGUE.md §5) más: venta de caja, pedido web, cotización
   pública y una llamada del bot.

## 4. Estimación

| Paso | Tamaño |
|---|---|
| 3.1 fix A4 | 1 sesión corta |
| 3.2 D | 1 sesión |
| 3.3 A5 | 2-3 sesiones |
| 3.5 revisión final | 1 sesión |
