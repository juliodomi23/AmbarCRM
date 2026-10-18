# Regresión previa al merge de Meta

> Actualización del 17-oct-2026: **46/46 tests y 33/33 checks pasan** tras completar el retiro forzado de Messenger. Ver la sección final fechada; las secciones iniciales conservan la preparación anterior.

Preparación del 16-oct-2026 (America/Mexico_City); nombre de informe solicitado para el 17.
Rama `preparar-merge-meta`, creada desde `modulos-fase-2` (`70e684b`).
Resultado final: **45/45 tests autorizados, 33/33 checks, TypeScript, lint, Prisma y build pasan**.
`test-lealtad-aurum.ts` fue excluido expresamente; no se conectó Aurum real.
Se conservan los cuatro fallos iniciales y las repeticiones que los resolvieron.

## Entorno y límites

- PostgreSQL 16 nuevo: `ambarcrm-premerge-20261017`, puerto publicado solo en `127.0.0.1:55450`.
- BD `crm`: `schema.sql` → `web/prisma/sql/multi-tenant.sql` → `actualizaciones.sql` tres veces,
  mediante `docker exec -i ambarcrm-premerge-20261017 psql -X -U dueno -d crm -v ON_ERROR_STOP=1`.
- Dueño `dueno`, app `crm_app` sin bypass, claves exclusivamente locales. No se usó `prisma db push`.
- App compilada en `127.0.0.1:3118`, Graph simulado con el preload existente
  `prisma/scripts/meta-facebook-simulado.mjs`; no hubo llamadas a Meta real ni a servicios de clientes.
- Se fijaron DATABASE_URL, ADMIN_DATABASE_URL, E2E_BASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET,
  META_TOKEN_ENCRYPTION_KEY, META_APP_ID, META_APP_SECRET, MESSENGER_VERIFY_TOKEN y WA_API_KEY
  de prueba. AURUM_URL, AURUM_WEBHOOK_SECRET y ANTHROPIC_API_KEY quedaron vacías.
  Se neutralizaron las variables presentes en archivos .env sin imprimir sus valores.
- Fixture AR: solo en esta BD, org 1 renombrada `ambar-rojo`, seed existente
  `seed-ambar-rojo.mjs` autorizado con ALLOW_DEMO_SEED=1, NODE_ENV=development y credenciales
  locales de las E2E. Módulo servidores habilitado en esa org. Sin canales reales ni envíos.
  Esto es una precondición de esas pruebas; no describe el slug productivo `inicial`.
- No se hizo push, deploy, ni se modificaron `meta-tech-provider`, `main` o `modulos-fase-2`.
  No se ejecutó ningún comando contra producción ni contra `ambarcrm-db`.

## Comandos y resultados

Desde `web/`: `npx --no-install tsc --noEmit`, `npm run lint`,
`npx --no-install prisma validate`, `npm run build`.
Antes se regeneró el cliente con `npx --no-install prisma generate`.
Cada test/check se invocó con `npx --yes tsx RUTA_DEL_ARCHIVO`; tsx es el ejecutor
ya usado por el repo, sin cambios en dependencias ni package-lock.
La app se inició con:

```text
node --import ./prisma/scripts/meta-facebook-simulado.mjs node_modules/next/dist/bin/next start -p 3118 -H 127.0.0.1
```

Todas las salidas y códigos reales: [ejecuciones completas](pruebas-pre-merge-2026-10-17/ejecuciones.txt)
y [resultados estructurados](pruebas-pre-merge-2026-10-17/resultados.json).
Los errores UNIQUE de los casos de duplicados son esperados si el test termina en 0.

| Comprobación | Resultado | Segundos |
|---|---|---:|
| `schema` | PASA (0) | 0.62 |
| `multi-tenant` | PASA (0) | 0.53 |
| `actualizaciones-1` | PASA (0) | 1.89 |
| `actualizaciones-2` | PASA (0) | 0.62 |
| `actualizaciones-3` | PASA (0) | 0.64 |
| `rol-prueba` | PASA (0) | 0.33 |
| `prisma-generate` | PASA (0) | 8.28 |
| `tsc` | PASA (0) | 10.17 |
| `lint` | PASA (0) | 77.64 |
| `prisma-validate` | PASA (0) | 2.66 |
| `build` | PASA (0) | 73.28 |

## Tests de prisma/scripts

| Archivo | Primera corrida | Final | Segundos final |
|---|---|---|---:|
| `test-aislamiento.ts` | PASA (0) | PASA (0) | 8.2 |
| `test-a3-e2e.ts` | PASA (0) | PASA (0) | 6.97 |
| `test-a3-fixes-e2e.ts` | PASA (0) | PASA (0) | 6.36 |
| `test-a4-e2e.ts` | PASA (0) | PASA (0) | 6.86 |
| `test-bot-api.ts` | PASA (0) | PASA (0) | 15.2 |
| `test-caja-a2-e2e.ts` | PASA (0) | PASA (0) | 7.06 |
| `test-caja-dinero.ts` | PASA (0) | PASA (0) | 6.42 |
| `test-caja-e2e.ts` | PASA (0) | PASA (0) | 6.31 |
| `test-canales-api.ts` | PASA (0) | PASA (0) | 6.5 |
| `test-canales-base.ts` | PASA (0) | PASA (0) | 5.89 |
| `test-canales-e2e.ts` | PASA (0) | PASA (0) | 6.22 |
| `test-canales-messenger.ts` | FALLA (1) | PASA (0) | 7.81 |
| `test-cobros-cancelar-eliminar-e2e.ts` | FALLA (1) | PASA (0) | 8.89 |
| `test-cobros-db.ts` | PASA (0) | PASA (0) | 6.59 |
| `test-cobros-e2e.ts` | FALLA (1) | PASA (0) | 8.67 |
| `test-concurrencia-caja-a2.ts` | PASA (0) | PASA (0) | 6.42 |
| `test-concurrencia-caja.ts` | PASA (0) | PASA (0) | 6.22 |
| `test-concurrencia-cobros.ts` | PASA (0) | PASA (0) | 5.7 |
| `test-concurrencia-cotizaciones.ts` | PASA (0) | PASA (0) | 6.11 |
| `test-concurrencia-nota-credito.ts` | PASA (0) | PASA (0) | 6.02 |
| `test-concurrencia-pedidos.ts` | PASA (0) | PASA (0) | 6.06 |
| `test-concurrencia-resenas.ts` | PASA (0) | PASA (0) | 6.92 |
| `test-concurrencia-retail.ts` | PASA (0) | PASA (0) | 11.42 |
| `test-concurrencia-sinred.ts` | PASA (0) | PASA (0) | 6.48 |
| `test-concurrencia-varias-cajas.ts` | PASA (0) | PASA (0) | 6.05 |
| `test-cotizaciones-e2e.ts` | PASA (0) | PASA (0) | 6.45 |
| `test-cotizaciones-zona.ts` | PASA (0) | PASA (0) | 5.86 |
| `test-cupos-concurrentes.ts` | PASA (0) | PASA (0) | 5.86 |
| `test-messenger-facebook-http.ts` | FALLA (1) | PASA (0) | 6.94 |
| `test-messenger-facebook-rutas.ts` | PASA (0) | PASA (0) | 6.45 |
| `test-messenger-facebook.ts` | PASA (0) | PASA (0) | 6.27 |
| `test-paridad-precios.ts` | PASA (0) | PASA (0) | 8.45 |
| `test-pedidos-e2e.ts` | PASA (0) | PASA (0) | 6.77 |
| `test-precios-promociones.ts` | PASA (0) | PASA (0) | 6.61 |
| `test-referencias.ts` | PASA (0) | PASA (0) | 5.69 |
| `test-reportes-cuadre.ts` | PASA (0) | PASA (0) | 6.12 |
| `test-resenas-e2e.ts` | PASA (0) | PASA (0) | 7.17 |
| `test-reservas-concurrentes.ts` | PASA (0) | PASA (0) | 5.91 |
| `test-servidores-e2e.ts` | PASA (0) | PASA (0) | 6.59 |
| `test-sinred-e2e.ts` | PASA (0) | PASA (0) | 7.45 |
| `test-sql-inventario-negativo.ts` | PASA (0) | PASA (0) | 5.88 |
| `test-total-cobrado-cliente.ts` | PASA (0) | PASA (0) | 5.62 |
| `test-tours-dinero.ts` | PASA (0) | PASA (0) | 5.55 |
| `test-vencimiento-pedidos.ts` | PASA (0) | PASA (0) | 5.77 |
| `test-webhook-manual.ts` | PASA (0) | PASA (0) | 5.89 |

## Checks de scripts

| Archivo | Primera corrida | Final | Segundos final |
|---|---|---|---:|
| `check-a3.ts` | PASA (0) | PASA (0) | 5.86 |
| `check-arquitectura-modulos.ts` | PASA (0) | PASA (0) | 5.64 |
| `check-audio-ogg.ts` | PASA (0) | PASA (0) | 5.39 |
| `check-aurum-webhook.ts` | PASA (0) | PASA (0) | 5.58 |
| `check-busqueda.ts` | PASA (0) | PASA (0) | 5.45 |
| `check-caja-a2.ts` | PASA (0) | PASA (0) | 5.48 |
| `check-caja-offline.ts` | PASA (0) | PASA (0) | 5.44 |
| `check-caja-sinred.ts` | PASA (0) | PASA (0) | 5.77 |
| `check-caja.ts` | PASA (0) | PASA (0) | 6.17 |
| `check-campos-personalizados.ts` | PASA (0) | PASA (0) | 6.19 |
| `check-canales-ui.ts` | PASA (0) | PASA (0) | 6.11 |
| `check-cantidades-retail.ts` | PASA (0) | PASA (0) | 6.34 |
| `check-citas.ts` | PASA (0) | PASA (0) | 6.56 |
| `check-clientes-automotriz.ts` | PASA (0) | PASA (0) | 5.91 |
| `check-contratos-cobros.ts` | PASA (0) | PASA (0) | 6.19 |
| `check-cotizaciones.ts` | PASA (0) | PASA (0) | 6.48 |
| `check-demo.ts` | PASA (0) | PASA (0) | 6.36 |
| `check-lealtad.ts` | PASA (0) | PASA (0) | 6.31 |
| `check-legal.ts` | PASA (0) | PASA (0) | 6.06 |
| `check-pedidos-en-linea.ts` | PASA (0) | PASA (0) | 6.64 |
| `check-permisos-modulos.ts` | PASA (0) | PASA (0) | 7.09 |
| `check-plantilla-meta.ts` | PASA (0) | PASA (0) | 6.14 |
| `check-precios.ts` | PASA (0) | PASA (0) | 6.75 |
| `check-proxy.ts` | PASA (0) | PASA (0) | 6.23 |
| `check-reportes-a4.ts` | PASA (0) | PASA (0) | 6.23 |
| `check-resenas.ts` | PASA (0) | PASA (0) | 6.11 |
| `check-reservas.ts` | PASA (0) | PASA (0) | 6.09 |
| `check-retail.ts` | PASA (0) | PASA (0) | 6.05 |
| `check-seeds-seguridad.ts` | PASA (0) | PASA (0) | 6.38 |
| `check-seguridad.ts` | PASA (0) | PASA (0) | 6.44 |
| `check-servidores.ts` | PASA (0) | PASA (0) | 6.31 |
| `check-sw-push.ts` | PASA (0) | PASA (0) | 6.84 |
| `check-viajes-academia.ts` | PASA (0) | PASA (0) | 6.27 |

## Fallos iniciales y correcciones pequeñas

1. `test-canales-messenger`: rechazó adjuntos con NEXTAUTH_URL HTTP. Repetida con
   `https://crm.prueba.test` solo en ese proceso (Graph simulado): pasa. La app E2E sigue en HTTP local.
2. `test-cobros-cancelar-eliminar-e2e` y `test-cobros-e2e`: guardas antiguas exigían 55453.
   Se admiten 55450 y 55453 manteniendo localhost/127.0.0.1; cancelar/eliminar también
   exige mismo puerto app/admin, BD crm y rol crm_app. Pasa con fixture AR preparado.
3. `test-messenger-facebook-http`: el mock exigía `secreto-meta-simulado` y el servidor
   tenía otro secreto ficticio; reiniciada la app por su puerto con el esperado, pasa
   el login NextAuth real, CSRF, selección, conexión manual y rate limit.
4. Se adaptó la guarda de la variante sin protección de cobros a los mismos puertos
   locales para demostrar la carrera sin utilizar otra BD.

No se modificaron los flujos de Meta excluidos del alcance ni lógica de negocio.
TypeScript completo y lint de las tres pruebas editadas se repitieron al terminar:
- `tsc-final`: EXIT 0, 7.27 s.
- `lint-pruebas-corregidas`: EXIT 0, 7.56 s.

## Concurrencia: sin protección y restaurada

Las variantes disponibles se ejecutaron secuencialmente contra la BD desechable,
con sus flags `*_SIN_PROTECCION=1`, y después con protección restaurada. Las variantes
que imprimen la anomalía y devuelven 0 son demostraciones, no pruebas de que la carrera
sea correcta. Cobros conserva la aserción y devuelve 1 deliberadamente al detectar doble pago.
No se quitó protección en archivos de negocio. Los scripts restauran índices al limpiar.

| Prueba | Sin protección (salida real) | Con protección restaurada (salida real) |
|---|---|---|
| `test-concurrencia-caja-a2` | EXIT 0; `{"modo":"SIN_PROTECCION","devolucionConcurrente":{"intentos":2,"exitosas":2,"cantidadVendida":1,"cantidadDevuelta":2},"devolucionTurnoCerrado":"NO_EJECUTADA","creditoConcurrente":{"intentos":2,"exitosas":2,"limite":100,"ventas":2,"totalVendido":160,"saldoGuardado":80},"apartados":null}` | EXIT 0; `{"modo":"CON_PROTECCION","devolucionConcurrente":{"intentos":2,"exitosas":1,"cantidadVendida":1,"cantidadDevuelta":1},"devolucionTurnoCerrado":{"devolucionId":"21","salidasTurnoCerrado":0,"salidasTurnoActual":1},"creditoConcurrente":{"intentos":2,"exitosas":1,"limite":100,"ventas":1,"totalVendido":80,"saldoGuardado":80},"apartados":{"stockReservado":0,"stockLiberado":1,"vencidos":1,"stockTrasVencer":1}}` |
| `test-concurrencia-caja` | EXIT 0; `{"modo":"SIN_PROTECCION","ultimoProducto":{"intentos":2,"ventas":2,"stockFinal":0},"uuidCliente":{"peticiones":5,"respuestasExitosas":5,"ventasGuardadas":5,"idsDistintos":5},"aperturaUsuario":{"intentos":2,"turnosAbiertos":2},"aperturaCaja":{"intentos":2,"turnosAbiertos":2},"cancelacionContraCorte":{"cancelacion":"cumplida","cierre":"cumplido","esperadoGuardado":200,"esperadoSegunVentasFinales":100,"coincide":false}}` | EXIT 0; `{"modo":"CON_PROTECCION","ultimoProducto":{"intentos":2,"ventas":1,"stockFinal":0},"uuidCliente":{"peticiones":5,"respuestasExitosas":5,"ventasGuardadas":1,"idsDistintos":1},"aperturaUsuario":{"intentos":2,"turnosAbiertos":1},"aperturaCaja":{"intentos":2,"turnosAbiertos":1},"cancelacionContraCorte":{"cancelacion":"rechazada409","cierre":"cumplido","esperadoGuardado":100,"esperadoSegunVentasFinales":100,"coincide":true}}` |
| `test-concurrencia-cobros` | EXIT 1; `{"modo":"SIN_PROTECCION","pagosAplicados":2,"mensualidades":2,"creadosPorCron":[1,1]}` | EXIT 0; `{"modo":"CON_PROTECCION","pagosAplicados":1,"mensualidades":1,"creadosPorCron":[0,1]}` |
| `test-concurrencia-cotizaciones` | EXIT 0; `{"modo":"SIN_PROTECCION","peticiones":2,"respuestasExitosas":2,"aceptacionesNuevas":2,"respuestasIdempotentes":0,"ventasCreadas":2,"stockFinal":0}` | EXIT 0; `{"modo":"CON_PROTECCION","peticiones":2,"respuestasExitosas":2,"aceptacionesNuevas":1,"respuestasIdempotentes":1,"ventasCreadas":1,"stockFinal":1}` |
| `test-concurrencia-nota-credito` | EXIT 0; `{"modo":"SIN_PROTECCION","intentos":2,"exitosas":2,"ventas":2,"saldoInicial":100,"importePorVenta":80,"saldoFinal":20,"saldoNegativo":false}` | EXIT 0; `{"modo":"CON_PROTECCION","intentos":2,"exitosas":1,"ventas":1,"saldoInicial":100,"importePorVenta":80,"saldoFinal":20,"saldoNegativo":false}` |
| `test-concurrencia-pedidos` | EXIT 0; `{"modo":"SIN_PROTECCION","peticiones":2,"exitosas":2,"rechazadas":0,"pedidosCreados":2,"cantidadReservada":2,"stockFisico":1,"sobreventa":true,"pedidoContraCaja":{"exitosas":2,"rechazadas":0,"pedidos":1,"ventasCaja":1,"stockFisico":0,"reservado":1,"disponible":-1},"idempotencia":null}` | EXIT 0; `{"modo":"CON_PROTECCION","peticiones":2,"exitosas":1,"rechazadas":1,"pedidosCreados":1,"cantidadReservada":1,"stockFisico":1,"sobreventa":false,"pedidoContraCaja":{"exitosas":1,"rechazadas":1,"pedidos":0,"ventasCaja":1,"stockFisico":0,"reservado":0,"disponible":0},"idempotencia":{"peticiones":5,"exitosas":5,"ventas":1}}` |
| `test-concurrencia-resenas` | EXIT 0; `{"modo":"SIN_PROTECCION","dobleEvento":{"eventos":2,"solicitudes":2,"enviosWhatsApp":2},"rafaga":{"eventos":6,"solicitudes":6,"enviosWhatsApp":6}}` | EXIT 0; `{"modo":"CON_PROTECCION","dobleEvento":{"eventos":2,"solicitudes":1,"enviosWhatsApp":1},"rafaga":{"eventos":6,"solicitudes":1,"enviosWhatsApp":1},"reservadaAbandonada":{"hace2h":"enviada","hace10min":"bloquea"},"omitidasYFallidas":{"primera":"omitida","segunda":"fallida","tercera":"omitida"}}` |
| `test-concurrencia-sinred` | EXIT 0; `{"modo":"SIN_PROTECCION","colaReenviada":{"peticiones":5,"exitosas":5,"ventasGuardadas":5,"existenciaFinal":4},"dosCajasSinRed":{"intentos":2,"exitosas":2,"ventas":2,"existenciaFinal":0,"ventasMarcadasNegativo":0,"movimientosSinRed":0}}` | EXIT 0; `{"modo":"CON_PROTECCION","colaReenviada":{"peticiones":5,"exitosas":5,"ventasGuardadas":1,"existenciaFinal":4},"dosCajasSinRed":{"intentos":2,"exitosas":2,"ventas":2,"existenciaFinal":-1,"ventasMarcadasNegativo":1,"movimientosSinRed":2},"contraPedidoEnLinea":{"existenciaTrasVentaSinRed":0,"pedidoDespuesDeSinRed":"rechazado 409","pedidoPrimeroLuegoSinRed":{"existencia":0,"marcas":[]}},"precioDistinto":{"cobrado":"90.00","servidor":"100.00","diferenciaPrecio":"10.00","marcas":["precio_distinto"],"rutaNormal":"rechazada: El pago no cubre el total"},"corteConVentasTardias":{"esperadoGuardadoZ":"370.00","esperadoEnVivoTrasTardia":"370.00","tardiaEnTurnoCerrado":{"marcas":["tardia"],"turnoId":true},"tardias":{"ventas":1,"efectivo":"30.00"},"sumaIngenuaDelTurnoCerrado":400,"sinTurnoAbierto":"TURNO_REQUERIDO","enTurnoNuevo":{"marcas":["tardia"],"turnoOriginal":true},"esperadoTurnoNuevo":"20.00"},"ventanas":{"haceMasDe72h":"VENTA_MUY_ANTIGUA","futura":"FECHA_FUTURA","ventanaDesactivada":"aceptada","esperandoTurnoCaducada":"VENTA_MUY_ANTIGUA"}}` |
| `test-vencimiento-pedidos` | EXIT 0; `{"modo":"SIN_PROTECCION","vencimientoSimple":{"estado":"cancelada","reservaActiva":false},"cruce":{"operacionesCumplidas":2,"accionesGanadoras":2,"estado":"cancelada","stockAplicado":true,"stock":0,"reservaActiva":false,"consistente":false},"pendienteABorrador":"409"}` | EXIT 0; `{"modo":"CON_PROTECCION","vencimientoSimple":{"estado":"cancelada","reservaActiva":false},"cruce":{"operacionesCumplidas":1,"accionesGanadoras":1,"estado":"cancelada","stockAplicado":false,"stock":1,"reservaActiva":false,"consistente":true},"pendienteABorrador":"409"}` |

`test-concurrencia-varias-cajas` compara ambos escenarios dentro de la misma ejecución;
los números quedan en la evidencia. Cupos, retail y reservas se ejecutaron con protección;
no tienen un flag equivalente para repetir todas sus ramas sin protección. No se introdujo
una protección nueva en esta tarea ni se alteraron los módulos para fabricar una variante.
Messenger también prueba consumo concurrente del intento y UNIQUE de página activa con Graph falso.

## Pendientes que requieren decisión

- 🛑 `test-lealtad-aurum.ts`: excluido por alcance; requiere un Aurum de pruebas real antes del despliegue,
  según PLAN-CIERRE-FASE-2.md. No equivale a una integración externa validada.
- 🛑 El ensayo sintético posterior no sustituye el ensayo con respaldo real, diferido hasta Meta aprobado.
- 🛑 El estado de App Review y permisos efectivos de Messenger solo puede confirmarse en el panel de Meta.

## Resultado de los pasos posteriores

- Ensayo desde `meta-tech-provider`: tres corridas en **1.303 / 0.466 / 0.508 s**,
  seis canales, 60 conversaciones y 1200 mensajes conservados. Dos etiquetas
  previas conservadas y 58 enlaces agregados por el backfill previsto.
  Idempotencia de todos los datos en la segunda y tercera corrida. Aislamiento: 81 tablas.
  [Informe y reproducción](ensayo-migracion-pre-merge-2026-10-17.md).
- Orden real: SQL mediante `db-migrate` antes de app; no hay `db push` en build ni
  arranque. Los backfills ya preparan sus columnas/tablas y son idempotentes.
  [Auditoría del orden](orden-migracion-pre-merge.md).
- Variables: `META_APP_ID` y `META_APP_SECRET` ya estaban mapeadas. Faltaba
  `MESSENGER_VERIFY_TOKEN`; se agregó el mapeo. **Faltantes obligatorias finales: ninguna.**
  Siguen sin mapeo opcional `ANTHROPIC_MODEL`, `BOT_AUTH_FAIL_MAX`,
  `BOT_AUTH_FAIL_WINDOW_MS`, `BOT_RATE_LIMIT_MAX`, `BOT_RATE_LIMIT_WINDOW_MS`, `BUILD_ID`.
  Los valores reales del panel quedan sin verificar. El control negativo detecta
  correctamente ambos nombres META al retirarlos de una copia del Compose.
  TypeScript del verificador y `docker compose config --quiet` con entorno ficticio: EXIT 0.
- Scripts RLS: `f/f/f/0/0` y cero contactos visibles sin empresa, en la BD de
  regresión y en la migrada. Script legacy: detecta los cuatro planos / cuatro
  cifrados / dos solo planos del fixture, sin imprimir secretos. Todos se
  ejecutaron con transacción READ ONLY y `default_transaction_read_only=on`.
  [Herramientas y límites](../scripts/pre-merge/README.md).

## Higiene: inventario anterior sin seguimiento

Se movieron **15 archivos** (un PLAN y catorce PROMPT) desde la raíz a
`docs/prompts/`, sin editar su contenido ni sobrescribir destinos. SHA256 antes
y después idénticos: [inventario completo](prompts/inventario-2026-10-17.json).
Los planes que ya estaban versionados, incluidos PLAN-CIERRE-FASE-2.md y
PLAN-MODULOS-FASE-2.md, siguen en la raíz.

| Archivo original | Destino |
|---|---|
| PLAN-CANALES-MESSENGER-Y-API.md | docs/prompts/PLAN-CANALES-MESSENGER-Y-API.md |
| PROMPT-AR-VISTAS.md | docs/prompts/PROMPT-AR-VISTAS.md |
| PROMPT-CANALES-MESSENGER-Y-API.md | docs/prompts/PROMPT-CANALES-MESSENGER-Y-API.md |
| PROMPT-COBROS-CANCELAR-ELIMINAR.md | docs/prompts/PROMPT-COBROS-CANCELAR-ELIMINAR.md |
| PROMPT-CONTRATO-NOMBRE.md | docs/prompts/PROMPT-CONTRATO-NOMBRE.md |
| PROMPT-MERGE-MODULOS-AR.md | docs/prompts/PROMPT-MERGE-MODULOS-AR.md |
| PROMPT-MERGE-Y-SEED-SERVIDORES.md | docs/prompts/PROMPT-MERGE-Y-SEED-SERVIDORES.md |
| PROMPT-MESSENGER-APPSECRET-POR-CANAL.md | docs/prompts/PROMPT-MESSENGER-APPSECRET-POR-CANAL.md |
| PROMPT-MESSENGER-LOGIN-FACEBOOK.md | docs/prompts/PROMPT-MESSENGER-LOGIN-FACEBOOK.md |
| PROMPT-MODULO-SERVIDORES.md | docs/prompts/PROMPT-MODULO-SERVIDORES.md |
| PROMPT-MODULOS-AR.md | docs/prompts/PROMPT-MODULOS-AR.md |
| PROMPT-NUEVO-COBRO-MONTO.md | docs/prompts/PROMPT-NUEVO-COBRO-MONTO.md |
| PROMPT-PREPARAR-MERGE-META.md | docs/prompts/PROMPT-PREPARAR-MERGE-META.md |
| PROMPT-PULIDO-SERVIDORES.md | docs/prompts/PROMPT-PULIDO-SERVIDORES.md |
| PROMPT-TOTAL-CLIENTE.md | docs/prompts/PROMPT-TOTAL-CLIENTE.md |

Salida de `git branch --merged modulos-fase-2`, tras los commits de preparación:
once referencias, incluyendo la propia base; diez ramas adicionales ya integradas.
**No se borró ninguna rama.**

```text
canales-messenger-api
cobros-cancelar-eliminar
messenger-login-facebook
meta-tech-provider
modulos-ar
modulos-ar-servidores
modulos-ar-servidores-pulido
modulos-ar-vistas
modulos-fase-2
nuevo-cobro-monto
total-cobrado-cliente
```

## Archivos principales y commits

Además de este informe, se crearon:

- `docs/ensayo-migracion-pre-merge-2026-10-17.md` y su JSON de huellas/conteos.
- `docs/orden-migracion-pre-merge.md`.
- `scripts/pre-merge/ensayar-migracion.mjs`, `check-env-despliegue.ts`,
  `verificar-rls.sql`, `canales-token-legacy.sql` y README de uso.
- `docs/CHECKLIST-MERGE-META.md` y `docs/META-APP-REVIEW-MESSENGER.md`.
- `docs/pruebas-pre-merge-2026-10-17/`: salidas, resultados, aislamiento, consultas
  y controles del verificador de variables.
- `docs/prompts/README.md`, inventario SHA256 y los quince documentos archivados.

| Tarea | Commit |
|---|---|
| 1. Regresión y guardas de pruebas | `3acbe61` |
| 2. Ensayo de migración | `d0fa5d5` |
| 3. Orden SQL y backfills | `19b8032` |
| 4. Verificadores y mapeo Messenger | `e248b15` |
| 5. Checklist único | `069e09d` |
| 6. App Review Messenger | `f77bf81` |
| 7. Higiene e inventario final | Commit que contiene esta sección; consultar `git log -1`. |

## Cierre y decisiones de Julio

- Contenedor `ambarcrm-premerge-20261017` eliminado, incluidas sus cuatro BD
  desechables (regresión y tres intentos del ensayo). App detenida por puerto
  3118, comprobando que su PID pertenecía a esta sesión. Puertos 3118/55450 sin listener.
- `meta-tech-provider` sigue en `e1c5e93`; `modulos-fase-2` sigue en `70e684b`.
  Sin cambios en `web/src`, SQL de negocio, package.json o package-lock respecto
  de esa base. Solo se corrigieron tres guardas de pruebas y un mapeo de Compose.
- 🛑 Aprobación de Meta, valores del panel y ensayo con respaldo real siguen
  pendientes de la ventana autorizada; no se accedió a producción.
- 🛑 Aurum real de pruebas sigue pendiente según el plan de cierre.
- 🛑 Messenger: confirmar acceso y capacidad Human Agent aparte. El paquete de
  revisión declara que no hay botón de desconexión Messenger ni desuscripción
  remota; Julio decide si usa el recorrido técnico documentado o encarga esa
  mejora en otra tarea. No se añadió funcionalidad aquí.


## Regresión de desconexión Messenger (17-oct-2026)

Esta sección sustituye el pendiente de código de desconexión descrito en el cierre
anterior. Resultado final: **46/46 tests autorizados y 33/33 checks pasan**,
además de TypeScript, lint, Prisma validate, build y el verificador local de variables.
Se conservan los fallos iniciales y de preparación; no se presentan como pasadas
las ejecuciones fallidas. `test-lealtad-aurum.ts` sigue excluido expresamente.

### Entorno y alcance de esta continuación

- Rama de trabajo `preparar-merge-meta`, sin crear otra, desde `0c46824`.
- PostgreSQL 16 desechable `ambarcrm-desconexion-20261017`, BD `crm`, publicado
  únicamente en `127.0.0.1:55450`. Creado con schema.sql → multi-tenant.sql →
  actualizaciones.sql ×3; el SQL se repitió otras tres veces al iniciar la regresión.
  Nunca se usó prisma db push. Dueño `dueno`, app `crm_app`, clave de prueba.
- Mismo fixture AR documentado antes: solo en esta BD, org 1 con slug `ambar-rojo`,
  seed existente autorizado con credenciales sintéticas y módulo servidores activo.
  No representa el slug productivo `inicial` ni utiliza canales de clientes.
- Next compilado en `127.0.0.1:3118`, preload meta-facebook-simulado.mjs y secretos
  exclusivamente ficticios. META_APP_SECRET coincide con `secreto-meta-simulado`;
  la prueba de adjuntos usa NEXTAUTH_URL HTTPS sintética solo en su proceso.
  URLs/keys de Aurum y Anthropic neutralizadas; ninguna llamada a Meta real.
- Tests y checks ejecutados con tsx 4.23.15 ya disponible en caché, invocando su
  CLI con Node. Reproducción equivalente desde web/: `npx --yes tsx RUTA.ts`.
  No se cambiaron package.json ni package-lock ni se añadieron librerías.
- No se cambió SQL, webhook o firma de Messenger ni los cuatro flujos de Meta
  excluidos. WhatsApp y API conservan DELETE y respuesta anteriores, cubiertos
  por la prueba nueva. Sin push, deploy o comandos contra producción.

Evidencia: [salidas de todas las ejecuciones](pruebas-desconexion-messenger-2026-10-17/ejecuciones.txt)
y [resultados con fases y códigos](pruebas-desconexion-messenger-2026-10-17/resultados.json).
Solo se omiten la salida de credenciales del seed y valores CSRF efímeros locales.

### Compilación y SQL

| Comprobación | Resultado real | Segundos |
|---|---|---:|
| `actualizaciones-1` | PASA (0) | 0.45 |
| `actualizaciones-2` | PASA (0) | 0.47 |
| `actualizaciones-3` | PASA (0) | 0.45 |
| `prisma-generate` | PASA (0) | 3.92 |
| `tsc` | PASA (0) | 7.3 |
| `lint` | PASA (0) | 25.67 |
| `prisma-validate` | PASA (0) | 2.73 |
| `build` | PASA (0) | 24.36 |

### Tests, todos salvo Aurum real

| Archivo | Primera regresión | Final | Segundos final |
|---|---|---|---:|
| `test-aislamiento.ts` | PASA (0) | PASA (0) | 1.86 |
| `test-a3-e2e.ts` | PASA (0) | PASA (0) | 1.7 |
| `test-a3-fixes-e2e.ts` | PASA (0) | PASA (0) | 1.26 |
| `test-a4-e2e.ts` | PASA (0) | PASA (0) | 1.55 |
| `test-bot-api.ts` | PASA (0) | PASA (0) | 9.0 |
| `test-caja-a2-e2e.ts` | PASA (0) | PASA (0) | 1.84 |
| `test-caja-dinero.ts` | PASA (0) | PASA (0) | 1.42 |
| `test-caja-e2e.ts` | PASA (0) | PASA (0) | 1.41 |
| `test-canales-api.ts` | PASA (0) | PASA (0) | 1.14 |
| `test-canales-base.ts` | PASA (0) | PASA (0) | 1.05 |
| `test-canales-e2e.ts` | FALLA (1) | PASA (0) | 1.44 |
| `test-canales-messenger.ts` | PASA (0) | PASA (0) | 1.8 |
| `test-cobros-cancelar-eliminar-e2e.ts` | PASA (0) | PASA (0) | 2.27 |
| `test-cobros-db.ts` | PASA (0) | PASA (0) | 1.11 |
| `test-cobros-e2e.ts` | PASA (0) | PASA (0) | 2.3 |
| `test-concurrencia-caja-a2.ts` | PASA (0) | PASA (0) | 1.34 |
| `test-concurrencia-caja.ts` | PASA (0) | PASA (0) | 1.19 |
| `test-concurrencia-cobros.ts` | PASA (0) | PASA (0) | 0.75 |
| `test-concurrencia-cotizaciones.ts` | PASA (0) | PASA (0) | 0.86 |
| `test-concurrencia-nota-credito.ts` | PASA (0) | PASA (0) | 0.89 |
| `test-concurrencia-pedidos.ts` | PASA (0) | PASA (0) | 1.06 |
| `test-concurrencia-resenas.ts` | PASA (0) | PASA (0) | 1.78 |
| `test-concurrencia-retail.ts` | PASA (0) | PASA (0) | 6.12 |
| `test-concurrencia-sinred.ts` | PASA (0) | PASA (0) | 1.47 |
| `test-concurrencia-varias-cajas.ts` | PASA (0) | PASA (0) | 1.05 |
| `test-cotizaciones-e2e.ts` | PASA (0) | PASA (0) | 1.41 |
| `test-cotizaciones-zona.ts` | PASA (0) | PASA (0) | 0.83 |
| `test-cupos-concurrentes.ts` | PASA (0) | PASA (0) | 0.73 |
| `test-messenger-desconexion.ts` | PASA (0) | PASA (0) | 2.02 |
| `test-messenger-facebook-http.ts` | PASA (0) | PASA (0) | 0.92 |
| `test-messenger-facebook-rutas.ts` | PASA (0) | PASA (0) | 1.23 |
| `test-messenger-facebook.ts` | PASA (0) | PASA (0) | 1.25 |
| `test-paridad-precios.ts` | PASA (0) | PASA (0) | 4.14 |
| `test-pedidos-e2e.ts` | PASA (0) | PASA (0) | 1.86 |
| `test-precios-promociones.ts` | PASA (0) | PASA (0) | 1.39 |
| `test-referencias.ts` | PASA (0) | PASA (0) | 0.59 |
| `test-reportes-cuadre.ts` | PASA (0) | PASA (0) | 1.03 |
| `test-resenas-e2e.ts` | PASA (0) | PASA (0) | 2.08 |
| `test-reservas-concurrentes.ts` | PASA (0) | PASA (0) | 0.81 |
| `test-servidores-e2e.ts` | PASA (0) | PASA (0) | 1.67 |
| `test-sinred-e2e.ts` | PASA (0) | PASA (0) | 2.25 |
| `test-sql-inventario-negativo.ts` | PASA (0) | PASA (0) | 0.53 |
| `test-total-cobrado-cliente.ts` | PASA (0) | PASA (0) | 0.74 |
| `test-tours-dinero.ts` | PASA (0) | PASA (0) | 0.66 |
| `test-vencimiento-pedidos.ts` | PASA (0) | PASA (0) | 0.92 |
| `test-webhook-manual.ts` | PASA (0) | PASA (0) | 0.94 |

### Checks de web/scripts, todos

| Archivo | Primera regresión | Final | Segundos final |
|---|---|---|---:|
| `check-a3.ts` | PASA (0) | PASA (0) | 0.42 |
| `check-arquitectura-modulos.ts` | PASA (0) | PASA (0) | 0.62 |
| `check-audio-ogg.ts` | PASA (0) | PASA (0) | 0.45 |
| `check-aurum-webhook.ts` | PASA (0) | PASA (0) | 0.72 |
| `check-busqueda.ts` | PASA (0) | PASA (0) | 0.39 |
| `check-caja-a2.ts` | PASA (0) | PASA (0) | 0.59 |
| `check-caja-offline.ts` | PASA (0) | PASA (0) | 0.53 |
| `check-caja-sinred.ts` | PASA (0) | PASA (0) | 0.56 |
| `check-caja.ts` | PASA (0) | PASA (0) | 0.48 |
| `check-campos-personalizados.ts` | PASA (0) | PASA (0) | 0.39 |
| `check-canales-ui.ts` | PASA (0) | PASA (0) | 0.66 |
| `check-cantidades-retail.ts` | PASA (0) | PASA (0) | 0.56 |
| `check-citas.ts` | PASA (0) | PASA (0) | 0.44 |
| `check-clientes-automotriz.ts` | PASA (0) | PASA (0) | 0.45 |
| `check-contratos-cobros.ts` | PASA (0) | PASA (0) | 0.53 |
| `check-cotizaciones.ts` | PASA (0) | PASA (0) | 0.61 |
| `check-demo.ts` | PASA (0) | PASA (0) | 0.66 |
| `check-lealtad.ts` | PASA (0) | PASA (0) | 0.41 |
| `check-legal.ts` | PASA (0) | PASA (0) | 0.41 |
| `check-pedidos-en-linea.ts` | PASA (0) | PASA (0) | 0.47 |
| `check-permisos-modulos.ts` | PASA (0) | PASA (0) | 0.42 |
| `check-plantilla-meta.ts` | PASA (0) | PASA (0) | 0.41 |
| `check-precios.ts` | PASA (0) | PASA (0) | 0.41 |
| `check-proxy.ts` | PASA (0) | PASA (0) | 0.39 |
| `check-reportes-a4.ts` | PASA (0) | PASA (0) | 0.41 |
| `check-resenas.ts` | PASA (0) | PASA (0) | 0.47 |
| `check-reservas.ts` | PASA (0) | PASA (0) | 0.42 |
| `check-retail.ts` | PASA (0) | PASA (0) | 0.47 |
| `check-seeds-seguridad.ts` | PASA (0) | PASA (0) | 0.41 |
| `check-seguridad.ts` | PASA (0) | PASA (0) | 0.45 |
| `check-servidores.ts` | PASA (0) | PASA (0) | 0.41 |
| `check-sw-push.ts` | PASA (0) | PASA (0) | 1.03 |
| `check-viajes-academia.ts` | PASA (0) | PASA (0) | 0.5 |

### Cobertura de la desconexión

`test-messenger-desconexion.ts` prueba el handler real y RLS con sesión controlada,
compartiendo la misma instancia de módulo db que la ruta. Graph está sustituido
por un emisor que exige URL, método DELETE y Authorization correctos; no hay red externa.

- Éxito: `desuscrito:true`, canal retirado; omitir borrarDatos conserva conversación
  y mensaje, con canal_id NULL. Con borrarDatos=true elimina explícitamente ambos.
- Cuatro errores definitivos: 190, sesión invalidada, 803 y HTTP 404.
  Retira el canal con desuscrito=false y motivo fijo; conserva el historial.
- Diez errores que conservan datos: 503, 500 con cuerpo 190, 429 con cuerpo 190,
  red, timeout, permisos 403, código 100 genérico, error ambiguo 100/33, success:false y JSON no válido.
  Incluso con borrarDatos=true devuelve 502 sin borrar nada; el reintento exitoso funciona.
- Sin sesión 401, agente 403, empresa A sobre canal B 404; ninguno llama a Graph.
- El token y su cifrado no aparecen en respuestas, auditoria_bot, eventos ni consola,
  incluso cuando el cuerpo/error ficticio de Meta contiene deliberadamente el token.
- API no hace llamada remota; WhatsApp conserva su DELETE remoto y el cuerpo previo.

La E2E HTTP usa login NextAuth real, rechaza sin sesión y elimina un canal Messenger
con Graph simulado conservando su conversación. El check de UI también renderiza
CanalExterno con React: botón solo para Messenger existente, nunca para canal nuevo
o API; revisa el guard de administrador y las opciones del Confirmador.
No se simuló un clic completo de navegador ni el panel/SDK de Meta real.

### Fallos reales encontrados y repetidos

1. Prueba focal nueva: en dos intentos devolvió 404 al consultar un canal propio.
   El arnés mezclaba las instancias ESM/CommonJS de db al cargar el handler con
   require, separando el contexto AsyncLocalStorage. Se unificó la instancia del
   test y se fija explícitamente la empresa de la sesión controlada. Pasa después;
   no fue necesario cambiar el aislamiento de la app.
2. Check focal: una expresión regular se detenía en el `>` de la flecha del
   handler. Se corrigió y se añadió comprobación mediante renderizado del componente.
3. Primera regresión completa, test-canales-e2e: buscaba el botón en el HTML inicial
   de Configuración, que abre Embudos. La pestaña Canales cambia del lado cliente.
   Se trasladó esa aserción al renderizado del check de UI; la E2E conserva la
   desconexión HTTP real. Repetición: PASA.
4. Una repetición adicional de la E2E llegó al límite de login por IP de 30 intentos
   cada 15 minutos y no obtuvo cookie de sesión. Se reinició solo la app local por
   su puerto para aislar otra ejecución; después pasa. No se debilitó ni cambió
   el limitador de producción.

En la revisión final se decidió conservar el canal ante 100/33: no confirma que
la página haya desaparecido y puede representar falta de acceso. Se añadió ese caso
a los errores 502 y se repitió **toda** la regresión sobre otra BD desechable nueva:
46/46 tests, 33/33 checks, TypeScript, lint, Prisma y build pasan sin fallos en esa
batería final. Las columnas «Primera regresión» preservan los intentos de la
batería previa y la columna «Final» corresponde a esta última corrida completa.
El primer intento de preparar el contenedor nuevo devolvió EXIT 2 porque Postgres
aún estaba arrancando; tras pg_isready en 0, schema/SQL y fixture se crearon bien.
No fue un error del SQL; su salida también está preservada.

- `tsc-final`: PASA (0), 7.25 s.
- `lint-pruebas-final`: PASA (0), 7.3 s.
- `check-env-despliegue`: PASA (0), 1.8 s.


### Commits nuevos y cierre local

| Tarea | Commit |
|---|---|
| Desuscripción remota | `2651d7e` |
| Botón, confirmación e historial | `2365e00` |
| Pruebas de errores, permisos y privacidad | `59cffcc` |
| App Review, checklist, decisiones y prompt autorizado | `cbe93de` |
| Regresión final y evidencia | Commit que contiene esta sección. |

El contenedor desechable se retiró después de todas las pruebas. La app se detuvo
por puerto 3118, comprobando su PID; no quedan listeners en 3118 ni 55450.
El prompt previo sin seguimiento fue incorporado sin modificarlo con autorización
explícita de Julio en el commit de documentación.

Después de guardar este informe se comprobará árbol limpio y ascendencia, y solo
entonces se ejecutará `git switch modulos-fase-2` + `git merge --ff-only preparar-merge-meta`.
La entrega final registra el resultado y SHA exacto de esa operación; no se crea
un commit de merge ni se actualiza meta-tech-provider, que sigue en e1c5e93.

🛑 Pendiente de Julio: aprobación y valores efectivos del panel de Meta, capacidad
Human Agent por separado, ensayo con respaldo real y Aurum real de pruebas según
el plan de cierre. La desconexión ya no requiere una decisión de implementación;
queda su humo real con la página de prueba en la ventana autorizada.

## Regresión de retiro forzado Messenger · 17-oct-2026

Rama `messenger-retiro-forzado`, creada desde `modulos-fase-2` en `586fb36`.
Resultado: **46/46 tests, 33/33 checks, TypeScript, lint, Prisma validate y build pasan**.
No hubo fallos en las ejecuciones focales ni en esta regresión completa.
Los fallos de las secciones anteriores corresponden a trabajos previos y se conservan.

### Entorno y evidencia del retiro forzado

- Contenedor PostgreSQL 16 propio `ambarcrm-retiro-20261017`, publicado solo en
  `127.0.0.1:55450`; se esperó `pg_isready` antes de crear las tablas.
- Preparación con `schema.sql` → `multi-tenant.sql` → `actualizaciones.sql` ×3,
  mediante `docker exec -i ambarcrm-retiro-20261017 psql -X -U dueno -d crm -v ON_ERROR_STOP=1`.
  Se repitió `actualizaciones.sql` otras tres veces como parte de la batería completa.
  Todas terminaron en 0. No se utilizó `prisma db push`.
- Pruebas con rol `crm_app`, RLS activo y claves sintéticas; aislamiento de lectura
  y escritura correcto en **81 tablas**. El fixture AR también es sintético.
- App compilada en `127.0.0.1:3118` con el preload existente
  `prisma/scripts/meta-facebook-simulado.mjs`. Graph de las pruebas de desconexión
  está sustituido por un mock: ninguna llamada a Meta real ni a producción.
- Se reemplazaron las variables locales por valores de pruebas y se dejaron
  vacías las conexiones a Aurum/IA. `test-canales-messenger.ts` recibe
  `NEXTAUTH_URL=https://crm.prueba.test`; la app HTTP usa localhost:3118.
- Ejecución de tests/checks con el tsx 4.23.15 ya disponible en caché, sin instalar
  librerías ni cambiar dependencias.
- [Resultados estructurados](pruebas-retiro-forzado-messenger-2026-10-17/resultados.json)
  y [salidas completas por ejecución](pruebas-retiro-forzado-messenger-2026-10-17/ejecuciones.txt).
  Solo se omite la salida de credenciales sintéticas del seed; su código se conserva.

### Preparación y pruebas focales

| Prueba | Resultado (salida) | Segundos |
|---|---|---:|
| `schema` | PASA (0) | 0.53 |
| `multi-tenant` | PASA (0) | 0.39 |
| `actualizaciones-1` | PASA (0) | 1.39 |
| `actualizaciones-2` | PASA (0) | 0.48 |
| `actualizaciones-3` | PASA (0) | 0.47 |
| `rol-prueba` | PASA (0) | 0.28 |
| `fixture-plataforma` | PASA (0) | 0.27 |
| `fixture-ar` | PASA (0) | 0.72 |
| `test-messenger-desconexion-focal` | PASA (0) | 8.58 |
| `check-canales-ui-focal` | PASA (0) | 5.74 |
| `tsc-focal` | PASA (0) | 8.81 |
| `lint-focal` | PASA (0) | 9.05 |

### Compilación, SQL y validaciones de la batería completa

| Prueba | Resultado (salida) | Segundos |
|---|---|---:|
| `actualizaciones-1` | PASA (0) | 0.59 |
| `actualizaciones-2` | PASA (0) | 0.55 |
| `actualizaciones-3` | PASA (0) | 0.55 |
| `prisma-generate` | PASA (0) | 4.16 |
| `tsc` | PASA (0) | 7.09 |
| `lint` | PASA (0) | 25.77 |
| `prisma-validate` | PASA (0) | 2.61 |
| `build` | PASA (0) | 27.64 |

### Todos los tests autorizados

| Prueba | Resultado (salida) | Segundos |
|---|---|---:|
| `test-aislamiento.ts` | PASA (0) | 2.02 |
| `test-a3-e2e.ts` | PASA (0) | 1.7 |
| `test-a3-fixes-e2e.ts` | PASA (0) | 1.26 |
| `test-a4-e2e.ts` | PASA (0) | 1.69 |
| `test-bot-api.ts` | PASA (0) | 9.09 |
| `test-caja-a2-e2e.ts` | PASA (0) | 1.97 |
| `test-caja-dinero.ts` | PASA (0) | 1.48 |
| `test-caja-e2e.ts` | PASA (0) | 1.53 |
| `test-canales-api.ts` | PASA (0) | 1.27 |
| `test-canales-base.ts` | PASA (0) | 1.11 |
| `test-canales-e2e.ts` | PASA (0) | 1.3 |
| `test-canales-messenger.ts` | PASA (0) | 2.03 |
| `test-cobros-cancelar-eliminar-e2e.ts` | PASA (0) | 2.47 |
| `test-cobros-db.ts` | PASA (0) | 1.44 |
| `test-cobros-e2e.ts` | PASA (0) | 2.45 |
| `test-concurrencia-caja-a2.ts` | PASA (0) | 1.28 |
| `test-concurrencia-caja.ts` | PASA (0) | 1.19 |
| `test-concurrencia-cobros.ts` | PASA (0) | 0.75 |
| `test-concurrencia-cotizaciones.ts` | PASA (0) | 1.0 |
| `test-concurrencia-nota-credito.ts` | PASA (0) | 0.92 |
| `test-concurrencia-pedidos.ts` | PASA (0) | 1.05 |
| `test-concurrencia-resenas.ts` | PASA (0) | 1.84 |
| `test-concurrencia-retail.ts` | PASA (0) | 6.17 |
| `test-concurrencia-sinred.ts` | PASA (0) | 1.53 |
| `test-concurrencia-varias-cajas.ts` | PASA (0) | 1.06 |
| `test-cotizaciones-e2e.ts` | PASA (0) | 1.47 |
| `test-cotizaciones-zona.ts` | PASA (0) | 0.84 |
| `test-cupos-concurrentes.ts` | PASA (0) | 0.73 |
| `test-messenger-desconexion.ts` | PASA (0) | 2.56 |
| `test-messenger-facebook-http.ts` | PASA (0) | 1.03 |
| `test-messenger-facebook-rutas.ts` | PASA (0) | 1.27 |
| `test-messenger-facebook.ts` | PASA (0) | 1.23 |
| `test-paridad-precios.ts` | PASA (0) | 4.0 |
| `test-pedidos-e2e.ts` | PASA (0) | 1.66 |
| `test-precios-promociones.ts` | PASA (0) | 1.45 |
| `test-referencias.ts` | PASA (0) | 0.75 |
| `test-reportes-cuadre.ts` | PASA (0) | 1.08 |
| `test-resenas-e2e.ts` | PASA (0) | 2.16 |
| `test-reservas-concurrentes.ts` | PASA (0) | 0.86 |
| `test-servidores-e2e.ts` | PASA (0) | 1.86 |
| `test-sinred-e2e.ts` | PASA (0) | 2.2 |
| `test-sql-inventario-negativo.ts` | PASA (0) | 0.52 |
| `test-total-cobrado-cliente.ts` | PASA (0) | 0.78 |
| `test-tours-dinero.ts` | PASA (0) | 0.78 |
| `test-vencimiento-pedidos.ts` | PASA (0) | 0.94 |
| `test-webhook-manual.ts` | PASA (0) | 0.97 |

`test-lealtad-aurum.ts`: EXCLUIDO por instrucción expresa; requiere Aurum real de pruebas.

### Todos los checks de web/scripts

| Prueba | Resultado (salida) | Segundos |
|---|---|---:|
| `check-a3.ts` | PASA (0) | 0.42 |
| `check-arquitectura-modulos.ts` | PASA (0) | 0.66 |
| `check-audio-ogg.ts` | PASA (0) | 0.41 |
| `check-aurum-webhook.ts` | PASA (0) | 0.77 |
| `check-busqueda.ts` | PASA (0) | 0.45 |
| `check-caja-a2.ts` | PASA (0) | 0.67 |
| `check-caja-offline.ts` | PASA (0) | 0.55 |
| `check-caja-sinred.ts` | PASA (0) | 0.53 |
| `check-caja.ts` | PASA (0) | 0.49 |
| `check-campos-personalizados.ts` | PASA (0) | 0.44 |
| `check-canales-ui.ts` | PASA (0) | 0.66 |
| `check-cantidades-retail.ts` | PASA (0) | 0.47 |
| `check-citas.ts` | PASA (0) | 0.45 |
| `check-clientes-automotriz.ts` | PASA (0) | 0.5 |
| `check-contratos-cobros.ts` | PASA (0) | 0.61 |
| `check-cotizaciones.ts` | PASA (0) | 0.64 |
| `check-demo.ts` | PASA (0) | 0.66 |
| `check-lealtad.ts` | PASA (0) | 0.42 |
| `check-legal.ts` | PASA (0) | 0.45 |
| `check-pedidos-en-linea.ts` | PASA (0) | 0.52 |
| `check-permisos-modulos.ts` | PASA (0) | 0.42 |
| `check-plantilla-meta.ts` | PASA (0) | 0.44 |
| `check-precios.ts` | PASA (0) | 0.42 |
| `check-proxy.ts` | PASA (0) | 0.42 |
| `check-reportes-a4.ts` | PASA (0) | 0.42 |
| `check-resenas.ts` | PASA (0) | 0.47 |
| `check-reservas.ts` | PASA (0) | 0.45 |
| `check-retail.ts` | PASA (0) | 0.47 |
| `check-seeds-seguridad.ts` | PASA (0) | 0.41 |
| `check-seguridad.ts` | PASA (0) | 0.47 |
| `check-servidores.ts` | PASA (0) | 0.41 |
| `check-sw-push.ts` | PASA (0) | 0.97 |
| `check-viajes-academia.ts` | PASA (0) | 0.44 |

### Casos de retiro forzado comprobados

`test-messenger-desconexion.ts` ejecuta el handler real con sesión controlada,
BD desechable y RLS. El mock exige el DELETE remoto, la página y Authorization
correctos; comprueba que el token no viaje en la URL.

- Diez fallos sin forzar devuelven 502 y conservan canal, conversación y mensaje,
  incluso con `borrarDatos:true`: 503, 500 con código 190, 429 con código 190,
  red, timeout, permisos 403/código 200, 400/código 100, 100/33 ambiguo,
  `success:false` y respuesta no JSON. El reintento normal exitoso sigue funcionando.
- Los mismos diez fallos, con `forzar:true`, se prueban con historial conservado
  y con borrado explícito: **20 retiros forzados**. Siempre intentan Graph una vez,
  devuelven 200 con `desuscrito:false`, `forzado:true` y el motivo fijo solicitado,
  y eliminan el canal. Conservar deja la conversación sin canal y mantiene su
  mensaje; borrar elimina ambos.
- `forzar:false`, `"true"`, `1` y `null` no habilitan el retiro. Un éxito remoto
  con `forzar:true` devuelve `desuscrito:true`, sin afirmar un retiro forzado.
- Sin sesión devuelve 401; agente 403; empresa A sobre canal B 404, aun enviando
  `forzar:true` y `borrarDatos:true`. No consultan Graph ni eliminan canales.
- API ignora `forzar` sin consultar Graph. WhatsApp mantiene su DELETE y respuesta:
  un fallo remoto sigue siendo 502 y conserva canal/mensaje aunque reciba `forzar:true`.
- No aparecen token, cifrado ni el marcador del cuerpo de Meta en ninguna respuesta,
  auditoría, evento o salida de consola capturada. Los errores ficticios incluyen
  deliberadamente esos secretos/marcadores para detectar filtraciones.
- Siguen pasando éxito normal, borrado explícito y los cuatro errores definitivos
  ya permitidos: 190, sesión invalidada, 803 y HTTP 404.
- `check-canales-ui.ts` renderiza el componente: no hay botón forzado inicial.
  También verifica la condición 502 y la confirmación previa al reenvío forzado.
  La E2E HTTP mantiene login real y desconexión normal con Graph simulado.
  No se ejecutó un clic completo de navegador ni una sesión real de Facebook.

### Commits y cierre local

| Tarea | Commit |
|---|---|
| API: retiro forzado solo Messenger/admin | `4f6e382` |
| UI: segunda confirmación tras 502 | `bed364a` |
| Pruebas, aislamiento y privacidad | `0c3fc56` |
| Decisión, referencia de soporte y prompt autorizado | `58c17c5` |
| Regresión y evidencia | Commit que contiene esta sección. |

El prompt que ya estaba sin seguimiento se incorporó sin editar su contenido,
con autorización explícita de Julio. El contenedor desechable se retiró y la app
se detuvo por el puerto 3118 después de verificar su PID; no quedan listeners de
esta prueba en 3118 ni 55450. No se operó `ambarcrm-db` ni producción.

Tras guardar el informe se comprobará árbol limpio y ascendencia antes de
`git switch modulos-fase-2` y `git merge --ff-only messenger-retiro-forzado`.
La entrega final registra el resultado y SHA del fast-forward. Sin reset,
rebase, commit de merge, push ni deploy; `meta-tech-provider` sigue en `e1c5e93`.

🛑 Pendiente de Julio: panel de Meta y aprobación/valores efectivos; solicitud o
habilitación de Human Agent; ensayo con un respaldo real en una copia aislada;
y Aurum real de pruebas antes del despliegue. El retiro forzado es solo una salida
para soporte: la suscripción puede seguir activa y requiere quitar la app en Facebook.


## Cierre de webhooks y automatizaciones · 17-oct-2026

Rama `webhooks-y-automatizaciones`, partiendo de `7269857`. Auditoría real de los
16 pasos en [auditoría de cierre](auditoria-cierre-webhooks-2026-10-17.md).
Faltaban la regresión final (15) y el merge local (16), no tareas de implementación
1–14. Se mantienen los recortes documentados: cuatro eventos conectados;
`mensaje.enviado` reservado sin un punto común permitido; sin entidad equipo,
solo asignación a agente; respuestas rápidas fuera de 24 h se omiten.

Resultado final: **48/48 tests y 33/33 checks pasan**, más TypeScript, lint,
Prisma validate, build y SQL idempotente. Se conservan todos los fallos iniciales
y las tres vueltas de tests/checks en las tablas y las salidas.

### Entorno y ejecución

- Docker estaba detenido; se inició Docker Desktop. Imagen `postgres:16` ya
  disponible: contenedor propio `ambarcrm-cierre-webhooks-20261017`, creado con
  `--pull=never`, puerto únicamente `127.0.0.1:55450`.
- BD nueva: `schema.sql` → `multi-tenant.sql` → `actualizaciones.sql` ×3 por
  `psql -X -v ON_ERROR_STOP=1`, sin `prisma db push`. Rol `crm_app` para las
  pruebas, dueño solo para preparación/limpieza. Aislamiento de lectura y
  escritura aprobado en **84 tablas**.
- Variables de archivos `.env*` neutralizadas por proceso y reemplazadas por
  credenciales sintéticas. Aurum e IA vacíos. App en `127.0.0.1:3118` con el
  preload existente `meta-facebook-simulado.mjs`. Un preload adicional temporal
  bloqueó sockets/fetch externos y resolución de nombres externos; los mocks
  explícitos de los tests sustituyen Graph y HTTPS sin salir a la red.
- Cliente Prisma regenerado con binario local; tests/checks ejecutados con el
  tsx ya presente en caché, sin npx con descarga ni nuevas librerías.
  `test-canales-messenger.ts` usa `NEXTAUTH_URL=https://crm.prueba.test` solo
  en su proceso; la app E2E mantiene HTTP local.
- Fixture AR sintético del seed existente, solo en esta BD, con módulo servidores.
  La salida del seed se omite porque imprime las credenciales ficticias.
- La consulta inicial de disponibilidad llegó antes del arranque (conexión
  rechazada); después el listener y el log confirmaron Ready, antes de las E2E.

Evidencia: [códigos y tiempos](pruebas-cierre-webhooks-2026-10-17/resultados.json),
[salidas por ejecución](pruebas-cierre-webhooks-2026-10-17/ejecuciones.txt) y
[log de la app en las primeras vueltas](pruebas-cierre-webhooks-2026-10-17/app-primeras-corridas.txt).

### Fallos y corrección del entorno

1. Primera vuelta: `test-a3-fixes-e2e.ts` recibió 500 en vez de 201.
   El log de la app muestra Prisma P2028: transacción caducada tras 5017 ms,
   límite 5000 ms. No se amplió ese límite ni se cambiaron aserciones.
2. Segunda vuelta: reutilizar la app acumuló el límite real de login por IP
   (30 intentos en 15 min), por lo que varias E2E no recibieron sesión.
   Sus salidas fallidas se conservan; no se desactivó la protección.
3. Se detuvo la app por el listener 3118, verificando su PID y comando, y se
   inició de nuevo para vaciar contadores de memoria. Tercera vuelta completa:
   48 tests y 33 checks aprobados; A3 terminó en 0 sin cambiar código de negocio.
   El timeout inicial no se reprodujo con el entorno ya listo.

### Preparación y compilación

| Comprobación | Salida real | Segundos |
|---|---|---:|
| `schema` | PASA (0) | 0.82 |
| `multi-tenant` | PASA (0) | 0.64 |
| `actualizaciones-1` | PASA (0) | 3.17 |
| `actualizaciones-2` | PASA (0) | 0.82 |
| `actualizaciones-3` | PASA (0) | 0.97 |
| `rol-prueba` | PASA (0) | 0.37 |
| `prisma-generate` | PASA (0) | 9.25 |
| `tsc` | PASA (0) | 41.27 |
| `lint` | PASA (0) | 113.3 |
| `prisma-validate` | PASA (0) | 1.56 |
| `build` | PASA (0) | 69.72 |
| `fixture-plataforma` | PASA (0) | 0.61 |
| `fixture-ar` | PASA (0) | 2.41 |

### Tests autorizados

| Prueba | Salidas de todas las vueltas, en orden | Final | Segundos final |
|---|---|---|---:|
| `test-a3-e2e.ts` | 0 → 0 → 0 | PASA (0) | 2.28 |
| `test-a3-fixes-e2e.ts` | 1 → 1 → 0 | PASA (0) | 1.53 |
| `test-a4-e2e.ts` | 0 → 1 → 0 | PASA (0) | 1.79 |
| `test-aislamiento.ts` | 0 → 0 → 0 | PASA (0) | 2.39 |
| `test-automatizaciones.ts` | 0 → 0 → 0 | PASA (0) | 3.56 |
| `test-bot-api.ts` | 0 → 0 → 0 | PASA (0) | 12.1 |
| `test-caja-a2-e2e.ts` | 0 → 1 → 0 | PASA (0) | 2.29 |
| `test-caja-dinero.ts` | 0 → 0 → 0 | PASA (0) | 1.72 |
| `test-caja-e2e.ts` | 0 → 1 → 0 | PASA (0) | 1.9 |
| `test-canales-api.ts` | 0 → 0 → 0 | PASA (0) | 1.68 |
| `test-canales-base.ts` | 0 → 0 → 0 | PASA (0) | 1.68 |
| `test-canales-e2e.ts` | 0 → 1 → 0 | PASA (0) | 1.72 |
| `test-canales-messenger.ts` | 0 → 0 → 0 | PASA (0) | 2.5 |
| `test-cobros-cancelar-eliminar-e2e.ts` | 0 → 1 → 0 | PASA (0) | 2.92 |
| `test-cobros-db.ts` | 0 → 0 → 0 | PASA (0) | 1.4 |
| `test-cobros-e2e.ts` | 0 → 1 → 0 | PASA (0) | 2.94 |
| `test-concurrencia-caja-a2.ts` | 0 → 0 → 0 | PASA (0) | 1.53 |
| `test-concurrencia-caja.ts` | 0 → 0 → 0 | PASA (0) | 1.38 |
| `test-concurrencia-cobros.ts` | 0 → 0 → 0 | PASA (0) | 0.93 |
| `test-concurrencia-cotizaciones.ts` | 0 → 0 → 0 | PASA (0) | 1.1 |
| `test-concurrencia-nota-credito.ts` | 0 → 0 → 0 | PASA (0) | 1.13 |
| `test-concurrencia-pedidos.ts` | 0 → 0 → 0 | PASA (0) | 1.24 |
| `test-concurrencia-resenas.ts` | 0 → 0 → 0 | PASA (0) | 2.18 |
| `test-concurrencia-retail.ts` | 0 → 0 → 0 | PASA (0) | 6.33 |
| `test-concurrencia-sinred.ts` | 0 → 0 → 0 | PASA (0) | 1.8 |
| `test-concurrencia-varias-cajas.ts` | 0 → 0 → 0 | PASA (0) | 1.42 |
| `test-cotizaciones-e2e.ts` | 0 → 1 → 0 | PASA (0) | 1.95 |
| `test-cotizaciones-zona.ts` | 0 → 0 → 0 | PASA (0) | 1.02 |
| `test-cupos-concurrentes.ts` | 0 → 0 → 0 | PASA (0) | 0.91 |
| `test-messenger-desconexion.ts` | 0 → 0 → 0 | PASA (0) | 3.96 |
| `test-messenger-facebook-http.ts` | 0 → 1 → 0 | PASA (0) | 1.51 |
| `test-messenger-facebook-rutas.ts` | 0 → 0 → 0 | PASA (0) | 2.08 |
| `test-messenger-facebook.ts` | 0 → 0 → 0 | PASA (0) | 1.5 |
| `test-paridad-precios.ts` | 0 → 0 → 0 | PASA (0) | 3.69 |
| `test-pedidos-e2e.ts` | 0 → 1 → 0 | PASA (0) | 1.93 |
| `test-precios-promociones.ts` | 0 → 0 → 0 | PASA (0) | 1.73 |
| `test-referencias.ts` | 0 → 0 → 0 | PASA (0) | 0.81 |
| `test-reportes-cuadre.ts` | 0 → 0 → 0 | PASA (0) | 1.33 |
| `test-resenas-e2e.ts` | 0 → 1 → 0 | PASA (0) | 2.42 |
| `test-reservas-concurrentes.ts` | 0 → 0 → 0 | PASA (0) | 1.15 |
| `test-servidores-e2e.ts` | 0 → 1 → 0 | PASA (0) | 2.08 |
| `test-sinred-e2e.ts` | 0 → 1 → 0 | PASA (0) | 2.65 |
| `test-sql-inventario-negativo.ts` | 0 → 0 → 0 | PASA (0) | 0.71 |
| `test-total-cobrado-cliente.ts` | 0 → 0 → 0 | PASA (0) | 0.91 |
| `test-tours-dinero.ts` | 0 → 0 → 0 | PASA (0) | 0.81 |
| `test-vencimiento-pedidos.ts` | 0 → 0 → 0 | PASA (0) | 1.12 |
| `test-webhook-manual.ts` | 0 → 0 → 0 | PASA (0) | 1.31 |
| `test-webhooks-salientes.ts` | 0 → 0 → 0 | PASA (0) | 2.39 |

### Checks

| Prueba | Salidas de todas las vueltas, en orden | Final | Segundos final |
|---|---|---|---:|
| `check-a3.ts` | 0 → 0 → 0 | PASA (0) | 0.61 |
| `check-arquitectura-modulos.ts` | 0 → 0 → 0 | PASA (0) | 0.78 |
| `check-audio-ogg.ts` | 0 → 0 → 0 | PASA (0) | 0.55 |
| `check-aurum-webhook.ts` | 0 → 0 → 0 | PASA (0) | 1.1 |
| `check-busqueda.ts` | 0 → 0 → 0 | PASA (0) | 0.68 |
| `check-caja-a2.ts` | 0 → 0 → 0 | PASA (0) | 0.77 |
| `check-caja-offline.ts` | 0 → 0 → 0 | PASA (0) | 0.74 |
| `check-caja-sinred.ts` | 0 → 0 → 0 | PASA (0) | 0.69 |
| `check-caja.ts` | 0 → 0 → 0 | PASA (0) | 0.66 |
| `check-campos-personalizados.ts` | 0 → 0 → 0 | PASA (0) | 0.58 |
| `check-canales-ui.ts` | 0 → 0 → 0 | PASA (0) | 1.0 |
| `check-cantidades-retail.ts` | 0 → 0 → 0 | PASA (0) | 0.63 |
| `check-citas.ts` | 0 → 0 → 0 | PASA (0) | 0.57 |
| `check-clientes-automotriz.ts` | 0 → 0 → 0 | PASA (0) | 0.59 |
| `check-contratos-cobros.ts` | 0 → 0 → 0 | PASA (0) | 0.77 |
| `check-cotizaciones.ts` | 0 → 0 → 0 | PASA (0) | 0.84 |
| `check-demo.ts` | 0 → 0 → 0 | PASA (0) | 0.78 |
| `check-lealtad.ts` | 0 → 0 → 0 | PASA (0) | 0.58 |
| `check-legal.ts` | 0 → 0 → 0 | PASA (0) | 0.59 |
| `check-pedidos-en-linea.ts` | 0 → 0 → 0 | PASA (0) | 0.62 |
| `check-permisos-modulos.ts` | 0 → 0 → 0 | PASA (0) | 0.56 |
| `check-plantilla-meta.ts` | 0 → 0 → 0 | PASA (0) | 0.56 |
| `check-precios.ts` | 0 → 0 → 0 | PASA (0) | 0.54 |
| `check-proxy.ts` | 0 → 0 → 0 | PASA (0) | 0.54 |
| `check-reportes-a4.ts` | 0 → 0 → 0 | PASA (0) | 0.56 |
| `check-resenas.ts` | 0 → 0 → 0 | PASA (0) | 0.6 |
| `check-reservas.ts` | 0 → 0 → 0 | PASA (0) | 0.62 |
| `check-retail.ts` | 0 → 0 → 0 | PASA (0) | 0.62 |
| `check-seeds-seguridad.ts` | 0 → 0 → 0 | PASA (0) | 0.55 |
| `check-seguridad.ts` | 0 → 0 → 0 | PASA (0) | 0.58 |
| `check-servidores.ts` | 0 → 0 → 0 | PASA (0) | 0.56 |
| `check-sw-push.ts` | 0 → 0 → 0 | PASA (0) | 1.07 |
| `check-viajes-academia.ts` | 0 → 0 → 0 | PASA (0) | 0.65 |

`test-lealtad-aurum.ts`: EXCLUIDO por instrucción, requiere Aurum real de pruebas.
Códigos 1 anteriores permanecen visibles; no se sustituyeron por el resultado final.
Los errores Prisma de duplicados/registro ajeno son esperados en tests que terminan en 0.

### Concurrencia sin protección y restaurada

Se ejecutaron las nueve variantes disponibles con sus flags `*_SIN_PROTECCION=1`
y después sin el flag, restaurando protección. Solo se modificaron fixtures e
índices de la BD desechable por los propios scripts; no se retiró protección del
código del producto. El 1 de cobros **sin** protección es la aserción deliberada que
reproduce la carrera; la variante protegida y la batería final pasan en 0.

| Demostración | Sin protección (código real) | Con protección restaurada |
|---|---:|---:|
| `caja-a2` | 0 | 0 |
| `caja` | 0 | 0 |
| `cobros` | 1 | 0 |
| `cotizaciones` | 0 | 0 |
| `nota-credito` | 0 | 0 |
| `pedidos` | 0 | 0 |
| `resenas` | 0 | 0 |
| `sinred` | 0 | 0 |
| `vencimiento-pedidos` | 0 | 0 |

Las anomalías y conteos completos están en las salidas enlazadas. Además,
`test-webhooks-salientes.ts` comprueba altas sin/con bloqueo 12/10;
`test-automatizaciones.ts`, cupo horario 22/20 y altas 27/25.

### Cierre del entorno y control Git

El contenedor propio fue retirado y la app detenida por el puerto 3118 tras
verificar PID/comando. Se comprobó que no quedan listeners de esta prueba en
3118 ni 55450. No se operó `ambarcrm-db`, producción ni redes de clientes.

Los dos prompts y la carpeta histórica autorizada se incorporaron en `4fb1dfa`
sin editar; SHA256 de sus cinco archivos comprobados contra el estado inicial.
Auditoría en `e72039d`. Esta sección y su evidencia se guardan en su propio commit.
Después se exige árbol limpio y se ejecuta exclusivamente el fast-forward a
`modulos-fase-2`; su resultado y SHA se consignan en la entrega. No hubo push,
deploy, reset, rebase ni merge a `meta-tech-provider` o `main`.


## Canal Instagram manual · 17-oct-2026

Parte B iniciada únicamente después del fast-forward de la Parte A a
`1290252294a87c594865429410cc117c6fa613bb`, con árbol limpio y la ascendencia de
`webhooks-y-automatizaciones` comprobada. Rama nueva `canal-instagram` desde ese
estado. Resultado final: **49/49 tests y 34/34 checks aprobados**, TypeScript,
lint, Prisma validate, build y SQL idempotente. Aislamiento en **84 tablas**.

### Alcance implementado y límites

- Proveedor/enum, cuenta activa única entre empresas y resolución SECURITY DEFINER.
  App Secret y token de página cifrados por canal; alta/edición manual y duplicados 409.
- Entrega, ventanas y desconexión extraídas a `meta-mensajeria.ts`, con los exports
  anteriores de Messenger conservados y sus pruebas aprobadas.
- Webhook GET/POST de Instagram, firma por canal o global solo cuando falta secreto
  propio, idempotencia concurrente por canal/mid e identidad por canal/ID externo.
  El perfil fallido conserva la entrada. Adjuntos incompatibles conservados con texto.
- Texto/media, ventana local de 24 h y etiqueta HUMAN_AGENT solo para un humano hasta
  antes de 7 días; nunca para bot/reglas. Límite local conservador de 1000 caracteres.
- API/UI manual, ícono, aviso de ventana, desconexión remota, historial opcional y
  retiro forzado solo admin tras 502 y confirmación adicional.
- Condición de reglas Instagram, proveedor en `datos.canal` de webhooks y campo
  aditivo `canal` en GET de la API v1 del bot. Formato anterior conservado.
- [Guía multicanal](bots-multicanal.md), decisiones y humo opcional documentados.
  No se implementan logins de Instagram/Facebook para este proveedor, comentarios,
  menciones, publicaciones, campañas ni App Review. Stories/reels no se reproducen
  como una función del canal: se conserva el adjunto incompatible mediante marcador.

### Entorno y ejecución propia

- PostgreSQL 16 nuevo `ambarcrm-instagram-20261017`, creado con `--pull=never` desde
  imagen local y publicado únicamente en `127.0.0.1:55450`.
- `schema.sql` → `multi-tenant.sql` → `actualizaciones.sql` ×3 en el paso 1;
  otras tres aplicaciones en la regresión final, todas en 0 con ON_ERROR_STOP.
  No se usó `prisma db push`. Pruebas con `crm_app`; dueño solo prepara/limpia
  fixtures (incluida auditoría de solo inserción) en esta BD desechable.
- Variables `.env*` neutralizadas y valores sintéticos por proceso. Aurum/IA vacíos.
  Mismo preload temporal de bloqueo de sockets/fetch/DNS externos de la Parte A;
  Graph y receptor HTTPS sustituidos por mocks. tsx en caché y binarios locales,
  sin descargas ni cambios en dependencias. No se agregaron variables de entorno:
  GET de Instagram reutiliza `MESSENGER_VERIFY_TOKEN`; Compose sin cambios.
- Fixture AR del seed existente, solo local. App compilada nueva en
  `127.0.0.1:3118`, Graph simulado y comprobación de disponibilidad antes de las E2E.
  La app nueva comenzó con contadores de login vacíos; no se desactivó el rate limit.
- Los flujos excluidos `api/wa/onboard`, `api/meta/webhook`, `api/meta/templates`,
  `api/mensajes/enviar` y el webhook de Messenger permanecen sin cambios.

Evidencia: [resultados y tiempos](pruebas-instagram-2026-10-17/resultados.json) y
[salidas de todas las ejecuciones](pruebas-instagram-2026-10-17/ejecuciones.txt).
También se conserva el [log de la app compilada](pruebas-instagram-2026-10-17/app-regresion.txt).

### Fallos de desarrollo y resolución

Se conservan los fallos anteriores a la regresión final; no hubo fallos en la
batería completa final de Instagram.

1. Extracción compartida: export `desuscribirPaginaMeta` mal renombrado; corregido
   antes de su commit y repetidas cuatro pruebas de Messenger y TypeScript en 0.
2. TypeScript del normalizador: parámetro de adjunto sin tipo; se tipó y volvió a pasar.
3. Test nuevo: mezcla de módulos ESM/require creaba contextos de empresa distintos;
   se alinearon los imports del arnés y se fijó el tenant de sus sesiones simuladas.
   El RLS no se relajó. Su limpieza de auditoría usa el dueño exclusivamente local.
   Al ajustar imports también se corrigió una ruta `channel.ts` a `channel/index.ts`.
4. Prueba de edición: `app_id:false` devolvía 200; ahora se rechaza con 400.
   Se mantiene además `instancia` al cambiar la cuenta y se comprueba la recepción
   por el ID editado. Ambos casos quedaron en la prueba y en el commit del paso 7.
5. Se repitieron la prueba integral de Instagram, Messenger, los checks nuevos,
   TypeScript y lint antes de arrancar la regresión completa.

### Historial de preparación y pruebas focales

En esta tabla se conservan los códigos de cada intento, incluso los del arnés.
`instagram-edicion-focal` (1) quedó resuelto en `instagram-focal-final` (0) y en
`test-canales-instagram.ts` (0) de la batería final. Un 1 histórico no es una
aprobación: su corrección está descrita arriba y la repetición completa abajo.

| Comprobación | Códigos reales en orden | Segundos del último intento |
|---|---|---:|
| `schema` | 0 | 0.7 |
| `multi-tenant` | 0 | 0.57 |
| `actualizaciones-1` | 0 | 2.79 |
| `actualizaciones-2` | 0 | 0.73 |
| `actualizaciones-3` | 0 | 0.7 |
| `rol-prueba` | 0 | 0.3 |
| `fixture-plataforma` | 0 | 0.29 |
| `fixture-ar` | 0 | 0.66 |
| `paso1-prisma-generate` | 0 | 5.46 |
| `extraccion-test-canales-messenger.ts` | 1 → 0 | 2.63 |
| `extraccion-test-messenger-desconexion.ts` | 0 | 4.22 |
| `extraccion-test-messenger-facebook.ts` | 0 | 1.86 |
| `extraccion-test-messenger-facebook-rutas.ts` | 0 | 2.26 |
| `extraccion-tsc` | 0 | 20.08 |
| `paso2-tsc` | 2 → 0 | 4.97 |
| `paso3-tsc` | 0 | 6.05 |
| `paso4-tsc` | 0 | 11.15 |
| `paso4-messenger-desconexion` | 0 | 4.24 |
| `paso5-tsc` | 0 | 10.63 |
| `paso5-check-canales-ui` | 0 | 1.13 |
| `paso6-tsc` | 0 | 10.33 |
| `paso6-automatizaciones` | 0 | 3.82 |
| `instagram-focal` | 1 → 1 → 1 → 0 → 0 | 16.57 |
| `paso7-tsc` | 0 → 0 | 7.08 |
| `instagram-edicion-focal` | 1 | 5.4 |
| `paso7-messenger` | 0 | 2.29 |
| `paso7-check-instagram` | 0 | 1.06 |
| `paso7-check-arquitectura` | 0 | 0.77 |
| `paso7-lint` | 0 | 21.74 |
| `instagram-focal-final` | 0 | 16.86 |
| `paso7-tsc-final` | 0 | 6.65 |
| `paso7-lint-final` | 0 | 6.47 |
| `regresion-actualizaciones-1` | 0 | 0.54 |
| `regresion-actualizaciones-2` | 0 | 0.51 |
| `regresion-actualizaciones-3` | 0 | 0.49 |
| `prisma-generate` | 0 | 3.06 |
| `tsc` | 0 | 5.44 |
| `lint` | 0 | 27.87 |
| `prisma-validate` | 0 | 1.11 |
| `build` | 0 | 55.1 |

### Tests de la regresión completa

| Prueba | Resultado real | Segundos |
|---|---|---:|
| `test-a3-e2e.ts` | PASA (0) | 1.91 |
| `test-a3-fixes-e2e.ts` | PASA (0) | 1.49 |
| `test-a4-e2e.ts` | PASA (0) | 1.93 |
| `test-aislamiento.ts` | PASA (0) | 2.12 |
| `test-automatizaciones.ts` | PASA (0) | 3.5 |
| `test-bot-api.ts` | PASA (0) | 10.51 |
| `test-caja-a2-e2e.ts` | PASA (0) | 2.13 |
| `test-caja-dinero.ts` | PASA (0) | 1.73 |
| `test-caja-e2e.ts` | PASA (0) | 1.78 |
| `test-canales-api.ts` | PASA (0) | 1.54 |
| `test-canales-base.ts` | PASA (0) | 1.28 |
| `test-canales-e2e.ts` | PASA (0) | 1.58 |
| `test-canales-instagram.ts` | PASA (0) | 16.59 |
| `test-canales-messenger.ts` | PASA (0) | 2.45 |
| `test-cobros-cancelar-eliminar-e2e.ts` | PASA (0) | 2.53 |
| `test-cobros-db.ts` | PASA (0) | 1.32 |
| `test-cobros-e2e.ts` | PASA (0) | 2.73 |
| `test-concurrencia-caja-a2.ts` | PASA (0) | 1.44 |
| `test-concurrencia-caja.ts` | PASA (0) | 1.35 |
| `test-concurrencia-cobros.ts` | PASA (0) | 0.9 |
| `test-concurrencia-cotizaciones.ts` | PASA (0) | 1.07 |
| `test-concurrencia-nota-credito.ts` | PASA (0) | 1.1 |
| `test-concurrencia-pedidos.ts` | PASA (0) | 1.22 |
| `test-concurrencia-resenas.ts` | PASA (0) | 1.98 |
| `test-concurrencia-retail.ts` | PASA (0) | 6.28 |
| `test-concurrencia-sinred.ts` | PASA (0) | 1.79 |
| `test-concurrencia-varias-cajas.ts` | PASA (0) | 1.25 |
| `test-cotizaciones-e2e.ts` | PASA (0) | 1.84 |
| `test-cotizaciones-zona.ts` | PASA (0) | 1.03 |
| `test-cupos-concurrentes.ts` | PASA (0) | 0.88 |
| `test-messenger-desconexion.ts` | PASA (0) | 3.62 |
| `test-messenger-facebook-http.ts` | PASA (0) | 1.14 |
| `test-messenger-facebook-rutas.ts` | PASA (0) | 2.11 |
| `test-messenger-facebook.ts` | PASA (0) | 1.45 |
| `test-paridad-precios.ts` | PASA (0) | 3.78 |
| `test-pedidos-e2e.ts` | PASA (0) | 1.83 |
| `test-precios-promociones.ts` | PASA (0) | 1.59 |
| `test-referencias.ts` | PASA (0) | 0.8 |
| `test-reportes-cuadre.ts` | PASA (0) | 1.32 |
| `test-resenas-e2e.ts` | PASA (0) | 2.31 |
| `test-reservas-concurrentes.ts` | PASA (0) | 0.97 |
| `test-servidores-e2e.ts` | PASA (0) | 2.04 |
| `test-sinred-e2e.ts` | PASA (0) | 2.44 |
| `test-sql-inventario-negativo.ts` | PASA (0) | 0.72 |
| `test-total-cobrado-cliente.ts` | PASA (0) | 1.22 |
| `test-tours-dinero.ts` | PASA (0) | 0.85 |
| `test-vencimiento-pedidos.ts` | PASA (0) | 1.2 |
| `test-webhook-manual.ts` | PASA (0) | 1.57 |
| `test-webhooks-salientes.ts` | PASA (0) | 2.59 |

### Checks de la regresión completa

| Prueba | Resultado real | Segundos |
|---|---|---:|
| `check-a3.ts` | PASA (0) | 0.53 |
| `check-arquitectura-modulos.ts` | PASA (0) | 0.72 |
| `check-audio-ogg.ts` | PASA (0) | 0.57 |
| `check-aurum-webhook.ts` | PASA (0) | 0.95 |
| `check-busqueda.ts` | PASA (0) | 0.66 |
| `check-caja-a2.ts` | PASA (0) | 0.77 |
| `check-caja-offline.ts` | PASA (0) | 0.66 |
| `check-caja-sinred.ts` | PASA (0) | 0.66 |
| `check-caja.ts` | PASA (0) | 0.61 |
| `check-campos-personalizados.ts` | PASA (0) | 0.55 |
| `check-canales-ui.ts` | PASA (0) | 0.93 |
| `check-cantidades-retail.ts` | PASA (0) | 0.64 |
| `check-citas.ts` | PASA (0) | 0.58 |
| `check-clientes-automotriz.ts` | PASA (0) | 0.56 |
| `check-contratos-cobros.ts` | PASA (0) | 0.65 |
| `check-cotizaciones.ts` | PASA (0) | 0.74 |
| `check-demo.ts` | PASA (0) | 0.75 |
| `check-instagram.ts` | PASA (0) | 0.97 |
| `check-lealtad.ts` | PASA (0) | 0.63 |
| `check-legal.ts` | PASA (0) | 0.6 |
| `check-pedidos-en-linea.ts` | PASA (0) | 0.61 |
| `check-permisos-modulos.ts` | PASA (0) | 0.54 |
| `check-plantilla-meta.ts` | PASA (0) | 0.56 |
| `check-precios.ts` | PASA (0) | 0.55 |
| `check-proxy.ts` | PASA (0) | 0.53 |
| `check-reportes-a4.ts` | PASA (0) | 0.54 |
| `check-resenas.ts` | PASA (0) | 0.59 |
| `check-reservas.ts` | PASA (0) | 0.61 |
| `check-retail.ts` | PASA (0) | 0.62 |
| `check-seeds-seguridad.ts` | PASA (0) | 0.54 |
| `check-seguridad.ts` | PASA (0) | 0.56 |
| `check-servidores.ts` | PASA (0) | 0.54 |
| `check-sw-push.ts` | PASA (0) | 0.93 |
| `check-viajes-academia.ts` | PASA (0) | 0.58 |

`test-lealtad-aurum.ts` excluido expresamente: necesita Aurum real de pruebas.
Los errores UNIQUE/registro ajeno previstos no son fallos cuando la prueba termina en 0.

### Cobertura focal de Instagram

`test-canales-instagram.ts` ejecuta los handlers reales con sesión simulada,
contexto de empresa y RLS; Graph y HTTPS están sustituidos. Comprueba:

- Firma válida/inválida propia y global, falta de firma, secreto ilegible que
  falla cerrado, cuerpos mixtos que no autorizan otra cuenta y desconocidos/acuse 200.
- Contactos nuevos/repetidos, mismo IGSID separado por canal, idempotencia simultánea,
  perfil denegado, adjuntos reel/story mixtos y mensajes sin contenido compatible.
- Texto, media, rechazo de URL insegura y texto excesivo sin envío, bordes exactos
  de 24 h/7 días, HUMAN_AGENT humano, rechazo de bot y omisión de respuesta de regla.
- Alta cifrada, edición/rotación sin revelar credenciales, duplicado conocido sin
  consultar Graph y carrera entre empresas con una sola alta y el otro 409.
- Regla por canal, webhook de ingesta/cambio de estado y acción de regla con
  `datos.canal=instagram`; GET del bot con proveedor e identificador externo.
- Red/429/5xx no desconectan el canal al enviar; error 190 definitivo lo marca.
  No se devuelven cuerpos de Meta en errores de alta/envío/baja.
- Desconexión normal e historial conservado, token vencido/404/803, nueve fallos
  temporales/ambiguos con historial conservado o borrado: 18 retiros forzados.
  Sin forzar, 502 conserva canal y mensaje incluso con `borrarDatos:true`.
  Solo `forzar:true` habilita el retiro; agente/sin sesión/otra empresa no lo hacen.
- Ningún token, secreto, cifrado ni cuerpo privado de Graph en respuestas, listado,
  errores de mensajes, eventos, auditoría, ejecuciones ni consola capturada con formato.

`check-instagram.ts` renderiza formulario e ícono y comprueba proveedor/condición,
campos secretos, ruta pública exacta y controles de migración; el check existente
renderiza la desconexión también para Instagram. No hubo clics de navegador ni
sesión de Instagram/Facebook real.

### Concurrencia sin protección y restaurada

Se repitieron las nueve variantes disponibles sobre esta BD, con sus flags
`*_SIN_PROTECCION=1` y luego restauradas. El 1 de cobros sin protección reproduce
la anomalía deliberadamente; todas las variantes protegidas y tests finales dan 0.
Webhooks/reglas demuestran además 12/10 altas, 22/20 ejecuciones y 27/25 reglas
sin/con bloqueo en sus propios tests.

| Demostración | Sin protección (código real) | Restaurada |
|---|---:|---:|
| `caja-a2` | 0 | 0 |
| `caja` | 0 | 0 |
| `cobros` | 1 | 0 |
| `cotizaciones` | 0 | 0 |
| `nota-credito` | 0 | 0 |
| `pedidos` | 0 | 0 |
| `resenas` | 0 | 0 |
| `sinred` | 0 | 0 |
| `vencimiento-pedidos` | 0 | 0 |

### Commits por tarea

| Paso | Commit | Cambio |
|---|---|---|
| 1 | `a137b1b` | Proveedor, cuenta única y resolución por empresa |
| Extracción para 2 | `a785cbc` | Mensajería Meta compartida, comportamiento Messenger conservado |
| 2 | `e6ac646` | Proveedor de Instagram y adjuntos conservados |
| 3 | `c2a663d` | Webhook firmado e identidad por canal |
| 4 | `357ddc6` | Servicio/API manual, cifrado y desconexión |
| 5 | `f602ba2` | Formulario, ícono y ventana en chat |
| 6 | `a05edc9` | Canal en reglas, payload y GET del bot |
| 7 | `c295caf` | Pruebas, checks y correcciones de edición |
| 8 | `268c02b` | Guía de bots multicanal |
| 9 | `4b34878` | Decisiones, supuestos y humo opcional |
| 10 | Commit que contiene esta sección | Regresión completa y evidencia |
| 11 | Fast-forward local posterior a este commit | Resultado/SHA en la entrega |

### Supuestos de Meta y pendientes

🛑 **No verificados contra Meta real**: token de página, `/me/messages` con IGSID,
sobre `object:instagram`/`entry.messaging`, firma, suscripción `messages` en la
página, campos de perfil, formatos de media, límites reales de texto y aceptación
real de HUMAN_AGENT hasta 7 días. Los mocks prueban el contrato local, no la
compatibilidad efectiva. Confirmar permisos `instagram_basic`,
`instagram_manage_messages` y los demás que exija la app de cada cliente.
También verificar efectos de suscribir/desuscribir si comparte página/app con
Messenger. Ver la lista completa en [decisiones de canales](canales-decisiones.md).

🛑 Julio: probar Messenger e Instagram con cuentas reales; panel de Meta y acceso
por app; Human Agent; ensayo con respaldo real en copia aislada; Aurum de pruebas.

### Retiro del entorno y merge local

App detenida por el listener 3118 tras verificar PID/comando y contenedor propio
retirado. Sin listeners de esta prueba en 3118 ni 55450. Nunca se operó
`ambarcrm-db`, producción, `meta-tech-provider` ni `main`. Sin push/deploy ni redes
reales. Dependencias y Compose sin cambios; archivos históricos autorizados de
la Parte A conservados sin editar y verificados de nuevo por SHA256.
Se recuperaron sus finales de línea originales tras la conversión automática
de Git al cambiar de rama; los cinco archivos coinciden byte por byte con el inicio.

Tras guardar este informe/evidencia se comprueba árbol limpio y se ejecuta solo
`git switch modulos-fase-2` y `git merge --ff-only canal-instagram`.
Ante un merge no fast-forward se detiene, sin reset/rebase/commit de merge.
La entrega consigna el resultado real y SHA final.


## Revisión de Citas y Reservas en línea · 17-oct-2026

Resultado final: **51 tests y 34 checks aprobados**. TypeScript, lint, Prisma validate,
build y SQL idempotente aprobados. Aislamiento en **84 tablas**. No hubo push ni deploy.

### Entorno y evidencia

- PostgreSQL 16 nuevo `ambarcrm-citas-20261017`, únicamente en `127.0.0.1:55450`.
- `schema.sql` → `multi-tenant.sql` → `actualizaciones.sql` ×3. Otras tres aplicaciones
  en la batería base; todas con ON_ERROR_STOP. No se usó prisma db push.
- Credenciales sintéticas, variables reales neutralizadas y bloqueo de sockets/fetch/DNS
  externos. Graph y recordatorios simulados; sin dependencias nuevas ni producción.
- App compilada en `127.0.0.1:3118`. Reinicio entre archivos E2E para aislar contadores,
  manteniendo los límites de login originales. Las pruebas usan crm_app con RLS.
- La batería final usa otra BD desechable nueva. La base/build pasaron; tras corregir una
  operación de parada del arnés se repitieron TODOS los tests/checks desde aislamiento.
  Se conservan ambas ejecuciones aprobadas de aislamiento; la tabla usa la última.

[Instrucciones reproducibles](pruebas-citas-2026-10-17/README.md),
[salidas completas](pruebas-citas-2026-10-17/ejecuciones.txt),
[códigos y tiempos de todos los intentos](pruebas-citas-2026-10-17/resultados.json),
[primera batería completa](pruebas-citas-2026-10-17/regresion-primera.json),
[batería final](pruebas-citas-2026-10-17/regresion-final.json) y
[log de la app](pruebas-citas-2026-10-17/app-regresion.txt).

### Preparación y validación final

| Ejecución | Código | Segundos |
|---|---|---|
| `schema` | 0 | 0.58 |
| `multi-tenant` | 0 | 0.45 |
| `actualizaciones-1` | 0 | 1.51 |
| `actualizaciones-2` | 0 | 0.57 |
| `actualizaciones-3` | 0 | 0.77 |
| `rol-prueba` | 0 | 0.34 |
| `fixture-plataforma` | 0 | 0.36 |
| `fixture-ar` | 0 | 1.05 |
| `regresion-actualizaciones-1` | 0 | 0.64 |
| `regresion-actualizaciones-2` | 0 | 0.61 |
| `regresion-actualizaciones-3` | 0 | 0.56 |
| `prisma-generate` | 0 | 3.3 |
| `tsc` | 0 | 7.23 |
| `lint` | 0 | 37.05 |
| `prisma-validate` | 0 | 1.24 |
| `build` | 0 | 33.24 |

### Tests de la regresión completa

| Archivo | Primera batería | Final | Segundos final |
|---|---|---|---|
| `test-a3-e2e.ts` | PASA (0) | PASA (0) | 3.48 |
| `test-a3-fixes-e2e.ts` | PASA (0) | PASA (0) | 3.38 |
| `test-a4-e2e.ts` | PASA (0) | PASA (0) | 3.51 |
| `test-aislamiento.ts` | PASA (0) | PASA (0) | 9.46 |
| `test-automatizaciones.ts` | PASA (0) | PASA (0) | 6.13 |
| `test-bot-api.ts` | PASA (0) | PASA (0) | 27.47 |
| `test-caja-a2-e2e.ts` | PASA (0) | PASA (0) | 3.92 |
| `test-caja-dinero.ts` | PASA (0) | PASA (0) | 2.95 |
| `test-caja-e2e.ts` | PASA (0) | PASA (0) | 2.24 |
| `test-canales-api.ts` | PASA (0) | PASA (0) | 2.12 |
| `test-canales-base.ts` | PASA (0) | PASA (0) | 2.18 |
| `test-canales-e2e.ts` | PASA (0) | PASA (0) | 2.0 |
| `test-canales-instagram.ts` | PASA (0) | PASA (0) | 17.2 |
| `test-canales-messenger.ts` | PASA (0) | PASA (0) | 2.96 |
| `test-citas-e2e.ts` | PASA (0) | PASA (0) | 7.86 |
| `test-citas.ts` | PASA (0) | PASA (0) | 6.05 |
| `test-cobros-cancelar-eliminar-e2e.ts` | PASA (0) | PASA (0) | 3.55 |
| `test-cobros-db.ts` | PASA (0) | PASA (0) | 2.57 |
| `test-cobros-e2e.ts` | PASA (0) | PASA (0) | 17.01 |
| `test-concurrencia-caja-a2.ts` | PASA (0) | PASA (0) | 9.3 |
| `test-concurrencia-caja.ts` | PASA (0) | PASA (0) | 12.46 |
| `test-concurrencia-cobros.ts` | PASA (0) | PASA (0) | 4.53 |
| `test-concurrencia-cotizaciones.ts` | PASA (0) | PASA (0) | 5.26 |
| `test-concurrencia-nota-credito.ts` | PASA (0) | PASA (0) | 6.17 |
| `test-concurrencia-pedidos.ts` | PASA (0) | PASA (0) | 5.22 |
| `test-concurrencia-resenas.ts` | PASA (0) | PASA (0) | 4.94 |
| `test-concurrencia-retail.ts` | PASA (0) | PASA (0) | 8.21 |
| `test-concurrencia-sinred.ts` | PASA (0) | PASA (0) | 4.89 |
| `test-concurrencia-varias-cajas.ts` | PASA (0) | PASA (0) | 4.03 |
| `test-cotizaciones-e2e.ts` | PASA (0) | PASA (0) | 4.72 |
| `test-cotizaciones-zona.ts` | PASA (0) | PASA (0) | 2.45 |
| `test-cupos-concurrentes.ts` | PASA (0) | PASA (0) | 1.71 |
| `test-messenger-desconexion.ts` | PASA (0) | PASA (0) | 7.72 |
| `test-messenger-facebook-http.ts` | PASA (0) | PASA (0) | 1.64 |
| `test-messenger-facebook-rutas.ts` | PASA (0) | PASA (0) | 2.83 |
| `test-messenger-facebook.ts` | PASA (0) | PASA (0) | 2.26 |
| `test-paridad-precios.ts` | PASA (0) | PASA (0) | 7.28 |
| `test-pedidos-e2e.ts` | PASA (0) | PASA (0) | 3.37 |
| `test-precios-promociones.ts` | PASA (0) | PASA (0) | 2.58 |
| `test-referencias.ts` | PASA (0) | PASA (0) | 1.37 |
| `test-reportes-cuadre.ts` | PASA (0) | PASA (0) | 2.11 |
| `test-resenas-e2e.ts` | FALLA (1) | PASA (0) | 3.24 |
| `test-reservas-concurrentes.ts` | PASA (0) | PASA (0) | 1.27 |
| `test-servidores-e2e.ts` | PASA (0) | PASA (0) | 2.86 |
| `test-sinred-e2e.ts` | FALLA (1) | PASA (0) | 3.0 |
| `test-sql-inventario-negativo.ts` | PASA (0) | PASA (0) | 0.77 |
| `test-total-cobrado-cliente.ts` | PASA (0) | PASA (0) | 1.05 |
| `test-tours-dinero.ts` | PASA (0) | PASA (0) | 0.94 |
| `test-vencimiento-pedidos.ts` | PASA (0) | PASA (0) | 1.3 |
| `test-webhook-manual.ts` | PASA (0) | PASA (0) | 1.86 |
| `test-webhooks-salientes.ts` | PASA (0) | PASA (0) | 2.94 |

### Checks de la regresión completa

| Archivo | Primera batería | Final | Segundos final |
|---|---|---|---|
| `check-a3.ts` | PASA (0) | PASA (0) | 0.6 |
| `check-arquitectura-modulos.ts` | PASA (0) | PASA (0) | 0.86 |
| `check-audio-ogg.ts` | PASA (0) | PASA (0) | 0.68 |
| `check-aurum-webhook.ts` | PASA (0) | PASA (0) | 1.21 |
| `check-busqueda.ts` | PASA (0) | PASA (0) | 0.65 |
| `check-caja-a2.ts` | PASA (0) | PASA (0) | 0.87 |
| `check-caja-offline.ts` | PASA (0) | PASA (0) | 0.78 |
| `check-caja-sinred.ts` | PASA (0) | PASA (0) | 0.79 |
| `check-caja.ts` | PASA (0) | PASA (0) | 1.02 |
| `check-campos-personalizados.ts` | PASA (0) | PASA (0) | 0.87 |
| `check-canales-ui.ts` | PASA (0) | PASA (0) | 1.71 |
| `check-cantidades-retail.ts` | PASA (0) | PASA (0) | 0.94 |
| `check-citas.ts` | PASA (0) | PASA (0) | 0.76 |
| `check-clientes-automotriz.ts` | PASA (0) | PASA (0) | 0.76 |
| `check-contratos-cobros.ts` | PASA (0) | PASA (0) | 0.87 |
| `check-cotizaciones.ts` | PASA (0) | PASA (0) | 1.01 |
| `check-demo.ts` | PASA (0) | PASA (0) | 1.04 |
| `check-instagram.ts` | PASA (0) | PASA (0) | 1.61 |
| `check-lealtad.ts` | PASA (0) | PASA (0) | 0.75 |
| `check-legal.ts` | PASA (0) | PASA (0) | 0.69 |
| `check-pedidos-en-linea.ts` | PASA (0) | PASA (0) | 0.92 |
| `check-permisos-modulos.ts` | PASA (0) | PASA (0) | 0.94 |
| `check-plantilla-meta.ts` | PASA (0) | PASA (0) | 0.85 |
| `check-precios.ts` | PASA (0) | PASA (0) | 0.97 |
| `check-proxy.ts` | PASA (0) | PASA (0) | 0.85 |
| `check-reportes-a4.ts` | PASA (0) | PASA (0) | 0.77 |
| `check-resenas.ts` | PASA (0) | PASA (0) | 1.23 |
| `check-reservas.ts` | PASA (0) | PASA (0) | 0.91 |
| `check-retail.ts` | PASA (0) | PASA (0) | 2.08 |
| `check-seeds-seguridad.ts` | PASA (0) | PASA (0) | 0.71 |
| `check-seguridad.ts` | PASA (0) | PASA (0) | 0.97 |
| `check-servidores.ts` | PASA (0) | PASA (0) | 0.79 |
| `check-sw-push.ts` | PASA (0) | PASA (0) | 1.67 |
| `check-viajes-academia.ts` | PASA (0) | PASA (0) | 1.13 |

### Fallos conservados y correcciones

1. TypeScript inicial: sesión y prop de zona, inferencia de paginación, Response opcional
   y contrato del proveedor simulado. Tipos corregidos; TypeScript final aprobado.
2. Focal de Citas: referencia a doctor ajeno devolvía 409 desde una cita completada;
   se valida la referencia de empresa primero y responde 400.
3. Reservas concurrentes: unicidad del contacto, corregida recuperando el ganador;
   después, Prisma no deserializaba void del advisory lock: SELECT 1 desde la función.
4. Build móvil: DLL de Prisma bloqueada por next start. Se detuvo exclusivamente :3118
   y el build posterior pasó.
5. Arranque en frío: schema salió 2 al conectar al PostgreSQL temporal que se apagaba;
   actualizaciones salió 3 por tabla ausente. Se espera al servidor final mediante TCP.
6. Primera batería, reseñas: esperaba cancelar una cita completada con 200. Se actualizó
   a 409 y se verifica estado completada y una sola reseña. Focal y repetición final pasan.
7. Primera batería, sin red: alcanzó 30 logins por IP acumulados entre archivos. Reiniciar
   la app entre E2E aísla los tests sin relajar auth. Focal y repetición final pasan.
8. El arnés terminó en 1 al intentar detener una app ya ausente. Se hizo idempotente,
   conservando el rechazo a un proceso inesperado en :3118. Se repitió toda la batería
   test/check desde aislamiento. [Detalle del arnés](pruebas-citas-2026-10-17/incidencias-arnes.txt).

Los mensajes de error provocados intencionalmente por los tests (proveedor simulado roto,
rechazos de validación o unicidad) se conservan; las aserciones y el código del proceso
establecen el resultado. La batería final no contiene códigos distintos de cero.

| Intento con fallo | Código | Veces conservadas |
|---|---|---|
| `tsc` | 2 | 2 |
| `test-citas-focal` | 1 | 3 |
| `tsc-focal` | 2 | 1 |
| `build-movil` | 1 | 1 |
| `schema` | 2 | 1 |
| `regresion-actualizaciones-1` | 3 | 1 |
| `test-resenas-e2e.ts` | 1 | 1 |
| `test-sinred-e2e.ts` | 1 | 1 |

### Evidencia de Citas y Reservas

`test-citas.ts` aprueba 13 grupos: altas/ediciones/movimientos y empalmes, dos POST con
201/409, estados, reseña única, validaciones, permisos, empresa A/B, zonas, excepciones,
servicio incompatible, cinco especialistas, límites públicos, token y cron. El control
negativo de agenda demuestra duplicados sin bloqueo y solo una cita con bloqueo; el
log conserva los números reales. Las pruebas originales del bot y de reservas concurrentes
pasan sin modificaciones. Sin rutas nuevas; arquitectura de módulos aprobada.

El cron prueba 105 candidatas en lotes, dos ejecuciones sin duplicar, estados/ventana,
omisión sin teléfono/canal sin reclamar, recuperación, máximo tres intentos y aislamiento
del error de una empresa. La entrega real ante un timeout tiene las limitaciones documentadas.

`test-citas-e2e.ts` prueba con sesión real y HTTP: clínica pequeña (2 especialistas),
clínica grande (10 y 500 citas más medianoche) y salón (5 técnicas, precio/duración/buffer),
desde configuración y cita ligada a conversación hasta completada, reserva pública y token.

- Clínica pequeña: 13 filas paginadas, 29 ms de consulta local.
- Clínica grande: 501 filas paginadas, 131 ms de consulta local.
- Salón de belleza: 41 filas paginadas, 28 ms de consulta local.

[Informe de hallazgos, faltantes por giro, caminos de un clic y commits](revision-citas-2026-10-17.md).
[20 capturas verificadas](capturas/revision-citas-2026-10-17/README.md), incluidas las fechas completas
en móvil, filtro de la clínica grande, especialista desactivado con citas conservadas,
confirmación pública y cancelación/token inválido. Se comprobó el ciclo de foco y su restauración.

### Limpieza y cierre

App de :3118 detenida y contenedor desechable retirado junto con su volumen anónimo final:
[comprobación](pruebas-citas-2026-10-17/limpieza.json). Producción, main, meta-tech-provider,
ambarcrm-db y los flujos excluidos de Meta no se tocaron. Evidencia preparada para merge
local exclusivamente fast-forward; SHA efectivo y restauración del prompt se verifican
y se informan en la entrega del chat tras crear el commit de evidencia.

🛑 Julio: revisión con datos reales de una clínica; recordatorio real con plantilla aprobada;
ensayo con respaldo real y Aurum de pruebas. Los faltantes y decisiones de producto
(usuario–doctor, etiquetas por giro, confirmación/reprogramación por token) quedan en el informe.
