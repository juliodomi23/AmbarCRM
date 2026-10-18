# Revisión de Citas y Reservas en línea · 17 de octubre de 2026

Base: `eabde09`, rama `revision-citas`. Diagnóstico inicial antes de modificar código.
Solo PostgreSQL desechable en 127.0.0.1:55450, sin servicios externos, push ni despliegue.
Las referencias de esta tabla corresponden a la base; la evidencia final se añade al terminar.

| Hallazgo | Evidencia archivo:línea (web/) | Gravedad | Resolución prevista |
|---|---|---|---|
| Previo 1 confirmado: agenda interna sin bloqueo ni empalme | src/app/api/citas/route.ts:103; src/app/api/citas/[id]/route.ts:89 | Corrompe datos | Compartir bloqueo de especialista y consulta de empalmes con reservas/bot |
| Previo 2 confirmado: mover no reinicia recordatorio | src/app/api/citas/[id]/route.ts:89 | UX | Reiniciar al cambiar realmente inicio, fin o especialista |
| Previo 3 parcialmente confirmado: PATCH sí recorta pero permite título vacío, sin máximos ni empalme al reasignar | src/app/api/citas/[id]/route.ts:32 | Corrompe datos | Validación común y revisión transaccional |
| Previo 4 parcialmente confirmado: rango ilimitado, pero ya existe take 200 | src/app/api/citas/route.ts:14,46; src/lib/paginacion.ts:4 | UX | Rango máximo 62 días y paginación que la UI consuma |
| Previo 5 confirmado: reclamación antes de resolver canal, fallos irreversibles y solo primer lote | src/app/api/cron/recordatorios-citas/route.ts:42,46,58; src/lib/recordatorios.ts:25 | UX | Omitir sin reclamar, reintentos acotados persistentes y lotes |
| Previo 6 confirmado: falta prueba dedicada de Citas | prisma/scripts/test-reservas-concurrentes.ts:1 | Menor | Nueva batería dedicada y regresión completa |
| Bot permite reabrir estados finales; reprogramación y cancelación pública validan estado fuera del bloqueo | src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/appointments/route.ts:268; src/app/api/public/reservas/cita/[token]/route.ts:62 | Corrompe datos | Transiciones y actualización atómica compartidas |
| Límite por teléfono público se cuenta fuera de transacción | src/app/api/public/reservas/[slug]/route.ts:81 | Seguridad | Serializar por teléfono en tenant y recontar antes de crear |
| Calendario no pagina: pierde citas a partir de 200 | src/components/citas/CitasCliente.tsx:89 | UX | Consumir páginas con orden estable |
| Eventos simultáneos se dibujan encima; medianoche y horas fuera de 8–20 se recortan | src/components/citas/CalendarioSemanal.tsx:55,74 | UX | Distribuir columnas y segmentos por día |
| Zona interna y recordatorio fija a México aunque reservas admite otra zona | src/components/citas/fecha.ts:1; src/lib/citas.ts:14 | UX | Usar zona configurada del negocio |
| Copiar enlace anuncia éxito incluso si falla portapapeles | src/components/reservas/EnlacePublico.tsx:8 | UX | Mostrar error real |
| Doctor desactivado conserva citas y relaciones, pero sin marca en agenda | prisma/schema.prisma:830,841; src/app/api/doctores/[id]/route.ts:14 | UX | Marcar inactivos, advertir citas futuras, permitir reasignación |
| Servicio inactivo no borra citas; DELETE con citas ya responde 409 | src/app/api/reservas/servicios/[id]/route.ts:44 | Descartado | Conservar comportamiento |
| Servicios sin especialistas activos no se ofrecen al público | src/app/api/public/reservas/[slug]/route.ts:37 | Descartado | Verificar también bot |
| Token aleatorio de 128 bits, formato estricto, sin PII en detalle público | src/lib/reservas/servidor.ts:275,338; src/app/api/public/reservas/cita/[token]/route.ts:19 | Descartado | Conservar token como credencial de acceso |
| Puestos controlan acceso al módulo, no existe relación usuario↔doctor | src/lib/modulos.ts:57; prisma/schema.prisma:841 | Decisión de producto | No inventar asignación ni seguridad por doctor; documentar requisito de clínica grande |
| Gestión pública actual solo consulta/cancela; no confirma ni reprograma | src/app/api/public/reservas/cita/[token]/route.ts:49; src/components/reservas/GestionCita.tsx:26 | Decisión de producto | Reportar funciones ausentes sin agregarlas |
| UI actual crea y cambia estado; no expone edición/movimiento ni filtros por especialista | src/components/citas/CitasCliente.tsx:246 | UX / alcance solicitado | Corregir agenda existente según 7b sin rediseñar |

## Criterios conservadores

- Estados finales `completada`, `cancelada`, `no_asistio`: solo permanecen iguales. No se mueven ni se reabren. `programada` y `confirmada` pueden avanzar a llegada o cierre; `en_sala` puede completarse/cancelarse. Se documentará la matriz exacta usada en pruebas.
- Horarios internos fuera de jornada o excepciones: advertencia, nunca bloqueo. Reservas públicas y bot conservan sus reglas de disponibilidad, anticipación y buffer.
- Sin doctor no se valida empalme. Completadas conservan ocupación histórica; cancelada/no_asistio liberan.
- Reintentos de recordatorio solo tras fallo conocido de envío. Una entrega confirmada no se reintenta si luego falla el registro local; no hay garantía de exactamente una entrega si el proceso muere durante la petición externa.
- No añadir recursos, pagos, recurrencias, lista de espera, multievento ni vínculo usuario↔doctor. Plantillas de Meta sin cambios.

## Evidencia y entrega final

Pendiente: pruebas, capturas, matriz por giro, caminos de un clic y SHA del merge condicionado a toda la regresión.
