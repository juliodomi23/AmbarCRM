# Piloto de Citas para clínica o consultorio

Preparado el 19 de octubre de 2026. Alcance: agenda, reservas públicas y operación de recepción.
El usuario eligió clínica/consultorio como primer giro. El código y las pruebas están en
`codex/revision-integral-citas`; no hay despliegue ni configuración de una clínica real todavía.

## Datos que debe proporcionar la clínica

- Nombre y marca del consultorio; persona responsable de recepción.
- Zona horaria de la sucursal y horario de cada doctor por día, incluidos descansos.
- Servicios que se podrán reservar, duración y margen entre consultas definidos por el negocio.
- Días de vacaciones/festivos y cambios de horario ya acordados.
- Quién tendrá acceso completo y qué usuario corresponde a cada doctor.
- Canal oficial de WhatsApp, plantilla aprobada y teléfono autorizado para la prueba del recordatorio.
- Anticipación mínima y cantidad de días a futuro que desea ofrecer.

Este piloto controla disponibilidad por doctor. Si dos doctores comparten un consultorio
y no pueden usarlo a la vez, hace falta control de salas antes de ofrecer esa disponibilidad.
Los doctores deben revisar esa necesidad con recepción al definir los horarios.

## Preparación de ejemplo

Los siguientes valores son ilustrativos; la clínica decide los horarios y duraciones reales.

| Elemento | Configuración de prueba |
|---|---|
| Recepción | Rol Agente, puesto Recepcionista autorizado en Citas, acceso a toda la agenda |
| Doctor A | Rol Agente, puesto Doctor autorizado en Citas, acceso solo al especialista A |
| Doctor B | Rol Agente, puesto Doctor autorizado en Citas, acceso solo al especialista B |
| Administrador | Configura usuarios, especialistas, servicios, jornadas y recordatorios |
| Jornada A | Lunes a viernes, 09:00–14:00 y 16:00–20:00 |
| Jornada B | Lunes a viernes, 10:00–15:00 |
| Servicio de prueba | 30 minutos de atención y 15 de margen; lo ofrecen ambos doctores |
| Día especial | Cierre completo para A; horario reducido para B en una fecha futura |

Si se activa Pacientes, revisa sus puestos autorizados por separado. Limitar una agenda no
es una política de confidencialidad completa de expedientes: el acceso a esos datos depende
de los permisos de Pacientes/Clientes. Usa contactos ficticios durante el ensayo.

## Recorrido de aceptación

| Caso | Acción | Resultado esperado |
|---|---|---|
| Marca y zona | Abrir el enlace público | Muestra la clínica y horas de su zona |
| Agenda privada | Entrar como doctor A | Solo ve sus citas; no cambia las de B ni las deja sin especialista |
| Recepción | Entrar con acceso completo | Consulta ambos doctores y puede asignar/reprogramar |
| Directorio grande | Buscar un contacto fuera de las primeras opciones | Lo encuentra por nombre o teléfono y mantiene la selección |
| Descanso | Intentar una cita durante el corte de comida | No se ofrece ni se guarda con ese doctor |
| Fin de jornada | Probar duración más margen cerca del cierre | Solo se ofrece si ambos caben completos |
| Cierre/horario especial | Consultar la fecha configurada | Prevalece la excepción sobre el horario semanal |
| Conflicto | Dos clientes eligen el mismo horario | Solo uno reserva o reprograma; el otro recibe aviso y otras opciones |
| Cambio por cliente | Cambiar fecha y hora desde su enlace | Mantiene servicio/doctor y reemplaza el horario solo al confirmar |
| Cambio por recepción | Editar mientras el cliente tiene el enlace abierto | El cambio obsoleto se rechaza y el cliente vuelve a consultar |
| Cancelación | Cancelar una cita futura | Libera el horario y conserva el estado en historial |
| Llegada y cierre | Confirmada → en sala → completada; otra como no asistió | Respeta las transiciones y no reabre estados finales |
| Recordatorio real | Ejecutar cron con plantilla aprobada y teléfono autorizado | Llega con variables y hora correctas, una sola vez |
| Recordatorio tras mover | Reprogramar una cita que tenía recordatorio | Reinicia el aviso para la hora nueva |

Registra para cada caso fecha, persona que lo probó, resultado y observación. Las pruebas
automáticas ya cubren varias reglas; este recorrido valida la configuración y operación
del consultorio concreto. Si cambia una jornada, recepción revisa las citas existentes:
el sistema no las cancela automáticamente.

## Cierre del piloto y entrega

El responsable técnico ensaya la actualización y recuperación con respaldo, aplica el SQL,
regenera Prisma y comprueba la compilación normal antes del despliegue autorizado.
Recepción y un doctor realizan el recorrido con la configuración acordada. Se entrega
el enlace público, los accesos, la [guía de operación](guia-operacion-citas.md) y un responsable
de soporte. Se confirma el funcionamiento del cron y un WhatsApp real antes de activar avisos.

Después del piloto, decide con sus necesidades si ampliar a salas/equipos compartidos,
varios servicios por visita, anticipos o lista de espera. Ninguna de esas funciones se
debe ofrecer como parte del alcance actual.
