# Revisión de Citas y Reservas en línea · 17 de octubre de 2026

## Cambio del 18 de octubre: jornada obligatoria

Esta decisión sustituye el aviso permisivo documentado el 17: con al menos un HorarioDoctor,
la agenda interna exige inicio y fin dentro de una misma ventana efectiva del día del negocio.
Respeta ExcepcionHorario (cierre u horario especial), sin cruzar descansos; responde 409 con
el horario disponible. Sin ninguna regla semanal permite guardar y avisa que hay que definirla.
Sin especialista no comprueba jornada ni empalmes. No cambia reservas públicas ni bot.
Crear y mover solo admiten desde hoy local; una hora anterior del mismo día está permitida.
Notas/estado de citas históricas no revalidan jornada ni pasado; las transiciones finales previas
se conservan. El calendario atenúa fuera de jornada solo al seleccionar un especialista;
los clics inválidos explican el motivo sin abrir el formulario.

## Cambio del 18 de octubre: borrar canceladas

DELETE interno exige módulo Citas y estado cancelada; cualquier otro estado responde 409,
id ajeno/inexistente 404. Bloquea la fila antes de revisar evoluciones y borrar: una cita con
evolución clínica ligada responde 409, aunque la FK permitiría SET NULL. Nunca se elimina
historial clínico. Solicitudes de reseña, pendientes o procesadas, se conservan y su cita_id
queda NULL mediante la FK existente; contacto, evento y detalle siguen disponibles.
El esquema actual no tiene cobro/venta/pago asociado a Cita, ni una bitácora general para
acciones de personal (AuditoriaBot es exclusiva del bot). No se inventan esas relaciones:
ningún registro de dinero se modifica y no se añade borrado al bot. No se ofrece borrado
en lote: requiere informar conflictos individuales y no es un cambio trivial.
Detalle y lista usan Confirmador, errores del servidor, toast y recarga de agenda.
El conteo arquitectónico sigue siendo 96 archivos; se comprueban los dos métodos protegidos
de citas/[id] explícitamente, porque DELETE no agrega un archivo de ruta.

Base: `eabde09`, rama `revision-citas`. Diagnóstico inicial antes de modificar código.
Solo PostgreSQL desechable en 127.0.0.1:55450, sin servicios externos, push ni despliegue.
Las referencias de esta tabla corresponden a la base; la evidencia final se añade al terminar.

| Hallazgo | Evidencia archivo:línea (web/) | Gravedad | Qué se hizo |
|---|---|---|---|
| Previo 1 confirmado: agenda interna sin bloqueo ni empalme | src/app/api/citas/route.ts:103; src/app/api/citas/[id]/route.ts:89 | Corrompe datos | Corregido: núcleo común en servidor.ts y transacción en citas-servidor.ts |
| Previo 2 confirmado: mover no reinicia recordatorio | src/app/api/citas/[id]/route.ts:89 | UX | Corregido: reinicia marca e intentos ante un cambio real |
| Previo 3 parcialmente confirmado: PATCH sí recorta pero permite título vacío, sin máximos ni empalme al reasignar | src/app/api/citas/[id]/route.ts:32 | Corrompe datos | Corregido: límites, recorte y empalmes dentro de transacción |
| Previo 4 parcialmente confirmado: rango ilimitado, pero ya existe take 200 | src/app/api/citas/route.ts:14,46; src/lib/paginacion.ts:4 | UX | Corregido: 62 días, páginas de 200 y UI que consume siguienteCursor |
| Previo 5 confirmado: reclamación antes de resolver canal, fallos irreversibles y solo primer lote | src/app/api/cron/recordatorios-citas/route.ts:42,46,58; src/lib/recordatorios.ts:25 | UX | Corregido: 3 intentos / 15 min; lotes 100 hasta 2000 por empresa |
| Previo 6 confirmado: falta prueba dedicada de Citas | prisma/scripts/test-reservas-concurrentes.ts:1 | Menor | Añadidos test-citas.ts y test-citas-e2e.ts; resultados completos en informe de regresión |
| Bot permite reabrir estados finales; reprogramación y cancelación pública validan estado fuera del bloqueo | src/app/api/v1/accounts/[accountId]/conversations/[conversationId]/appointments/route.ts:268; src/app/api/public/reservas/cita/[token]/route.ts:62 | Corrompe datos | Corregido: finales protegidos; cancelación pública con UPDATE condicionado |
| Límite por teléfono público se cuenta fuera de transacción | src/app/api/public/reservas/[slug]/route.ts:81 | Seguridad | Corregido: bloqueo transaccional por empresa/teléfono y recuento al crear |
| Calendario no pagina: pierde citas a partir de 200 | src/components/citas/CitasCliente.tsx:89 | UX | Corregido: todas las páginas, orden inicio/id y descarte de cargas antiguas |
| Eventos simultáneos se dibujan encima; medianoche y horas fuera de 8–20 se recortan | src/components/citas/CalendarioSemanal.tsx:55,74 | UX | Corregido: columnas para simultáneas y segmentos para medianoche |
| Zona interna y recordatorio fija a México aunque reservas admite otra zona | src/components/citas/fecha.ts:1; src/lib/citas.ts:14 | UX | Corregido: agenda, formularios, panel del contacto y recordatorio usan zona de reservas |
| Copiar enlace anuncia éxito incluso si falla portapapeles | src/components/reservas/EnlacePublico.tsx:8 | UX | Corregido: error visible si falla portapapeles; Copiar verificado en navegador |
| Doctor desactivado conserva citas y relaciones, pero sin marca en agenda | prisma/schema.prisma:830,841; src/app/api/doctores/[id]/route.ts:14 | UX | Corregido: marca inactivo, aviso de citas futuras y edición/reasignación |
| Servicio inactivo no borra citas; DELETE con citas ya responde 409 | src/app/api/reservas/servicios/[id]/route.ts:44 | Descartado | Conservado; la regresión mantiene las pruebas existentes |
| Servicios sin especialistas activos no se ofrecen al público | src/app/api/public/reservas/[slug]/route.ts:37 | Descartado | Conservado: público filtra servicios y bot no obtiene horarios de especialistas inactivos |
| Token aleatorio de 128 bits, formato estricto, sin PII en detalle público | src/lib/reservas/servidor.ts:275,338; src/app/api/public/reservas/cita/[token]/route.ts:19 | Descartado | Conservado: 128 bits; formato estricto y detalle sin nombre/teléfono del cliente |
| Puestos controlan acceso al módulo, no existe relación usuario↔doctor | src/lib/modulos.ts:57; prisma/schema.prisma:841 | Decisión de producto | Decisión de Julio: vínculo usuario–doctor y alcance de lectura por agenda |
| Gestión pública actual solo consulta/cancela; no confirma ni reprograma | src/app/api/public/reservas/cita/[token]/route.ts:49; src/components/reservas/GestionCita.tsx:26 | Decisión de producto | Decisión de Julio: confirmar/reprogramar por token y vencimiento explícito |
| UI actual crea y cambia estado; no expone edición/movimiento ni filtros por especialista | src/components/citas/CitasCliente.tsx:246 | UX / alcance solicitado | Corregido: filtros y edición con formulario existente; mover conserva duración elegida |

## Criterios conservadores

- Estados finales `completada`, `cancelada`, `no_asistio`: solo permanecen iguales. No se mueven ni se reabren. `programada` y `confirmada` pueden avanzar a llegada o cierre; `en_sala` puede completarse/cancelarse. Se documentará la matriz exacta usada en pruebas.
- Horarios internos fuera de jornada o excepciones: advertencia, nunca bloqueo. Reservas públicas y bot conservan sus reglas de disponibilidad, anticipación y buffer.
- Sin doctor no se valida empalme. Completadas conservan ocupación histórica; cancelada/no_asistio liberan.
- Reintentos de recordatorio solo tras fallo conocido de envío. Una entrega confirmada no se reintenta si luego falla el registro local; no hay garantía de exactamente una entrega si el proceso muere durante la petición externa.
- No añadir recursos, pagos, recurrencias, lista de espera, multievento ni vínculo usuario↔doctor. Plantillas de Meta sin cambios.

## Evidencia y entrega final

La evidencia está en `pruebas-citas-2026-10-17/` y las capturas en `capturas/revision-citas-2026-10-17/`. La regresión final y el resultado del merge se registran al cierre.

## Estados y reprogramación implementados

| Actual | Siguientes permitidos (además del mismo estado) |
|---|---|
| programada | confirmada, en_sala, completada, cancelada, no_asistio |
| confirmada | en_sala, completada, cancelada, no_asistio |
| en_sala | completada, cancelada |
| completada / cancelada / no_asistio | ninguno |

Reprogramar inicio/fin/especialista solo desde programada o confirmada. Cambio real reinicia
recordatorio; escribir la misma fecha no lo reinicia. El cambio de estado y el indicador
`completada` se calculan bajo bloqueo de la cita: dos PATCH simultáneos solicitan una sola
reseña y el envío queda fuera de la transacción. El bot comparte las transiciones; sus
respuestas válidas se conservan, pero reabrir un estado final ahora responde 409.
Cancelación pública condiciona estado e inicio en el UPDATE para no cancelar un cierre concurrente.

## Hallazgos nuevos corregidos durante las pruebas

| Hallazgo | Archivo:línea (web/) | Gravedad | Qué se hizo |
|---|---|---|---|
| Altas públicas simultáneas del mismo teléfono fallaban por unicidad del contacto | src/lib/reservas/servidor.ts:195 | UX | Recuperar el contacto ganador y mantener el límite transaccional |
| Inclusión de responsable completo podía exponer passwordHash en respuestas y props | src/lib/citas-servidor.ts:20; src/app/(app)/citas/page.tsx:20 | Seguridad | Select explícito id/nombre; pruebas HTTP y de respuesta sin secretos |
| Fecha imposible podía lanzar RangeError; JSON null/array causaba 500 público | src/lib/reservas/horarios.ts:55; src/app/api/public/reservas/[slug]/route.ts:64 | UX | Comprobar fecha y objeto de entrada antes de acceder a campos |
| Errores de red dejaban carga/envío sin resolver y respuestas antiguas cambiaban horarios | src/components/reservas/ReservaPublica.tsx:48; src/components/citas/CitasCliente.tsx:84 | UX | Manejo de error/finally y generación de consulta para descartar respuestas viejas |
| Campos datetime-local recortados en 390 px | src/components/citas/FormularioCitaModal.tsx:108 | UX | Apilados en móvil y dos columnas desde sm; captura posterior verificada |
| Modales de Citas sin foco inicial ni ciclo de Tab | src/components/citas/useFocoModal.ts:4 | UX | Foco contenido en los modales de citas y restaurado al cerrar |

## Tres giros: resultado real y qué falta

Los fixtures usan datos sintéticos: clínica pequeña con 2 especialistas, grande con 10,
salón con 5 técnicas. Los flujos HTTP contra `next start` pasan por sesión real, configuración
de servicio y horario, alta desde conversación, edición, estados, reserva pública y token.
El fixture grande añade 500 citas más una nocturna. En la corrida visual su API recuperó
501 filas en 131 ms (solo consulta local paginada; no es un benchmark de producción).
La ficha está asociada al contacto y se conserva el acceso desde el detalle.

| Giro | Lo existente verificado | Qué falta / decisión | Tamaño orientativo |
|---|---|---|---|
| Clínica pequeña | 2 especialistas, calendario, configuración, ficha, reserva pública y estados; formulario usable a 390 px | Confirmar/reprogramar desde token; el flujo público actual tiene cinco etapas y no requiere cuenta | Mediano, 2–4 días con pruebas |
| Clínica grande | 10 especialistas, 501 filas sin truncar, filtros por especialista/especialidad/estado, cambios y aislamiento por empresa | Relacionar usuario con doctor y definir quién puede leer/editar cada agenda; hoy un puesto autorizado ve toda su empresa | Mediano/grande, 3–5 días |
| Salón de belleza | 5 técnicas, precio, servicio con duración/buffer, cualquiera, recurrentes como contactos, no-asistió | Etiquetas configurables por giro: la interfaz interna todavía dice Doctor; no se encontró mecanismo existente y no se inventó | Chico/mediano, 1–3 días |
| Clínica grande / salón | Agenda de personas | Recursos compartidos como sillones/cabinas/sillas | Grande, 1–2 semanas |
| Salón / clínica pequeña | Un servicio por cita | Varios servicios en una visita y duración/precio combinados | Grande, 1–2 semanas |
| Los tres | Estados y cancelaciones | Recurrencia y lista de espera | Grande, 1–2 semanas por función |
| Salón / clínica grande | Una cita necesita contacto | Atención sin cita, fila o walk-in | Mediano, 3–5 días |
| Salón / clínica pequeña | Precio informativo | Depósito/anticipo y reglas de cancelación vinculadas a pago | Grande, 1–2 semanas más proveedor |

Son estimaciones para decidir alcance, no compromisos. No se implementaron estos faltantes.
No hay una guía de módulos separada en este árbol: se actualizó `MODULOS.md`.

## Caminos de un clic

| Camino | Resultado comprobado | Límite actual |
|---|---|---|
| Reservas en línea → Copiar | Copia URL completa al portapapeles; error real si falla | No envía automáticamente al cliente |
| Reservas en línea → Abrir | Vista pública sin sesión | Navegación pública en nueva pestaña |
| Cliente → servicio → cualquiera → fecha → hora → datos | Confirmación clara, servicio/especialista y hora del negocio; móvil y escritorio | Cinco etapas existentes, no reserva literal en un solo clic |
| Bandeja → + Crear cita | `PanelConversacion` usa `CitasContacto`, que precarga contacto y conversación al formulario | Se abre la agenda con query; no un modal dentro de la bandeja |
| Bandeja → insertar enlace | Ya existen respuestas rápidas por nombre o `/` en `ChatCliente.tsx:754`; su contenido puede guardar el enlace estático de la empresa, o se puede pegar | No hay botón específico que inserte dinámicamente el enlace; no se añadió; no se envió ningún mensaje real |
| Gestión por token → consultar/cancelar | Sin sesión; doctor correcto, sin datos de otros clientes; cancelar libera; inválido da Cita no encontrada | No confirma ni reprograma; no hay caducidad configurable del token |
| Agenda → hueco | Precarga hora y doctor del filtro seleccionado; conserva citas sin doctor | No hay arrastrar y soltar; se mueve con Editar cita |
| Agenda → estado | Acciones rápidas y selector; finales no se reabren | Cambios incoherentes quedan deshabilitados y API responde 409 |
| Agenda → Editar cita | Edita texto, horario y especialista; probado con teclado y reasignación | Contacto y responsable no se cambian en esta edición |
| Recordatorio → link de gestión / doctor | Plantilla y mapeo actual conservados | Solo hay cuatro variables existentes: nombre, fecha/hora, título y negocio. No se añadió enlace ni doctor a plantillas aprobadas |

## Criterios que se conservan y decisiones pendientes

- Cualquiera ordena por menor cantidad de citas en estados ocupantes del día local;
  empates por nombre y luego id. Usa una disponibilidad calculada y, al guardar, bloquea
  cada candidato y pasa al siguiente si se ocupó. Es reparto por carga observada, no una
  promesa de round-robin global para peticiones simultáneas en horas distintas.
- Especialista desactivado: no se borra ni se pierden citas. No existe DELETE de doctores
  en la API. Si alguien lo borra directamente con SQL, la FK usa SET NULL: la cita sigue,
  pero pierde su asociación; la operación directa queda fuera de la app y de esta revisión.
  Borrar servicio con citas ya responde 409; desactivarlo conserva el histórico.
- El token es una credencial de acceso: alguien que conoce un token válido puede consultar
  o cancelar esa cita. No hay identidad del visitante contra la que definir un «token ajeno».
  Se probaron tokens inexistentes/malformados y aislamiento de citas privadas por id/empresa.
- Las variables de recordatorio no contienen doctor ni enlace de gestión. Se necesita una
  decisión sobre las variables y una plantilla aprobada; no se modificó ninguna plantilla.
- Reintentos: solo fallos conocidos, tres intentos separados 15 min. Sin teléfono/canal no
  se reclama. Entrega externa y registro local no pueden ser atómicos: un proceso que muere
  tras reclamar deja una marca que requiere revisión operativa. Un timeout reportado como
  fallo permite reintento y puede duplicar una entrega que el proveedor sí aceptó: no se
  promete exactamente una entrega ni se liberan reclamaciones antiguas a ciegas.
  Las marcas históricas previas a esta corrección no se reinterpretan automáticamente.
- La agenda interna avisa después de guardar fuera de jornada o con servicio incompatible.
  No bloquea. Las reservas y el bot siguen exigiendo disponibilidad válida.
- Permisos por puesto son del módulo completo; «cada doctor solo ve su propia agenda»
  necesita el vínculo usuario–doctor antes descrito. Los filtros visuales no son autorización.

## Revisión visual y alcance de la evidencia

Escritorio 1440×1000 y móvil 390×844, navegador de la app, app compilada, datos sintéticos.
Se revisaron las agendas de los tres giros, filtros, configuración, formulario móvil, selección
pública, confirmación, cancelación e inválidos. Se creó/completó una cita desde escritorio en
clínica pequeña y desde móvil en salón; se probó alta con contacto/conversación precargados y
edición/reasignación con teclado. Los tres flujos completos de negocio están además en la
prueba HTTP, con sesión real. No se afirma una auditoría exhaustiva con lector de pantalla.

El llenado automatizado de datetime-local mostraba un valor DOM sin disparar el cambio de
React. Se confirmó mediante teclado y resultado guardado (18-oct, 16:00), y se verificó mover
con teclado a otro día/especialista. No se cambió código por esta limitación del automatizador.

Las capturas incluyen modo oscuro y focos visibles; el calendario semanal mantiene su scroll
horizontal en móvil. La vista de todas las agendas con 10 especialistas deja tarjetas estrechas;
los filtros permiten leerlas. Una noche que cruza medianoche expande el día completo para no
ocultarla. Cambiar ese diseño queda para revisión de Julio con una clínica real.

## Pendientes de Julio

- 🛑 Revisar visualmente la agenda con datos reales de una clínica y decidir si hace falta otra vista por día/técnica.
- 🛑 Decidir vínculo usuario–doctor, permisos por agenda y etiquetas por giro.
- 🛑 Probar un recordatorio real con plantilla aprobada; decidir inclusión de doctor/enlace y recuperación de entregas inciertas.
- 🛑 Ensayo con respaldo real y prueba de `test-lealtad-aurum.ts` contra Aurum de pruebas antes de despliegue.

## Commits de la revisión

| Commit | Cambio |
|---|---|
| `662076c` | Documentar diagnóstico inicial de citas y reservas antes de corregir |
| `2a1c842` | Unificar empalmes y serializar creación y edición de citas por especialista |
| `d988268` | Proteger estados finales y cancelación pública frente a cambios concurrentes |
| `1e96620` | Validar textos referencias fechas y rangos de la agenda interna |
| `3677aca` | Reintentar recordatorios fallidos con límite persistente y recorrer lotes |
| `f94d258` | Serializar el límite público por teléfono y excluir especialistas inactivos |
| `6e44b83` | Corregir agenda con varios especialistas zonas avisos y errores de interfaz |
| `461e96f` | Probar citas estados cron reservas y tres giros con fixtures desechables |
| `fe49ec0` | Validar cuerpos públicos y dejar la regresión local reproducible sin red |
| `9a897e5` | Documentar revisión por giro caminos de citas y decisiones pendientes |
| `9441637` | Alinear reseñas con estados finales y aislar los límites de login de cada E2E |

La entrega añade un último commit con resultados y capturas. El SHA del fast-forward
se entrega al finalizar, una vez creado ese commit.

## Incidencias de la regresión y correcciones del arnés

La primera batería completa terminó con dos fallos reales registrados: `test-resenas-e2e.ts`
esperaba 200 al pasar completada a cancelada; se actualizó a 409 y se añadió comprobar que
la cita sigue completada y que existe una sola solicitud de reseña. `test-sinred-e2e.ts`
agotó el límite de 30 logins por IP acumulado por archivos anteriores. Se mantiene el límite
original y se reinicia la app compilada entre archivos E2E para aislar sus contadores.
No se modificó auth ni se relajaron controles. Las pruebas originales de reservas concurrentes
y de la API del bot no se modificaron. Se repite la batería completa en otra BD desechable.

El primer arranque en frío alcanzó el PostgreSQL temporal de inicialización y `schema.sql`
falló con «database system is shutting down»; la siguiente etapa detectó que faltaba ajustes.
La espera del arnés ahora exige TCP a 127.0.0.1, que solo está disponible en el servidor final.
Ambos intentos fallidos permanecen en el log, y la preparación posterior pasó.

En la app final se capturaron además 50 citas de un especialista en escritorio y el aviso de
desactivación con dos citas futuras conservadas en móvil. Se comprobó por teclado que
Shift+Tab vuelve del primer control al último dentro del modal y que Escape lo cierra
y devuelve el foco al botón Doctores. Hay 20 capturas JPEG.

## Resultado de la regresión y cierre

51 tests y 34 checks aprobados; TypeScript, lint, Prisma validate, build y SQL idempotente
aprobados. Aislamiento en 84 tablas. Los fallos previos y su resolución están en la
[sección de regresión](regresion-pre-merge-2026-10-17.md). App local detenida y contenedor
retirado. Se añade la evidencia y se admite únicamente el merge local fast-forward;
el SHA efectivo y la verificación del prompt restaurado se entregan en el chat.
