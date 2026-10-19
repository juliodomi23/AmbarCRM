# Preparación comercial de Citas para clínica

19 de octubre de 2026. Continúa la revisión de autoservicio. Trabajo local en
`codex/revision-integral-citas`, sin despliegue ni mensajes reales.
Implementación guardada en el commit local `16c4fad`.

## Problemas corregidos

- Los recordatorios exigían una conversación previa incluso al elegir un canal oficial.
  Una reserva pública de un paciente nuevo podía omitirse indefinidamente. Ahora, con
  canal fijo activo y oficial, se crea/reutiliza la conversación de ese paciente en ese
  canal. Si la cita venía de otro canal, el mensaje se registra en el canal usado para enviarlo.
  El índice único y el manejo del conflicto impiden duplicar conversaciones entre crons.
- Sin canal fijo se conserva el requisito de una conversación oficial activa; no se
  selecciona un canal arbitrario del negocio. Un canal fijo inválido/inactivo no usa otro como sustituto.
- Las citas internas no tenían enlace personal. Las nuevas reciben un token aleatorio;
  recepción puede obtener el enlace desde el detalle, también para citas antiguas.
  Dos solicitudes simultáneas conservan el mismo token. El servidor respeta la empresa
  y la agenda asignada al integrante antes de devolverlo.
- Clientes/Pacientes elegían la próxima cita entre las diez más lejanas y usaban la zona
  de Ciudad de México. Los listados ahora consultan la siguiente cita activa y usan la
  zona del negocio. Las fechas del historial en la ficha usan esa misma zona.
- Contactos ocultaba la acción Cita a personas sin expediente. Se permite abrir el
  formulario con el contacto precargado; crear una ficha clínica sigue siendo independiente.

## Confirmación de asistencia y enlace en el recordatorio

El enlace personal permite **Confirmar mi asistencia** en una cita programada futura.
El cliente confirma el horario que está viendo mediante `inicioOriginal`; si recepción
lo cambió, se devuelve 409 para volver a consultar. Repetir una confirmación es idempotente.
Una cancelación o estado final no se reabre, tampoco al competir con otra solicitud.
Se conserva la cancelación y reprogramación con las reglas existentes.

La variable de plantilla **Enlace para confirmar, reprogramar o cancelar** corresponde
a `enlace_gestion`. Se añade a las opciones del mapeo; las plantillas de Meta no se modifican.
Un recordatorio que usa esa variable asegura el token de una cita antigua y lo incluye
en el cuerpo de la plantilla. Sin URL pública configurada omite el envío y no consume
intentos; no envía un enlace vacío. Las configuraciones con variables desconocidas se rechazan.

`POST /api/citas/<id>/enlace` requiere sesión, módulo y alcance de agenda. Devuelve
`{ enlace }`, 404 para una cita fuera del alcance y 409 si falta la URL pública.
`POST /api/public/reservas/cita/<token>` admite además
`{ accion: "confirmar", inicioOriginal: "...Z" }`. Devuelve estado `confirmada`.

La demo simula la búsqueda y explica que una cuenta activa genera los enlaces;
no crea enlaces personales ni envía WhatsApp desde la demo.

## Validación y entrega

La prueba nueva `test-citas-entrega-e2e.ts` comprueba enlaces simultáneos y permisos,
confirmación pública, recordatorios concurrentes sin conversación previa, canal/historial
correctos, enlace en plantilla, próxima cita entre más de diez, zona del negocio y omisión
sin URL. Usa sesiones HTTP reales y proveedor inyectado, sin mensajes externos.

La actualización no añade tablas ni columnas. El esquema se ensaya desde `schema.sql`
y las actualizaciones repetidas, con RLS y credenciales de prueba. La compilación local
usa Webpack/fuentes simuladas del arnés anterior; la compilación normal se comprueba al desplegar.

Los resultados finales y cualquier fallo previo se conservan en
[evidencia automática](pruebas-citas-entrega-2026-10-19/README.md).

Resultado final: **56 scripts de prueba y 34 comprobaciones aprobados**.
TypeScript, lint de los archivos cambiados, Prisma validate y compilación local
también aprobados. Se ensayó la competencia entre confirmar y cancelar: una
cancelación no se reabre. Un canal fijo inactivo no consume intentos de envío.

Se verificaron en navegador la confirmación desde móvil, obtener/copiar el enlace
en recepción y la próxima cita en la zona del negocio. Las
[tres capturas](capturas/citas-entrega-2026-10-19/README.md) corresponden a la
compilación probada. La app, el contenedor y su volumen desechable se retiraron;
[evidencia de limpieza](pruebas-citas-entrega-2026-10-19/limpieza.json).

El piloto con la configuración de una clínica real, su plantilla aprobada, cron,
compilación normal y respaldo siguen siendo pasos de entrega.
