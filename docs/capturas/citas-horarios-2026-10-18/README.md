# Citas: horarios, duración y borrado · 18 de octubre de 2026

App compilada con `next start`, PostgreSQL desechable en 127.0.0.1:55450 y datos
sintéticos de `docs/pruebas-citas-horarios-2026-10-18/visual.mts`. Sin servicios externos.
Escritorio 1440×1000, móvil 390×844. Navegador integrado de Codex.

| Captura | Evidencia |
|---|---|
| 01-calendario-escritorio.jpg | Jornada 09–12 y 14–18; descanso y martes cerrado atenuados |
| 02-formulario-escritorio.jpg | Servicio de 30 min, inicio 09:30 y fin automático 10:00; margen separado |
| 03-formulario-movil.jpg | Fecha y hora completas a 390 px, campos apilados, fin editable y margen |
| 04-bloqueo-movil.jpg | Inicio 12:30, guardado deshabilitado y motivo visible; modal desplazable |
| 05-bloqueo-escritorio.jpg | Mismo bloqueo fuera de jornada en escritorio |
| 06-confirmar-borrado-escritorio.jpg | Confirmador del repo desde el detalle cancelado |
| 07-confirmar-borrado-movil.jpg | Confirmador legible en móvil |
| 08-borrado-real-movil.jpg | Borrado confirmado, toast y agenda recargada |
| 09-calendario-movil.jpg | Jornada atenuada con desplazamiento horizontal semanal |
| 10-alta-servicio-movil.jpg | Alta real desde el formulario: servicio y horario en agenda |
| 11-aviso-sin-horarios-movil.jpg | Sin jornada permite agendar e invita a definirla; defecto de empresa 45 min |

## Comprobaciones visuales y funcionales

- Se eligió servicio, contacto e inicio por teclado y se comprobó el fin 10:00 para 09:30;
  luego se guardó desde móvil y apareció la cita. El margen de 15 min se informa aparte.
- El cierre especial del martes muestra aviso sin abrir formulario al pulsar Enter en ese día.
- La cita cancelada tenía Eliminar en lista y detalle; se abrió Confirmador desde detalle,
  se confirmó en móvil y se verificaron cero citas y el toast Cita eliminada.
- Sin especialista seleccionado, el DOM tiene cero segmentos de atenuación.
- El formulario solo ofrece especialistas activos. Su foco inicial queda en Servicio.
- Se conservan datetime-local: a 390 px ambos campos miden 306 px, se ven fecha/hora completas
  y tienen step=300. El modal tiene scroll para alcanzar notas, botones y mensajes; no hay
  recorte horizontal del documento (scrollWidth=390). No se afirma una prueba en iOS físico.
- `fill` sobre datetime-local del automatizador mostraba un valor sin actualizar React;
  se usaron los segmentos por teclado y se confirmó el resultado guardado. No se alteró la
  aplicación para acomodar esa limitación del automatizador.

Los datos y credenciales de los fixtures son inventados y solo sirven en la BD desechable.
