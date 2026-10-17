# Regresión previa al merge de Meta

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

La BD y app locales se conservan temporalmente para las verificaciones siguientes.
La limpieza definitiva y el inventario de ramas/prompts se anotan en el cierre de este informe.
