# Regresión previa al merge de Meta

> Actualización del 17-oct-2026: **46/46 tests y 33/33 checks pasan** tras completar la desconexión. Ver la sección final fechada; las secciones iniciales conservan la preparación anterior.

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
