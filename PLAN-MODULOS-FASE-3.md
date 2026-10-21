# Plan de módulos · Fase 3

Fecha de revisión: **20 de octubre de 2026**. Esta fase continúa el trabajo de módulos
con prioridad en facilidad de uso y agrega **Marketing** y **Meta Ads**. El alcance
inicial es trabajo interno del CRM; la conexión y las acciones sobre Meta se entregan
en etapas posteriores.

## 1. Revisión de la fase 2

La revisión del repositorio encontró implementados los bloques de la fase 2. Eso no
demuestra que estén desplegados, que todas las integraciones reales hayan pasado su
piloto ni que la fase esté cerrada operativamente.

| Bloque | Evidencia en el repositorio | Situación al iniciar fase 3 |
|---|---|---|
| Cantidades decimales | Motor retail y pruebas de cantidades/stock | Implementado; hasta tres decimales en productos por peso |
| A1 · Caja, turnos y corte | Caja sobre las ventas existentes, pagos mixtos, cortes X/Z, ticket e idempotencia | Implementado |
| A2 · Devoluciones, apartados y crédito | Transacciones, abonos, vencimientos y pruebas concurrentes | Implementado |
| B · Cotizaciones | Documento público, aceptación, envío y conversión a venta | Implementado |
| C · Pedidos y catálogo público | Tienda, reservas de existencia y vencimiento de pedidos | Implementado |
| A3 · Precios y promociones | Motor compartido, variantes, volumen, etiquetas e importación | Implementado |
| A4 · Reportes y varias cajas | Costos por partida, devoluciones y separación del envío | Implementado, incluido el ajuste de envío señalado en el plan anterior |
| D · Reseñas | Página pública, QR, panel y solicitudes con control de duplicados | Implementado |
| A5 · Caja sin conexión | Catálogo local, cola, revisión y conciliación de ventas tardías | Implementado; opcional y apagado por defecto |

También hay trabajo posterior de agenda, autoservicio, experiencia para belleza,
canales, módulos de Ámbar Rojo y recuperación de contraseña. El detalle funcional
vigente está en [MODULOS.md](MODULOS.md).

La evidencia de [Belleza y Citas del 19 de octubre](docs/pruebas-belleza-2026-10-19/resumen-regresion.md)
registra **57 scripts de prueba y 34 comprobaciones aprobados**, SQL aplicado tres
veces, TypeScript, lint de cambios y compilación local. Se usaron PostgreSQL
desechable, datos sintéticos, proveedores externos bloqueados y fuentes simuladas.
Son resultados de aquella revisión, no una corrida nueva sobre la fase 3.

El [plan de cierre del 11 de octubre](PLAN-CIERRE-FASE-2.md) se conserva como historia.
Sus conteos de pruebas, estado de pausa y afirmaciones sobre qué contiene cada rama
no describen por sí solos el checkout actual. Para reproducir pruebas se toma el
[arnés reciente](docs/pruebas-belleza-2026-10-19/README.md), que prepara la base con
`schema.sql`, `multi-tenant.sql` y `actualizaciones.sql`; no usar la receta antigua
de `prisma db push` como sustituto del ensayo de migración.

Quedan por acreditar los pendientes externos documentados: Aurum real de pruebas,
piloto con proveedores reales, compilación normal con fuentes reales, ensayo con
respaldo real y estado efectivo de App Review/permisos en el panel de Meta. Esta
revisión no accedió a producción ni confirmó esos puntos.

## 2. Qué resuelve cada módulo

**Marketing** organiza qué se quiere conseguir, para quién, por qué canal, cuándo y
con qué presupuesto previsto. Su primera entrega guarda campañas internas y su
revisión. No envía mensajes, publica contenido ni crea anuncios.

**Meta Ads** prepara propuestas de anuncios para Facebook e Instagram con objetivo,
audiencia, contenido, fechas y presupuesto. Su primera entrega permite trabajar y
aprobar la propuesta dentro del CRM. Una propuesta aprobada **no implica** que Meta
la haya revisado ni que exista un anuncio publicado.

Los módulos se activan individualmente por organización desde **Configuración →
Clientes Ámbar CRM**, mediante la administración de plataforma. No se activan
automáticamente en clientes existentes. Cada organización configura los accesos de
sus módulos activos; el menú y Ctrl+K los reciben del catálogo común.

## 3. Entregas

### 3A · Experiencia y campañas internas

Primera entrega de esta fase:

- Registrar Marketing (`marketing`, `/marketing`) y Meta Ads (`meta_ads`, `/meta-ads`).
- Crear y editar campañas/propuestas persistentes, con acciones de enviar a revisión,
  aprobar internamente y archivar. La aprobación exige rol administrador.
- Separar objetivos y preparación de los resultados: sin conexión no hay cifras de
  alcance, gasto real, ventas atribuidas ni rendimiento que mostrar.
- Proteger datos por organización con `org_id`, RLS, permisos de módulo y validación
  del servidor. Una versión del registro evita sobrescribir cambios ajenos.
- Mostrar acciones que correspondan al estado y al acceso de la persona. Si otro
  integrante cambió el registro, explicar el conflicto y permitir recargarlo.
- Conservar una indicación visible de que todavía no se publica ni se genera gasto.
- Revisar los flujos comunes que se reutilicen: alta, edición, búsqueda, filtros,
  estados vacíos, errores, confirmaciones, teclado y experiencia en celular.

El desarrollo local no requiere activar permisos nuevos de Meta porque esta entrega
no llama a Marketing API. La aprobación interna es parte del trabajo del equipo.

### 3B · Conexión y consulta de Meta Ads

Segunda entrega, sujeta a los permisos y condiciones efectivos de la aplicación:

- Conectar una cuenta mediante el flujo autorizado de Meta, sin pedir contraseñas ni
  exponer tokens al navegador.
- Seleccionar la cuenta publicitaria y comprobar que la organización tiene acceso.
- Consultar campañas, estado y resultados con periodo, moneda, zona horaria y hora
  de última actualización visibles.
- Distinguir datos sin actualizar, cuenta sin anuncios, conexión vencida y falta de
  permisos. Explicar el siguiente paso en cada caso.
- Conservar el alcance de solo consulta hasta validar conexión, aislamiento y
  comportamiento con errores del proveedor.

Los permisos requeridos según capacidad, sus requisitos y la evidencia para revisión
se detallan en [Meta Ads y App Review](docs/META-ADS-APP-REVIEW.md).

### 3C · Publicación con aprobación y presupuesto

La publicación es una entrega posterior; no existe en el MVP interno:

- Convertir la propuesta en una operación compatible con Marketing API.
- Antes de publicar, mostrar cuenta, objetivo, anuncio, destino, fechas y presupuesto,
  indicando si el presupuesto es diario o total y su moneda.
- Exigir aprobación del responsable autorizado y confirmar la versión exacta que se
  publicará. Un cambio relevante invalida la aprobación correspondiente.
- Registrar qué operación se pidió y el resultado del proveedor; evitar duplicados
  ante reintentos y ofrecer recuperación cuando Meta no confirme el resultado.
- Mostrar claramente la diferencia entre aprobación interna, revisión de Meta,
  publicación y entrega del anuncio. Agregar pausa cuando la integración la soporte.

La aceptación de esta etapa requiere permisos efectivos, pruebas con activos
autorizados y revisión del flujo de gasto. No se publican anuncios para probar la UI.

### 3D · Leads y atribución

- Recibir leads de formularios con sus permisos y suscripciones correspondientes.
- Validar autenticidad, tenant y activo de origen antes de procesar un evento.
- Evitar duplicados por evento/lead y enlazar contactos y oportunidades existentes
  cuando corresponda, usando el origen `meta_ads` disponible en el modelo.
- Conservar campaña/anuncio/formulario de origen y mostrar seguimiento comercial.
- Diferenciar resultados informados por Meta de ventas registradas en el CRM; definir
  ventana de atribución y limitaciones antes de presentar retorno de inversión.
- Atender fallos y revocaciones de acceso sin perder ni mezclar información de clientes.

## 4. Criterios de UI/UX

| Necesidad | Criterio de aceptación |
|---|---|
| Entender el módulo | Título, explicación breve y acción principal visibles al entrar |
| Crear sin conocimientos de anuncios | Objetivos y campos explicados en español; ejemplos concretos y ayuda junto al campo |
| Evitar formularios abrumadores | Orden lógico, valores razonables y opciones avanzadas solo cuando aporten valor |
| Conocer el siguiente paso | Estado con texto, acciones disponibles y explicación de bloqueos |
| Guardar con confianza | Indicador de guardado, confirmación de resultado y conservación de entradas ante error |
| Resolver errores | Mensaje específico y opción de corregir o reintentar; sin errores técnicos expuestos al usuario |
| Empezar desde cero | Estado vacío con contexto y botón para crear; filtros sin resultados ofrecen limpiarlos |
| Usar celular | Sin desbordamiento horizontal; contenido legible y controles cómodos en 390 × 844 |
| Usar teclado | Etiquetas asociadas, foco visible, orden lógico y diálogo con foco controlado |
| Comprender cifras | Presupuesto planeado separado del gasto real; sin métricas simuladas presentadas como reales |
| Configurar | Formularios y textos comprensibles; no exigir editar JSON para usar los módulos |

Se reutilizan los componentes de `web/src/components/ui.tsx`, `EmptyState`,
`Confirmador` y los patrones de formularios existentes. La reserva pública por
etapas sirve como referencia para preparación guiada y resumen editable. El diseño
debe comprobarse con tareas completas, además de inspeccionar la pantalla inicial.

## 5. Validación y condiciones de entrega

Para 3A:

1. Ejecutar TypeScript, lint, Prisma validate, compilación y las comprobaciones de
   arquitectura/permisos que cambien; agregar pruebas propias de los módulos.
2. Preparar PostgreSQL de prueba con los SQL del repositorio, aplicar la actualización
   tres veces y comprobar aislamiento de las tablas nuevas usando `crm_app`.
3. Probar alta, edición, revisión, aprobación de administrador y archivo mediante
   solicitudes reales. Verificar módulo apagado, usuario sin acceso, IDs de otra
   organización, datos inválidos y versión desactualizada.
4. Comprobar que el cambio concurrente no se pierda y que el usuario reciba un conflicto
   recuperable. Si se incorpora una nueva protección de concurrencia, demostrarla con
   el control negativo correspondiente en la base desechable.
5. Recorrer la UI en escritorio y celular con datos sintéticos: crear, editar, filtrar,
   revisar, aprobar y archivar; también vacíos y errores. Verificar teclado y foco.
6. Registrar comandos, resultados y límites. Una compilación con fuentes simuladas no
   se reporta como prueba del comando normal de despliegue.

Las pruebas no deben enviar mensajes, crear campañas en Meta ni generar gasto. La
regresión de fase 2 existente sirve como referencia; debe repetirse lo necesario para
las superficies compartidas afectadas por los cambios.

### Resultados de esta sesión

Resultados de la implementación local verificados el **21 de octubre de 2026**. La
evidencia completa está en [pruebas de Marketing y Meta Ads](docs/pruebas-marketing-2026-10-21/README.md).

| Comprobación | Resultado de fase 3 |
|---|---|
| TypeScript, lint y Prisma | Aprobados |
| Compilación | Aprobada localmente con fuentes simuladas; falta comprobar descarga real de fuentes en entorno de despliegue |
| SQL idempotente y aislamiento | Actualización ×3 y aislamiento en 86 tablas aprobados |
| Permisos, estados y conflictos de versión | Prueba HTTP con NextAuth real aprobada para ambos módulos; control negativo: sin protección 2 escrituras, con versión 1 éxito y 1 conflicto |
| Recorrido visual escritorio/móvil y teclado | Flujo visual de creación/revisión/aprobación y control de presupuesto en 390 × 844, sin desborde; queda pendiente una auditoría completa con tecnologías de asistencia |
| Integración y publicación real en Meta | Fuera del alcance de 3A |
| Producción | No verificada ni modificada por esta revisión |

La batería general pasó 37 de 38 checks; el de recuperación de contraseña exige su
propia base desechable `:55461/crm_recuperar` y no se forzó sobre la base de fase 3.
La revisión visual incluyó navegación por teclado y foco de los pasos, pero no una
prueba completa con lector de pantalla.

## 6. Límites y trabajo posterior

En 3A no se conectan cuentas publicitarias, se sincronizan métricas, se reciben leads,
se publica contenido, se envían campañas por WhatsApp ni se contrata gasto. Tampoco
se implementan cobros con link, CFDI u Óptica en esta entrega. Esos módulos conservan
sus requisitos y prioridades propios.

La siguiente ampliación se elige después de verificar 3A: primero corregir problemas
de uso, permisos o persistencia; después avanzar con consulta de Meta y evidencia de
App Review. [Guía específica de permisos](docs/META-ADS-APP-REVIEW.md).
