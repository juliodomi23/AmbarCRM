# PROMPT — Módulo "Taller mecánico" (general, apagado por defecto)

Rama nueva `taller-mecanico` desde la rama actual. Sin push, merge ni deploy; no tocar producción; no enviar mensajes reales. Commits pequeños por etapa (1 a 5) para poder revisar cada una.

## Contexto
Hay que agregar un módulo para talleres mecánicos. **No es el módulo `automotriz` existente**: ese es inventario de vehículos en venta (agencia) con la tabla `vehiculos`. El taller trabaja con vehículos **de los clientes**, que entran a servicio. No reutilices ni modifiques `vehiculos`/`automotriz`; crea tablas propias.

Antes de escribir código, lee `MODULOS.md`, `MULTI-TENANT.md` y cómo están hechos Clientes (`/clientes`), Cotizaciones, Cobros/Caja y Citas, para **reutilizarlos** (contacto/cliente, teléfono, citas, pagos) en vez de duplicar. Si algo no encaja, dilo en el reporte; no inventes.

## Reglas del proyecto (obligatorias)
- Catálogo en `web/src/lib/modulos-catalogo.ts`: clave `taller`, área "Taller mecánico", **apagado por defecto**, activable por org en Configuración → Clientes Ámbar CRM. Sin `soloOrgId`.
- Tablas nuevas en `web/prisma/sql/actualizaciones.sql`, idempotentes, con `org_id` (DEFAULT de `app.current_org`), RLS `org_isolation`, GRANT e índices; reflejadas en `schema.prisma`.
- APIs con `conModulo("taller", …)`; páginas con `moduloActivo`. Puestos por defecto: Administrador, Recepcionista, Mecánico (si el puesto no existe, usa el mecanismo actual de puestos).
- Control de versión en ediciones (rechazar datos desactualizados), como Marketing.
- Español en toda la UI. Sin abstracciones innecesarias.

## Etapa 1 — Clientes y vehículos
- Tabla `taller_vehiculos`: cliente/contacto (FK al existente), placa, VIN (opcional, único por org si existe), marca, modelo, año, color, kilometraje actual, notas. Placa única por org.
- `/taller`: lista de vehículos con búsqueda por placa/cliente/marca; ficha del vehículo con dueño, historial de órdenes y datos editables.
- Un cliente puede tener varios vehículos. Crear vehículo desde la ficha del cliente y desde `/taller`.

## Etapa 2 — Órdenes de servicio
- Tablas `taller_ordenes` y `taller_orden_conceptos` (mano de obra y refacciones: descripción, cantidad, precio unitario, tipo).
- Estados: `recibido` → `diagnostico` → `esperando_aprobacion` → `en_reparacion` → `listo` → `entregado` (+ `cancelado`). Cada cambio guarda quién y cuándo.
- Campos: vehículo, km de entrada, falla reportada, diagnóstico, mecánico asignado, fecha promesa de entrega, total calculado en servidor (nunca confiar en el total del cliente).
- Tablero por estado en `/taller/ordenes` + detalle de la orden. Al actualizar el km de entrada, actualiza el km del vehículo solo si es mayor.

## Etapa 3 — Cotización, aprobación y fotos
- Desde una orden, generar cotización con los conceptos y enviarla por el canal del cliente (WhatsApp) con liga de aprobación. Reutiliza el módulo Cotizaciones si encaja; si no, crea la aprobación mínima propia.
- Aprobar/rechazar pasa la orden a `en_reparacion` o la regresa a diagnóstico. Guardar fecha y medio de la aprobación.
- Fotos de la orden (ingreso, daños, evidencia) con el mecanismo de media/uploads actual; límite de tamaño y tipos permitidos validados en servidor.

## Etapa 4 — Refacciones y pagos
- Tabla `taller_refacciones`: nombre, código, existencia, costo, precio, mínimo. Al agregar una refacción a una orden se descuenta existencia en transacción (sin quedar negativa); al cancelar la orden, se regresa.
- Aviso de existencia baja.
- Pagos de la orden: anticipos y pago final, registrados con el módulo Cobros/Caja existente si aplica. Mostrar saldo pendiente. No cerrar `entregado` con saldo pendiente sin confirmación explícita de un administrador.

## Etapa 5 — Recordatorios de servicio
- Tabla `taller_recordatorios`: vehículo, tipo (cambio de aceite, afinación, etc.), próximo por km y/o por fecha.
- Al entregar una orden, sugerir crear el recordatorio. Vista de "próximos y vencidos".
- Envío de recordatorio por WhatsApp **solo con plantilla aprobada, opt-in del cliente y interruptor por org apagado por defecto**, igual que Campañas de envío. Esta etapa puede quedar en "lista de vencidos + botón manual"; el envío automático solo si el patrón de cron ya existe y es reutilizable.

## Pruebas
Un script `web/scripts/check-taller.ts` (mismo estilo que `check-campanas-envio.ts`):
- Aislamiento entre orgs (RLS): una org no ve vehículos, órdenes ni refacciones de otra.
- Org sin el módulo: 403/404 en todas las APIs y la página.
- Placa duplicada en la misma org falla; en otra org pasa.
- Total de la orden se recalcula en servidor ignorando el enviado por el cliente.
- Transiciones de estado inválidas rechazadas (p. ej. `recibido` → `entregado`).
- Descuento de existencia: no queda negativa, concurrente seguro, se regresa al cancelar.
- Edición con versión desactualizada rechazada.
- Entregar con saldo pendiente exige confirmación de administrador.

## Entrega
`npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `git diff --check` limpios y regresión completa pasando. Documenta en `MODULOS.md` (sección "Taller mecánico") y crea `docs/TALLER-MECANICO.md` con estados, tablas y límites. Reporte breve por etapa con archivos tocados y hash de cada commit, más lo que dejaste fuera y por qué.
