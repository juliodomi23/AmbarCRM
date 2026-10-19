# Decisiones de Citas

- 2026-10-17: agenda, bot y reservas comparten bloqueo de especialista y empalmes; cancelada/no_asistio liberan; completada/cancelada/no_asistio son finales; solo programada/confirmada se reprograman. Fuera de jornada en agenda interna avisa sin bloquear. Reintento de recordatorio conocido: máximo tres, cada 15 minutos. [Revisión y decisiones pendientes](revision-citas-2026-10-17.md).
- 2026-10-18: con jornada definida, agenda interna bloquea fuera de horario; sin jornada permite con aviso. Excepciones incompatibles se rechazan y un cierre legado prevalece. Servicios con citas conservan duración y margen; para cambiarlos se crea otro servicio. Zona configurable desde reservas. [Revisión integral](revision-integral-citas-2026-10-18.md).

- 2026-10-19: búsqueda de contactos sin el límite de las primeras 500 opciones; agenda por usuario con acceso total o por especialista, comprobada en servidor; reprogramación pública por token con versión original, mismo servicio/especialista y validación transaccional. La configuración del equipo no cambia hasta que admin la guarde. [Guía de operación](guia-operacion-citas.md).

- 2026-10-19 (entrega clínica): confirmación de asistencia por enlace con versión del horario; enlaces para citas internas y variable de plantilla enlace_gestion. Con canal oficial fijo se permite recordar a un paciente sin chat previo, registrando el envío en ese canal. Sin canal fijo se conserva el requisito de conversación oficial. [Detalle de entrega](citas-entrega-2026-10-19.md).
