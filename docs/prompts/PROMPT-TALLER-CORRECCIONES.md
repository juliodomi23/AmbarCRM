# PROMPT — Correcciones del módulo Taller mecánico

Misma rama `taller-mecanico` (último commit `0ff9aee`). Mismas reglas: sin push, merge ni deploy; no tocar producción; no enviar nada real. Un commit por corrección (1 a 3) y uno final para pruebas y docs. Solo esto, nada más.

## Contexto
Revisión del módulo encontró 3 fallas reales y varias menores. Corrige en este orden.

## 1. El enlace público de aprobación redirige a /login
`web/src/proxy.ts` excluye del login las rutas públicas con una lista en `config.matcher`. Faltan `taller-aprobacion/` (página) y `api/taller-aprobacion/` (API). Hoy el cliente que abre el enlace cae en `/login`.
- Agrégalas al matcher, con el mismo estilo que `cotizacion/` y `opinion/`.
- Verifica con una petición real sin cookie de sesión: la página y `GET`/`POST` de la API responden sin redirigir a login. Una ruta que no es pública (p. ej. `/api/taller/ordenes`) sigue protegida.

## 2. La aprobación puede quedar desactualizada
`PATCH /api/taller/ordenes/[id]` permite editar `conceptos` en cualquier estado no cerrado. El cliente puede aprobar un total y que el equipo lo cambie después.
- En `esperando_aprobacion`: rechazar edición de `conceptos` (409, mensaje claro: "La orden espera la respuesta del cliente. Regrésala a diagnóstico para cambiar conceptos").
- En `en_reparacion` y `listo`: si cambian los conceptos (cantidades, precios o piezas) y la orden ya tenía `aprobadoAt`, regresar a `diagnostico`, limpiar `aprobadoAt`, `aprobadoMedio`, `aprobacionResultado` y `aprobacionToken`, y registrar el cambio en `taller_orden_cambios`. La UI debe avisar antes de guardar: "Cambiar conceptos exige nueva aprobación del cliente".
- Una edición que no cambia los conceptos (p. ej. solo diagnóstico o mecánico) no regresa la orden.
- Quitar la transición `diagnostico` → `esperando_aprobacion` del PATCH (en `taller-reglas.ts`). Solo se llega ahí por `/aprobacion`, que genera el token. Así no quedan órdenes en espera sin enlace. `esperando_aprobacion` → `cancelado` debe limpiar el token.
- Al regresar de `esperando_aprobacion` a `diagnostico` por PATCH, limpiar el token.

## 3. No se puede cobrar el saldo después de entregar
`pagos/route.ts` rechaza pagos en órdenes `entregado`. Si un administrador entrega con saldo, ese saldo ya no se puede registrar.
- Permitir pagos en `entregado` mientras quede saldo. Solo `cancelado` queda cerrado.
- Mostrar el saldo pendiente en la orden entregada y el formulario de pago.

## 4. Menores (en el mismo commit que la corrección relacionada)
- Al editar conceptos, rechazar si el nuevo total queda por debajo de lo ya pagado (409: "El total no puede ser menor a lo pagado").
- Cancelar una orden con pagos registrados: pedir confirmación explícita de administrador (`confirmarCancelacionConPagos`) y dejar los pagos visibles. No se implementa reembolso; el aviso dice que debe resolverse fuera del sistema.
- `GET /api/taller-aprobacion/[token]`: devolver solo `numero`, `estado`, `vehiculo` y, por concepto, `descripcion`, `cantidad`, `precioUnitario`, más `total`. Sin `orgId`, `refaccionId` ni ids internos.
- `taller_ordenes.numero`: que sea consecutivo por organización en vez de la secuencia global. Hazlo sin romper órdenes existentes ni permitir duplicados bajo concurrencia (bloqueo por org o contador por org). Si no se puede hacer limpio en esta pasada, déjalo documentado en `docs/TALLER-MECANICO.md` como límite conocido y no lo toques.
- `mecanico_id`: dejarlo así; ya lo valida `referenciaPropia`. Anótalo en los límites.
- Fotos de 8 MB en base64 por JSON: comprueba si `proxy.ts` o Next recortan el cuerpo antes de llegar a la ruta (límite de cuerpo del proxy). Si lo recortan, ajusta la configuración o baja el límite a lo que sí pasa y actualiza el mensaje y la documentación. Prueba con una foto real de ~7 MB.

## Pruebas
Amplía `web/scripts/check-taller.ts` para cubrir **rutas HTTP**, no solo funciones sueltas. Debe poder correrse: crea la base aislada `taller_test` en localhost, aplica `schema.sql` y `prisma/sql/*.sql`, y documenta en `docs/TALLER-MECANICO.md` los comandos exactos para correrlo (incluidas `DATABASE_URL` y `ADMIN_DATABASE_URL`). **Corre la prueba completa y pega el resultado en el reporte.** Si no se puede correr, dilo; no lo des por hecho.

Casos nuevos:
- Aprobación pública sin sesión: GET y POST funcionan; una ruta protegida sigue dando 401/redirect.
- Token de un solo uso: segundo POST → 409. Token de otra org o con formato inválido → 404.
- Editar conceptos en `esperando_aprobacion` → 409.
- Editar conceptos en `en_reparacion` con orden aprobada → vuelve a `diagnostico`, limpia aprobación, registra el cambio.
- Editar solo diagnóstico/mecánico en `en_reparacion` → no regresa.
- Transición `diagnostico` → `esperando_aprobacion` por PATCH → 409; por `/aprobacion` → 200.
- Entregar con saldo: agente → 409; administrador sin `confirmarSaldoPendiente` → 409; administrador con confirmación → 200.
- Registrar pago en orden `entregado` con saldo → 201; en `cancelado` → 409; pago mayor al saldo → 409.
- Total menor a lo pagado → 409.
- Cancelar con pagos sin confirmación de administrador → 409.
- Org sin el módulo: 404 en todas las APIs de `/api/taller/*` y en la página; la ruta pública de aprobación también 404 si el módulo está apagado.
- Respuesta pública de aprobación sin `orgId` ni `refaccionId`.

## Entrega
`npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check` limpios y `npm run check:taller` **pasando de verdad**. Actualiza `docs/TALLER-MECANICO.md` y `MODULOS.md` solo en lo que cambió. Reporte breve: archivos tocados, hash de cada commit, salida de la prueba, y qué quedó fuera y por qué.
