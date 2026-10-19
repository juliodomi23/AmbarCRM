# Guía de configuración y operación de Citas

Actualizada: 19 de octubre de 2026. Para recepción, administradores y especialistas.

## Preparar el negocio

1. Un administrador activa **Citas** y **Reservas en línea** en Configuración → Módulos.
   Revisa los puestos autorizados: tener usuario no da acceso automáticamente al módulo.
2. En Citas → **Especialistas**, registra a quienes atienden. No dupliques a la misma persona
   para ofrecer otro servicio: un especialista puede tener varios servicios y una sola agenda.
3. En Reservas en línea → **Ajustes**, configura la zona del negocio, anticipación mínima,
   días disponibles a futuro, intervalo entre opciones y máximo por teléfono en 24 horas.
   Usa, por ejemplo, `America/Mexico_City`, `America/Cancun` o `America/Tijuana`.
   No cambies la zona para mover citas: las citas existentes conservan su instante.
4. En **Servicios**, define nombre, duración, tiempo libre después, precio y quién lo da.
   Ejemplo: valoración de 30 minutos y 15 de preparación ocupa 45 minutos del especialista.
   Si un servicio ya tiene citas, crea otro para cambiar su duración o margen y oculta el anterior.
5. En **Horario semanal**, agrega una fila por tramo y día. Para una jornada de 09:00–14:00
   y 16:00–20:00 agrega dos filas; el descanso queda libre de reservas.
6. En **Días especiales**, registra vacaciones, festivos y horarios excepcionales.
   Deja ambas horas vacías para cerrar todo el día. Un horario especial sustituye al semanal
   de esa fecha, por lo que debes registrar todos los tramos que sí estarán abiertos.
7. Abre el enlace público de Reservas en línea y comprueba una reserva de prueba con
   el servicio, especialista y zona correctos antes de compartirlo con clientes.

La cita y su margen deben caber completos en un tramo. Un turno que termina a las 14:00
no permite una valoración de 30 minutos más 15 de margen que empiece a las 13:30.
Cambiar jornadas o cerrar un día no cancela automáticamente citas existentes: recepción
debe revisar las afectadas y acordar el cambio con los clientes.

## Configurar el acceso del equipo

En **Configuración → Usuarios**, el administrador elige y guarda el acceso a citas de
cada integrante con rol Agente:

| Opción | Qué permite |
|---|---|
| Toda la agenda | Consultar y operar las citas de todos los especialistas de su empresa |
| Solo un especialista | Consultar y operar únicamente las citas del especialista asignado; no puede reasignarlas ni dejarlas sin especialista |

Un administrador ve toda la agenda. Los usuarios existentes conservan su acceso hasta
que se cambie explícitamente. El permiso se comprueba en el servidor en cada operación;
también limita las citas mostradas en fichas, listados de Clientes/Pacientes y el resumen.
Si el vínculo se elimina, el acceso restringido queda sin citas visibles: nunca se amplía solo.
Desactivar al especialista conserva su historial e impide nuevas reservas con él.

Este ajuste **no sustituye** los permisos de Contactos ni Expedientes. El directorio y los
datos clínicos no ligados a otras citas siguen sus permisos de módulo. Los bots trabajan
con los permisos de su propia API, no con la agenda de un integrante.

## Operación diaria de recepción

- Para crear: Citas → **Nueva cita**, busca al contacto por nombre o teléfono y selecciónalo.
  La búsqueda consulta todo el directorio; si hay demasiadas coincidencias, escribe más datos.
  También puedes abrir Citas desde su ficha o conversación con el contacto precargado.
- Selecciona servicio y especialista, comprueba inicio y fin, agrega notas y guarda.
  Sin servicio puedes usar título y duración libres. Sin especialista no se protege una agenda
  individual: recepción debe asignarlo antes de prometer disponibilidad.
- En la agenda, abre la cita para editar, cambiar estado o consultar notas.
  La hora siempre se interpreta en la zona del negocio.
- Usa **confirmada** cuando el cliente confirma, **en sala** cuando llega, **completada**
  cuando termina y **no asistió** cuando corresponda. Los estados finales no se reabren.
- Para cambiar fecha/hora, edita una cita programada o confirmada. El servidor rechaza
  empalmes y horarios no válidos, aunque dos personas guarden simultáneamente.
- Cancela cuando el cliente lo solicite; el horario queda disponible. El borrado solo se
  permite en citas canceladas y sin evolución clínica ligada. Conserva el historial cuando sea útil.

La agenda interna permite agendar con aviso si el especialista aún no tiene jornada;
el bot y las reservas públicas siempre requieren disponibilidad configurada.

## Qué puede hacer el cliente con su enlace

Al reservar recibe un enlace personal para consultar su cita, confirmar asistencia,
**Cambiar fecha y hora** o cancelar. Para una cita creada por recepción, abre el detalle
en Citas y pulsa **Obtener enlace**; puedes copiarlo y compartirlo con el paciente.
El paciente debe guardarlo y evitar compartirlo: quien tenga el enlace puede gestionar esa cita.
El enlace no muestra nombre ni teléfono del cliente.

Para reprogramar, elige día y hora libres y pulsa **Confirmar cambio de horario**.
Conserva el mismo servicio, especialista, duración y margen. Su cita anterior se mantiene
hasta que el cambio se guarda correctamente. Usa el mismo enlace después del cambio.
No se puede mover una cita que ya empezó, esté en sala o haya terminado/cancelado.
Si el servicio o especialista ya no está disponible, debe contactar a recepción.

Si aparece un conflicto, el horario pudo ser reservado por otra persona. Se actualizan las
opciones para elegir otra. Si recepción modificó la cita mientras tanto, pulsa
**Volver a consultar mi cita** antes de confirmar otro cambio. Ante un fallo de conexión,
consulta el enlace para verificar si el cambio alcanzó a guardarse.

Para confirmar, pulsa **Confirmar mi asistencia**. Si recepción cambió el horario,
vuelve a consultar el enlace y confirma la fecha actual. Una cita cancelada o que ya
empezó no se puede confirmar.

## Recordatorios de WhatsApp

Un administrador configura en Configuración → Módulos → Citas el canal, la plantilla
aprobada, la anticipación y el valor de cada variable. Guarda y verifica que el mapeo
coincida con la plantilla: nombre del contacto, fecha/hora, servicio o negocio según corresponda.
Puedes mapear **Enlace para confirmar, reprogramar o cancelar** a una variable del cuerpo
de una plantilla aprobada que admita ese dato. No cambia automáticamente el texto de Meta.
Con un canal oficial fijo, un paciente nuevo puede recibir el aviso aunque todavía no
haya escrito: el sistema crea o reutiliza su conversación en ese canal. Sin canal fijo,
necesita una conversación oficial activa. La dirección pública del CRM debe estar configurada
para enviar el enlace; si falta, el aviso con enlace queda omitido sin consumir intentos.

El responsable técnico debe programar `POST /api/cron/recordatorios-citas` autenticado
con `x-api-key` y la clave del entorno. La clave nunca se entrega al cliente en un enlace público.
Reprogramar reinicia el recordatorio para la nueva hora; esto no envía un WhatsApp inmediato.

Si un aviso falla, revisa canal/conexión, plantilla aprobada, teléfono del contacto,
configuración de anticipación y ejecución del cron. Los reintentos son acotados; no pulses
envíos repetidos sin revisar el resultado. La prueba con mensajes simulados no acredita
entregabilidad real: valida un recordatorio con un teléfono autorizado antes de entregar.

## Antes de entregar a un comprador

Comprueba con sus datos de prueba una jornada partida, un cierre, una reserva pública,
una reprogramación, una cancelación, dos intentos sobre el mismo horario, cada acceso del
equipo y un recordatorio real. Confirma que la marca y el enlace pertenecen a su empresa.

El responsable técnico debe aplicar `web/prisma/sql/actualizaciones.sql`, regenerar Prisma,
compilar y desplegar en el entorno acordado con respaldo y procedimiento de recuperación.
Nunca ejecutar la batería de pruebas contra la base del comprador.

Este alcance atiende una cita por servicio y especialista. Recursos compartidos como salas,
sillones/equipos y varios servicios en una sola visita requieren una ampliación específica.
