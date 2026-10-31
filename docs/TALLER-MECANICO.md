# Taller mecánico

## Activación y alcance

El módulo usa la clave `taller`, aparece en `/taller` y se activa por organización
en **Configuración → Clientes Ámbar CRM**. No está restringido a un `orgId` y
permanece apagado mientras la plataforma no lo active para la organización. Los
puestos sugeridos son Administrador, Recepcionista y Mecánico.

Taller registra unidades que pertenecen a los clientes. No lee ni modifica la
tabla `vehiculos` ni el módulo Automotriz, que representa inventario de venta.
La persona cliente es el contacto existente para conservar su teléfono e historial.

## Estados de las órdenes

| Estado | Uso |
| --- | --- |
| `recibido` | Se registra el vehículo, km de entrada y falla reportada. |
| `diagnostico` | El taller prepara diagnóstico y conceptos de trabajo. |
| `esperando_aprobacion` | Se generó una liga pública de un solo uso para el cliente. |
| `en_reparacion` | Inicia el trabajo, tras aprobación o decisión interna desde diagnóstico. |
| `listo` | Reparación terminada, pendiente de entrega. |
| `entregado` | Vehículo devuelto al cliente. |
| `cancelado` | Orden cancelada; las refacciones reservadas se regresan al inventario. |

Las transiciones inválidas se rechazan. Cada cambio guarda fecha y actor (miembro
del equipo o cliente). Las ediciones de orden validan `version`; el servidor vuelve
a calcular el total desde cantidades y precios de conceptos. Al registrar o editar
el kilometraje, la ficha del vehículo solo se actualiza si ese valor es mayor.

## Tablas

- `taller_vehiculos`: propietario, placa, VIN opcional, marca, modelo, año, color,
  kilometraje, notas y versión. Placa y VIN son únicos por organización.
- `taller_ordenes`: vehículo, folio, estado, km de entrada, falla, diagnóstico,
  responsable mecánico, fecha promesa, total, versión y aprobación.
- `taller_orden_conceptos`: mano de obra y refacciones con cantidad y precio.
- `taller_orden_cambios`: historial de estado, actor y fecha.
- `taller_fotos`: referencia a medios de ingreso, daños o evidencia.
- `taller_refacciones`: código, existencia, costo, precio y mínimo.
- `taller_pagos`: anticipos y liquidaciones ligados a una orden.
- `taller_recordatorios`: servicio próximo por kilometraje y/o fecha.

Todas las tablas tienen `org_id` por defecto desde `app.current_org`, RLS con la
política `org_isolation`, permisos de `crm_app` e índices por organización. Las
relaciones a contactos, vehículos, órdenes y refacciones comprueban el mismo tenant.

## Límites e integraciones

Las órdenes se cotizan con sus propios conceptos. El módulo Cotizaciones actual
genera partidas comerciales y no enlaza una orden de taller. La aprobación propia
muestra el importe y permite aprobar o solicitar revisión. El enlace solo funciona
una vez y se comparte manualmente; el módulo no envía mensajes de WhatsApp.

Citas se revisó como alternativa de agenda. La fecha promesa de entrega no incluye
hora ni duración y no representa por sí sola una cita; por eso el módulo no crea
eventos de calendario automáticamente. La ficha de cliente sí reutiliza el contacto
y su teléfono.

Las fotos aceptan JPG, PNG y WebP de hasta 8 MB y se sirven con el storage de medios
existente, bajo la sesión y organización correspondientes.

Los pagos se guardan directamente en la orden porque Caja solo cobra ventas de
mostrador y Cobros requiere un contrato. No crean movimientos en esos módulos.
Entregar con saldo exige confirmación expresa de un administrador; el sistema no
permite registrar pagos mayores que el saldo.

La lista `/taller/recordatorios` compara fecha y kilometraje del vehículo y separa
próximos de vencidos. Crear el recordatorio es manual. No hay cron ni envío de
WhatsApp; no existe interruptor, plantilla ni opt-in configurado para Taller.

## Migración y comprobaciones

Las tablas se crean de forma idempotente en `web/prisma/sql/actualizaciones.sql` y
se reflejan en `web/prisma/schema.prisma`. `npm run check:taller` requiere una base
PostgreSQL aislada en `localhost/taller_test`, con esas actualizaciones aplicadas;
el script rechaza otros hosts o bases y limpia las organizaciones de prueba.
