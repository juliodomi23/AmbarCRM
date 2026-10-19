# Revisión de belleza y experiencia de reserva

Trabajo local del 19 de octubre de 2026 en `codex/revision-integral-citas`.
Sin cambios de esquema, despliegues ni mensajes externos.
Implementación guardada en el commit local `b0c1215`.

## Correcciones funcionales

- Crear una ficha para un contacto que ya tiene una responde 409 y conserva sus datos;
  antes el upsert podía reemplazar preferencias y sensibilidades con campos vacíos.
- Clientes/Pacientes normalizan teléfonos y comprueban duplicados dentro de una
  transacción con bloqueo por teléfono. Se detectan también formatos históricos con
  espacios. Esto permite reutilizar la ficha al reservar en línea con el mismo número.
- La conversión de contactos tiene búsqueda en servidor: no depende de los primeros
  500 precargados. El filtro sin ficha respeta la organización y su módulo.
- Las fechas de nacimiento imposibles o futuras y cuerpos inválidos se rechazan con
  400. Una edición parcial de la ficha conserva los campos omitidos.
- Al relacionar una atención con una cita se utiliza su especialista y se rechazan
  referencias inválidas, citas ajenas o una especialista diferente.
- Los formularios salen del estado de guardado y conservan lo escrito si falla la red.

La búsqueda para convertir usa `GET /api/clientes?sinFicha=1&q=...` (o Pacientes
con su propio permiso). Devuelve hasta 30 contactos básicos y `hayMas`; no entrega
fichas ni notas. `POST` conserva su función de crear, mientras que la edición se
realiza por `PATCH /api/contactos/<id>/expediente`.

## Cambios de interfaz

- Reserva pública por etapas, progreso, descripción del tratamiento y resumen editable
  con duración, precio, especialista y hora local. Un único especialista se selecciona
  automáticamente. El conflicto de horario lleva de nuevo a horarios actualizados.
- Etiquetas persistentes, botones táctiles, selección anunciada con aria-pressed y foco
  al avanzar. Si falla la carga se puede volver a buscar sin recargar toda la página.
- Clientes distingue persona nueva y contacto existente, muestra el nombre del próximo
  servicio y tiene acciones de agendar/ficha más fáciles de pulsar desde móvil.
- La ficha de belleza presenta preferencias y cuidados, sensibilidades destacadas y
  **Registrar atención** con ejemplos de uñas, pestañas y spa. Cada cita relacionada se
  identifica también por fecha y hora. Los datos personales opcionales quedan en un
  desplegable, después de las preferencias; los campos clínicos se conservan en Pacientes.
- La API simulada de la demo conserva la búsqueda y rechaza recrear una ficha existente.

## Alcance y evidencia

`test-belleza-e2e.ts` prepara un salón con más de 500 contactos y servicios de uñas,
pestañas y masaje; prueba conservación de datos, altas simultáneas, aislamiento,
duraciones, descanso, margen, compatibilidad de especialistas y registro de atención.
El control sin serialización demuestra dos contactos con formatos distintos; con
la normalización y el bloqueo se admite una sola alta y la otra recibe 409.

El paquete cubre una especialista y un servicio por cita. Cabinas compartidas, paquetes
de varias especialistas y cobro de anticipos no forman parte de este alcance.
[Guía y aceptación del piloto](piloto-belleza.md).

Resultado: **57 scripts de prueba y 34 comprobaciones aprobados**, además de
TypeScript, lint de cambios, Prisma validate y compilación local Webpack con fuentes
simuladas. La preparación SQL se repitió tres veces. No se cambió el esquema.
[Resumen por caso](pruebas-belleza-2026-10-19/resumen-regresion.md).

El primer build encontró EPERM en archivos generados y pasó al repetirlo con acceso
local suficiente. El primer ensayo de belleza esperaba pestañas a las 10:45 pese a
que sus 120 + 20 minutos superarían el descanso de las 13:00; el motor lo rechazó
correctamente y se corrigió la expectativa para comprobar un manicure que sí cabe.
Ambos intentos se conservan en el registro.

Se verificaron en navegador reserva completa, retroceso conservando datos, selección
automática de especialista, búsqueda fuera de los 500 contactos, ficha móvil y
registro de atención en escritorio. Las [capturas y mediciones](capturas/belleza-2026-10-19/README.md)
no muestran desbordamiento horizontal. Se retiraron la app, el contenedor y el volumen
de prueba: [limpieza](pruebas-belleza-2026-10-19/limpieza.json).

La aceptación con el salón y la integración real de WhatsApp siguen siendo parte
de la entrega; esta evidencia no declara un piloto real ni un despliegue realizados.
