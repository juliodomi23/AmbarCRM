# Módulos personalizables

Un módulo se registra en `web/src/lib/modulos.ts` con una clave estable, nombre,
descripción, icono SVG y ruta. La plataforma lo activa por organización en
Configuración → Clientes; cada organización solo configura sus módulos activos.

Para agregar un módulo, añade su catálogo y crea sus tablas con `org_id`, DEFAULT
de `app.current_org`, RLS `org_isolation` y GRANT en
`web/prisma/sql/actualizaciones.sql`. Refléjalo en Prisma, protege sus APIs con
`requireModuloActivo("clave")` y añade su página. AppShell y Ctrl+K consumen el
catálogo activo automáticamente.

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
estado `en_sala` representa que el paciente ya llegó y está esperando atención.

La agenda incluye un catálogo de doctores con especialidad, cédula, color y
estado activo. Cada cita puede asignarse a un doctor y utiliza su color como
referencia visual en el calendario.

Cada contacto tiene un expediente clínico con fecha de nacimiento, sexo,
alergias, antecedentes, medicamentos, observaciones e historial de evoluciones.
Las evoluciones pueden relacionarse con una cita y un doctor, y registran al
usuario que las capturó.

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

## Demo clínica

```bash
cd web
node scripts/seed-demo-clinica.mjs admin@demo.test ClaveSegura
```

El seed es idempotente y solo trabaja sobre `demo-clinica`. Crea la marca Salud,
el módulo Citas, tres campos personalizados, un embudo de cuatro etapas, ocho
contactos, seis oportunidades, ocho citas de esta semana y tres conversaciones.
También crea dos doctores, asigna cada cita y prepara expedientes clínicos para
los ocho pacientes con evoluciones de ejemplo.
