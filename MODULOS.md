# Módulos personalizables

Un módulo se registra en `web/src/lib/modulos.ts` con una clave estable, nombre,
descripción, icono SVG y ruta. La plataforma lo activa por organización en
Configuración → Clientes Ámbar CRM; cada organización solo configura sus
módulos activos. La ficha de cada organización muestra métricas, equipo,
módulos y su liga de acceso para soporte sin exponer contraseñas.

Para agregar un módulo, añade su catálogo y crea sus tablas con `org_id`, DEFAULT
de `app.current_org`, RLS `org_isolation` y GRANT en
`web/prisma/sql/actualizaciones.sql`. Refléjalo en Prisma, protege sus APIs con
`requireModuloActivo("clave")` y añade su página. AppShell y Ctrl+K consumen el
catálogo activo automáticamente.

## Módulo Clientes

Clientes es independiente de Contactos. Un **contacto** sigue representando a
cualquier lead, proveedor o persona que escribe por WhatsApp. Se convierte en
**cliente de servicio** cuando se crea su ficha.

La ficha extiende al contacto existente en lugar de duplicarlo. Así conserva el
mismo teléfono, conversaciones, oportunidades y etiquetas, pero aparece además
en `/clientes` con preferencias, sensibilidades, historial y próximas citas.
Esto sirve para negocios de uñas, pestañas, cejas y otros servicios recurrentes.

Un cliente puede crearse desde cero o a partir de un contacto existente. Con el
módulo activo, Contactos muestra la acción **Crear ficha** y Citas ofrece solo a
las personas que ya tienen ficha.

## Módulo Pacientes

Pacientes usa `/pacientes` y el mismo contacto base, pero presenta la información
como expediente clínico: alergias, antecedentes, medicamentos, evoluciones,
doctores y próximas citas. Para una clínica se activan **Pacientes + Citas**;
para un negocio de servicios se activan **Clientes + Citas**. Esta selección
evita duplicar teléfonos, chats u oportunidades.

## Módulo Automotriz

Automotriz agrega un inventario aislado por organización en `/automotriz`. La
primera versión permite registrar marca, modelo, año, versión, color, stock,
VIN, kilometraje, precio, fotografía y notas. Cada vehículo puede cambiarse
rápidamente entre **Disponible**, **Reservado**, **Vendido** y **En taller**.

La pantalla muestra indicadores de disponibilidad, reservados, vendidos y valor
del inventario disponible. El seed `seed-demo-automotriz.mjs` crea la
organización `demo-auto`, activa Automotriz y Citas, carga seis vehículos, dos
asesores y tres pruebas de manejo.

## Módulo Inmobiliaria

Inmobiliaria agrega `/inmobiliaria` con propiedades para venta o renta. Registra
tipo, ciudad, dirección, recámaras, baños, superficie, precio, fotografía y
estado. Se combina con Citas para agendar visitas y con Usuarios para invitar
asesores inmobiliarios.

## Módulo Citas

Cuando Citas está activo aparece en el menú lateral, la barra móvil y Ctrl+K. Su
API devuelve 404 si está apagado. Las citas pueden crearse desde Contactos, desde
el panel de Chat o desde `/citas`.

La organización configura en **Configuración → Módulos**:

- canal oficial de WhatsApp;
- plantilla de Meta con estado `APPROVED`;
- horas de anticipación;
- valor de cada variable, respetando `{{1}}`, `{{2}}`, etc.

Las fuentes disponibles son nombre del contacto, fecha y hora de la cita en
`America/Mexico_City`, título de la cita y nombre del negocio. El cron
`/api/cron/recordatorios-citas`, protegido con `x-api-key`, construye las
variables en ese orden, registra el resultado y marca la cita para no repetirlo.

### Operación clínica

Al hacer clic en una cita del calendario se abre su detalle con acciones rápidas:
**Confirmó**, **Ya llegó**, **Atendido**, **No llegó** y **Cancelar cita**. El
estado `en_sala` representa que el cliente ya llegó y está esperando atención.

La agenda incluye un catálogo de doctores con especialidad, cédula, color y
estado activo. Cada cita puede asignarse a un doctor y utiliza su color como
referencia visual en el calendario.

Cada cliente puede tener una ficha con fecha de nacimiento, sensibilidades,
preferencias, productos a evitar, observaciones e historial de servicios. Los
servicios pueden relacionarse con una cita y un especialista, y registran al
usuario que los capturó.

El payload que recibe el bot incluye `ambarcrm.citas_url`. Con el mismo header
`api_access_token`, el bot puede consultar próximas citas mediante `GET` y
marcar una cita como `confirmada` o `cancelada` mediante `PATCH` con
`{ "citaId": "...", "estado": "confirmada" }`. Esto permite confirmar por
WhatsApp sin modificar el webhook de Meta.

## Campos personalizados

Las definiciones se administran en **Configuración → Campos personalizados**.
Las claves desconocidas se ignoran y las activas se validan en servidor según
su tipo. Los valores se editan en Contactos, Chat y Oportunidades; también están
disponibles como columnas opcionales y en CSV usando la etiqueta como encabezado.
La pantalla explica casos de uso y permite capturar las opciones separadas por
comas cuando el tipo elegido es **Opción**.

## Equipo

En **Configuración → Usuarios** el admin invita integrantes y define dos cosas:
el rol técnico (`Admin` o `Agente`) y el puesto operativo (`Recepcionista`,
`Doctor`, `Especialista`, `Vendedor`, `Asesor inmobiliario` o
`Asesor automotriz`). El puesto describe su función sin complicar los permisos.

## Demo clínica

```bash
cd web
node scripts/seed-demo-clinica.mjs admin@demo.test ClaveSegura
```

El seed es idempotente y solo trabaja sobre `demo-clinica`. Crea la marca Salud,
el módulo Citas, tres campos personalizados, un embudo de cuatro etapas, ocho
contactos, seis oportunidades, ocho citas de esta semana y tres conversaciones.
También crea recepción, dos doctores, asigna cada cita y prepara expedientes
clínicos para los ocho pacientes con historial de ejemplo.

## Demo automotriz

```bash
cd web
node scripts/seed-demo-automotriz.mjs auto@local.test AutoDemo2026!
```

El seed es idempotente y solo trabaja sobre `demo-auto`. Carga seis vehículos
en distintos estados y crea una cuenta administradora para esa organización.

## Demo inmobiliaria

```bash
cd web
node scripts/seed-demo-inmobiliaria.mjs inmobiliaria@local.test InmoDemo2026!
```

El seed es idempotente y solo trabaja sobre `demo-inmobiliaria`. Carga cinco
propiedades, dos asesores, tres prospectos y tres citas de visita.
