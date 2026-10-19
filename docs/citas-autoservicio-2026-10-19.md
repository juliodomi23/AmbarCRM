# Citas: búsqueda, agenda por integrante y reprogramación pública

19 de octubre de 2026. Continuación de la revisión integral del 18 de octubre.
Rama: `codex/revision-integral-citas`. Sin push, merge ni despliegue.
Implementación guardada en el commit local `6b7656f`.

## Resultado del cierre

55 scripts de prueba y 34 comprobaciones aprobados. TypeScript, lint de archivos
modificados, Prisma generate/validate y compilación Webpack aprobados. Después del
último ajuste del formulario se repitieron TypeScript, lint, build y el ensayo HTTP
de seis grupos. También se verificó reprogramar desde móvil en esa última compilación.
La base/app desechables se retiraron; [registro de limpieza](pruebas-citas-autoservicio-2026-10-19/limpieza.json).

El siguiente paso acordado es un [piloto de clínica/consultorio](piloto-citas-clinica.md).

## Buscar cualquier contacto

El formulario de Citas busca por nombre o teléfono en todo el directorio de su empresa,
incluidos contactos sin expediente. Espera 250 ms y cancela respuestas anteriores
para no reemplazar una consulta nueva por una respuesta vieja. Devuelve hasta 30
coincidencias e indica cuándo precisar la búsqueda. Conserva el contacto seleccionado,
la precarga y el historial. Ya no descarga las primeras 500 opciones.

`GET /api/citas/contactos?q=` exige sesión y permiso de Citas, valida hasta 100 caracteres
y selecciona id, nombre, teléfono e id de expediente. RLS conserva el aislamiento.

## Agenda por integrante

Configuración → Usuarios permite a admin guardar **Toda la agenda** o **Solo un especialista**.
Se añaden `usuarios.agenda_solo_propia` (false por defecto) y `agenda_doctor_id` opcional.
La FK usa SET NULL al borrar un especialista y conserva la restricción. No hay tabla nueva.
La actualización SQL es repetible y los usuarios existentes no cambian de alcance.

Las lecturas comprueban el acceso actual en BD; las altas/ediciones/bajas lo revalidan
dentro de la transacción, con bloqueo compartido del usuario. Una cuenta restringida
no puede leer/modificar citas de otros, crearlas sin especialista ni reasignarlas.
Sin vínculo no ve ninguna cita. Los administradores mantienen el acceso completo.
Alta y activación/desactivación de especialistas requieren administrador.

La restricción filtra citas en calendario, resumen, Clientes/Pacientes y sus fichas;
también impide enlazar una evolución a una cita fuera del alcance. Las evoluciones ligadas
a otras citas se excluyen de esas fichas para no revelar sus detalles por la relación.
Los permisos del directorio, expedientes y bots son independientes de este alcance.
El resumen usa la zona horaria configurada para contar las citas del día.

## Cambiar de horario con el enlace público

El enlace `/reservar/cita/<token>` ofrece días y horas libres para una cita futura
programada/confirmada. Conserva servicio, especialista, duración, margen, estado y token.
Solo al guardar reemplaza el horario; reinicia el recordatorio para la nueva fecha.
La consulta excluye la propia cita y la confirmación revalida bajo bloqueo de cita y especialista.
No permite mover citas iniciadas/finales ni servicios/especialistas retirados.
Un cambio concurrente de fecha detectado por `inicioOriginal` devuelve 409.

Contrato añadido a `GET/POST /api/public/reservas/cita/<token>`:

- GET sin consulta: detalle público anterior más `reprogramable`.
- GET `?desde=AAAA-MM-DD`: días disponibles en bloques de 14 y `siguiente`.
- GET `?fecha=AAAA-MM-DD`: instantes ISO libres en `horarios`.
- POST `{ accion: "reprogramar", inicio: "...Z", inicioOriginal: "...Z" }`:
  200 con `{ ok: true, cita: ... }`; 400 para datos inválidos, 409 para cita cambiada o sin disponibilidad.
- POST `{ accion: "cancelar" }` conserva el contrato de cancelación. La actualización
  comprueba que el inicio no cambió desde su lectura para no cancelar una reprogramación simultánea.

El enlace no devuelve datos personales del cliente. Conserva rate limiting y validación
del token aleatorio de 32 hexadecimales. Se mantiene disponible la cancelación con servicio
oculto. Reprogramar no envía mensajes externos inmediatamente.

## Verificación

`test-citas-autoservicio-e2e.ts` usa sesiones HTTP reales y seis grupos: búsqueda después
de 500 contactos, lectura/escritura restringidas, fichas sin filtraciones, cambios de alcance
y validación de empresa, reprogramación con margen y recordatorio, y dos clientes compitiendo
por un horario con un único ganador. También prueba cierres y servicios retirados.

Evidencia automática y resultados finales en [pruebas de autoservicio](pruebas-citas-autoservicio-2026-10-19/README.md).
Evidencia visual en [capturas](capturas/citas-autoservicio-2026-10-19/README.md).

La compilación usa Webpack y fuentes simuladas del arnés anterior; no cambia las fuentes
ni el comando del producto. Los proveedores externos permanecen bloqueados y los datos
y cuentas son sintéticos. Los logs conservan intentos fallidos anteriores: timeout de Prisma
tras suspensión, error de tipos corregido, restricciones EPERM/red del sandbox y expectativas
de autenticación ajustadas a la redirección real del proxy. Los fallos de preparación no se
cuentan como pruebas aprobadas.

El control de arquitectura se actualizó de 96 a 97 rutas protegidas por la incorporación
del buscador de contactos; las demás verificaciones del control se conservan.
Tras la regresión completa se ajustó el formulario para limpiar la restricción de agenda
al elegir rol Admin; se repiten compilación, verificaciones estáticas y ensayo de citas.

## Entrega y límites

Antes del despliegue: respaldo, aplicar `web/prisma/sql/actualizaciones.sql`, regenerar Prisma,
compilar normalmente y ensayar recuperación. No se ejecutó nada contra producción.
[Guía de operación para el comprador](guia-operacion-citas.md).

Sigue pendiente un piloto con horarios reales y recordatorio por WhatsApp con plantilla
aprobada/cron real. Varios servicios en una sola cita y recursos compartidos (salas,
sillones o equipos) no forman parte de esta ampliación. Tampoco se añade confirmación
pública de asistencia, anticipos ni lista de espera.
