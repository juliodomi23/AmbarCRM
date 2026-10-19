# Piloto de agenda para belleza y spa

Paquete: **Clientes + Citas + Reservas en línea**. Sirve para atención por una
especialista en cada cita: uñas, pestañas, cejas, faciales o masaje. Clientes
conserva preferencias, sensibilidades, productos a evitar e historial de atención.
No hace falta activar Pacientes para un salón de belleza.

## Preparar el negocio

1. Configurar nombre, marca y zona horaria del negocio. Confirmar que la URL pública
   corresponde al CRM que se va a entregar.
2. Crear las especialistas y asignar la agenda a cada integrante que solo debe operar
   la suya. Recepción puede ver las agendas que le permitan sus permisos.
3. En Reservas en línea, registrar cada servicio con duración, precio y especialistas
   que realmente lo realizan. Separar aplicación, retoque y retiro cuando tengan
   duraciones diferentes. No cambiar la duración de un servicio con citas existentes;
   crear otro servicio para conservar su historial.
4. Definir horarios semanales, descanso mediante dos bloques separados y excepciones
   para ausencias. El margen de preparación/limpieza ocupa agenda además del servicio,
   pero no se presenta como duración de atención a la clienta.
5. Revisar el enlace de reserva desde un celular. La descripción del servicio debe
   explicar qué incluye; el precio mostrado no representa un pago ni un anticipo cobrado.
6. Si se van a usar recordatorios, configurar canal oficial activo, plantilla aprobada,
   variables y cron. Incluir el enlace de gestión cuando la plantilla lo permita.

Ejemplo sintético del ensayo: manicure con gel 90 min + 15 de margen; extensiones de
pestañas 120 + 20; masaje 60 + 15. Son datos de prueba: cada negocio define sus tiempos
y precios de acuerdo con su operación.

## Operar una visita

- Crear una persona nueva o buscar un contacto existente al abrir su ficha. La búsqueda
  no está limitada a los primeros contactos precargados. El teléfono se normaliza y
  un duplicado indica usar el contacto existente.
- Registrar sensibilidades, preferencias y productos a evitar. El aviso de sensibilidades
  queda visible antes del formulario; las preferencias pueden incluir forma y tono de
  uñas, estilo de pestañas o presión preferida para masaje.
- Agendar desde su ficha o compartir el enlace público. La reserva muestra servicio,
  duración, precio, especialista y horario antes de confirmar. Se puede volver a un
  paso anterior sin borrar el nombre y teléfono introducidos.
- Desde el detalle de la cita, obtener su enlace personal para consultar, confirmar
  asistencia, reprogramar o cancelar con las reglas vigentes.
- Tras la visita, usar **Registrar atención**: anotar lo realizado, técnica/productos y
  cuidados indicados. Si se relaciona con una cita, se usa su especialista; no se
  atribuye la misma atención a otra persona por error.

## Aceptación con el primer salón

- [ ] Servicios, precios, duraciones, especialistas y zona aprobados por el negocio.
- [ ] Reserva real de prueba desde celular, con y sin preferencia de especialista.
- [ ] El descanso, las ausencias y el margen impiden reservar horarios que no caben.
- [ ] Una reserva de la misma persona aparece en su ficha existente.
- [ ] Recepción confirma, mueve y cancela; la clienta ve el resultado en su enlace.
- [ ] Cada integrante accede solo a la agenda permitida.
- [ ] Se registra una atención y se conservan preferencias y sensibilidades.
- [ ] Plantilla/recordatorio con destinatario de prueba autorizado, si se contrató WhatsApp.
- [ ] Capacitación breve, enlace de reserva y responsable de soporte entregados.

## Límites del paquete actual

La unidad de reserva es **un servicio y una especialista por cita**. No hay control
automático de cabinas, camillas o equipos compartidos, ni reservas que coordinen
varios servicios/especialistas como un solo paquete. Un spa que dependa de esos
recursos necesita revisar ese alcance antes de contratar. Tampoco se cobra un
anticipo desde la reserva pública. No ofrecer esas capacidades como incluidas.

El ensayo local con datos sintéticos no sustituye este piloto con el negocio ni
la verificación de su integración real de WhatsApp.
