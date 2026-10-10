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

## Retail y comercio

Retail se arma con tres módulos independientes para adaptarse tanto a una tienda
física como a ventas por WhatsApp:

- **Clientes** conserva compradores frecuentes, preferencias e historial;
- **Productos e inventario** administra catálogo, SKU, código de barras, precio,
  costo, existencia mínima y entradas o salidas auditables;
- **Compras y proveedores** guarda proveedores, órdenes, costos y recepción de
  mercancía conectada automáticamente con las existencias;
- **Ventas y pedidos** registra ventas de mostrador, WhatsApp, teléfono o tienda
  en línea, con cliente opcional, descuentos, método de pago y preparación.
- **Caja de mostrador** cobra sobre las ventas existentes, con turnos por persona
  y caja, entradas/salidas de efectivo, cobro mixto, cortes X/Z y ticket de 58/80 mm.

Cada venta o compra calcula sus importes en servidor. Los pedidos activos
descuentan existencias dentro de una transacción y las compras recibidas las
incrementan. Al cancelar o regresar a borrador, el movimiento se revierte y
queda auditado. Los puestos operativos incluyen vendedor de tienda, cajero y
encargado de inventario.

Las existencias y partidas admiten hasta tres decimales para productos marcados
como venta por peso (por ejemplo, `1.234 kg`). Los productos por pieza conservan
cantidades enteras. Los cálculos se hacen con `Prisma.Decimal` en servidor y con
milésimas o centavos enteros en la interfaz para evitar errores de punto flotante.

Caja requiere Productos y Ventas activos. Una persona y una caja solo pueden tener
un turno abierto; ambas reglas se protegen con bloqueos e índices únicos parciales.
Cada cobro usa un `uuid_cliente` idempotente, bloquea el turno y luego los productos,
y toda escritura de existencia ocurre dentro de `transaccionTenant()` después de
`bloquearProductos()`. El corte X consulta sin cerrar y el Z guarda efectivo esperado,
contado y diferencia de forma irreversible. Un Cajero no puede cancelar ventas de caja:
la cancelación y devolución de inventario exige Encargado de tienda o Admin.

Las devoluciones conservan la referencia a la venta y admiten cantidades parciales,
reembolso desde el turno abierto actual o nota de crédito del cliente. El turno de la
venta original nunca se reabre: primero se bloquea el turno que entrega efectivo, luego
la venta original y finalmente sus productos. Dos devoluciones concurrentes no pueden
superar lo vendido, y un cambio enlaza la devolución con la nueva venta.

Los apartados separan existencia al crearse, registran anticipo y abonos, y liberan los
productos al cancelar o vencer. Su vigencia se configura con `apartadoDiasVigencia` en
el módulo Caja. El crédito por cliente mantiene límite, saldo, cargos, abonos y
antigüedad; la cuenta se bloquea antes de cada venta para que cobros simultáneos no
rebasen el límite. Solo Encargado de tienda o Admin configura el límite o autoriza una
venta que lo exceda. Los abonos en efectivo entran al turno abierto. Los recordatorios
de saldo usan texto dentro de la ventana de WhatsApp y una plantilla aprobada fuera de
ella.

El corte funciona como libro de efectivo: suma todos los cobros en efectivo históricos
del turno, incluso si la venta terminó cancelada, y resta cada reembolso como una salida
explícita. Las notas de crédito pueden usarse como pago cuando la venta tiene cliente;
se bloquean antes de consumir saldo y nunca generan efectivo ni cambio. El cron
`/api/cron/vencer-apartados`, protegido con `WA_API_KEY`, libera apartados vencidos en
todas las empresas sin atribuir sus movimientos automáticos a una persona.

## Módulo Cotizaciones

Cotizaciones vive en `/cotizaciones` y puede iniciarse desde una oportunidad o desde el
chat con el contacto precargado. Acepta productos del catálogo y conceptos libres; el
navegador solo manda las entradas y el servidor vuelve a calcular subtotal, descuentos,
IVA y total con `Prisma.Decimal`. Cada empresa configura el porcentaje de IVA y si sus
precios ya lo incluyen.

El documento público `/cotizacion/<token>` usa un token aleatorio de 32 caracteres
hexadecimales, la marca de la empresa y estilos de impresión A4 exclusivos de esa ruta.
Aceptar o rechazar bloquea primero la cotización y es idempotente. Una aceptación puede
marcar la oportunidad como ganada y, si se configuró así, convertir la propuesta en venta
dentro de la misma `transaccionTenant()`: bloquea los productos antes de modificar sus
existencias y deja el movimiento de inventario auditado.

WhatsApp usa texto libre únicamente dentro de la ventana de 24 horas. Fuera de ella exige
la plantilla aprobada configurada en el módulo. El cron
`/api/cron/vencer-cotizaciones`, protegido con `WA_API_KEY`, recorre todas las empresas y
continúa aunque falle una. Las pruebas principales son `scripts/check-cotizaciones.ts`,
`prisma/scripts/test-concurrencia-cotizaciones.ts` y
`prisma/scripts/test-cotizaciones-e2e.ts`.

## Módulo Reseñas de Google

Reseñas vive en `/resenas` (promedio, distribución, tendencia semanal en la zona local,
conteo por origen y un QR por origen). La página pública `/opinion/<empresa>?o=<origen>`
guarda la calificación y **siempre** manda al enlace de Google configurado por la empresa,
sea 1 o 5 estrellas: Google prohíbe pedir reseñas de forma selectiva. El destino sale solo
de la configuración (https y dominio `g.page`, `google.com` o `maps.app.goo.gl`), nunca de
la petición. El origen se normaliza a `[a-z0-9_-]` de hasta 40 caracteres o cae en
`directo`. `limitarIp` frena abusos; con el módulo apagado, o sin enlace válido, responde 404.

La solicitud automática (`src/lib/resenas-envio.ts`) se dispara al pasar una cita a
`completada` (el "atendida") o una venta a `entregada`, y solo si el cambio de estado es
una transición real. Las ventas de mostrador (caja) quedan fuera porque nunca pasan por
`entregada`. Corre fuera de la transacción del cambio de estado y nunca lanza: si Meta
falla, la cita o la venta cambian igual. Dentro de las 24 h manda texto; fuera, la
plantilla aprobada (`{{1}}` nombre, `{{2}}` enlace a `/opinion/<empresa>?o=whatsapp`). Sin
canal oficial o sin plantilla no se envía: la solicitud queda `omitida` con su motivo y,
si hay conversación, una nota interna. Una solicitud vigente (`reservada` o `enviada`) por
contacto cada `diasEntreSolicitudes` (90 por defecto): se reserva con `SELECT … FOR UPDATE`
sobre el contacto, no con un `if` suelto. `omitida` y `fallida` no consumen el periodo. Una
solicitud `reservada` que nunca se resolvió (caída del proceso) sí lo consume. Prueba:
`prisma/scripts/test-concurrencia-resenas.ts` (`RESENAS_SIN_PROTECCION=1` demuestra el fallo).

Los QR los genera `src/lib/qr-svg.ts` (modo byte, corrección M, hasta 213 bytes) sin
dependencias. Las pruebas son `scripts/check-resenas.ts` y
`prisma/scripts/test-resenas-e2e.ts`.

## Módulo Pedidos en línea

Los pedidos web pendientes reservan existencia sin descontarla hasta su confirmación.
`horasVencimiento` configura el plazo (24 horas por defecto, mínimo 1). El cron
`POST /api/cron/vencer-pedidos`, protegido con `x-api-key: WA_API_KEY`, recorre todas
las empresas, cancela los pendientes vencidos y libera sus reservas. Si una empresa
falla, el cron continúa con las demás.

## Precios y promociones

`calcularPrecios()` es el único motor de precios del servidor. Busca primero una escala
por volumen; si no aplica, usa la lista asignada al cliente o la lista pública como
respaldo también en caja y ventas sin cliente; después
elige la promoción vigente más favorable. La vigencia se evalúa con la zona de Reservas
o `America/Mexico_City`. Caja, Ventas, apartados, crédito, cotizaciones y tienda usan el
mismo motor. Las cotizaciones conservan el precio calculado al crearse.

El descuento promocional y su descripción se guardan en cada partida. Las devoluciones
prorratean el importe efectivamente cobrado, incluido el descuento general, y ajustan el
último centavo para que la suma nunca rebase el total de la venta.
El tope de descuento del Cajero mide únicamente descuentos manuales contra el subtotal
posterior a promociones; una promoción automática nunca consume ese tope.

Las variantes son productos independientes enlazados por `productos.grupo_id`; cada una
tiene SKU, código, atributos JSON y existencia propios, por lo que participa en las mismas
reservas y bloqueos que cualquier producto. `/productos/etiquetas` genera Code 128 en SVG
sin dependencias y muestra precio público y primera escala de mayoreo.

El catálogo se puede importar y exportar por CSV desde Productos. La importación valida
precio, costo, SKU y códigos por renglón, es atómica y nunca escribe existencia; la
exportación neutraliza valores que Excel interpretaría como fórmulas. Los cambios en lote
solo permiten precio, estado activo y agotado manual.

## Reportes retail

`venta_partidas.costo_unitario` conserva el costo vigente cuando se descuenta inventario.
Los pedidos web lo dejan vacío mientras solo reservan y lo capturan al confirmarse. Las
ventas históricas sin costo permanecen como "sin costo" y no se presentan como utilidad
del 100 %. El ingreso neto por partida prorratea promociones y descuento general con la
misma función que usan las devoluciones, incluido el ajuste del último centavo.

`/reportes-retail` exige un rango máximo de un año y acceso de Admin o Encargado de
tienda. Excluye canceladas, borradores y pedidos aún reservados; las devoluciones restan
ingreso y costo en la fecha local en que suceden. Permite comparar variantes o agruparlas
por producto padre, muestra rotación, inventario valorizado, mínimos, ventas por día,
hora, cajero y caja, y diferencias de cortes. El CSV usa la protección de fórmulas común.

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

## Módulo Reservas en línea

El motor de Cita en Click dentro de AmbarCRM: un enlace público
(`/reservar/<empresa>`) donde el cliente final elige servicio, especialista (o "no
tengo preferencia"), día y hora, deja nombre y WhatsApp, y la cita aparece en Citas con
origen "en línea". Requiere el módulo Citas (los especialistas son sus doctores).

- **Configuración** en `/reservas-en-linea` (solo administradores): servicios con
  duración, tiempo libre posterior, precio y quién los da; horario semanal por
  especialista (varias filas = turno partido); días especiales (cerrado u horario
  distinto); anticipación mínima, días a futuro, cada cuánto se ofrecen horarios y
  tope de citas por teléfono.
- **Motor** (`lib/reservas/horarios.ts`, función pura, sin librerías): convierte las
  horas locales del negocio a UTC por día, también con horario de verano. Probado con
  los mismos casos de Cita en Click en `scripts/check-reservas.ts`.
- **Sin dobles reservas**: la cita se crea con el especialista bloqueado (`FOR UPDATE`)
  y revisando empalmes en la misma transacción; "no tengo preferencia" asigna al menos
  ocupado y, si se ocupa, pasa al siguiente. No se usa `EXCLUDE` para no romper la
  migración con citas que ya estuvieran encimadas.
- **Seguridad del enlace público**: la disponibilidad se recalcula en el servidor, límite
  por IP, tope de citas creadas por teléfono en 24 h, fechas solo dentro de la ventana.
  El cliente consulta o cancela con `/reservar/cita/<token>` (32 hex), sin cuenta y sin
  ver datos personales.
- Los recordatorios por WhatsApp son los del módulo Citas (plantilla y anticipación).

Prueba de concurrencia: `npx tsx prisma/scripts/test-reservas-concurrentes.ts`.

## Módulo Lealtad (Aurum)

Conecta AmbarCRM con las tarjetas de sellos de Aurum (`lealtad.ambarrojostudios.cloud`).
Aurum sigue siendo un sistema aparte (app en tiendas y pases de Wallet); AmbarCRM lo usa
por su API, sin cambios en Aurum.

- **Conexión**: Configuración → Módulos → Lealtad, con el identificador (slug) del negocio
  y la clave del dueño en Aurum. La clave se verifica una vez y se guarda cifrada con
  `META_TOKEN_ENCRYPTION_KEY`; la API de módulos nunca la devuelve ni deja sobrescribirla.
  Un negocio de Aurum solo puede estar conectado a una empresa.
- **En el chat**: el panel del contacto muestra sellos y premios por canjear (se cruza por
  los últimos 10 dígitos del teléfono), con botones Sellar y Canjear, o la liga de alta si
  aún no tiene tarjeta. El token de la tarjeta nunca sale del servidor.
- **Premio ganado**: Aurum llama al webhook; AmbarCRM confirma el premio con Aurum, deja
  una nota interna y avisa por WhatsApp: texto libre si la ventana de 24 h está abierta,
  la plantilla configurada (`{{1}}` nombre, `{{2}}` premio) si está cerrada.
- **Protección del bloqueo por IP de Aurum** (10 claves fallidas bloquean la IP 15 min, y es
  la IP de todas las empresas): un 401 marca la conexión con error y no se vuelve a llamar
  hasta reconectar.

Variables de entorno en AmbarCRM: `AURUM_URL` (fija; ninguna empresa la elige) y
`AURUM_WEBHOOK_SECRET`. En Aurum: `WEBHOOK_URL=https://<crm>/api/public/aurum/webhook?clave=<AURUM_WEBHOOK_SECRET>`.

Prueba contra un Aurum de pruebas (nunca producción), con una clienta `9611234567` y una
meta de 1 sello: `AURUM_URL=… AURUM_SLUG=… AURUM_CLAVE=… AURUM_WEBHOOK_SECRET=…
META_TOKEN_ENCRYPTION_KEY=… npx tsx prisma/scripts/test-lealtad-aurum.ts`.

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
ALLOW_DEMO_SEED=1 node scripts/seed-demo-clinica.mjs
```

El seed es idempotente y solo trabaja sobre `demo-clinica`. Crea la marca Salud,
el módulo Citas, tres campos personalizados, un embudo de cuatro etapas, ocho
contactos, seis oportunidades, ocho citas de esta semana y tres conversaciones.
También crea recepción, dos doctores, asigna cada cita y prepara expedientes
clínicos para los ocho pacientes con historial de ejemplo.

## Demo automotriz

```bash
cd web
ALLOW_DEMO_SEED=1 node scripts/seed-demo-automotriz.mjs
```

El seed es idempotente y solo trabaja sobre `demo-auto`. Carga seis vehículos
en distintos estados y crea una cuenta administradora para esa organización.

## Demo inmobiliaria

```bash
cd web
ALLOW_DEMO_SEED=1 node scripts/seed-demo-inmobiliaria.mjs
```

El seed es idempotente y solo trabaja sobre `demo-inmobiliaria`. Carga cinco
propiedades, dos asesores, tres prospectos y tres citas de visita.

## Demo retail

```bash
cd web
ALLOW_DEMO_SEED=1 node scripts/seed-demo-retail.mjs
```

El seed idempotente crea `demo-retail` con diez productos, tres proveedores, dos
órdenes de compra, movimientos de inventario, seis clientes, seis ventas en
distintos estados, una caja principal y un equipo formado por vendedor, cajero,
encargado de inventario y encargado de tienda.

## Despachos legales

La vertical legal se compone de cuatro módulos independientes:

- **Expedientes legales** muestra asuntos, responsables, materias, etapas y el
  historial unificado de actuaciones, audiencias, documentos, términos, partes
  y seguimientos;
- **Asesorías legales** registra consultas, responsables, seguimiento y
  conversión a contrato;
- **Honorarios y caja** concentra planes de pago, cobros, caja, diligencias y
  gastos por expediente;
- **Operación del despacho** muestra sucursales, asistencia y productividad del
  equipo.

Los puestos sugeridos para esta vertical son abogado, pasante, asistente
jurídico y coordinador jurídico. Citas sigue siendo un módulo compartido y los
prospectos se administran en un embudo legal normal del CRM.

La demo jurídica usa exclusivamente nombres y asuntos ficticios. No importa ni
conserva información del sistema de ningún despacho real.

```bash
cd web
ALLOW_DEMO_SEED=1 node scripts/seed-demo-legal.mjs
```

## Viajes y tours

La vertical de viajes usa tres módulos activables:

- **Tours y salidas** administra destinos, experiencias, fechas, duración,
  itinerario, precio y capacidad;
- **Reservas y viajeros** conecta cada apartado con un contacto del CRM, controla
  pasajeros, estado, total y saldo;
- **Cobranza de viajes** registra anticipos y liquidaciones y actualiza el saldo
  de la reservación.

Los contactos, el chat, los embudos y Citas siguen siendo compartidos. Los
puestos sugeridos son agente de viajes, coordinador de tours y guía. La API
impide reservar más personas que el cupo disponible y rechaza pagos mayores al
saldo pendiente.

```bash
cd web
ALLOW_DEMO_SEED=1 node scripts/seed-demo-viajes.mjs
```

## Educación y academias

Educación se divide en cinco módulos para que una organización active solo lo
que necesita:

- **Alumnos** extiende un contacto con matrícula, tutor, nivel y estado;
- **Cursos y grupos** administra modalidad, profesor, horario, cupo y precio;
- **Inscripciones** relaciona alumnos con cursos y registra su avance;
- **Colegiaturas** controla cargos, vencimientos y pagos;
- **Asistencia** guarda presencia, faltas, retardos y justificaciones por clase.

El servidor valida el cupo antes de inscribir y el pase de lista es idempotente:
registrar otra vez el mismo alumno, curso y fecha actualiza el estado existente.
Los puestos sugeridos son profesor y coordinador académico.

```bash
cd web
ALLOW_DEMO_SEED=1 node scripts/seed-demo-academia.mjs
```

Todos los seeds de demo se niegan a ejecutar en producción y requieren
`ALLOW_DEMO_SEED=1`. Se puede pasar correo y contraseña como argumentos; si se
omite la contraseña, el script genera una segura y la muestra únicamente al
terminar. En PowerShell, define primero `$env:ALLOW_DEMO_SEED="1"` y ejecuta el
comando `node` sin el prefijo de variable.

## Pedidos en línea

El módulo `pedidos_en_linea` depende de Productos y Ventas. Publica únicamente
productos activos con `visible_en_linea`, toma precios y existencias del servidor
y guarda cada pedido como una venta normal con canal `tienda_en_linea`.

Los pedidos pendientes separan existencia en `reservas_pedido` sin escribir
`productos.stock`. Al confirmar una venta, la transición bloquea los productos,
descuenta la existencia y consume la reserva; al cancelar, la libera. El enlace
público `/tienda/<empresa>` usa la marca del negocio y el seguimiento por token
no muestra teléfono, dirección ni otros datos personales.

La demo retail incluye catálogo público, ajustes de entrega y un pedido en línea:

```bash
cd web
ALLOW_DEMO_SEED=1 node scripts/seed-demo-retail.mjs
```

## Cómo agregar un módulo

- [ ] Añadir la clave, ruta, descripción y acceso por puesto en `src/lib/modulos.ts`.
- [ ] Agregar los modelos necesarios en `prisma/schema.prisma` y el SQL idempotente
  correspondiente en `prisma/sql/actualizaciones.sql`.
- [ ] Proteger cada ruta del módulo con `conModulo(clave, opciones, handler)`.
- [ ] Crear componentes pequeños y reutilizables para la interfaz.
- [ ] Crear la página del módulo y comprobar su estado activo antes de mostrarla.
- [ ] Dar captura en pantalla con `FormularioModulo` (`components/modulos/`): se le pasa
  la lista de campos (texto, número, dinero, fecha, selección o contacto) y el endpoint;
  el servidor valida todo. Las opciones comunes están en `lib/opciones-formularios.ts`.
- [ ] Preparar un seed idempotente con datos exclusivamente ficticios.
- [ ] Añadir o extender un script `scripts/check-*.ts`.
- [ ] Incluir las tablas nuevas en la prueba automática de aislamiento multi-tenant.
- [ ] Verificar con `referenciaAjena()` (`lib/referencias.ts`) todo id que llegue del
  cliente (contacto, responsable, expediente…): las llaves foráneas no respetan RLS.
- [ ] Validar montos con `dinero()` (`lib/dinero.ts`): máximo 2 decimales.
- [ ] En páginas de listado, usar `take: LIMITE_PANEL` y calcular las métricas con
  `count`/`aggregate`/`groupBy` en la base, no sobre la lista cargada.

## Calidad antes de publicar

- [ ] Ejecutar `npm run lint`, `npx prisma validate`, `npx next build` y todos los
  `scripts/check-*.ts` después de cada fase.
- [ ] Para inventario, ventas, compras, pagos de tours e inscripciones, validar
  cupos o saldos dentro de una transacción y bloquear las filas necesarias con
  `FOR UPDATE`.
- [ ] Ejecutar `npx tsx prisma/scripts/test-concurrencia-retail.ts` contra un
  Postgres de prueba y comprobar que la versión sin bloqueos falla de forma
  deliberada antes de restaurar los bloqueos.
- [ ] Ejecutar `npx tsx prisma/scripts/test-referencias.ts`: rechazo de ids de otra
  empresa y recordatorios de citas sin atascos.
- [ ] Ejecutar cada seed cinco veces en la misma base y comparar los conteos de
  todas las tablas que tienen `org_id`.
- [ ] Revisar las rutas principales de cada demo en escritorio (1440 × 900) y
  celular (390 × 844), incluyendo la barra inferior y el cajón Más.
